import { setup, assign, fromPromise, log, sendTo, type ActorRefFrom, fromCallback, type DoneActorEvent, sendParent, type AnyActorRef } from 'xstate';
import { blobToFile } from '$lib/utils'; // Assuming utils exists

// --- Types ---

// Internal helper function
const calculateRMS = (data: Uint8Array): number => {
	let sumSquares = 0;
	for (let i = 0; i < data.length; i++) {
		const normalizedValue = (data[i] - 128) / 128;
		sumSquares += normalizedValue * normalizedValue;
	}
	return Math.sqrt(sumSquares / data.length);
};

// Modified Context: Stream is now required input
export interface SttContext {
    parent: AnyActorRef | undefined; // Reference to the parent actor
    audioStream: MediaStream; // Now required via input
    mediaRecorder: MediaRecorder | null;
    audioChunks: Blob[];
    // transcribedText: string | null; // Worker doesn't need to hold final text
    errorMessage: string | null;
    minDecibels: number;
    silenceDuration: number;
    transcribeFn: (token: string, audioFile: File) => Promise<{ text: string }>; // Required via input
    apiToken: string; // Required via input
    // Audio Analysis State
    rmsLevel: number;
    // Remove audioContext and analyserNode if managed within the service
}

// Modified Events: Added parent communication and control events
export type SttEvent =
    // | { type: 'START_LISTENING'; payload?: { token?: string | null } } // Removed, started by manager
    // | { type: 'STOP_LISTENING' } // Removed, controlled by manager via STOP
    // | { type: 'PERMISSION_GRANTED'; stream: MediaStream } // Removed, handled by manager
    // | { type: 'PERMISSION_DENIED'; error: string } // Removed, handled by manager
    | { type: 'INITIALIZATION_COMPLETE'; recorder: MediaRecorder }
    | { type: 'INITIALIZATION_FAILED'; error: string }
    | { type: 'SOUND_DETECTED' }
    | { type: 'SILENCE_DETECTED' }
    | { type: '_AUDIO_ANALYSIS_UPDATE'; rms: number }
    | { type: 'RECORDING_DATA_AVAILABLE'; data: Blob }
    | { type: 'PROCESS_CHUNKS' } // Sent by manager
    | { type: 'STOP' } // Sent by manager
    // | { type: 'TRANSCRIPTION_SUCCESS'; text: string } // Internal event from actor
    // | { type: 'TRANSCRIPTION_ERROR'; error: string } // Internal event from actor
    // | { type: 'RESET' }; // Removed, managed by manager lifecycle

    // Events sent back FROM actors (need proper typing)
    | DoneActorEvent<MediaRecorder> // From initializeRecorderActor
    | DoneActorEvent<{ text: string }> // From transcriptionActor
    | { type: 'error.actor'; error: unknown; id: string } // General actor errors

    | { type: 'AUDIO_CHUNK'; data: Blob }

// --- Machine Setup ---

export const sttMachine = setup({
    types: {
        context: {} as SttContext,
        events: {} as SttEvent,
        // Input now includes required fields
        input: {} as Pick<SttContext, 'audioStream' | 'minDecibels' | 'silenceDuration' | 'transcribeFn' | 'apiToken' | 'parent'>
    },
    actors: {
        // micPermissionActor removed
        // ... existing code ...
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
        // audioAnalysisService remains largely the same internally
        audioAnalysisService: fromCallback<SttEvent, { stream: MediaStream, minDecibels: number, silenceDuration: number }>(({ input, sendBack, self }) => {
             console.log('[sttWorker/audioAnalysisService] Actor starting...');
            const { stream, minDecibels, silenceDuration } = input;
             console.log('[sttWorker/audioAnalysisService] Received input - stream:', stream.id, 'minDecibels:', minDecibels, 'silenceDuration:', silenceDuration);
             // Check if stream is active
             if (!stream || !stream.active) {
                 console.error('[sttWorker/audioAnalysisService] Received inactive stream.');
                 // Send an error back immediately?
                 // sendBack({ type: 'ANALYSIS_ERROR', error: 'Inactive stream provided' });
                 return; // Stop execution
             }
             // ... rest of the analysis service logic ...
             // Ensure it uses the correct `sendBack` for events like SOUND_DETECTED, SILENCE_DETECTED, _AUDIO_ANALYSIS_UPDATE
             let audioContext: AudioContext | null = null;
             let analyser: AnalyserNode | null = null;
             let source: MediaStreamAudioSourceNode | null = null;
             let animationFrameId: number | null = null;
             let silenceTimeoutId: ReturnType<typeof setTimeout> | null = null;
             let wasSoundDetected = false;
             let isSilent = true;

             try {
                 audioContext = new AudioContext();
                 source = audioContext.createMediaStreamSource(stream);
                 analyser = audioContext.createAnalyser();
                 analyser.minDecibels = minDecibels;
                 analyser.maxDecibels = -30;
                 source.connect(analyser);

                 const bufferLength = analyser.frequencyBinCount;
                 const domainData = new Uint8Array(bufferLength);
                 const timeDomainData = new Uint8Array(analyser.fftSize);

                 const loop = () => {
                     if (!analyser || !audioContext || audioContext.state === 'closed') {
                         console.log('[sttWorker/audioAnalysisService] Analysis loop stopping (context closed or analyser missing).');
                         return;
                     }
                     analyser.getByteTimeDomainData(timeDomainData);
                     analyser.getByteFrequencyData(domainData);
                     const rms = calculateRMS(timeDomainData);
                     const hasSound = domainData.some(value => value > 0);

                     sendBack({ type: '_AUDIO_ANALYSIS_UPDATE', rms });

                     if (hasSound) {
                         isSilent = false;
                         if (silenceTimeoutId) { clearTimeout(silenceTimeoutId); silenceTimeoutId = null; }
                         if (!wasSoundDetected) {
                             console.log('[sttWorker/audioAnalysisService] SOUND DETECTED');
                             sendBack({ type: 'SOUND_DETECTED' });
                             wasSoundDetected = true;
                         }
                     } else {
                         if (!isSilent && !silenceTimeoutId) {
                             console.log(`[sttWorker/audioAnalysisService] Silence started, timeout ${silenceDuration}ms`);
                             silenceTimeoutId = setTimeout(() => {
                                 console.log('[sttWorker/audioAnalysisService] SILENCE DETECTED (timeout)');
                                 sendBack({ type: 'SILENCE_DETECTED' });
                                 silenceTimeoutId = null;
                                 isSilent = true;
                                 wasSoundDetected = false;
                             }, silenceDuration);
                         }
                         isSilent = true;
                     }
                     animationFrameId = requestAnimationFrame(loop);
                 };
                 animationFrameId = requestAnimationFrame(loop);

             } catch (err: any) {
                  console.error('[sttWorker/audioAnalysisService] Error starting:', err);
                  if (source) source.disconnect();
                  if (audioContext && audioContext.state !== 'closed') audioContext.close();
                  if (animationFrameId) cancelAnimationFrame(animationFrameId);
                  if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
                  // Send error back to machine?
                  // sendBack({ type: 'ANALYSIS_ERROR', error: err.message });
                  return;
             }

             return () => {
                 console.log(`[sttWorker/audioAnalysisService] Stopping analysis for worker ${self.id}...`);
                 if (animationFrameId) cancelAnimationFrame(animationFrameId);
                 if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
                 if (source) source.disconnect();
                 if (analyser) analyser.disconnect();
                 if (audioContext && audioContext.state !== 'closed') {
                     audioContext.close().catch(e => console.error('Error closing AudioContext:', e));
                 }
             };
        })
    },
    actions: {
        assignRecorder: assign({
            mediaRecorder: ({ event }) => {
                return (event as DoneActorEvent<MediaRecorder>).output;
            }
        }),
        assignError: assign({
            errorMessage: ({ event }) => {
                console.error("[sttWorker] Error event received:", event);
                let message = 'An unknown worker error occurred';
                // Prioritize actor errors
                if (event.type === 'error.actor') {
                    const errorData = event.error;
                    if (errorData instanceof Error) message = errorData.message;
                    else if (typeof errorData === 'string') message = errorData;
                    else try { message = JSON.stringify(errorData); } catch { /* ignore */ }
                } else if (event.type === 'INITIALIZATION_FAILED') { // Keep specific init failed
                    message = event.error;
                }
                // else if ('data' in event && event.data) { // Handle errors from promises (like initializeRecorderActor)
                //     const errorData = event.data;
                //     if (errorData instanceof Error) message = errorData.message;
                //     else if (typeof errorData === 'string') message = errorData;
                //     else try { message = JSON.stringify(errorData); } catch { /* ignore */ }
                // }
                console.log(`[sttWorker] Assigning error message: ${message}`);
                return message;
            }
            // No context clearing here, happens on stop/manager decision
        }),
        // clearError removed (errors lead to stopped state or are handled by manager)
        // startRecorder/stopRecorder remain similar but logs adjusted
        startRecorder: ({ context }) => {
            if (context.mediaRecorder && context.mediaRecorder.state === 'inactive') {
                console.log('[sttWorker] Starting media recorder with timeslice...');
                context.mediaRecorder.start(500); // Use a reasonable timeslice
            } else {
                console.warn('[sttWorker] Recorder not ready or already recording.');
            }
        },
         // Action to setup recorder listeners
         setupRecorderListeners: ({ context, self }) => {
             if (context.mediaRecorder) {
                 console.log('[sttWorker] Setting up MediaRecorder listeners...');
                 context.mediaRecorder.ondataavailable = (event) => {
                     if (event.data.size > 0) {
                         // Use self.send to send the event to the machine instance
                         self.send({ type: 'RECORDING_DATA_AVAILABLE', data: event.data });
                     }
                 };
                 context.mediaRecorder.onstop = () => {
                      console.log('[sttWorker] MediaRecorder stopped.');
                      // Optionally send an internal event if needed
                 };
                 context.mediaRecorder.onerror = (event) => {
                      console.error('[sttWorker] MediaRecorder error:', event);
                      // Send error event to the machine
                      self.send({ type: 'INITIALIZATION_FAILED', error: 'MediaRecorder error' }); // Reuse or create specific event?
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
        // closeAudioStream removed - manager handles stream
        // resetContext removed - manager handles lifecycle
        // updateToken removed - token passed via input
        assignAnalysisUpdate: assign({
            rmsLevel: ({ context, event }) => {
                if (event.type === '_AUDIO_ANALYSIS_UPDATE') {
                     return event.rms;
                 }
                 return context.rmsLevel;
            },
        }),
        // resetAnalysisContextOnError removed
        // --- New Actions for Parent Communication ---
        sendSilenceToParent: sendParent(({ self }) => ({ type: 'WORKER_SILENCE_DETECTED', workerRef: self })),
        sendResultToParent: sendParent(
            ({ context, event, self }) => {
                // Explicitly type the event for this specific context
                const doneEvent = event as DoneActorEvent<{ text: string }>;
                let textToSend = ''; // Default to empty string

                // Check the correct event type AND if the output exists and has text
                if (doneEvent.type === 'xstate.done.actor.transcriptionActor' && typeof doneEvent.output?.text === 'string') {
                    textToSend = doneEvent.output.text;
                } else {
                    // Log if transcription succeeded but returned nothing or unexpected type
                    console.log('[sttWorker] No valid text found in transcription result, sending empty result.');
                }

                console.log(`[sttWorker] Sending WORKER_TRANSCRIPTION_RESULT: "${textToSend}" from worker ${self.id}`);
                // Include workerRef in the event payload
                return { type: 'WORKER_TRANSCRIPTION_RESULT', text: textToSend, workerRef: self };

                // return { type: 'ignore' }; // Should not happen if called correctly
            }
        ),
        sendErrorToParent: sendParent(
            ({ context, event }) => {
                // Extract error message from context or event
                let errorMessage = context.errorMessage || 'Unknown worker error';
                // If triggered by actor error event, use that specific error
                if (event.type === 'error.actor' && event.id === 'transcriptionActor') {
                     const errorData = event.error;
                      if (errorData instanceof Error) errorMessage = errorData.message;
                      else if (typeof errorData === 'string') errorMessage = errorData;
                      else try { errorMessage = JSON.stringify(errorData); } catch { /* ignore */ }
                      console.error('[sttWorker] Transcription actor failed:', errorMessage);
                } else if (event.type === 'error.actor' && event.id === 'initializeRecorderActor') {
                     const errorData = event.error;
                      if (errorData instanceof Error) errorMessage = errorData.message;
                      else if (typeof errorData === 'string') errorMessage = errorData;
                      else try { errorMessage = JSON.stringify(errorData); } catch { /* ignore */ }
                      console.error('[sttWorker] Initialize recorder actor failed:', errorMessage);
                }
                 // Use the message stored in context if available (from assignError)
                 errorMessage = context.errorMessage || errorMessage;

                console.log(`[sttWorker] Sending WORKER_ERROR: ${errorMessage}`);
                return { type: 'WORKER_ERROR', error: errorMessage };
            }
        )
    },
    guards: {
        hasAudioChunks: ({ context }) => context.audioChunks.length > 0,
        // hasTranscribeFn removed (required input)
        // hasToken removed (required input)
        // Correct event type comparisons using 'xstate.' prefix
        isMediaRecorder: ({event}) => event.type === 'xstate.done.actor.initializeRecorderActor' && event.output instanceof MediaRecorder,
        isNotMediaRecorder: ({event}) => event.type === 'xstate.done.actor.initializeRecorderActor' && !(event.output instanceof MediaRecorder)
    }
}).createMachine({
    id: 'sttWorker', // Changed ID for clarity
    // context initialized with required input fields
    context: ({ input }) => ({
        parent: input.parent, // Store parent ref if needed for direct communication (though sendParent is preferred)
        audioStream: input.audioStream,
        mediaRecorder: null,
        audioChunks: [],
        // transcribedText: null, // Remove from context
        errorMessage: null,
        minDecibels: input.minDecibels,
        silenceDuration: input.silenceDuration,
        transcribeFn: input.transcribeFn,
        apiToken: input.apiToken,
        rmsLevel: 0,
    }),
    // Initial state is now initializing
    initial: 'initializing',
    states: {
        // idle state removed
        // permissionPending state removed
        initializing: {
            entry: log('[sttWorker] Entering initializing state...'),
            invoke: {
                id: 'initializeRecorderActor',
                src: 'initializeRecorderActor',
                input: ({ context }) => ({ stream: context.audioStream }),
                onDone: {
                    target: 'listening',
                    actions: [
                        { type: 'assignRecorder' },
                        { type: 'setupRecorderListeners' },
                        log('[sttWorker] Recorder initialized, moving to listening.')
                    ]
                },
                onError: {
                    target: 'stopped',
                    actions: [{ type: 'assignError' }, 'sendErrorToParent', log('[sttWorker] Recorder initialization failed.')]
                }
            },
            on: {
                // Allow stopping during initialization
                STOP: { target: 'stopped', actions: log('[sttWorker] Received STOP during initialization.') }
            }
        },
        listening: {
            id: 'listeningState',
            entry: [
                log('[sttWorker] Entering listening state...'),
                // 'clearError' // Error cleared on successful init
            ],
            invoke: {
                 id: 'audioAnalysisService',
                 src: 'audioAnalysisService',
                 input: ({context}) => ({
                     stream: context.audioStream, // Use stream from context
                     minDecibels: context.minDecibels,
                     silenceDuration: context.silenceDuration
                 }),
                  // Handle errors from the analysis service itself?
                  onError: {
                      target: 'stopped',
                      actions: [
                          assign({errorMessage: 'Audio analysis service failed'}), // Generic error
                          'sendErrorToParent',
                          log('[sttWorker] Audio Analysis Service error.')
                      ]
                  }
             },
            on: {
                SOUND_DETECTED: {
                     target: 'recording',
                     actions: log('[sttWorker] SOUND_DETECTED event received.')
                 },
                 _AUDIO_ANALYSIS_UPDATE: {
                     actions: 'assignAnalysisUpdate'
                 },
                 // Stop command from manager
                 STOP: { target: 'stopped', actions: log('[sttWorker] Received STOP during listening.') }
            },
            // exit: log('[sttWorker] Exiting listening state.') // analysis service stopped implicitly
        },
        recording: {
            id: 'recordingState',
            entry: [
                log('[sttWorker] Entering recording state...'),
                'startRecorder' // Start recorder assumes listeners are set up
            ],
             invoke: { // Keep analysis running
                 id: 'audioAnalysisService',
                 src: 'audioAnalysisService',
                 input: ({context}) => ({
                     stream: context.audioStream,
                     minDecibels: context.minDecibels,
                     silenceDuration: context.silenceDuration
                 }),
                  onError: { // Handle analysis errors during recording too
                      target: 'stopped',
                      actions: [
                          assign({errorMessage: 'Audio analysis service failed during recording'}),
                          'sendErrorToParent',
                          log('[sttWorker] Audio Analysis Service error during recording.')
                      ]
                  }
             },
            on: {
                // Event sent internally from setupRecorderListeners
                RECORDING_DATA_AVAILABLE: { actions: 'appendAudioChunk' },
                SILENCE_DETECTED: {
                    target: 'waitingForProcessing', // Go to new state
                    guard: 'hasAudioChunks',
                    // Send event to parent INSTEAD of transitioning directly
                    actions: [
                        log('[sttWorker] SILENCE_DETECTED received in recording state. Sending event to parent...'),
                        'sendSilenceToParent'
                    ]
                },
                _AUDIO_ANALYSIS_UPDATE: {
                    actions: 'assignAnalysisUpdate'
                },
                // Stop command from manager
                STOP: {
                    target: 'stopped', // Stop immediately if told to
                    actions: ['stopRecorder', log('[sttWorker] Received STOP during recording.')]
                }
            },
            exit: ['stopRecorder', log('[sttWorker] Exiting recording state.')] // Stop recorder when leaving
        },
        // New state to wait for manager's instruction
        waitingForProcessing: {
             id: 'waitingState',
             entry: log('[sttWorker] Entering waitingForProcessing state...'),
             on: {
                 PROCESS_CHUNKS: {
                     target: 'processing',
                     // Guard shouldn't be needed here if SILENCE_DETECTED guard worked
                     actions: log('[sttWorker] SUCCESS: Received PROCESS_CHUNKS in waiting state, moving to processing.')
                 },
                 // Also handle STOP while waiting
                 STOP: {
                      target: 'stopped',
                      actions: log('[sttWorker] Received STOP while waiting for processing.')
                  }
             },
             // Exit actions if needed? Recorder should already be stopped from recording exit.
        },
        processing: {
             id: 'processingState',
            // Clear chunks just before invoking actor
            entry: [log('[sttWorker] Entering processing state...')],
            invoke: {
                id: 'transcriptionActor',
                src: 'transcriptionActor',
                // Pass required context items
                input: ({ context }) => ({
                    chunks: context.audioChunks, // Chunks should be available here
                    transcribeFn: context.transcribeFn,
                    token: context.apiToken
                }),
                onDone: {
                    target: 'stopped', // Worker is done after successful transcription
                    actions: [
                        'stopRecorder',
                        'clearAudioChunks',
                        'sendResultToParent',
                        log('[sttWorker] Transcription successful, stopping and cleaning up recorder.')
                    ]
                },
                onError: {
                    target: 'stopped', // Worker stops on transcription error
                    actions: [
                        'stopRecorder',
                        'clearAudioChunks',
                        'assignError',
                        'sendErrorToParent',
                        log('[sttWorker] Transcription failed, stopping and cleaning up recorder.')
                    ]
                }
            },
            // Remove always guard (manager responsibility)
            on: {
                 // Handle STOP event during processing? Maybe just let it finish?
                 // For simplicity, let's assume it finishes or errors out.
                 // If immediate stop is needed, we'd need cancellation logic.
                 STOP: {
                     actions: log('[sttWorker] Received STOP during processing (ignored, will finish/error out).')
                 }
            }
        },
        // transcribed state removed
        // error state removed

        // Final state for the worker
        stopped: {
            type: 'final',
            entry: log('[sttWorker] Entering final stopped state.')
            // Cleanup actions like stopping recorder/analysis are handled in exit actions of previous states or manager stops the actor.
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