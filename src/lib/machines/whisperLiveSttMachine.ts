import { setup, assign, fromCallback, log, sendTo, type ActorRefFrom, sendParent, type AnyActorRef, fromPromise, type DoneActorEvent, type ErrorActorEvent, stopChild } from 'xstate';
// No 'ws' import needed for browser environment

// --- Constants ---
const AUDIO_WORKLET_PATH = '/audio-processor.js'; // Path relative to public root
const DEFAULT_WS_URL = 'ws://localhost:9090';

// --- Helper Functions ---
function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// --- Types ---

// Input expected from the Configurator
export interface WhisperLiveInput {
	apiToken?: string | null; // Optional token
	wsUrl?: string; // Optional URL, defaults to DEFAULT_WS_URL
	parent: AnyActorRef; // Parent reference is required
	// Config for Whisper Live server (can be overridden by input)
	language?: string;
	model?: string;
	useVad?: boolean;
}

// Internal context of the machine
export interface WhisperLiveContext {
	// Config
	wsUrl: string;
	apiToken?: string | null;
	parent: AnyActorRef;
	language: string;
	model: string;
	useVad: boolean;
	clientId: string;
	// Audio
	audioContext: AudioContext | null;
	mediaStream: MediaStream | null;
	sourceNode: MediaStreamAudioSourceNode | null;
	audioWorkletNode: AudioWorkletNode | null;
	isWorkletReady: boolean;
	// WebSocket
	connectionStatus: 'idle' | 'connecting' | 'initializing' | 'waiting_server' | 'connected' | 'disconnected' | 'error';
	websocketActor: ActorRefFrom<typeof websocketActorLogic> | null;
	isServerReady: boolean;
	// Transcription
	currentSegment: string | null;
	finalTranscriptBuffer: string | null;
	errorMessage: string | null;
	rmsLevel: number; // Added RMS level
	isAudioProcessing: boolean; // Flag to track if audio input/worklet is active
}

// All possible events the machine can handle
type WhisperLiveEvent =
	// Commands from parent
	| { type: 'START_LISTENING' }
	| { type: 'STOP_LISTENING' }
	| { type: 'RESET' }
	| { type: 'GLOBAL.RESET' } // Added for global handling clarification
	// Internal events: Mic Permission
	| DoneActorEvent<MediaStream, 'micPermissionActor'>
	| ErrorActorEvent<unknown, 'micPermissionActor'>
	// Internal events: Audio Worklet Setup
	| DoneActorEvent<{ audioContext: AudioContext }, 'audioWorkletSetupActor'>
	| ErrorActorEvent<unknown, 'audioWorkletSetupActor'>
	// Internal events: Audio Processing (from Worklet Node)
	| { type: 'WORKLET_AUDIO_CHUNK'; data: ArrayBuffer }
	| { type: 'WORKLET_RMS_UPDATE'; value: number }
	| { type: 'WORKLET_READY' } // Added explicit event for worklet ready
	| { type: 'WORKLET_ERROR'; error: string }
	| { type: 'VAD_SPEECH_START' } // VAD event
	| { type: 'VAD_SILENCE_START' } // VAD event
	// Internal events: From WebSocket Actor
	| { type: 'WEBSOCKET.CONNECTING' }
	| { type: 'WEBSOCKET.OPEN' }
	| { type: 'WEBSOCKET.CLOSE'; code?: number; reason?: string }
	| { type: 'WEBSOCKET.ERROR'; error: string }
	| { type: 'WEBSOCKET.MESSAGE'; data: any }
	// Internal events: From WebSocket Messages (dispatched by processWebSocketMessage)
	| { type: 'SERVER_READY' }
	| { type: 'SERVER_WAIT'; duration: number }
	| { type: 'SERVER_DISCONNECT' }
	| { type: 'LANGUAGE_DETECTED'; language: string }
	// Internal command TO WebSocket Actor
	| { type: 'SEND_CONFIG'; payload: any }
	| { type: 'FINAL_TRANSCRIPT_RECEIVED' } // Internal event after final transcript
	// Internal action type (for ignoring sendTo results)
	| { type: 'ignore' };

// --- Actor Logics ---

// Microphone Permission Actor
const micPermissionActorLogic = fromPromise<MediaStream>(async () => {
	console.log('[WhisperLive/Perms] Requesting microphone permission...');
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[WhisperLive/Perms] MediaDevices API not available.');
        throw new Error('MediaDevices API not available.');
    }
	try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!(stream instanceof MediaStream)) {
            console.error('[WhisperLive/Perms] Invalid MediaStream received.');
            throw new Error('Invalid MediaStream received.');
        }
        console.log('[WhisperLive/Perms] Permission granted successfully.');
        return stream;
    } catch (error) {
        console.error('[WhisperLive/Perms] Error getting user media:', error);
        throw error; // Re-throw the error
    }
});

// Audio Worklet Setup Actor
const audioWorkletSetupActor = fromPromise<{ audioContext: AudioContext }>(async () => {
	console.log('[WhisperLive/AudioInit] Initializing AudioContext and Worklet...');
	let audioContext: AudioContext | null = null;
	try {
		audioContext = new AudioContext();
		console.log(`[WhisperLive/AudioInit] AudioContext created. State: ${audioContext.state}`);
		if (audioContext.state === 'suspended') {
			console.log('[WhisperLive/AudioInit] AudioContext suspended, attempting resume...');
			await audioContext.resume();
			console.log(`[WhisperLive/AudioInit] AudioContext resumed. State: ${audioContext.state}`);
		}
		if (audioContext.state !== 'running') {
			console.error(`[WhisperLive/AudioInit] AudioContext state is '${audioContext.state}', not 'running'.`);
            throw new Error(`AudioContext state is '${audioContext.state}', not 'running'. User interaction might be required.`);
		}
        console.log(`[WhisperLive/AudioInit] Attempting to add module: ${AUDIO_WORKLET_PATH}`);
		await audioContext.audioWorklet.addModule(AUDIO_WORKLET_PATH);
		console.log('[WhisperLive/AudioInit] AudioWorklet module added successfully.');
		return { audioContext };
	} catch (e: any) {
        console.error('[WhisperLive/AudioInit] Error during AudioContext/Worklet setup:', e);
        // Ensure context is closed on error during setup
        if (audioContext && audioContext.state !== 'closed') {
            console.log('[WhisperLive/AudioInit] Closing AudioContext due to setup error.');
            audioContext.close().catch(() => {}); // Ignore close error
        }
		throw new Error(`Audio initialization failed: ${e.message || e}`); // Ensure error message is passed
	}
});

// WebSocket Actor Logic (Handles connection and raw message passing)
const websocketActorLogic = fromCallback<WhisperLiveEvent, { url: string, parentMachineId: string }>(({ sendBack, receive, input }) => {
	console.log(`[WebSocketActor/${input.parentMachineId}] Starting with input:`, input);
	let socket: WebSocket | null = null;

	const connect = () => {
		if (socket && socket.readyState !== WebSocket.CLOSED) {
            console.log(`[WebSocketActor/${input.parentMachineId}] Connect called but socket exists with state: ${socket.readyState}`);
            return;
        }
		console.log(`[WebSocketActor/${input.parentMachineId}] Attempting connect to ${input.url}...`);
		sendBack({ type: 'WEBSOCKET.CONNECTING' } as any);
		try {
			socket = new WebSocket(input.url);

			socket.onopen = () => {
                console.log(`[WebSocketActor/${input.parentMachineId}] WebSocket OPENED.`);
                console.log(`[WebSocketActor/${input.parentMachineId}] Attempting to send WEBSOCKET.OPEN event back to machine.`);
                sendBack({ type: 'WEBSOCKET.OPEN' } as any);
            };

			socket.onmessage = (event: MessageEvent) => {
				try {
                    console.log(`[WebSocketActor/${input.parentMachineId}] WebSocket MESSAGE received:`, event.data);
                    // Send raw data back for parsing in the main machine
                    sendBack({ type: 'WEBSOCKET.MESSAGE', data: event.data } as any);
                 }
				catch (e) {
                    console.error(`[WebSocketActor/${input.parentMachineId}] Error processing message:`, e);
                    sendBack({ type: 'WEBSOCKET.ERROR', error: 'Processing error' } as any);
                }
			};

			socket.onerror = (event) => {
                // Log the event itself for more details if possible
                console.error(`[WebSocketActor/${input.parentMachineId}] WebSocket ERROR occurred:`, event);
                sendBack({ type: 'WEBSOCKET.ERROR', error: 'WebSocket error event occurred' } as any);
            };

			socket.onclose = (event: CloseEvent) => {
                console.log(`[WebSocketActor/${input.parentMachineId}] WebSocket CLOSED. Code: ${event.code}, Reason: ${event.reason}`);
                sendBack({ type: 'WEBSOCKET.CLOSE', code: event.code, reason: event.reason } as any);
                socket = null; // Clear socket ref on close
            };

		} catch (error: any) {
			const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[WebSocketActor/${input.parentMachineId}] Error creating WebSocket:`, message, error);
			sendBack({ type: 'WEBSOCKET.ERROR', error: `WebSocket creation failed: ${message}` } as any);
		}
	};

	receive((event) => {
        // Comment out or remove the log for frequent events like WORKLET_AUDIO_CHUNK
        // console.log(`[WebSocketActor/${input.parentMachineId}] Received command from parent:`, event.type);
		// Commands *to* this actor
		if (event.type === 'START_LISTENING') {
            console.log(`[WebSocketActor/${input.parentMachineId}] Received command from parent: START_LISTENING`);
            connect();
        }
		else if (event.type === 'STOP_LISTENING') {
            console.log(`[WebSocketActor/${input.parentMachineId}] Received command from parent: STOP_LISTENING`);
			if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, 'Client stopped');
		} else if (event.type === 'WORKLET_AUDIO_CHUNK') { // Handle audio chunk event from parent
			console.log(`[WebSocketActor/${input.parentMachineId}] Received WORKLET_AUDIO_CHUNK from machine.`);
			if (socket) {
			    console.log(`[WebSocketActor/${input.parentMachineId}] Checking socket state before send: readyState = ${socket.readyState} (1 = OPEN)`);
			} else {
			    console.error(`[WebSocketActor/${input.parentMachineId}] Cannot send audio chunk: socket is null!`);
			    return; // 소켓이 없으면 더 이상 진행하지 않음
			}
			if (socket && socket.readyState === WebSocket.OPEN) {
				try {
					console.log(`[WebSocketActor/${input.parentMachineId}] Attempting to send ${event.data.byteLength} bytes of audio data. Socket state: ${socket.readyState}`);
					socket.send(event.data);
				}
				catch (e: any) {
					console.error(`[WebSocketActor/${input.parentMachineId}] Error during socket.send:`, e);
					const message = e instanceof Error ? e.message : 'Unknown error';
					console.error(`[WebSocketActor/${input.parentMachineId}] Error sending audio chunk:`, message, e);
					sendBack({ type: 'WEBSOCKET.ERROR', error: `Send audio failed: ${message}` } as any);
				}
			}
		} else if (event.type === 'SEND_CONFIG') {
            console.log(`[WebSocketActor/${input.parentMachineId}] Received command from parent: SEND_CONFIG`);
			if (socket && socket.readyState === WebSocket.OPEN) {
				try {
                    console.log(`[WebSocketActor/${input.parentMachineId}] Sending config:`, event.payload);
                    socket.send(JSON.stringify(event.payload));
                }
				catch (e: any) {
					const message = e instanceof Error ? e.message : 'Unknown error';
                    console.error(`[WebSocketActor/${input.parentMachineId}] Error sending config:`, message, e);
					sendBack({ type: 'WEBSOCKET.ERROR', error: `Send config failed: ${message}` } as any);
				}
			}
        } else {
            // Log other infrequent commands if needed
            console.log(`[WebSocketActor/${input.parentMachineId}] Received other command from parent:`, event.type);
        }
	});

	return () => { // Cleanup
		if (socket && socket.readyState !== WebSocket.CLOSED) {
            console.log(`[WebSocketActor/${input.parentMachineId}] Cleaning up - closing socket.`);
			socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
			socket.close(1000, 'Actor cleanup');
		}
		socket = null;
		console.log(`[WebSocketActor/${input.parentMachineId}] Actor stopped.`);
	};
});


// --- Machine Setup ---

export const whisperLiveSttMachine = setup({
	types: {
		context: {} as WhisperLiveContext,
		events: {} as WhisperLiveEvent,
		input: {} as WhisperLiveInput,
	},
	actors: {
		micPermissionActor: micPermissionActorLogic,
		audioWorkletSetupActor: audioWorkletSetupActor,
		websocketService: websocketActorLogic
	},
	actions: {
		// --- Context Assignments ---
		assignClientId: assign({ clientId: () => `web-${generateUUID()}` }),
		assignAudioContextAndWorkletReady: assign({
			audioContext: ({ event }) => (event as DoneActorEvent<{ audioContext: AudioContext }>).output.audioContext,
			isWorkletReady: true,
			errorMessage: null,
		}),
		assignWorkletError: assign({
			isWorkletReady: false,
			errorMessage: ({ event }) => {
				// Type check for the specific error event
				if (event.type === 'WORKLET_ERROR') {
					return `Audio Worklet error: ${event.error}`;
				}
				// Type check for actor error event
				if (event.type === 'xstate.error.actor.audioWorkletSetupActor') {
					const error = (event as ErrorActorEvent).error;
					return `Audio Worklet setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
				}
				return 'Unknown audio processing error';
			},
			connectionStatus: 'error',
			isAudioProcessing: false, // Stop audio processing on error
		}),
		assignStream: assign({ mediaStream: ({ event }) => (event as DoneActorEvent<MediaStream>).output, errorMessage: null }),
		assignPermissionError: assign({ errorMessage: 'Microphone permission denied.', connectionStatus: 'error', isAudioProcessing: false }),
		assignGenericPermissionError: assign({
			errorMessage: ({ event }) => {
                // Add type check before accessing properties
                if (event.type === 'xstate.error.actor.micPermissionActor' && event.error instanceof Error) {
                    return `Microphone permission error: ${event.error.message || event.error.name}`;
                } else if (event.type === 'xstate.error.actor.micPermissionActor') {
                    return 'Unknown microphone permission error';
                }
                return 'Generic permission error (unexpected event type)';
            },
			isAudioProcessing: false,
		}),
		// Explicit action for when worklet signals ready
		assignWorkletReady: assign({ isWorkletReady: true }),

		// WebSocket Actor Management
		spawnWebSocketActor: assign({
			websocketActor: ({ spawn, context, self }) =>
				spawn('websocketService', {
					id: `ws-actor-${self.id}`,
					input: { url: context.wsUrl, parentMachineId: self.id }
				}),
			connectionStatus: 'connecting',
			isServerReady: false,
			errorMessage: null,
		}),
		clearWebSocketActor: assign({ websocketActor: null }),
		// Use stopChild for stopping the actor
		stopWebSocketActorAction: stopChild(({ context }) => context.websocketActor!),

		// WebSocket State Updates
		assignConnecting: assign({ connectionStatus: 'connecting', errorMessage: null }),
		assignConnectionOpen: assign({ connectionStatus: 'connected', errorMessage: null }), // Changed from 'initializing' to 'connected'
		assignConnectionClosed: assign({
			connectionStatus: 'disconnected',
			isServerReady: false,
			errorMessage: ({ event }) => {
                // Add type check before accessing properties
                if (event.type === 'WEBSOCKET.CLOSE' && event.code !== 1000 && event.code !== 1005 /* Normal closure */) {
                    return `Connection closed unexpectedly: ${event.reason || event.code}`;
                }
                return null; // No error message for normal closure
            },
			websocketActor: null, // Assume actor stops on close
		}),
		assignConnectionError: assign({
			connectionStatus: 'error',
			isServerReady: false,
			errorMessage: ({ event }) => (event.type === 'WEBSOCKET.ERROR' ? event.error : 'Unknown WS error'),
			websocketActor: null, // Assume actor stops on error
		}),
		assignServerReady: assign({ isServerReady: true, connectionStatus: 'connected', errorMessage: null }),
		assignServerWait: assign({ isServerReady: false, connectionStatus: 'waiting_server' }),
		assignServerDisconnect: assign({ 
            isServerReady: false, 
            connectionStatus: 'disconnected',
            errorMessage: 'Server initiated disconnect.' // Add error message
        }),
		assignDetectedLanguage: assign({
            language: ({ event }) => {
                if (event.type === 'LANGUAGE_DETECTED') return event.language;
                return 'unknown'; // Fallback
            }
        }),

		// Transcription Updates
		assignTranscriptionUpdate: assign(( { context, event } ) => {
			if (event.type !== 'WEBSOCKET.MESSAGE') return {};
            let data;
            try {
                console.log('[WhisperLive/WS Msg Received]:', event.data); // Log raw incoming message
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch (e) {
                console.error("[WhisperLive] Failed to parse WS message data:", event.data, e);
                return { errorMessage: "Failed to parse server message" };
            }

			let updates: Partial<Pick<WhisperLiveContext, 'currentSegment' | 'finalTranscriptBuffer' | 'errorMessage'>> = {};
            // Restore simpler logic - assign values based on message

			let isFinalUpdate = false;
			let updateSource = 'unknown';

			// Adapt to common whisper.cpp/faster-whisper streaming JSON structures
			if (data?.segments && Array.isArray(data.segments)) {
				 updateSource = 'segments';
				 const transcript = data.segments.map((s: any) => s.text || '').join(' ').trim();
				 const lastSegment = data.segments[data.segments.length - 1];
				 const isFinal = lastSegment?.final === true || lastSegment?.type === 'final' || lastSegment?.completed === true || lastSegment?.segment_type === 'final';
				 isFinalUpdate = isFinal;

				 updates.currentSegment = transcript;
				 if (isFinal) {
                     updates.finalTranscriptBuffer = transcript.trim() || null;
				 }
                 if (context.errorMessage !== null) updates.errorMessage = null;
			} else if (data?.transcript && typeof data.transcript === 'string') {
                updateSource = 'transcript_field';
                updates.currentSegment = data.transcript;
                if (data.final === true) {
                    isFinalUpdate = true;
                    updates.finalTranscriptBuffer = data.transcript.trim() || null;
                }
                if (context.errorMessage !== null) updates.errorMessage = null;
            } else if (data?.type === 'partial_transcript' && data.data) {
                updateSource = 'partial_transcript_event';
                updates.currentSegment = data.data;
                if (context.errorMessage !== null) updates.errorMessage = null;
            } else if (data?.type === 'final_transcript' && data.data) {
                updateSource = 'final_transcript_event';
                isFinalUpdate = true;
                updates.currentSegment = null; // Clear partial on final
                const newFinal = (context.finalTranscriptBuffer || '') + data.data + ' ';
                updates.finalTranscriptBuffer = newFinal.trim() || null;
                if (context.errorMessage !== null) updates.errorMessage = null;
            }

			// Log the update details
			if (updateSource !== 'unknown') {
			    console.log(`[WhisperLive/AssignUpdate] Source: ${updateSource}, Final: ${isFinalUpdate}, Current: "${updates.currentSegment ?? ''}", FinalBuffer: "${updates.finalTranscriptBuffer ?? ''}"`);
			}

			return updates; // Return context changes
		}),
		resetContext: assign({
			// Keep parent and config
			parent: ({ context }) => context.parent,
			wsUrl: ({ context }) => context.wsUrl,
			apiToken: ({ context }) => context.apiToken,
			language: ({ context }) => context.language,
			model: ({ context }) => context.model,
			useVad: ({ context }) => context.useVad,
			clientId: ({ context }) => context.clientId,
			// Reset dynamic state
			audioContext: null,
			mediaStream: null,
			sourceNode: null,
			audioWorkletNode: null,
			isWorkletReady: false,
			connectionStatus: 'idle' as const,
			websocketActor: null,
			isServerReady: false,
			currentSegment: null,
			finalTranscriptBuffer: null,
			errorMessage: null,
			rmsLevel: 0, // Initialize RMS level
			isAudioProcessing: false, // Reset audio processing flag
		}),
        // Renamed from clearContext for clarity
		clearDynamicContext: assign(( { context } ) => { // Use object destructuring to get context
			console.warn('[WhisperLive/Context] WARNING: Executing clearDynamicContext. This should not happen during active streaming.', { 
				// Note: context.value is not available directly here. Logging connectionStatus instead.
				connectionStatus: context.connectionStatus 
			}); 
			return {
				websocketActor: null,
				sourceNode: null,
				audioWorkletNode: null,
				mediaStream: null,
				audioContext: null,
				isWorkletReady: false,
				isAudioProcessing: false,
				connectionStatus: 'idle' as const,
				isServerReady: false,
				currentSegment: null,
				finalTranscriptBuffer: null,
				errorMessage: null,
				rmsLevel: 0, // Reset RMS level
			}
		}),


		// --- Actor Communication ---
		// Action to start the WebSocket connection (called internally)
		startWebSocketActor: sendTo(({ context }) => context.websocketActor!, { type: 'START_LISTENING' } as WhisperLiveEvent),
		// Action to send the initial configuration to the WebSocket actor
		sendInitConfigToWebSocket: sendTo(
			({ context }) => context.websocketActor!,
			({ context }): WhisperLiveEvent => ({ // Use type for event creator
				type: 'SEND_CONFIG',
				payload: {
					// Common config fields for whisper live servers
					uid: context.clientId,
					client_id: context.clientId, // Some servers use this name
					language: context.language,
					task: 'transcribe',
					model: context.model,
					use_vad: context.useVad,
					api_token: context.apiToken // Send token if provided
				}
			})
		),
		// Action to forward audio chunks from the worklet to the WebSocket actor
		forwardAudioToWebsocket: sendTo(
			({ context }) => context.websocketActor!,
			({ event }): WhisperLiveEvent => {
				if (event.type === 'WORKLET_AUDIO_CHUNK') {
                    // Forward the event as is, the actor logic will handle sending the buffer
                    return event;
                }
				return { type: 'ignore' }; // Should not happen
			}
		),

		// --- AudioWorklet/Media Graph Management ---
		setupAndStartAudioProcessing: assign(( { context, self } ) => {
            console.log('[WhisperLive] Executing setupAndStartAudioProcessing action...'); // Log action start
			if (!context.audioContext || !context.mediaStream || !context.isWorkletReady) {
                console.error('[WhisperLive] setupAndStartAudioProcessing: Pre-requisites not met!', { 
                    hasContext: !!context.audioContext, 
                    hasStream: !!context.mediaStream, 
                    isWorkletReady: context.isWorkletReady 
                });
				self.send({ type: 'WORKLET_ERROR', error: 'Pre-requisites not met for audio setup'});
				return {};
			}
			let sourceNode: MediaStreamAudioSourceNode | null = null;
			let audioWorkletNode: AudioWorkletNode | null = null;
			try {
                console.log('[WhisperLive] setupAndStartAudioProcessing: Creating AudioWorkletNode...');
				// Disconnect previous nodes if they exist (e.g., on retry)
				if (context.sourceNode) { try { context.sourceNode.disconnect(); } catch {} }
				if (context.audioWorkletNode) { try { context.audioWorkletNode.disconnect(); context.audioWorkletNode.port.close(); } catch {} }

				audioWorkletNode = new AudioWorkletNode(context.audioContext, 'audio-processor');
                console.log('[WhisperLive] setupAndStartAudioProcessing: AudioWorkletNode created.');

					audioWorkletNode.port.onmessage = (ev: MessageEvent) => { // Accept any message type for now
					    // <<< 추가: 액터/노드가 정리 중인지 확인 >>>
					    if (!context.audioWorkletNode) {
					        // console.log('[WhisperLive/WorkletMsg] audioWorkletNode is null in context, ignoring message.'); // 로그는 필요시 활성화
					        return; // 노드가 null이면 (정리 중이면) 메시지 무시
					    }
					    // <<< ------------------------------------ >>>

                    // Check message type before sending to self
                    if (ev.data?.type === 'RMS_UPDATE') {
                        console.log(`[WhisperLive/WorkletMsg] Received RMS_UPDATE: ${ev.data.value}`);
                        self.send({ type: 'WORKLET_RMS_UPDATE', value: ev.data.value });
                    } else if (ev.data?.type === 'VAD_SPEECH_START') { // Handle VAD events
                        self.send({ type: 'VAD_SPEECH_START' });
                    } else if (ev.data?.type === 'VAD_SILENCE_START') {
                        self.send({ type: 'VAD_SILENCE_START' });
                    } else if (ev.data instanceof ArrayBuffer) { // Check if data is ArrayBuffer
					    console.log('[WhisperLive/WorkletMsg] Data is ArrayBuffer. Attempting self.send...');
					    try {
					        self.send({ type: 'WORKLET_AUDIO_CHUNK', data: ev.data });
					        console.log('[WhisperLive/WorkletMsg] self.send(WORKLET_AUDIO_CHUNK) called successfully.');
					    } catch (e) {
					        console.error('[WhisperLive/WorkletMsg] Error during self.send(WORKLET_AUDIO_CHUNK):', e);
					    }
                    } else {
                        console.warn('[WhisperLive/WorkletMsg] Unexpected message format from worklet. Expected ArrayBuffer for audio chunk. Received:', 
                            `Type: ${typeof ev.data}`, 
                            `Instance of ArrayBuffer: ${ev.data instanceof ArrayBuffer}`, 
                            `Data:`, ev.data // Log the actual data
                        );
                    }
				};
                // Use onmessageerror instead of onerror for port errors
				audioWorkletNode.port.onmessageerror = (ev) => {
					console.error('[WhisperLive] Audio worklet port message error:', ev);
					self.send({ type: 'WORKLET_ERROR', error: 'Audio worklet port message error' });
				};
                // Handle processor errors (uncaught exceptions in the worklet)
                audioWorkletNode.onprocessorerror = (ev) => {
                    console.error('[WhisperLive] Audio worklet processor error:', ev);
					self.send({ type: 'WORKLET_ERROR', error: `Audio worklet processor error: ${ev}` });
                };

                console.log('[WhisperLive] setupAndStartAudioProcessing: Creating MediaStreamSourceNode...');
				sourceNode = context.audioContext.createMediaStreamSource(context.mediaStream);
                console.log('[WhisperLive] setupAndStartAudioProcessing: Connecting nodes...');
				sourceNode.connect(audioWorkletNode);
				// Do NOT connect workletNode to destination unless debugging audio output
				// audioWorkletNode.connect(context.audioContext.destination);

				// Tell the worklet to start processing AFTER connecting the graph
                console.log(`[WhisperLive/AudioSetup] Nodes connected. WorkletNode exists: ${!!audioWorkletNode}, Port exists: ${!!audioWorkletNode?.port}`);
                console.log('[WhisperLive] setupAndStartAudioProcessing: Sending start message to worklet...');
				audioWorkletNode.port.postMessage({ type: 'start' });
				console.log('[WhisperLive] Audio graph connected & worklet start message sent.');

				return { sourceNode, audioWorkletNode, errorMessage: null, isAudioProcessing: true }; // Set flag here

			} catch (error: any) {
				console.error('[WhisperLive/AudioSetup] CRITICAL: Error during setupAndStartAudioProcessing:', error);
				self.send({ type: 'WORKLET_ERROR', error: `Audio graph setup failed: ${error instanceof Error ? error.message : 'Unknown'}` });
				return { sourceNode: null, audioWorkletNode: null, isAudioProcessing: false }; // Clear nodes on error
			}
		}),
		stopAudioProcessing: ({ context }) => {
			if (context.audioWorkletNode) {
				try {
					// Tell worklet to stop processing
					context.audioWorkletNode.port.postMessage({ type: 'stop' });
					// Close the port to prevent further messages/errors
					context.audioWorkletNode.port.close();
				} catch (e) {
					console.warn('[WhisperLive] Error stopping worklet port:', e);
				}
				// Disconnect worklet node
				try { context.audioWorkletNode.disconnect(); } catch {}
			}
			// Disconnect source node
			try { context.sourceNode?.disconnect(); } catch {}
			// Stop the original media stream tracks
			context.mediaStream?.getTracks().forEach(track => track.stop());
			console.log('[WhisperLive] Audio processing stopped.');
		},
		clearAudioNodes: assign({
			sourceNode: null,
			audioWorkletNode: null,
			mediaStream: null, // Clear stream ref when nodes are cleared
		}),
		closeAudioContext: ({ context }) => {
			if (context.audioContext?.state !== 'closed') {
				context.audioContext?.close().catch(e => console.error('Error closing AC:', e));
			}
		},
		clearAudioContextRef: assign({
			audioContext: null,
			isWorkletReady: false // Reset ready flag when context is cleared
		}),
        // Combine cleanup actions
        stopAllProcessing: ({ context }) => {
            console.log('[WhisperLive] Executing stopAllProcessing action...');
            // Stop WS actor first (using the dedicated action)
            // This should ideally be called separately via stopChild in the state transition
            if (context.websocketActor) {
                 console.log('[WhisperLive] stopAllProcessing: stopping websocket actor via stopChild is preferred in transition actions.');
            }

            // --- Removing handlers moved to removeWorkletMessageHandler ---

            // Stop Audio Processing
            console.log('[WhisperLive] stopAllProcessing: stopping audio processing...');
            if (context.audioWorkletNode) {
                console.log('[WhisperLive] stopAllProcessing: Attempting to send \'stop\' message to worklet.');
                try { context.audioWorkletNode.port.postMessage({ type: 'stop' }); } catch (e) { console.warn('Error sending stop to worklet:', e); }
                console.log('[WhisperLive] stopAllProcessing: Attempting to close worklet port.');
                try { context.audioWorkletNode.port.close(); } catch (e) { console.warn('Error closing worklet port:', e); }
                console.log('[WhisperLive] stopAllProcessing: Attempting to disconnect worklet node.');
                try { context.audioWorkletNode.disconnect(); } catch {} // Disconnect node
            }
            console.log('[WhisperLive] stopAllProcessing: Attempting to disconnect source node.');
            try { context.sourceNode?.disconnect(); } catch {} // Disconnect source
            console.log('[WhisperLive] stopAllProcessing: Attempting to stop media stream tracks.');
            context.mediaStream?.getTracks().forEach(track => track.stop()); // Stop media stream tracks
            console.log('[WhisperLive] stopAllProcessing: Audio processing stopped.');

            // Close Audio Context
            if (context.audioContext?.state !== 'closed') {
                console.log('[WhisperLive] stopAllProcessing: Closing audio context...');
                context.audioContext?.close().catch((e) => console.error('Error closing AC:', e));
            }
            console.log('[WhisperLive] stopAllProcessing: Action completed.');
        },
        // --- New Action to Remove Message Handlers ---
        removeWorkletMessageHandler: ({ context }) => {
            console.log('[WhisperLive/Action] Removing worklet message handlers...');
            if (context.audioWorkletNode?.port) {
                try {
                    // Set handlers to null to stop processing messages
                    context.audioWorkletNode.port.onmessage = null;
                    context.audioWorkletNode.port.onmessageerror = null;
                    console.log('[WhisperLive/Action] Worklet message handlers removed.');
                } catch (e) {
                    // Log error but continue, as cleanup should proceed
                    console.warn('[WhisperLive/Action] Error removing worklet message handlers:', e);
                }
            } else {
                console.log('[WhisperLive/Action] No audioWorkletNode or port found, skipping handler removal.');
            }
        },

		// --- Parent Communication ---
		sendStateUpdateToParent: sendParent(({ context }) => {
			console.log(`[WhisperLive/Action] Sending WORKER_STATE_UPDATE to parent. RMS: ${context.rmsLevel}`);
			return {
				type: 'WORKER_STATE_UPDATE',
				state: {
					isListening: context.isAudioProcessing && context.connectionStatus === 'connected',
					error: context.errorMessage,
					currentTranscript: context.currentSegment,
					finalTranscript: context.finalTranscriptBuffer,
					connectionStatus: context.connectionStatus,
					isServerReady: context.isServerReady,
					rmsLevel: context.rmsLevel
				}
			};
		}),
		sendFinalizedUpdateToParent: sendParent(({ context, event }) => {
			// Check if the triggering event was a WS message containing a final transcript
			if (event.type === 'WEBSOCKET.MESSAGE') {
				let data;
				try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return { type: 'ignore' }; }

				const lastSegment = data?.segments?.[data.segments.length - 1];
				const isFinal = lastSegment?.final === true || lastSegment?.type === 'final' || lastSegment?.completed === true || lastSegment?.segment_type === 'final' || data?.final === true;

				if (isFinal) {
					// Use the updated finalTranscriptBuffer from context (assigned by assignTranscriptionUpdate)
					return { type: 'MANAGER_TRANSCRIPTION_UPDATE', finalTranscript: context.finalTranscriptBuffer };
				}
			}
			return { type: 'ignore' }; // Send nothing if not final
		}),
		sendErrorToParent: sendParent(({ context }) => ({
			type: 'WORKER_ERROR',
			error: context.errorMessage ?? 'Unknown live worker error'
		})),

		// --- WebSocket Message Parsing Actions ---
		processWebSocketMessage: ({ context, event, self }) => {
			if (event.type !== 'WEBSOCKET.MESSAGE') return;
            let data;
            try {
                console.log('[WhisperLive/WS Msg Received]:', event.data); // Log raw incoming message
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch (e) {
				console.error('[WhisperLive] Failed to parse WS message:', e);
				return;
			}

			try {
                console.log('[WhisperLive/WS Msg Parsed]:', data); // Log parsed message
				// Handle control messages
				if (data?.message === 'SERVER_READY' || data?.type === 'server_ready') {
                    console.log('[WhisperLive/WS Msg] SERVER_READY condition met. Sending event to self.');
					self.send({ type: 'SERVER_READY' });
				} else if ((data?.status === 'WAIT' || data?.type === 'wait') && typeof data.duration === 'number') {
                    console.log('[WhisperLive/WS Msg] SERVER_WAIT condition met. Sending event to self.');
					self.send({ type: 'SERVER_WAIT', duration: data.duration });
				} else if (data?.message === 'DISCONNECT' || data?.type === 'disconnect') {
                    console.log('[WhisperLive/WS Msg] SERVER_DISCONNECT condition met. Sending event to self.');
					self.send({ type: 'SERVER_DISCONNECT' });
				} else if (data?.language && typeof data.language === 'string') {
                    console.log('[WhisperLive/WS Msg] LANGUAGE_DETECTED condition met. Sending event to self.');
					self.send({ type: 'LANGUAGE_DETECTED', language: data.language });
				} else if (data?.error && typeof data.error === 'string') {
                    console.log('[WhisperLive/WS Msg] Server error condition met. Sending WEBSOCKET.ERROR to self.', data.error);
                    self.send({ type: 'WEBSOCKET.ERROR', error: data.error });
                }
				// Log transcript segments if they exist (handled by assignTranscriptionUpdate)
				else if (data?.segments || data?.transcript || data?.type?.includes('transcript')) {
				    // console.log('[WhisperLive/WS Msg] Transcript data received (handled by assignTranscriptionUpdate).');
				} else {
				    console.log('[WhisperLive/WS Msg] Received other message type:', data);
				}
			} catch (e) {
				console.error('[WhisperLive] Error processing parsed WS message logic:', e);
			}
		},

		// --- Logging ---
		logAudioStreamingStarted: log('[WhisperLive] Audio streaming started.'),
		logError: log(({ context }) => `[WhisperLive] Error state reached. Message: ${context.errorMessage ?? 'No error message'}`),
		logReceivedEvent: log(({ event }) => {
			try {
				// Attempt to stringify, replace ArrayBuffer with placeholder
				const eventString = JSON.stringify(event, (key, value) => {
					if (value instanceof ArrayBuffer) {
						return `[ArrayBuffer: ${value.byteLength} bytes]`;
					}
					return value;
				});
				return `[WhisperLive/Event] Received: ${eventString}`;
			} catch (e) {
				// Fallback for complex/circular events
				return `[WhisperLive/Event] Received: ${event.type} (Stringify failed)`;
			}
		}, 'EventLog'),
		assignRmsLevel: assign({
			rmsLevel: ({ event }) => {
				if (event.type === 'WORKLET_RMS_UPDATE') {
					console.log(`[WhisperLive/Action] assignRmsLevel: Updating RMS to ${event.value}`);
					return event.value;
				}
				return 0;
			}
		}),
        clearTranscriptionBuffers: assign({
            currentSegment: null,
            finalTranscriptBuffer: null
        }),
        clearAudioNodesAction: assign({
            sourceNode: null,
            audioWorkletNode: null,
            mediaStream: null,
        }),
        // Action to check for final transcript and send internal event
        checkAndStopWebSocketOnFinal: ({ event, self }) => {
            if (event.type !== 'WEBSOCKET.MESSAGE') return;
            let data;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }

            const lastSegment = data?.segments?.[data.segments.length - 1];
            const isFinal = lastSegment?.final === true || lastSegment?.type === 'final' || lastSegment?.completed === true || lastSegment?.segment_type === 'final' || data?.final === true;

            if (isFinal) {
                console.log('[WhisperLive] Final transcript detected in message. Sending FINAL_TRANSCRIPT_RECEIVED event.');
                self.send({ type: 'FINAL_TRANSCRIPT_RECEIVED' });
            }
        },
	},
	guards: {
        isPermissionDeniedError: ({ event }) => {
            const specificEvent = event as Extract<WhisperLiveEvent, { type: 'xstate.error.actor.micPermissionActor' }>;
			const error = specificEvent.error;
			return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
		},
		isWebSocketConnected: ({ context }) => context.websocketActor !== null && context.connectionStatus === 'connected',
		canStreamAudio: ({ context }) => context.isWorkletReady && context.connectionStatus === 'connected',
		isUnexpectedWsClose: ({ event }) => {
            // Guard checks only the event code, not the state machine's current state
            if (event.type !== 'WEBSOCKET.CLOSE') return false;
			return !(event.code === 1000 || event.code === 1005);
		},
        canTransitionToStreaming: ({ context }) => {
            // Guard checks context properties, assumes this runs when SERVER_READY is received
            return context.isWorkletReady; // Check only worklet readiness globally? Or move handling entirely
        },
        canForwardAudio: ({ context }) => {
            const isReady = context.connectionStatus === 'connected' && context.isServerReady;
            // Re-add log for debugging
            if (!isReady) {
                console.log(`[WhisperLive/Guard] canForwardAudio failed: connectionStatus=${context.connectionStatus}, isServerReady=${context.isServerReady}`);
            } else {
                // Log success case too, temporarily
                console.log(`[WhisperLive/Guard] canForwardAudio PASSED: connectionStatus=${context.connectionStatus}, isServerReady=${context.isServerReady}`);
            }
            return isReady;
        }
	}
}).createMachine({
	id: 'whisperLiveStt',
	context: ({ input }) => ({
        parent: input.parent,
		wsUrl: input.wsUrl ?? DEFAULT_WS_URL,
		apiToken: input.apiToken,
		language: input.language ?? 'ko',
		model: input.model ?? 'large-v3-turbo',
		useVad: input.useVad ?? true,
		clientId: `web-${generateUUID()}`,
		audioContext: null,
		mediaStream: null,
		sourceNode: null,
		audioWorkletNode: null,
		isWorkletReady: false,
		connectionStatus: 'idle',
		websocketActor: null,
		isServerReady: false,
		currentSegment: null,
		finalTranscriptBuffer: null,
		errorMessage: null,
		rmsLevel: 0,
		isAudioProcessing: false,
	}),
	initial: 'idle',

	on: {
        '*': { actions: 'logReceivedEvent' },
		'GLOBAL.RESET': {
			target: '.idle',
			actions: ['removeWorkletMessageHandler', 'stopWebSocketActorAction', 'stopAllProcessing', 'clearDynamicContext', 'sendStateUpdateToParent'] as const // Use action name
		},
		'xstate.error.actor.micPermissionActor': {
			target: '.error',
			guard: 'isPermissionDeniedError',
			actions: ['removeWorkletMessageHandler', 'assignPermissionError', 'sendStateUpdateToParent'] as const // Add handler removal
		},
		'WORKLET_READY': {
			actions: ['assignWorkletReady', 'sendStateUpdateToParent'] as const
		},
		'WORKLET_ERROR': {
			target: '.error',
			actions: ['removeWorkletMessageHandler', 'assignWorkletError', 'stopWebSocketActorAction', 'stopAllProcessing', 'clearDynamicContext', 'sendStateUpdateToParent'] as const // Use action name
		},
		'WEBSOCKET.OPEN': {
			actions: [
			    log('[WhisperLive] WEBSOCKET.OPEN event received.'),
			    assign({ connectionStatus: 'connected' as const, errorMessage: null }), // Assign directly
			    log(({ context }) => `[WhisperLive] After assignConnectionOpen: status=${context.connectionStatus}`), // Log status after assignment
			    'sendInitConfigToWebSocket',
			    'sendStateUpdateToParent'
			] as const // Ensure the array is treated as a tuple
		},
		'WEBSOCKET.CLOSE': [
			{ actions: log('[WhisperLive/GlobalOn] WARNING: WEBSOCKET.CLOSE triggered.') },
			{
				target: '.error',
				guard: 'isUnexpectedWsClose',
				actions: ['removeWorkletMessageHandler', 'assignConnectionClosed', 'stopAudioProcessing', 'clearAudioNodesAction', 'sendStateUpdateToParent'] as const // Add handler removal
			}
		],
		'WEBSOCKET.ERROR': [
			{ actions: log('[WhisperLive/GlobalOn] WARNING: WEBSOCKET.ERROR triggered.') },
			{
				target: '.error',
				actions: ['removeWorkletMessageHandler', 'assignConnectionError', 'stopAudioProcessing', 'clearAudioNodesAction', 'sendStateUpdateToParent'] as const // Add handler removal
			}
		],
		'WEBSOCKET.MESSAGE': {
            actions: ['processWebSocketMessage', 'assignTranscriptionUpdate', 'sendStateUpdateToParent', 'sendFinalizedUpdateToParent', 'checkAndStopWebSocketOnFinal'] as const
		},
		'WORKLET_AUDIO_CHUNK': {
			actions: [
			    log('[WhisperLive/GlobalOn] TEMP: Received WORKLET_AUDIO_CHUNK globally. (Guard and forward removed)')
			] as const
		},
        'SERVER_READY': {
            target: '.streamingAudio',
            guard: 'canTransitionToStreaming', // Check if worklet ready (WS should be open by now ideally)
            actions: ['assignServerReady', 'sendStateUpdateToParent'] as const
        },
        'SERVER_WAIT': {
            actions: ['assignServerWait', 'sendStateUpdateToParent', log('[WhisperLive] Received SERVER_WAIT from server.')] as const
        },
        'SERVER_DISCONNECT': [
			{ actions: log('[WhisperLive/GlobalOn] WARNING: SERVER_DISCONNECT triggered.') },
			{
				target: '.error',
				actions: ['removeWorkletMessageHandler', 'assignServerDisconnect', 'stopWebSocketActorAction', 'stopAudioProcessing', 'clearAudioNodesAction', 'sendStateUpdateToParent'] as const // Add handler removal
			}
		],
        'LANGUAGE_DETECTED': {
            actions: ['assignDetectedLanguage', 'sendStateUpdateToParent'] as const
        },
        'WORKLET_RMS_UPDATE': {
            actions: ['assignRmsLevel', 'sendStateUpdateToParent'] as const
        }
	},

	states: {
		idle: {
			entry: [log('[WhisperLive] Entering idle state.'), 'clearDynamicContext', 'assignClientId', 'sendStateUpdateToParent'] as const,
			on: {
				START_LISTENING: { target: 'initializingAudio' }
			}
		},
		initializingAudio: {
			entry: log('[WhisperLive] Entering initializingAudio state. Invoking audioWorkletSetupActor...'),
			invoke: {
				 id: 'audioWorkletSetupActor',
				 src: 'audioWorkletSetupActor',
				 onDone: {
					 target: 'requestingPermission',
                     actions: [
                         log('[WhisperLive/AudioInit] audioWorkletSetupActor succeeded. Running assignAudioContextAndWorkletReady...'),
                         'assignAudioContextAndWorkletReady',
                         log(({ context }) => `[WhisperLive/AudioInit] After assignAudioContextAndWorkletReady: isWorkletReady=${context.isWorkletReady}`)
                     ] as const
				 },
                 onError: {
                     target: 'error',
                     actions: [log('[WhisperLive/AudioInit] audioWorkletSetupActor failed.'), 'assignWorkletError']
                 }
			 },
			 always: {
				 guard: ({ context }) => context.isWorkletReady,
				 target: 'requestingPermission'
			 }
		},
		requestingPermission: {
			 entry: log('[WhisperLive] Entering requestingPermission state. Invoking micPermissionActor...'),
			 invoke: {
				 id: 'micPermissionActor',
				 src: 'micPermissionActor',
				 onDone: {
					 target: 'connectingWebSocket', // Connect WS immediately after permission
                       actions: [
                           log('[WhisperLive/Perms] micPermissionActor succeeded.'),
                           'assignStream',
                           'setupAndStartAudioProcessing',
						    'spawnWebSocketActor',      // Spawn WS actor here
						    'startWebSocketActor'       // Start WS actor here
                       ] as const
				 },
                 onError: {
                     target: 'error',
                     actions: [log('[WhisperLive/Perms] micPermissionActor failed directly.'), 'assignGenericPermissionError']
                 }
			 }
		},
		waitingForSpeech: {
			 entry: [log('[WhisperLive] Entering waitingForSpeech state (WS disconnected). Listening for VAD...'), 'sendStateUpdateToParent'],
			 always: { // Ensure audio processing is running
				 guard: ({ context }) => !context.isAudioProcessing,
				 target: 'initializingAudio',
				 actions: log('[WhisperLive] Audio processing not active in waitingForSpeech, re-initializing.')
			 },
			 on: {
				 VAD_SPEECH_START: { // Reconnect on next speech start
				     target: 'connectingWebSocket',
				     actions: [log('[WhisperLive] VAD_SPEECH_START received in waiting state, reconnecting WebSocket...')] as const // Ensure actions is an array
				 },
				 STOP_LISTENING: { target: 'stopping', actions: ['removeWorkletMessageHandler'] as const }, // Add handler removal
				 // WORKLET_ERROR handled globally
			 }
		},
		connectingWebSocket: {
			 entry: [
			    log('[WhisperLive] Entering connectingWebSocket state.'),
			    // Spawn/Start actions are now handled in the transition from requestingPermission
			    // or from waitingForSpeech (if reconnecting)
			    'sendStateUpdateToParent' // Keep sending state update
			] as const,
			 on: {
				 // VAD_SILENCE_START no longer disconnects WS
				 STOP_LISTENING: { target: 'stopping' },
				 // Server ready transitions to streamingAudio
				 'SERVER_READY': {
				     target: 'streamingAudio',
				     guard: 'canTransitionToStreaming', // Check if worklet ready (WS should be open by now ideally)
				     actions: ['assignServerReady', 'sendStateUpdateToParent'] as const
				 },
				 // WS events handled globally but specific error/close might need review
			 },
			 exit: log('[WhisperLive] Exiting connectingWebSocket state (likely transitioning to streamingAudio).')
		},
		streamingAudio: {
			 entry: [log('[WhisperLive] Entering streamingAudio state.'), 'logAudioStreamingStarted', 'sendStateUpdateToParent'] as const,
			 exit: [log('[WhisperLive] Exiting streamingAudio state.'), 'sendStateUpdateToParent'],
			 on: {
				 // VAD_SILENCE_START no longer disconnects WS
				 // Consider adding logic here or in worklet to *pause* sending audio on silence if desired
				 STOP_LISTENING: { target: 'stopping', actions: ['removeWorkletMessageHandler'] as const }, // Add handler removal
				 'WEBSOCKET.MESSAGE': {
				     actions: [
				         'processWebSocketMessage',
				         'assignTranscriptionUpdate',
				         'sendStateUpdateToParent',
				         'sendFinalizedUpdateToParent', // Might still be useful
				         'checkAndStopWebSocketOnFinal' // New action to trigger stop
				     ] as const
				 },
				 'FINAL_TRANSCRIPT_RECEIVED': { // Internal event
				     target: 'stoppingWebSocket',
				     actions: log('[WhisperLive] Received FINAL_TRANSCRIPT_RECEIVED. Stopping WebSocket.')
				 },
				 // Global handlers for CLOSE/ERROR still apply
			 }
		},
		stoppingWebSocket: { // State to only stop the websocket
			entry: [
			    log('[WhisperLive] Entering stoppingWebSocket state.'),
			    'stopWebSocketActorAction',
			    'clearWebSocketActor',
			    assign({ connectionStatus: 'disconnected' as const, isServerReady: false }),
			    'sendStateUpdateToParent'
			] as const,
			// After stopping WS, go back to waiting for speech
			always: { target: 'waitingForSpeech' }
		},
		stopping: {
			 entry: [
				 'removeWorkletMessageHandler', // Remove handlers first
				 log('[WhisperLive] Entering stopping state (STOP_LISTENING received).'),
				 'stopWebSocketActorAction',
				 'stopAllProcessing', // Calls actions defined in setup, includes detailed logging
				 'clearDynamicContext',
				 'sendStateUpdateToParent'
			 ] as const,
			 always: { target: 'idle' }
		},
		error: {
			entry: [
				 'removeWorkletMessageHandler', // Remove handlers first
				 'logError',
				 'sendErrorToParent',
				 'stopWebSocketActorAction',
				 'stopAllProcessing', // Calls actions defined in setup, includes detailed logging
				 'clearDynamicContext'
			 ] as const,
			on: {
				START_LISTENING: { target: 'initializingAudio' },
			}
		}
	}
}); 