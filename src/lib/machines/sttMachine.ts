import { setup, assign, fromPromise, log, sendTo, type ActorRefFrom, fromCallback, type DoneActorEvent, sendParent, type AnyActorRef, type ErrorActorEvent, type PromiseActorLogic } from 'xstate';
import { blobToFile } from '$lib/utils'; // Assuming utils exists

// --- Types ---
const AUDIO_WORKLET_PATH = '/audio-processor.js'; // Path relative to public root

// Internal helper function
const calculateRMS = (data: Uint8Array): number => {
	let sumSquares = 0;
	for (let i = 0; i < data.length; i++) {
		const normalizedValue = (data[i] - 128) / 128;
		sumSquares += normalizedValue * normalizedValue;
	}
	return Math.sqrt(sumSquares / data.length);
};

// Modified Context: Added Audio Worklet related fields
export interface SttContext {
    parent: AnyActorRef | undefined; // Reference to the parent actor
    audioStream: MediaStream; // Now required via input
    mediaRecorder: MediaRecorder | null;
    audioChunks: Blob[];
    errorMessage: string | null;
    minDecibels: number;
    silenceDuration: number;
    transcribeFn: (token: string, audioFile: File) => Promise<{ text: string }>; // Required via input
    apiToken: string; // Required via input
    // --- Audio Worklet State ---
    audioContext: AudioContext | null;
    sourceNode: MediaStreamAudioSourceNode | null;
    audioWorkletNode: AudioWorkletNode | null;
    isWorkletReady: boolean;
    rmsLevel: number;
    isStopping: boolean; // Flag to indicate the actor is stopping
}

// Modified Events: Removed old analysis events, added worklet events
export type SttEvent =
    // Commands/Info from Manager
    | { type: 'PROCESS_CHUNKS' } // Sent by manager
    | { type: 'STOP' } // Sent by manager
    | { type: 'CLEANUP' } // <<< Added: Explicit cleanup event from manager
    // Internal Events: Initialization
    | { type: 'INITIALIZATION_COMPLETE'; recorder: MediaRecorder } // Kept for recorder
    | { type: 'INITIALIZATION_FAILED'; error: string } // Kept for recorder error
    // Internal Events: Recording
    | { type: 'RECORDING_DATA_AVAILABLE'; data: Blob }
    // --- Audio Worklet Events ---
    | { type: 'WORKLET_RMS_UPDATE'; value: number }
    | { type: 'VAD_SPEECH_START' } // From worklet
    | { type: 'VAD_SILENCE_START' } // From worklet
    | { type: 'WORKLET_READY' } // From worklet setup actor
    | { type: 'WORKLET_ERROR'; error: string } // From worklet or setup actor
    // Events sent back FROM actors
    | DoneActorEvent<MediaRecorder, 'initializeRecorderActor'>
    | DoneActorEvent<{ audioContext: AudioContext }, 'audioWorkletSetupActor'> // Added for worklet setup
    | DoneActorEvent<{ text: string }, 'transcriptionActor'>
    | ErrorActorEvent // General actor errors (covers worklet setup too)
    | { type: 'AUDIO_CHUNK'; data: Blob } // Keep? Seems redundant with RECORDING_DATA_AVAILABLE

// --- Actors ---

// Audio Worklet Setup Actor (adapted from whisperLiveSttMachine)
const audioWorkletSetupActor = fromPromise<{ audioContext: AudioContext }>(async () => {
	console.log('[sttWorker/AudioInit] Initializing AudioContext and Worklet...');
	let audioContext: AudioContext | null = null;
	try {
		audioContext = new AudioContext();
		console.log(`[sttWorker/AudioInit] AudioContext created. State: ${audioContext.state}`);
		if (audioContext.state === 'suspended') {
			console.log('[sttWorker/AudioInit] AudioContext suspended, attempting resume...');
			await audioContext.resume();
			console.log(`[sttWorker/AudioInit] AudioContext resumed. State: ${audioContext.state}`);
		}
		if (audioContext.state !== 'running') {
			console.error(`[sttWorker/AudioInit] AudioContext state is '${audioContext.state}', not 'running'.`);
            throw new Error(`AudioContext state is '${audioContext.state}', not 'running'. User interaction might be required.`);
		}
        console.log(`[sttWorker/AudioInit] Attempting to add module: ${AUDIO_WORKLET_PATH}`);
		await audioContext.audioWorklet.addModule(AUDIO_WORKLET_PATH);
		console.log('[sttWorker/AudioInit] AudioWorklet module added successfully.');
		return { audioContext };
	} catch (e: any) {
        console.error('[sttWorker/AudioInit] Error during AudioContext/Worklet setup:', e);
        if (audioContext && audioContext.state !== 'closed') {
            console.log('[sttWorker/AudioInit] Closing AudioContext due to setup error.');
            audioContext.close().catch(() => {});
        }
		throw new Error(`Audio initialization failed: ${e.message || e}`);
	}
});


// --- Machine Setup ---

export const sttMachine = setup({
    types: {
        context: {} as SttContext,
        events: {} as SttEvent,
        input: {} as Pick<SttContext, 'audioStream' | 'minDecibels' | 'silenceDuration' | 'transcribeFn' | 'apiToken' | 'parent'>
    },
    actors: {
        initializeRecorderActor: fromPromise(async ({ input }: { input: { stream: MediaStream } }) => {
            // Keep internal logging for worker debugging if needed
            console.log('[sttWorker] Initializing MediaRecorder with stream:', input.stream);
            // ... existing recorder initialization logic ...
            if (!(input.stream instanceof MediaStream)) {
                console.error('[sttWorker] Invalid stream passed to initializeRecorderActor:', input.stream);
                throw new Error('Invalid MediaStream received by actor.');
            }
            const stream = input.stream;
            let options = {};
            const supportedTypes = [
                'audio/wav', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', ''
            ];
            console.log("[sttWorker] Checking supported MIME types:");
            supportedTypes.forEach(type => console.log(`  ${type}: ${MediaRecorder.isTypeSupported(type)}`));

            if (MediaRecorder.isTypeSupported('audio/wav')) options = { mimeType: 'audio/wav' };
            else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm;codecs=opus' };
            else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) options = { mimeType: 'audio/ogg;codecs=opus' };
            else if (MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/webm' };
            else if (!MediaRecorder.isTypeSupported('')) throw new Error('MediaRecorder not supported or no suitable audio format.');
            else console.warn('[sttWorker] No preferred MIME type supported, trying default.');

            let recorder;
            try {
                recorder = Object.keys(options).length > 0 ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
                // Add event listeners here if needed, BEFORE returning
                recorder.ondataavailable = (event) => {
                    // Cannot directly sendBack here, need to handle via machine events
                    // This actor only resolves with the recorder instance
                    // The machine itself needs to handle recorder events
                    console.log(`[sttWorker/recorder] ondataavailable event, size: ${event.data.size}`);
                 };
                 recorder.onstop = () => {
                     console.log('[sttWorker/recorder] onstop event');
                 };
                 recorder.onerror = (event) => {
                      console.error('[sttWorker/recorder] onerror event:', event);
                      // How to propagate this error back to the machine?
                      // Maybe throw from here? Or emit a custom event?
                      // For now, just log it.
                 };
            } catch (e) {
                console.error("[sttWorker] Error creating MediaRecorder instance:", e);
                throw e;
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // Optional delay
            console.log('[sttWorker] MediaRecorder initialized.');
            return recorder;
        }),
        transcriptionActor: fromPromise(async ({ input }: { input: { chunks: Blob[], transcribeFn: SttContext['transcribeFn'], token: string | null } }) => {
            console.log('[sttWorker] Starting transcription...');
            const { chunks, transcribeFn, token } = input;
            // Keep internal validation, although manager should ensure these are passed
            if (!transcribeFn) throw new Error('Transcription function (transcribeFn) not provided.');
            if (!token) throw new Error('API token not provided for transcription.');
            if (chunks.length === 0) {
                console.log('[sttWorker] No audio chunks to transcribe.');
                return { text: '' };
            }
            const audioBlob = new Blob(chunks, { type: chunks[0]?.type || 'audio/wav' });
            const mimeType = audioBlob.type;
            const extension = mimeType?.split('/')[1]?.split(';')[0] ?? 'wav';
            const audioFile = blobToFile(audioBlob, `recording.${extension}`);
            console.log(`[sttWorker] Transcribing audio file (${(audioFile.size / 1024).toFixed(1)} KB) of type ${mimeType}...`);
            const result = await transcribeFn(token, audioFile);
            console.log('[sttWorker] Transcription successful:', result);
            return result;
        }),
        audioWorkletSetupActor // Added
    },
    actions: {
        assignRecorder: assign({
            mediaRecorder: ({ event }) => {
                // Ensure type safety
                if (event.type === 'xstate.done.actor.initializeRecorderActor') {
                    return event.output;
                }
                return null; // Or context.mediaRecorder if you want to keep existing on wrong event
            }
        }),
        assignError: assign({
            errorMessage: ({ event }) => {
                console.error("[sttWorker] Error event received:", event);
                let message = 'An unknown worker error occurred';
                if ('error' in event && event.type.startsWith('xstate.error.actor.')) { 
                    const errorEvent = event as ErrorActorEvent; // Type assertion
                    const errorData = event.error;
                    if (errorData instanceof Error) message = errorData.message;
                    else if (typeof errorData === 'string') message = errorData;
                    else try { message = JSON.stringify(errorData); } catch { message = 'Unknown actor error data'; }
                } else if (event.type === 'INITIALIZATION_FAILED') {
                    message = event.error;
                } else if (event.type === 'WORKLET_ERROR') { // Handle worklet error event
                    message = `Worklet Error: ${event.error}`;
                }
                console.log(`[sttWorker] Assigning error message: ${message}`);
                return message;
            }
        }),
        startRecorder: ({ context }) => {
            if (context.mediaRecorder && context.mediaRecorder.state === 'inactive') {
                console.log('[sttWorker] Starting media recorder with timeslice...');
                context.mediaRecorder.start(500);
            } else {
                console.warn('[sttWorker] Recorder not ready or already recording.');
            }
        },
         setupRecorderListeners: ({ context, self }) => {
             if (context.mediaRecorder) {
                 console.log('[sttWorker] Setting up MediaRecorder listeners...');
                 context.mediaRecorder.ondataavailable = (event) => {
                     if (context.isStopping) {
                         // console.log('[sttWorker/ondataavailable] Ignoring data: isStopping flag is true.');
                         return;
                     }
                     if (event.data.size > 0) {
                         if (self.getSnapshot()?.status === 'done') return;
                         self.send({ type: 'RECORDING_DATA_AVAILABLE', data: event.data });
                     }
                 };
                 context.mediaRecorder.onstop = () => {
                      console.log('[sttWorker] MediaRecorder stopped.');
                 };
                 context.mediaRecorder.onerror = (event) => {
                      console.error('[sttWorker] MediaRecorder error:', event);
                      // Send a general error event? Or use existing?
                      self.send({ type: 'INITIALIZATION_FAILED', error: 'MediaRecorder error' });
                 };
             } else {
                 console.error('[sttWorker] Cannot setup listeners, MediaRecorder is null.');
             }
         },
        stopRecorder: ({ context }) => {
            if (context.mediaRecorder && context.mediaRecorder.state === 'recording') {
                console.log('[sttWorker] Stopping media recorder...');
                 // Remove listeners before stopping for robustness
                 context.mediaRecorder.ondataavailable = null;
                 context.mediaRecorder.onstop = null;
                 context.mediaRecorder.onerror = null;
                 // Stop the recorder
                context.mediaRecorder.stop();
            } else if (context.mediaRecorder && context.mediaRecorder.state === 'inactive'){
                 console.log('[sttWorker] Recorder was already inactive.');
            } else {
                 console.warn('[sttWorker] Recorder not recording or not available.');
            }
        },
        appendAudioChunk: assign({
            audioChunks: ({ context, event }) => {
                if (event.type === 'RECORDING_DATA_AVAILABLE') {
                    // Minimal logging for chunks
                    // console.log(`[sttWorker] Appending audio chunk. Current chunks: ${context.audioChunks.length + 1}`);
                    return [...context.audioChunks, event.data];
                }
                return context.audioChunks;
            }
        }),
        // clearAudioChunks remains useful before processing
        clearAudioChunks: assign({ audioChunks: [] }),
        // assignAnalysisUpdate removed -> assignRmsLevel added
        assignRmsLevel: assign({
            rmsLevel: ({ context, event }) => {
                if (event.type === 'WORKLET_RMS_UPDATE') {
                    return event.value;
                }
                return context.rmsLevel;
            },
        }),
        // --- Actions for Audio Worklet ---
        assignAudioContextAndWorkletReady: assign({
            audioContext: ({ event }) => {
                 if (event.type === 'xstate.done.actor.audioWorkletSetupActor') {
                    return event.output.audioContext;
                 }
                 return null; // Or keep existing context?
            },
            isWorkletReady: true,
            errorMessage: null, // Clear error on success
        }),
        assignWorkletError: assign({
            isWorkletReady: false,
            errorMessage: ({ event }) => {
                if (event.type === 'WORKLET_ERROR') {
                    return `Audio Worklet error: ${event.error}`;
                }
                if ('error' in event && event.type === 'xstate.error.actor.audioWorkletSetupActor') {
                    const error = (event as ErrorActorEvent).error;
                    return `Audio Worklet setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
                return 'Unknown audio processing error';
            },
            // Consider transitioning to error state? For now, just assign context.
        }),
        setupAndStartAudioProcessing: assign(( { context, self } ) => {
            console.log('[sttWorker] Executing setupAndStartAudioProcessing action...');
			if (!context.audioContext || !context.audioStream || !context.isWorkletReady) {
                console.error('[sttWorker] setupAndStartAudioProcessing: Pre-requisites not met!', {
                    hasContext: !!context.audioContext,
                    hasStream: !!context.audioStream,
                    isWorkletReady: context.isWorkletReady
                });
				self.send({ type: 'WORKLET_ERROR', error: 'Pre-requisites not met for audio setup'});
				return {}; // Return empty object to avoid changing context on error here
			}
			let sourceNode: MediaStreamAudioSourceNode | null = null;
			let audioWorkletNode: AudioWorkletNode | null = null;
			try {
                console.log('[sttWorker] setupAndStartAudioProcessing: Creating AudioWorkletNode...');
				if (context.sourceNode) { try { context.sourceNode.disconnect(); } catch {} }
				if (context.audioWorkletNode) { try { context.audioWorkletNode.disconnect(); context.audioWorkletNode.port.close(); } catch {} }

				audioWorkletNode = new AudioWorkletNode(context.audioContext, 'audio-processor');
                console.log('[sttWorker] setupAndStartAudioProcessing: AudioWorkletNode created.');

                console.log('[sttWorker] setupAndStartAudioProcessing: Creating MediaStreamSourceNode...');
				sourceNode = context.audioContext.createMediaStreamSource(context.audioStream);
                console.log('[sttWorker] setupAndStartAudioProcessing: Connecting nodes...');
				sourceNode.connect(audioWorkletNode);
				// Do NOT connect workletNode to destination

                console.log('[sttWorker] setupAndStartAudioProcessing: Sending start message to worklet...');
				audioWorkletNode.port.postMessage({ type: 'start' });
				console.log('[sttWorker] Audio graph connected & worklet start message sent.');

				// <<< Log the node object right before returning for assignment >>>
				console.log('[sttWorker/Action] Returning audioWorkletNode for assignment:', audioWorkletNode);
				return { sourceNode, audioWorkletNode, errorMessage: null }; // Don't set isAudioProcessing flag here

			} catch (error: any) {
				console.error('[sttWorker] setupAndStartAudioProcessing: Error setting up media graph:', error);
				console.warn('[sttWorker/Action] !!! ERROR in setupAndStartAudioProcessing catch block. Sending WORKLET_ERROR !!!');
				self.send({ type: 'WORKLET_ERROR', error: `Audio graph setup failed: ${error instanceof Error ? error.message : 'Unknown'}` });
				return { sourceNode: null, audioWorkletNode: null }; // Clear nodes on error
			}
		}),
		stopAudioProcessing: ({ context }) => {
             console.warn('[sttWorker/Action] WARNING: stopAudioProcessing called.');
             console.log('[sttWorker] Stopping audio processing (worklet)...');
 			if (context.audioWorkletNode) {
 				try {
 					context.audioWorkletNode.port.close();
 				} catch (e) { console.warn('[sttWorker] Error stopping worklet port:', e); }
 			}
 			try { context.sourceNode?.disconnect(); } catch {}
             // Do NOT stop the main audioStream tracks here - manager owns the stream
 			console.log('[sttWorker] Audio processing stopped.');
        },
        clearAudioNodes: assign({ // Renamed from clearAudioContextRef maybe?
            sourceNode: null,
            audioWorkletNode: null,
            audioContext: null, // Close context separately
            isWorkletReady: false,
        }),
        closeAudioContext: ({ context }) => {
            console.warn('[sttWorker/Action] WARNING: closeAudioContext called.');
            if (context.audioContext?.state !== 'closed') {
                context.audioContext?.close().catch(e => console.error('[sttWorker] Error closing AC:', e));
            }
        },
		// --- Parent Communication ---
		sendSilenceToParent: sendParent(({ self }) => ({ type: 'WORKER_SILENCE_DETECTED', workerRef: self })), // Triggered by VAD_SILENCE_START now
		sendRmsUpdateToParent: sendParent(({ event, self }) => {
            // Type guard for the event
            if (event.type === 'WORKLET_RMS_UPDATE') {
                // console.log(`[sttWorker] Sending WORKER_RMS_UPDATE: ${event.value.toFixed(4)} from worker ${self.id}`); // Optional: Throttled log if needed
                return { type: 'WORKER_RMS_UPDATE', value: event.value, workerRef: self };
            }
            // Should not happen if called correctly, but return undefined to satisfy types
            console.warn('[sttWorker] sendRmsUpdateToParent called with wrong event type:', event.type);
            return undefined;
        }),
		sendResultToParent: sendParent(
            ({ context, event, self }) => {
                const doneEvent = event as DoneActorEvent<{ text: string }>;
                let textToSend = '';
                if (doneEvent.type === 'xstate.done.actor.transcriptionActor' && typeof doneEvent.output?.text === 'string') {
                    textToSend = doneEvent.output.text;
                } else {
                    console.log('[sttWorker] No valid text found in transcription result, sending empty result.');
                }
                console.log(`[sttWorker] Sending WORKER_TRANSCRIPTION_RESULT: "${textToSend}" from worker ${self.id}`);
                return { type: 'WORKER_TRANSCRIPTION_RESULT', text: textToSend, workerRef: self };
            }
        ),
        sendErrorToParent: sendParent(
             ({ context, event }) => {
                let errorMessage = context.errorMessage || 'Unknown worker error';
                if ('error' in event && event.type === 'xstate.error.actor.transcriptionActor') {
                     const errorData = event.error;
                      if (errorData instanceof Error) errorMessage = errorData.message;
                      else if (typeof errorData === 'string') errorMessage = errorData;
                      else try { errorMessage = JSON.stringify(errorData); } catch { /* ignore */ }
                      console.error('[sttWorker] Transcription actor failed:', errorMessage);
                } else if ('error' in event && event.type === 'xstate.error.actor.initializeRecorderActor') {
                     const errorData = event.error;
                      if (errorData instanceof Error) errorMessage = errorData.message;
                      else if (typeof errorData === 'string') errorMessage = errorData;
                      else try { errorMessage = JSON.stringify(errorData); } catch { /* ignore */ }
                      console.error('[sttWorker] Initialize recorder actor failed:', errorMessage);
                } else if ('error' in event && event.type === 'xstate.error.actor.audioWorkletSetupActor') {
                     const errorData = event.error;
                      if (errorData instanceof Error) errorMessage = errorData.message;
                      else if (typeof errorData === 'string') errorMessage = errorData;
                      else try { errorMessage = JSON.stringify(errorData); } catch { /* ignore */ }
                      console.error('[sttWorker] AudioWorkletSetup actor failed:', errorMessage);
                } else if (event.type === 'WORKLET_ERROR') { // Handle direct worklet error
                    errorMessage = `Worklet Error: ${event.error}`;
                }
                 errorMessage = context.errorMessage || errorMessage;
                console.log(`[sttWorker] Sending WORKER_ERROR: ${errorMessage}`);
                return { type: 'WORKER_ERROR', error: errorMessage };
            }
        ),
        // New action to set up worklet message handlers AFTER the node is assigned to context
        setupWorkletMessageHandler: ({ context, self }) => {
            console.log('[sttWorker/Action] setupWorkletMessageHandler called.');
            let lastLogTime = 0; // Variable to track last log time for throttling
            if (!context.audioWorkletNode) {
                console.error('[sttWorker/Action] Cannot setup handlers: audioWorkletNode is null in context.');
                // Optionally send an error event back to self?
                // self.send({ type: 'WORKLET_ERROR', error: 'Failed to setup handlers, node missing' });
                return;
            }
            // Assign handlers using the 'self' reference from the action arguments
            context.audioWorkletNode.port.onmessage = (ev: MessageEvent) => {
              
                // Log the received data structure
                // --- Throttled logging --- 
                const now = Date.now();

                // <<< Check if actor is stopping >>>
                if (context.isStopping) {
                    // Optional: Log that the message is being ignored due to stopping flag.
                    // console.log('[sttWorker/onmessage] Ignoring message: isStopping flag is true.');
                    return; // Simplified check
                }
                // Remove the snapshot check as isStopping should be sufficient - Reverted, adding back final checks
                // if (self.getSnapshot().status === 'done') {
                //     // Optional: Log that the message is being ignored.
                //     // console.log('[sttWorker/onmessage] Ignoring message: Actor is stopped.');
                //     return;
                // }

                if (now - lastLogTime > 1000) { // Log max once per second
                    lastLogTime = now;
                }
                // ------------------------- 
 
                // Handle messages from worklet and send as machine events
                if (ev.data?.type === 'RMS_UPDATE') {
                    if (now - lastLogTime === 0) console.log('[sttWorker/onmessage] Handling RMS_UPDATE (throttled)...'); // Log details only when throttled log is printed
                    try {
                         if (self.getSnapshot()?.status === 'done') return; // <-- Check added
                        self.send({ type: 'WORKLET_RMS_UPDATE', value: ev.data.value });
                    } catch (e) { /* ignore error if actor stopped */ }
                } else if (ev.data?.type === 'VAD_SPEECH_START') {
                    if (now - lastLogTime === 0) console.log('[sttWorker/onmessage] Handling VAD_SPEECH_START (throttled)...'); // Log details only when throttled log is printed
                    try {
                         if (self.getSnapshot()?.status === 'done') return; // <-- Check added
                        self.send({ type: 'VAD_SPEECH_START' });
                    } catch (e) { /* ignore error if actor stopped */ }
                } else if (ev.data?.type === 'VAD_SILENCE_START') {
                    if (now - lastLogTime === 0) console.log('[sttWorker/onmessage] Handling VAD_SILENCE_START (throttled)...'); // Log details only when throttled log is printed
                    try {
                         if (self.getSnapshot()?.status === 'done') return; // <-- Check added
                        self.send({ type: 'VAD_SILENCE_START' });
                    } catch (e) { /* ignore error if actor stopped */ }
                }
                // Ignore ArrayBuffer chunks silently
                else if (!(ev.data instanceof ArrayBuffer)) {
                    console.warn('[sttWorker] Unknown message type from worklet:', ev.data);
                }
            };
            context.audioWorkletNode.port.onmessageerror = (ev) => {
                console.error('[sttWorker] Audio worklet port message error:', ev);
                self.send({ type: 'WORKLET_ERROR', error: 'Audio worklet port message error' });
            };
            context.audioWorkletNode.onprocessorerror = (ev) => {
                console.error('[sttWorker] Audio worklet processor error:', ev);
                self.send({ type: 'WORKLET_ERROR', error: `Audio worklet processor error: ${ev}` });
            };
            console.log('[sttWorker/Action] Worklet message handlers assigned.');
        },
        // --- New Action to Remove Listeners ---
        removeWorkletListeners: ({ context }) => {
            console.log('[sttWorker/Action] Removing worklet message listeners and closing port...'); // Log updated
            if (context.audioWorkletNode?.port) {
                try {
                    // Set handlers to null FIRST to stop processing messages immediately
                    context.audioWorkletNode.port.onmessage = null;
                    context.audioWorkletNode.port.onmessageerror = null;
                    console.log('[sttWorker/Action] Worklet message listeners removed.');

                    // Send stop message to worklet AFTER removing listeners
                    try {
                        console.log('[sttWorker/Action] Sending stop message to worklet.');
                        context.audioWorkletNode.port.postMessage({ type: 'stop' });
                    } catch (e) {
                        console.warn('[sttWorker/Action] Error sending stop message to worklet:', e);
                        // Continue even if sending stop fails, try to close port anyway
                    }

                    // Close the port AFTER removing listeners and sending stop
                    try {
                        console.log('[sttWorker/Action] Closing worklet port...');
                        context.audioWorkletNode.port.close();
                        console.log('[sttWorker/Action] Worklet port closed.');
                    } catch (closeError) {
                         console.warn('[sttWorker/Action] Error closing worklet port:', closeError);
                         // Continue cleanup even if closing fails
                    }
                } catch (e) {
                    // Log error but continue, as cleanup should proceed
                    console.warn('[sttWorker/Action] Error during worklet listener removal/stop/close:', e);
                }
            } else {
                console.log('[sttWorker/Action] No audioWorkletNode or port found, skipping listener removal/port close.');
            }
        },
        // --- New Action to Mark as Stopping ---
        markAsStopping: assign({ isStopping: true }),
    },
    guards: {
        hasAudioChunks: ({ context }) => context.audioChunks.length > 0,
        // Correct event type comparisons using 'xstate.' prefix
        isMediaRecorder: ({event}) => event.type === 'xstate.done.actor.initializeRecorderActor' && event.output instanceof MediaRecorder,
        isNotMediaRecorder: ({event}) => event.type === 'xstate.done.actor.initializeRecorderActor' && !(event.output instanceof MediaRecorder),
        isWorkletSetupSuccess: ({event}) => event.type === 'xstate.done.actor.audioWorkletSetupActor' && !!event.output?.audioContext,
    }
}).createMachine({
    id: 'sttWorker', // Changed ID for clarity
    context: ({ input }) => ({
        parent: input.parent,
        audioStream: input.audioStream,
        mediaRecorder: null,
        audioChunks: [],
        errorMessage: null,
        minDecibels: input.minDecibels,
        silenceDuration: input.silenceDuration,
        transcribeFn: input.transcribeFn,
        apiToken: input.apiToken,
        rmsLevel: 0,
        audioContext: null,
        sourceNode: null,
        audioWorkletNode: null,
        isWorkletReady: false,
        isStopping: false, // Initialize the new flag
    }),
    // Initial state sequence: recorder -> worklet
    initial: 'initializingRecorder',
    states: {
        initializingRecorder: {
            entry: log('[sttWorker] Entering initializingRecorder state...'),
            invoke: {
                id: 'initializeRecorderActor',
                src: 'initializeRecorderActor',
                input: ({ context }) => ({ stream: context.audioStream }),
                onDone: {
                    target: 'initializingWorklet',
                    actions: [
                        'assignRecorder',
                        'setupRecorderListeners',
                        log('[sttWorker] Recorder initialized, moving to init worklet.')
                    ]
                },
                onError: {
                    target: 'stopped',
                    // Cleanup actions removed, handled by CLEANUP or final state entry
                    actions: ['markAsStopping', 'assignError', 'sendErrorToParent', log('[sttWorker] Recorder initialization failed.')]
                }
            },
            on: {
                STOP: { actions: [log('[sttWorker] Received STOP during recorder initialization (ignored, waiting for CLEANUP).')] }, // Cleanup removed
                CLEANUP: { // <<< Added CLEANUP handler
                    target: 'stopped',
                    actions: [
                        log('[sttWorker] Received CLEANUP during recorder initialization.'),
                        'markAsStopping',
                        'removeWorkletListeners', // Safe
                        'stopAudioProcessing', // Safe
                        'stopRecorder' // Safe
                    ]
                }
            }
        },
        initializingWorklet: {
            entry: log('[sttWorker] Entering initializingWorklet state...'),
            invoke: {
                id: 'audioWorkletSetupActor',
                src: 'audioWorkletSetupActor',
                onDone: {
                    target: 'listening',
                    guard: 'isWorkletSetupSuccess',
                    actions: [
                        'assignAudioContextAndWorkletReady',
                        'setupAndStartAudioProcessing',
                        'setupWorkletMessageHandler',
                        log('[sttWorker] AudioWorklet setup success, moving to listening.')
                    ]
                },
                onError: {
                    target: 'stopped',
                    actions: [
                        'markAsStopping', // Keep markAsStopping for immediate effect
                        // removeWorkletListeners removed
                        log('[sttWorker/InvokeError] !!! onError in initializingWorklet (audioWorkletSetupActor) !!!'),
                        'assignWorkletError',
                        'sendErrorToParent'
                    ]
                }
            },
            on: {
                STOP: { actions: [log('[sttWorker] Received STOP during worklet initialization (ignored, waiting for CLEANUP).')] }, // Cleanup removed
                CLEANUP: { // <<< Added CLEANUP handler
                    target: 'stopped',
                    actions: [
                        log('[sttWorker] Received CLEANUP during worklet initialization.'),
                        'markAsStopping',
                        'removeWorkletListeners',
                        'stopAudioProcessing',
                        'stopRecorder'
                    ]
                }
            }
        },
        listening: {
            id: 'listeningState',
            entry: [
                log('[sttWorker] Entering listening state (Worklet running)...'),
            ],
            on: {
                VAD_SPEECH_START: {
                     target: 'recording',
                     actions: log('[sttWorker] VAD_SPEECH_START event received.')
                 },
                 WORKLET_RMS_UPDATE: {
                     actions: ['assignRmsLevel', 'sendRmsUpdateToParent']
                 },
                 WORKLET_ERROR: {
                    target: 'stopped',
                    actions: [
                        'markAsStopping',
                        // removeWorkletListeners removed
                        log('[sttWorker/Event] !!! WORKLET_ERROR received in listening state !!!'),
                        'assignWorkletError',
                        'sendErrorToParent'
                    ]
                 },
                 STOP: {
                    actions: [log('[sttWorker/Event] !!! STOP received in listening state (ignored, waiting for CLEANUP) !!!')] // Cleanup removed
                 },
                 CLEANUP: { // <<< Added CLEANUP handler
                    target: 'stopped',
                    actions: [
                        log('[sttWorker] Received CLEANUP in listening state.'),
                        'markAsStopping', // Mark immediately
                        'removeWorkletListeners', // Try stopping/removing listeners NOW
                        'stopAudioProcessing', // Disconnect nodes NOW
                        'stopRecorder' // Stop recorder NOW (might be inactive, but safe)
                    ]
                }
            },
            exit: [log('[sttWorker/State] !!! Exiting listening state !!!')]
        },
        recording: {
            id: 'recordingState',
            entry: [
                log('[sttWorker] Entering recording state (Worklet running)...'),
                'startRecorder'
            ],
            on: {
                RECORDING_DATA_AVAILABLE: { actions: 'appendAudioChunk' },
                VAD_SILENCE_START: {
                    target: 'waitingForProcessing',
                    guard: 'hasAudioChunks',
                    actions: [
                        log('[sttWorker] VAD_SILENCE_START received. Sending event to parent...'),
                        'sendSilenceToParent'
                    ]
                },
                WORKLET_RMS_UPDATE: {
                    actions: ['assignRmsLevel', 'sendRmsUpdateToParent']
                },
                 WORKLET_ERROR: {
                    target: 'stopped',
                    actions: [
                        'markAsStopping',
                        // removeWorkletListeners removed
                        'assignWorkletError',
                        'sendErrorToParent',
                        log('[sttWorker] Worklet error received during recording.')
                    ]
                 },
                STOP: {
                    actions: [log('[sttWorker] Received STOP during recording (ignored, waiting for CLEANUP).')] // Cleanup removed
                },
                CLEANUP: { // <<< Added CLEANUP handler
                    target: 'stopped',
                    actions: [
                        log('[sttWorker] Received CLEANUP during recording.'),
                        'markAsStopping',
                        'removeWorkletListeners',
                        'stopAudioProcessing',
                        'stopRecorder' // Definitely needs to be stopped here
                    ]
                }
            },
            // Stop recorder and worklet processing on exit -- Keep these on normal exit?
            // Let's remove them here too, as the normal exit (VAD_SILENCE_START) leads to waiting, not stopping.
            // Cleanup on transition to stopped is now handled by CLEANUP or final state entry.
            exit: [log('[sttWorker] Exiting recording state.')]
        },
        waitingForProcessing: {
             id: 'waitingState',
             entry: log('[sttWorker] Entering waitingForProcessing state...'),
             on: {
                 PROCESS_CHUNKS: {
                     target: 'processing',
                     actions: log('[sttWorker] Received PROCESS_CHUNKS, moving to processing.')
                 },
                 STOP: {
                     actions: [log('[sttWorker] Received STOP while waiting for processing (ignored, waiting for CLEANUP).')] // Cleanup removed
                  },
                 CLEANUP: { // <<< Added CLEANUP handler
                    target: 'stopped',
                    actions: [
                        log('[sttWorker] Received CLEANUP while waiting for processing.'),
                        'markAsStopping',
                        'removeWorkletListeners', // Should already be inactive, but safe
                        'stopAudioProcessing', // Should already be inactive, but safe
                        'stopRecorder' // Should already be stopped, but safe
                    ]
                 }
                 // TODO: Add WORKLET_ERROR handler? Yes, good practice.
                 // WORKLET_ERROR: { target: 'stopped', actions: [...] }
             },
        },
        processing: {
             id: 'processingState',
            entry: [log('[sttWorker] Entering processing state (Worklet stopped)...')],
            invoke: {
                id: 'transcriptionActor',
                src: 'transcriptionActor',
                input: ({ context }) => ({
                    chunks: context.audioChunks,
                    transcribeFn: context.transcribeFn,
                    token: context.apiToken
                }),
                onDone: {
                    target: 'stopped',
                    actions: [
                        'markAsStopping', // Keep markAsStopping
                        // removeWorkletListeners removed (already stopped)
                        'clearAudioChunks',
                        'sendResultToParent',
                        log('[sttWorker] Transcription successful, stopping worker.')
                    ]
                },
                onError: {
                    target: 'stopped',
                    actions: [
                        'markAsStopping', // Keep markAsStopping
                        // removeWorkletListeners removed (already stopped)
                        'clearAudioChunks',
                        'assignError',
                        'sendErrorToParent',
                        log('[sttWorker] Transcription failed, stopping worker.')
                    ]
                }
            },
            on: {
                 STOP: {
                     actions: log('[sttWorker] Received STOP during processing (ignored, waiting for CLEANUP or completion).') // Let transcription finish
                 },
                 CLEANUP: { // <<< Added CLEANUP handler (stops transcription?)
                    // It's tricky to cancel the transcription actor easily.
                    // Let's just log for now and let it transition to stopped on completion/error.
                    // The manager will call stopChild anyway.
                    actions: log('[sttWorker] Received CLEANUP during processing (ignored, will stop on completion/error).')
                 }
            }
        },
        stopped: {
            type: 'final',
            entry: [
                // <<< Reordered cleanup actions >>>
                'markAsStopping', // Ensure flag is set immediately
                log('[sttWorker] Entering final stopped state. Performing final cleanup.'),
                // Main stopping actions moved to CLEANUP handlers
                // 'removeWorkletListeners', // Remove handlers & try closing port first
                // 'stopAudioProcessing',    // Ensure port is closed & disconnect nodes
                // 'stopRecorder',         // Stop the recorder
                'closeAudioContext',    // Close the main audio context
                'clearAudioNodes',      // Clear node references
            ]
        }
    }
});

// blobToFile helper function might still be needed if not globally available
// function blobToFile(theBlob: Blob, fileName: string): File { ... }

// Helper function definition (if not already available)
// function blobToFile(theBlob: Blob, fileName: string): File {
//     const b: any = theBlob;
//     //A Blob() is almost a File() - it's just missing the two properties below which we will add
//     b.lastModifiedDate = new Date();
//     b.name = fileName;
//     return theBlob as File;
// } 