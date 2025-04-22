import { setup, assign, fromPromise, log, sendTo, type ActorRefFrom, fromCallback, type DoneActorEvent } from 'xstate';
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

export interface SttContext {
    audioStream: MediaStream | null;
    mediaRecorder: MediaRecorder | null;
    audioChunks: Blob[];
    transcribedText: string | null;
    errorMessage: string | null;
    minDecibels: number; // Sensitivity for sound detection
    silenceDuration: number; // Milliseconds of silence to stop recording
    // Function injected from outside to perform the actual transcription API call
    transcribeFn?: (token: string, audioFile: File) => Promise<{ text: string }>; // Adjust based on actual API response
    apiToken?: string | null;
    // Audio Analysis State
    rmsLevel: number;
    audioContext: AudioContext | null;
    analyserNode: AnalyserNode | null;
}

type SttEvent =
    | { type: 'START_LISTENING'; payload?: { token?: string | null } } // Triggered externally
    | { type: 'STOP_LISTENING' } // Triggered externally
    | { type: 'PERMISSION_GRANTED'; stream: MediaStream }
    | { type: 'PERMISSION_DENIED'; error: string }
    | { type: 'INITIALIZATION_COMPLETE'; recorder: MediaRecorder }
    | { type: 'INITIALIZATION_FAILED'; error: string }
    // Re-add explicit events, keep internal update for RMS
    | { type: 'SOUND_DETECTED' }
    | { type: 'SILENCE_DETECTED' }
    | { type: '_AUDIO_ANALYSIS_UPDATE'; rms: number } // Only RMS needed now
    | { type: 'RECORDING_DATA_AVAILABLE'; data: Blob }
    | { type: 'TRANSCRIPTION_SUCCESS'; text: string }
    | { type: 'TRANSCRIPTION_ERROR'; error: string }
    | { type: 'RESET' };

// --- Machine Setup ---

export const sttMachine = setup({
    types: {
        context: {} as SttContext,
        events: {} as SttEvent,
        input: {} as Partial<Pick<SttContext, 'minDecibels' | 'silenceDuration' | 'transcribeFn' | 'apiToken'>>
    },
    actors: {
        micPermissionActor: fromPromise(async () => {
            console.log('[sttMachine] Requesting microphone permission...');
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('MediaDevices API not available.');
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[sttMachine] Permission granted, stream received:', stream);
            if (!(stream instanceof MediaStream)) {
                console.error('[sttMachine] getUserMedia did not return a valid MediaStream!');
                throw new Error('Invalid MediaStream received.');
            }
            return stream;
        }),
        initializeRecorderActor: fromPromise(async ({ input }: { input: { stream: MediaStream } }) => {
            console.log('[sttMachine] Initializing MediaRecorder with stream:', input.stream);
            if (!(input.stream instanceof MediaStream)) {
                console.error('[sttMachine] Invalid stream passed to initializeRecorderActor:', input.stream);
                throw new Error('Invalid MediaStream received by actor.');
            }
            const stream = input.stream;
            let options = {};
            // Log supported types
            const supportedTypes = [
                'audio/wav',
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/aac',
                '' // Default
            ];
            console.log("[sttMachine] Checking supported MIME types:");
            supportedTypes.forEach(type => {
                console.log(`  ${type}: ${MediaRecorder.isTypeSupported(type)}`);
            });

            // Prioritize WAV, then Opus formats, then webm default
            if (MediaRecorder.isTypeSupported('audio/wav')) {
                 console.log('[sttMachine] Using audio/wav');
                 options = { mimeType: 'audio/wav' };
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                console.log('[sttMachine] Using audio/webm;codecs=opus');
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                console.log('[sttMachine] Using audio/ogg;codecs=opus');
                options = { mimeType: 'audio/ogg;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                console.log('[sttMachine] Using audio/webm (default codec)');
                options = { mimeType: 'audio/webm' };
            } else {
                 console.warn('[sttMachine] No preferred MIME type supported, trying default.');
                 // Keep options empty if no specific type is supported
                 if (!MediaRecorder.isTypeSupported('')) {
                      throw new Error('MediaRecorder not supported or no suitable audio format.');
                 }
                 options = {}; // Explicitly empty
            }

            let recorder;
            try {
                // Only pass options if it's not empty
                recorder = Object.keys(options).length > 0 ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
            } catch (e) {
                console.error("[sttMachine] Error creating MediaRecorder instance:", e);
                throw e; // Rethrow the specific error
            }

            // Check recorder state or add listeners if needed for readiness?
            await new Promise(resolve => setTimeout(resolve, 50)); // Short delay to ensure recorder is ready?
            console.log('[sttMachine] MediaRecorder initialized.');
            return recorder;
        }),
        transcriptionActor: fromPromise(async ({ input }: { input: { chunks: Blob[], transcribeFn: SttContext['transcribeFn'], token: string | null } }) => {
            console.log('[sttMachine] Starting transcription...');
            const { chunks, transcribeFn, token } = input;
            if (!transcribeFn) {
                throw new Error('Transcription function (transcribeFn) not provided.');
            }
            if (!token) {
                throw new Error('API token not provided for transcription.');
            }
            if (chunks.length === 0) {
                console.log('[sttMachine] No audio chunks to transcribe.');
                return { text: '' }; // Return empty text if no audio
            }
            const audioBlob = new Blob(chunks, { type: chunks[0]?.type || 'audio/wav' });
            // Determine extension from blob type
            const mimeType = audioBlob.type;
            const extension = mimeType?.split('/')[1]?.split(';')[0] ?? 'wav'; // Get subtype, remove codecs if present
            const audioFile = blobToFile(audioBlob, `recording.${extension}`);
            console.log(`[sttMachine] Transcribing audio file (${(audioFile.size / 1024).toFixed(1)} KB) of type ${mimeType}...`);
            const result = await transcribeFn(token, audioFile);
            console.log('[sttMachine] Transcription successful:', result);
            return result; // Expecting { text: string }
        }),
        // Modified actor for audio analysis
        audioAnalysisService: fromCallback<SttEvent, { stream: MediaStream, minDecibels: number, silenceDuration: number }>(({ input, sendBack }) => {
            console.log('[sttMachine/audioAnalysisService] Actor starting...');
            const { stream, minDecibels, silenceDuration } = input;
            console.log('[sttMachine/audioAnalysisService] Received input - stream:', stream, 'minDecibels:', minDecibels, 'silenceDuration:', silenceDuration);
            let audioContext: AudioContext | null = null;
            let analyser: AnalyserNode | null = null;
            let source: MediaStreamAudioSourceNode | null = null;
            let animationFrameId: number | null = null;
            let silenceTimeoutId: ReturnType<typeof setTimeout> | null = null;
            let wasSoundDetected = false; // Track if sound has already been detected
            let isSilent = true; // Track current silence state

            console.log('[sttMachine/audioAnalysisService] Starting analysis...');

            try {
                audioContext = new AudioContext();
                source = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.minDecibels = minDecibels;
                analyser.maxDecibels = -30; // Default max, can be adjusted
                source.connect(analyser);

                const bufferLength = analyser.frequencyBinCount;
                const domainData = new Uint8Array(bufferLength);
                const timeDomainData = new Uint8Array(analyser.fftSize);

                const loop = () => {
                    if (!analyser) return;
                    analyser.getByteTimeDomainData(timeDomainData);
                    analyser.getByteFrequencyData(domainData);
                    const rms = calculateRMS(timeDomainData);
                    const hasSound = domainData.some(value => value > 0);

                    // Send RMS update event every frame
                    sendBack({ type: '_AUDIO_ANALYSIS_UPDATE', rms });
                    // Log after sending event
                    // console.log(`[sttMachine/audioAnalysisService] Sent _AUDIO_ANALYSIS_UPDATE, RMS: ${rms.toFixed(3)}`);

                    if (hasSound) {
                        // Sound is present
                        isSilent = false;
                        if (silenceTimeoutId) {
                            clearTimeout(silenceTimeoutId);
                            silenceTimeoutId = null;
                        }
                        if (!wasSoundDetected) {
                            console.log('[sttMachine/audioAnalysisService] SOUND DETECTED');
                            sendBack({ type: 'SOUND_DETECTED' });
                            wasSoundDetected = true; // Send only once per listening cycle? Or allow re-trigger?
                                                    // Current logic sends SOUND_DETECTED only once after silence.
                        }
                    } else {
                        // Sound is not present (silence)
                        if (!isSilent && !silenceTimeoutId) {
                            // Transitioning to silence, start timer
                            console.log(`[sttMachine/audioAnalysisService] Silence started, timeout ${silenceDuration}ms`);
                            silenceTimeoutId = setTimeout(() => {
                                console.log('[sttMachine/audioAnalysisService] SILENCE DETECTED (timeout)');
                                sendBack({ type: 'SILENCE_DETECTED' });
                                silenceTimeoutId = null;
                                isSilent = true; // Mark as definitively silent after timeout
                                wasSoundDetected = false; // Reset sound detection flag after silence
                            }, silenceDuration);
                        }
                        // Update isSilent flag immediately
                        isSilent = true;
                    }

                    animationFrameId = requestAnimationFrame(loop);
                };
                animationFrameId = requestAnimationFrame(loop);

            } catch (err: any) {
                 console.error('[sttMachine/audioAnalysisService] Error starting:', err);
                 // Optionally send an error event back? Or let the machine handle initialization failure?
                 // self.send({ type: 'ANALYSIS_ERROR', error: err.message });
                 // Cleanup if partially initialized
                 if (source) source.disconnect();
                 if (audioContext && audioContext.state !== 'closed') audioContext.close();
                 if (animationFrameId) cancelAnimationFrame(animationFrameId);
                 if (silenceTimeoutId) clearTimeout(silenceTimeoutId); // Clear timer on cleanup
                 return;
            }

            // Cleanup function returned by fromCallback
            return () => {
                console.log('[sttMachine/audioAnalysisService] Stopping analysis...');
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                if (source) source.disconnect();
                if (analyser) analyser.disconnect(); // Ensure analyser is also disconnected
                if (audioContext && audioContext.state !== 'closed') {
                    audioContext.close().catch(e => console.error('Error closing AudioContext:', e));
                }
                 // Send one last update with 0 RMS? Optional.
                 // sendBack({ type: '_AUDIO_ANALYSIS_UPDATE', rms: 0, hasSound: false });
            };
        })
    },
    actions: {
        assignError: assign({
            errorMessage: ({ event }) => {
                console.error("[sttMachine] Error event received:", event); // Log the whole error event
                let message = 'An unknown STT error occurred';
                // Check specific event types first
                if (event.type === 'PERMISSION_DENIED' || event.type === 'INITIALIZATION_FAILED' || event.type === 'TRANSCRIPTION_ERROR') {
                    message = event.error; // Assuming simple string error
                } else if ('data' in event && event.data) {
                    // Handle errors from invoked actors (promises)
                    const errorData = event.data;
                    if (errorData instanceof Error) {
                         message = errorData.message;
                    } else if (typeof errorData === 'string') {
                         message = errorData;
                    } else if (typeof errorData === 'object' && errorData !== null) {
                        if ('detail' in errorData && typeof errorData.detail === 'string') {
                            message = errorData.detail; // Extract detail if available
                        } else if ('message' in errorData && typeof errorData.message === 'string') {
                            message = errorData.message; // Extract message if available
                        } else {
                            try { message = JSON.stringify(errorData); } catch { /* Ignore stringify errors */ }
                        }
                    }
                }
                console.log(`[sttMachine] Assigning error message: ${message}`);
                return message;
            },
            // Clear other relevant fields on error?
            audioStream: ({context, event}) => (event.type === 'PERMISSION_DENIED' || 'data' in event) ? null : context.audioStream,
            mediaRecorder: ({context, event}) => (event.type === 'INITIALIZATION_FAILED' || 'data' in event) ? null : context.mediaRecorder,
            audioChunks: [], // Clear chunks on error
            transcribedText: null
        }),
        clearError: assign({ errorMessage: null }),
        startRecorder: ({ context }) => {
            if (context.mediaRecorder && context.mediaRecorder.state === 'inactive') {
                console.log('[sttMachine] Starting media recorder with timeslice...');
                // Add timeslice argument (e.g., 500ms) to trigger ondataavailable periodically
                context.mediaRecorder.start(500);
            } else {
                console.warn('[sttMachine] Recorder not ready or already recording.');
            }
        },
        stopRecorder: ({ context }) => {
            if (context.mediaRecorder && context.mediaRecorder.state === 'recording') {
                console.log('[sttMachine] Stopping media recorder...');
                context.mediaRecorder.stop();
            } else {
                console.warn('[sttMachine] Recorder not recording or not available.');
            }
        },
        appendAudioChunk: assign({
            audioChunks: ({ context, event }) => {
                if (event.type === 'RECORDING_DATA_AVAILABLE') {
                    console.log(`[sttMachine] Appending audio chunk, size: ${event.data.size}. Current chunks: ${context.audioChunks.length}`);
                    return [...context.audioChunks, event.data];
                }
                return context.audioChunks;
            }
        }),
        clearAudioChunks: assign({ audioChunks: [] }),
        closeAudioStream: ({ context }: { context: SttContext }) => {
            console.log('[sttMachine] Closing audio stream tracks (action)...');
            context.audioStream?.getTracks().forEach(track => track.stop());
            // Return the result of assign()
            return assign({
                audioStream: null,
                audioContext: null,
                analyserNode: null,
                // Ensure silenceStartTime is cleared if it exists in context (it doesn't currently)
                // silenceStartTime: null,
                rmsLevel: 0
           });
        },
        resetContext: assign({
            audioStream: null,
            mediaRecorder: null,
            audioChunks: [],
            transcribedText: null,
            errorMessage: null,
            // Also reset analysis context
            rmsLevel: 0,
            audioContext: null,
            analyserNode: null,
        }),
        updateToken: assign({
            apiToken: ({ event, context }) => {
                if (event.type === 'START_LISTENING' && event.payload?.token !== undefined) {
                    return event.payload.token;
                }
                return context.apiToken; // Keep existing if not provided
            }
        }),
        // Modified Action for Analysis Update (RMS only)
        assignAnalysisUpdate: assign({
            rmsLevel: ({ context, event }) => {
                if (event.type === '_AUDIO_ANALYSIS_UPDATE') {
                     // console.log(`[sttMachine] assignAnalysisUpdate called. RMS: ${event.rms}`); // Remove log
                     return event.rms;
                 }
                 // Return previous value if event type doesn't match
                 return context.rmsLevel;
            },
        }),
        // New action to reset analysis context specifically on error
        resetAnalysisContextOnError: assign({
            audioStream: null,
            mediaRecorder: null,
            audioChunks: [],
            transcribedText: null,
            // Keep errorMessage as is
            rmsLevel: 0,
            audioContext: null,
            analyserNode: null,
        })
    },
    guards: {
        hasAudioChunks: ({ context }) => context.audioChunks.length > 0,
        hasTranscribeFn: ({ context }) => typeof context.transcribeFn === 'function',
        hasToken: ({ context }) => typeof context.apiToken === 'string' && context.apiToken.length > 0,
    }
}).createMachine({
    id: 'stt',
    context: ({ input }) => ({
        audioStream: null,
        mediaRecorder: null,
        audioChunks: [],
        transcribedText: null,
        errorMessage: null,
        minDecibels: input?.minDecibels ?? -45,
        silenceDuration: input?.silenceDuration ?? 1500,
        transcribeFn: input?.transcribeFn,
        apiToken: input?.apiToken,
        // Init analysis context
        rmsLevel: 0,
        audioContext: null,
        analyserNode: null,
    }),
    initial: 'idle',
    states: {
        idle: {
            entry: 'resetContext', // Ensure context is clean on entering idle
            on: {
                START_LISTENING: { target: 'permissionPending', actions: 'updateToken' }
            }
        },
        permissionPending: {
            entry: log('Requesting mic permission...'),
            invoke: {
                id: 'micPermissionActor',
                src: 'micPermissionActor',
                onDone: {
                    target: 'initializing',
                    actions: [
                        log(({ context, event }: { context: SttContext, event: DoneActorEvent<MediaStream> }) => `[sttMachine] Before assignStream. Context stream: ${context.audioStream}, Event output stream: ${event.output instanceof MediaStream}`),
                        // Inline the assignStream logic here
                        assign( ({ event }: { event: DoneActorEvent<MediaStream> }) => {
                            console.log('[sttMachine] Assigning stream from event:', event.output);
                            if (event.output instanceof MediaStream) {
                                return {
                                    audioStream: event.output,
                                    errorMessage: undefined // Clear error on success
                                };
                            } else {
                                console.error('[sttMachine] Invalid stream in PERMISSION_GRANTED event output!');
                                return {
                                    audioStream: null,
                                    errorMessage: 'Invalid MediaStream received after permission grant.'
                                };
                            }
                        }),
                        log(({ context }: { context: SttContext }) => `[sttMachine] After assignStream. Context stream: ${context.audioStream}`)
                    ]
                },
                onError: {
                    target: 'error',
                    actions: 'assignError' // Use existing named action as a string
                }
            },
             on: {
                // Allow stopping while pending permission
                STOP_LISTENING: { target: 'idle' },
                RESET: { target: 'idle' }
            }
        },
        initializing: {
            entry: log('Initializing recorder...'),
            // Use single invoke with proper onDone/onError handling
            invoke: {
                id: 'initializeRecorderActor',
                src: 'initializeRecorderActor',
                input: ({ context }) => ({ stream: context.audioStream! }),
                onDone: {
                    target: 'listening',
                    // Assign recorder directly inline using assign
                    actions: assign(
                        ({ event }: { event: DoneActorEvent<MediaRecorder> }) => {
                            if (event.output instanceof MediaRecorder) {
                                return {
                                    mediaRecorder: event.output,
                                    errorMessage: undefined // Clear error on success
                                };
                            } else {
                                console.error('[sttMachine] Invalid output from initializeRecorderActor:', event.output);
                                return {
                                    mediaRecorder: null,
                                    errorMessage: 'Failed to initialize MediaRecorder instance.' // Set error message
                                };
                            }
                        }
                    )
                },
                onError: {
                    target: 'error',
                    // Use existing named action
                    actions: ['assignError', 'closeAudioStream'] // Assign error and cleanup stream
                }
            },
             on: {
                // Still allow stopping during initialization
                STOP_LISTENING: { target: 'idle', actions: 'closeAudioStream' },
                RESET: { target: 'idle', actions: ['closeAudioStream', 'resetContext'] }
            }
        },
        listening: {
            id: 'listeningState',
            entry: [log('Entered listening state'), log('Listening for sound...'), 'clearError'],
            invoke: {
                 id: 'audioAnalysisService',
                 src: 'audioAnalysisService',
                 input: ({context}) => ({
                     stream: context.audioStream!,
                     minDecibels: context.minDecibels,
                     silenceDuration: context.silenceDuration // Pass duration to service
                 }),
             },
            on: {
                // Use explicit SOUND_DETECTED event for transition
                SOUND_DETECTED: {
                     target: 'recording',
                     // Remove log action temporarily to test transition
                     // actions: log('SOUND_DETECTED event received in listening state')
                 },
                 _AUDIO_ANALYSIS_UPDATE: { // Still listen for RMS updates
                     actions: 'assignAnalysisUpdate'
                 },
                STOP_LISTENING: { target: 'idle', actions: 'closeAudioStream' },
                RESET: { target: 'idle', actions: ['closeAudioStream', 'resetContext'] }
            },
            exit: log('Exiting listening state') // Stop analysis service implicitly via state exit?
        },
        recording: {
            id: 'recordingState',
            entry: [log('Entered recording state'), log('Recording started...'), 'startRecorder'],
             invoke: {
                 id: 'audioAnalysisService', // Reuse ID to ensure only one runs
                 src: 'audioAnalysisService',
                 input: ({context}) => ({
                     stream: context.audioStream!,
                     minDecibels: context.minDecibels,
                     silenceDuration: context.silenceDuration // Pass duration to service
                 }),
             },
            on: {
                RECORDING_DATA_AVAILABLE: { actions: 'appendAudioChunk' },
                 // Use explicit SILENCE_DETECTED event for transition
                 SILENCE_DETECTED: {
                     target: 'processing',
                     guard: ({ context }) => context.audioChunks.length > 0, // Use inline guard
                     actions: log('SILENCE_DETECTED event received in recording state')
                 },
                 _AUDIO_ANALYSIS_UPDATE: { // Still listen for RMS updates
                     actions: 'assignAnalysisUpdate'
                 },
                STOP_LISTENING: {
                    target: 'processing',
                    guard: ({ context }) => context.audioChunks.length > 0
                },
                RESET: { target: 'idle', actions: ['closeAudioStream', 'resetContext'] }
            },
            exit: ['stopRecorder', log('Exiting recording state')]
        },
        processing: {
            entry: log('Processing recorded audio...'),
            invoke: {
                id: 'transcriptionActor',
                src: 'transcriptionActor',
                input: ({ context }) => ({
                    chunks: context.audioChunks,
                    transcribeFn: context.transcribeFn,
                    token: context.apiToken
                }),
                onDone: {
                    target: 'transcribed',
                    // Replace named action string with inline assign logic
                    actions: assign(
                        ({ event }: { event: DoneActorEvent<{ text: string }> }) => {
                            // Check if output exists and has a text property
                            if (event.output && typeof event.output.text === 'string') {
                                console.log(`[sttMachine] Assigning transcribed text: "${event.output.text}"`);
                                return {
                                    transcribedText: event.output.text,
                                    errorMessage: null, // Clear error
                                    audioChunks: [] // Clear chunks
                                };
                            }
                            console.warn('[sttMachine] Transcription completed but no text found in event output:', event.output);
                            return {
                                transcribedText: null, // Assign null if no text found
                                errorMessage: 'Transcription successful but no text received.',
                                audioChunks: [] // Clear chunks even if text is missing
                            };
                        }
                    )
                },
                onError: {
                    target: 'error',
                    actions: ['assignError', 'closeAudioStream']
                }
            },
            // If no transcribeFn or token, go to error state immediately
            always: {
                target: 'error',
                actions: assign({ errorMessage: 'Missing transcription function or API token.'}),
                guard: ({context}) => !context.transcribeFn || !context.apiToken
            },
            on: {
                // Can't really stop processing, maybe RESET?
                RESET: { target: 'idle', actions: ['closeAudioStream', 'resetContext'] }
            }
        },
        transcribed: {
            entry: log( ({context}) => `Transcription: ${context.transcribedText}`),
            // Stay here until explicitly stopped or reset, allowing access to transcribedText
            on: {
                START_LISTENING: { target: 'listening' }, // Restart listening
                STOP_LISTENING: { target: 'idle', actions: 'closeAudioStream' },
                RESET: { target: 'idle', actions: ['closeAudioStream', 'resetContext'] }
            }
        },
        error: {
            entry: [
                log( ({context}) => `STT Error: ${context.errorMessage}`),
                // Ensure stream/recorder are stopped if error occurs during active states
                 ({context}) => {
                     if (context.mediaRecorder && context.mediaRecorder.state !== 'inactive') context.mediaRecorder.stop();
                     if (context.audioStream) context.audioStream.getTracks().forEach(track => track.stop());
                 },
                 // Call named action for context reset
                 'resetAnalysisContextOnError'
            ],
            on: {
                START_LISTENING: { target: 'permissionPending', actions: ['clearError', 'updateToken'] }, // Retry
                RESET: { target: 'idle', actions: 'resetContext' } // Use full reset here
            }
        }
    }
});

// Helper function definition (if not already available)
// function blobToFile(theBlob: Blob, fileName: string): File {
//     const b: any = theBlob;
//     //A Blob() is almost a File() - it's just missing the two properties below which we will add
//     b.lastModifiedDate = new Date();
//     b.name = fileName;
//     return theBlob as File;
// } 