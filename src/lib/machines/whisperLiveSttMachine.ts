import {
	setup,
	assign,
	fromCallback,
	log,
	sendTo,
	type ActorRefFrom,
	sendParent,
	type AnyActorRef,
	fromPromise,
	type DoneActorEvent,
	type ErrorActorEvent,
	stopChild,
	raise,
	createMachine,
	assign as assignWs
} from 'xstate';
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
	connectionStatus: 'idle' | 'connecting' | 'waiting_server' | 'connected' | 'disconnected' | 'error';
	websocketActor: ActorRefFrom<typeof webSocketConnectionMachine> | null;
	isServerReady: boolean;
	// Transcription
	currentSegment: string | null;
	finalTranscriptBuffer: string | null;
	errorMessage: string | null;
	rmsLevel: number; // Added RMS level
	isAudioProcessing: boolean; // Flag to track if audio input/worklet is active
	isStopping: boolean; // Flag to indicate the actor is stopping
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
	// Internal events: From WebSocket Machine
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
	// Internal command TO WebSocket Machine
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

// WebSocket Machine

interface WebSocketMachineContext {
	parent: AnyActorRef;
	url: string;
	configPayload: any; // Initial config from parent
	clientId: string;
	socket: WebSocket | null;
	keepaliveIntervalId: ReturnType<typeof setInterval> | null;
	keepaliveIntervalMs: number;
	silentAudioChunk: ArrayBuffer; // Pre-generated silent audio
	retries: number;
}

type WebSocketMachineEvent =
	// Internal events triggered by WebSocket callbacks
	| { type: 'WEBSOCKET.INTERNAL.OPEN' }
	| { type: 'WEBSOCKET.INTERNAL.MESSAGE'; data: any }
	| { type: 'WEBSOCKET.INTERNAL.ERROR'; error: string }
	| { type: 'WEBSOCKET.INTERNAL.CLOSE'; code?: number; reason?: string }
	// Events from parent (whisperLiveSttMachine)
	| { type: 'SEND_AUDIO'; data: ArrayBuffer }
	| { type: 'STOP' }
	| { type: 'SEND_SILENT_PING' };

// Note: Consider moving this machine to its own file later
const webSocketConnectionMachine = setup({
	types: {
		context: {} as WebSocketMachineContext,
		events: {} as WebSocketMachineEvent,
		input: {} as { parent: AnyActorRef; url: string; configPayload: any; clientId: string }
	},
	actions: {
		sendOpenToParent: sendParent({ type: 'WEBSOCKET.OPEN' }),
		sendMessageToParent: sendParent(({ event }) => {
			if (event.type === 'WEBSOCKET.INTERNAL.MESSAGE') {
				return { type: 'WEBSOCKET.MESSAGE', data: event.data };
			} return undefined;
		}),
		sendErrorToParent: sendParent(({ context, event }) => {
			let errorMsg = 'Unknown WebSocket error';
			if (event.type === 'WEBSOCKET.INTERNAL.ERROR') { errorMsg = event.error; }
			console.error(`[WebSocketMachine/${context.clientId}] Sending WEBSOCKET.ERROR to parent: ${errorMsg}`);
			return { type: 'WEBSOCKET.ERROR', error: errorMsg };
		}),
		sendCloseToParent: sendParent(({ event }) => {
			if (event.type === 'WEBSOCKET.INTERNAL.CLOSE') {
				return { type: 'WEBSOCKET.CLOSE', code: event.code, reason: event.reason };
			} return undefined;
		}),
		connectWebSocket: assignWs(({ context, self }) => {
			console.log(`[WebSocketMachine/${context.clientId}] Attempting connect to ${context.url}`);
			try {
				const socket = new WebSocket(context.url);
				socket.onopen = () => { console.log(`[WebSocketMachine/${context.clientId}] WebSocket OPENED.`); self.send({ type: 'WEBSOCKET.INTERNAL.OPEN' }); };
				socket.onmessage = (event) => { self.send({ type: 'WEBSOCKET.INTERNAL.MESSAGE', data: event.data }); };
				socket.onerror = (event) => { console.error(`[WebSocketMachine/${context.clientId}] WebSocket ERROR:`, event); self.send({ type: 'WEBSOCKET.INTERNAL.ERROR', error: 'WebSocket error event occurred' }); };
				socket.onclose = (event) => { console.log(`[WebSocketMachine/${context.clientId}] WebSocket CLOSED. Code: ${event.code}, Reason: ${event.reason}`); self.send({ type: 'WEBSOCKET.INTERNAL.CLOSE', code: event.code, reason: event.reason }); };
				return { socket: socket, retries: 0 };
			} catch (error: any) {
				console.error(`[WebSocketMachine/${context.clientId}] Error creating WebSocket:`, error);
				self.send({ type: 'WEBSOCKET.INTERNAL.ERROR', error: `WebSocket creation failed: ${error.message || 'Unknown'}` });
				return { socket: null };
			}
		}),
		sendConfig: ({ context, self }) => {
			if (context.socket?.readyState === WebSocket.OPEN) {
				try {
					console.log(`[WebSocketMachine/${context.clientId}] Sending config:`, context.configPayload);
					context.socket.send(JSON.stringify(context.configPayload));
				} catch (e: any) {
					console.error(`[WebSocketMachine/${context.clientId}] Error sending config:`, e);
					self.send({ type: 'WEBSOCKET.INTERNAL.ERROR', error: `Send config failed: ${e.message || 'Unknown'}` });
				}
			} else {
				console.warn(`[WebSocketMachine/${context.clientId}] Cannot send config, socket not open.`);
				self.send({ type: 'WEBSOCKET.INTERNAL.ERROR', error: 'Cannot send config, socket not open.' });
			}
		},
		sendAudioChunk: ({ context, event }) => {
			if (event.type !== 'SEND_AUDIO') return;
			if (context.socket?.readyState === WebSocket.OPEN) {
				try { context.socket.send(event.data); } catch (e: any) {
					console.error(`[WebSocketMachine/${context.clientId}] Error sending audio chunk:`, e);
					context.parent.send({ type: 'WEBSOCKET.ERROR', error: `Send audio failed: ${e.message || 'Unknown'}` });
				}
			}
		},
		cleanupWebSocket: ({ context }) => {
			console.log(`[WebSocketMachine/${context.clientId}] Cleaning up WebSocket.`);
			if (context.socket) {
				context.socket.onopen = null; context.socket.onmessage = null; context.socket.onerror = null; context.socket.onclose = null;
				if (context.socket.readyState !== WebSocket.CLOSED && context.socket.readyState !== WebSocket.CLOSING) { context.socket.close(1000, 'Machine stopping'); }
			}
		},
		assignSocketNull: assignWs({ socket: null }),
		sendSilentAudioPing: ({ context }) => {
			if (context.socket?.readyState === WebSocket.OPEN) {
				try {
					// console.log(`[WebSocketMachine/${context.clientId}] Sending silent audio ping.`);
					context.socket.send(context.silentAudioChunk.slice(0)); // Send a slice to avoid transferring ownership if needed later
				} catch (e: any) {
					console.error(`[WebSocketMachine/${context.clientId}] Error sending silent ping:`, e);
					// Inform parent about send error? Maybe raise internal error?
					// For now, just log it.
				}
			}
		},
		startKeepaliveTimer: assignWs({
			keepaliveIntervalId: ({ context, self }) => {
				if (context.keepaliveIntervalId) clearInterval(context.keepaliveIntervalId);
				console.log(`[WebSocketMachine/${context.clientId}] Starting silent audio keepalive timer (${context.keepaliveIntervalMs}ms).`);
				return setInterval(() => { self.send({ type: 'SEND_SILENT_PING' }); }, context.keepaliveIntervalMs);
			}
		}),
		clearKeepaliveTimer: assignWs({
			keepaliveIntervalId: ({ context }) => {
				if (context.keepaliveIntervalId) {
					console.log(`[WebSocketMachine/${context.clientId}] Clearing keepalive timer.`);
					clearInterval(context.keepaliveIntervalId);
				}
				return null;
			}
		}),
	}
}).createMachine({
	id: 'webSocketConnection',
	context: ({ input }) => {
        // Create silent audio chunk (e.g., 100ms of 16kHz mono audio = 1600 samples)
        // Each sample is Float32 (4 bytes)
        const silentSampleCount = 1600;
        const silentBuffer = new ArrayBuffer(silentSampleCount * 4);
        // No need to fill with zeros, ArrayBuffer is initialized to zeros

        return {
            parent: input.parent,
            url: input.url,
            configPayload: input.configPayload,
            clientId: input.clientId,
            socket: null,
            retries: 0,
            // <<< Initialize keepalive context >>>
            keepaliveIntervalId: null,
            keepaliveIntervalMs: 2000, // <<< Reduce interval to 2 seconds >>>
            silentAudioChunk: silentBuffer
        };
    },
	initial: 'connecting',
	states: {
		connecting: {
			entry: 'connectWebSocket',
			on: {
				'WEBSOCKET.INTERNAL.OPEN': { target: 'connected', actions: ['sendOpenToParent', 'sendConfig', 'startKeepaliveTimer'] },
				'WEBSOCKET.INTERNAL.ERROR': { target: 'stopped', actions: ['sendErrorToParent', 'cleanupWebSocket', 'assignSocketNull', 'clearKeepaliveTimer'] },
				'STOP': { target: 'stopped', actions: ['cleanupWebSocket', 'assignSocketNull', 'clearKeepaliveTimer'] }
			}
		},
		connected: {
			on: {
				'WEBSOCKET.INTERNAL.MESSAGE': { actions: 'sendMessageToParent' },
				'WEBSOCKET.INTERNAL.ERROR': { target: 'stopped', actions: ['sendErrorToParent', 'cleanupWebSocket', 'assignSocketNull', 'clearKeepaliveTimer'] },
				'WEBSOCKET.INTERNAL.CLOSE': { target: 'stopped', actions: ['sendCloseToParent', 'cleanupWebSocket', 'assignSocketNull', 'clearKeepaliveTimer'] },
				'SEND_AUDIO': { actions: 'sendAudioChunk' },
				'SEND_SILENT_PING': { actions: 'sendSilentAudioPing' },
				'STOP': { target: 'stopped', actions: ['cleanupWebSocket', 'assignSocketNull', 'clearKeepaliveTimer'] }
			}
		},
		stopped: { type: 'final' }
	}
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
		websocketService: webSocketConnectionMachine
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

		// WebSocket Actor Management - Updated
		spawnWebSocketActor: assign({
			websocketActor: ({ context, spawn, self }) => {
				// Prepare initial config payload here
				const configPayload = {
					uid: context.clientId,
					client_id: context.clientId, // Some servers use this name
					language: context.language,
					task: 'transcribe',
					model: context.model,
					use_vad: context.useVad,
					...(context.useVad && {
						vad_parameters: {
							onset: 0.1, // Renamed from threshold, Example value, adjust as needed
						}
					})
				};
				console.log(`[WhisperLive] Spawning WebSocket machine with input:`, { url: context.wsUrl, clientId: context.clientId });
				return spawn('websocketService', {
					id: `ws-actor-${self.id}`,
					input: {
						parent: self, // Pass self as parent
						url: context.wsUrl,
						configPayload: configPayload, // Pass config here
						clientId: context.clientId
					}
				});
			},
			// Update connection status based on spawning
			connectionStatus: 'connecting',
			isServerReady: false,
			errorMessage: null,
		}),
		clearWebSocketActor: assign({ websocketActor: null }),
		// Use stopChild for stopping the actor - send STOP event to the actor first
		stopWebSocketActorAction: sendTo(({ context }) => context.websocketActor!, { type: 'STOP' } as WebSocketMachineEvent), // Send STOP event

		// WebSocket State Updates (Now mostly based on events FROM the WebSocket machine)
		assignConnecting: assign({ connectionStatus: 'connecting', errorMessage: null }), // Keep for initial status
		assignConnectionOpen: assign({ connectionStatus: 'connected', errorMessage: null }), // Triggered by WEBSOCKET.OPEN
		assignConnectionClosed: assign({
			connectionStatus: 'disconnected',
			isServerReady: false,
			errorMessage: ({ event }) => {
                if (event.type === 'WEBSOCKET.CLOSE' && event.code !== 1000 && event.code !== 1005) {
                    return `Connection closed unexpectedly: ${event.reason || event.code}`;
                } return null;
            },
			websocketActor: null, // Actor stops itself, but clear ref here too
		}),
		assignConnectionError: assign({
			connectionStatus: 'error',
			isServerReady: false,
			errorMessage: ({ event }) => (event.type === 'WEBSOCKET.ERROR' ? event.error : 'Unknown WS error'),
			websocketActor: null, // Actor stops itself, clear ref
		}),
		assignServerReady: assign({ isServerReady: true, connectionStatus: 'connected', errorMessage: null }), // Triggered by SERVER_READY message
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
		clearDynamicContext: assign(( { context } ) => {
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

		// --- Actor Communication Updates ---
		// REMOVE startWebSocketActor action - actor starts on spawn
		// REMOVE sendInitConfigToWebSocket action - config passed via input
		// UPDATE forwardAudioToWebsocket action - Send 'SEND_AUDIO' event
		forwardAudioToWebsocket: sendTo(
			({ context }) => context.websocketActor!,
			({ event }): WebSocketMachineEvent | undefined => { // Use new event type
				if (event.type === 'WORKLET_AUDIO_CHUNK') {
                    return { type: 'SEND_AUDIO', data: event.data }; // Send specific event
                }
				return undefined; // Use undefined for no event
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
        setupWorkletMessageHandler: ({ context, self }) => {
            console.log('[WhisperLive/Action] setupWorkletMessageHandler called.');
            if (!context.audioWorkletNode) {
                console.error('[WhisperLive/Action] Cannot setup handlers: audioWorkletNode is null in context.');
                return;
            }
            context.audioWorkletNode.port.onmessage = (ev: MessageEvent) => {
                // <<< Move checks to the very beginning >>>
                if (context.isStopping || self.getSnapshot().status === 'done') {
                    // Optional: Log message ignored
                    // console.log('[WhisperLive/onmessage] Ignoring message: Actor stopping or done.');
                    return;
                }

                // Check message type before sending to self
                if (ev.data?.type === 'RMS_UPDATE') {
                    try { self.send({ type: 'WORKLET_RMS_UPDATE', value: ev.data.value }); } catch(e) { /* ignore */ }
                } else if (ev.data?.type === 'VAD_SPEECH_START') { // Handle VAD events
                    try { self.send({ type: 'VAD_SPEECH_START' }); } catch(e) { /* ignore */ }
                } else if (ev.data?.type === 'VAD_SILENCE_START') {
                    try { self.send({ type: 'VAD_SILENCE_START' }); } catch(e) { /* ignore */ }
                } else if (ev.data instanceof ArrayBuffer) { // Check if data is ArrayBuffer
                    try {
                        self.send({ type: 'WORKLET_AUDIO_CHUNK', data: ev.data });
                    } catch (e) {
                        /* ignore error if actor stopped */
                    }
                } else {
                    console.warn('[WhisperLive/WorkletMsg] Unexpected message format from worklet. Expected ArrayBuffer for audio chunk. Received:',
                        `Type: ${typeof ev.data}`,
                        `Instance of ArrayBuffer: ${ev.data instanceof ArrayBuffer}`,
                        `Data:`, ev.data // Log the actual data
                    );
                }
            };
            context.audioWorkletNode.port.onmessageerror = (ev) => {
                console.error('[WhisperLive] Audio worklet port message error:', ev);
                self.send({ type: 'WORKLET_ERROR', error: 'Audio worklet port message error' });
            };
            context.audioWorkletNode.onprocessorerror = (ev) => {
                console.error('[WhisperLive] Audio worklet processor error:', ev);
                self.send({ type: 'WORKLET_ERROR', error: `Audio worklet processor error: ${ev}` });
            };
            console.log('[WhisperLive/Action] Worklet message handlers assigned.');
        },
        markAsStopping: assign({ isStopping: true }),
        sendStopToWorklet: ({ context }) => {
            console.log('[WhisperLive/Action] sendStopToWorklet: Attempting to send stop to worklet.');
            if (context.audioWorkletNode?.port) {
                try {
                    context.audioWorkletNode.port.postMessage({ type: 'stop' });
                } catch (e) {
                    console.warn('[WhisperLive/Action] sendStopToWorklet: Error sending stop message:', e);
                }
            } else {
                console.warn('[WhisperLive/Action] sendStopToWorklet: No worklet node/port found.');
            }
        },
	},
	guards: {
        isPermissionDeniedError: ({ event }) => {
            const specificEvent = event as Extract<WhisperLiveEvent, { type: 'xstate.error.actor.micPermissionActor' }>;
			const error = specificEvent.error;
			return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
		},
		canStreamAudio: ({ context }) => context.isWorkletReady,
		canForwardAudio: ({ context }) => context.websocketActor !== null,
        canTransitionToStreaming: ({ context }) => {
            return context.isWorkletReady;
        },
        isFinalSegment: ({ context, event }) => {
            if (event.type !== 'WEBSOCKET.MESSAGE') return false;
            let data;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return false; }

            const lastSegment = data?.segments?.[data.segments.length - 1];
            const isFinal = lastSegment?.final === true || lastSegment?.type === 'final' || lastSegment?.completed === true || lastSegment?.segment_type === 'final' || data?.final === true || data?.is_final === true;

            if (isFinal) {
                console.log('[WhisperLive/Guard] Final transcript detected.');
            }
            return isFinal;
        },
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
		isStopping: false, // Initialize the new flag
	}),
	initial: 'idle',

	on: {
        '*': { actions: 'logReceivedEvent' },
		'GLOBAL.RESET': {
			target: '.idle',
			actions: ['markAsStopping', 'sendStopToWorklet', 'removeWorkletMessageHandler', 'stopWebSocketActorAction', 'stopAllProcessing', 'clearDynamicContext', 'sendStateUpdateToParent'] as const // Use action name
		},
		'xstate.error.actor.micPermissionActor': {
			target: '.error',
			guard: 'isPermissionDeniedError',
			actions: ['markAsStopping', 'sendStopToWorklet', 'removeWorkletMessageHandler', 'assignPermissionError', 'sendStateUpdateToParent'] as const // Add handler removal
		},
		'WORKLET_READY': {
			actions: ['assignWorkletReady', 'sendStateUpdateToParent'] as const
		},
		'WORKLET_ERROR': {
			target: '.error',
			actions: ['markAsStopping', 'sendStopToWorklet', 'removeWorkletMessageHandler', 'assignWorkletError', 'stopWebSocketActorAction', 'stopAllProcessing', 'clearDynamicContext', 'sendStateUpdateToParent'] as const // Use action name
		},
		'WEBSOCKET.OPEN': {
			actions: [
			    log('[WhisperLive] WEBSOCKET.OPEN received from child actor.'),
			    'assignConnectionOpen', // Update local status for UI
			    'sendStateUpdateToParent'
			] as const
		},
		'WEBSOCKET.CLOSE': [
			{
				// Handler for unexpected close (excluding 1000, 1005, 1011)
				guard: ({ event }) => {
					const closeEvent = event as Extract<WhisperLiveEvent, { type: 'WEBSOCKET.CLOSE' }>;
					return !(closeEvent.code === 1000 || closeEvent.code === 1005 || closeEvent.code === 1011);
				},
				target: '.error',
				actions: [
					log('[WhisperLive] WEBSOCKET.CLOSE received from child actor (unexpected). Transitioning to error.'),
					'assignConnectionClosed',
					'markAsStopping',
					'sendStopToWorklet',
					'removeWorkletMessageHandler',
					'stopAudioProcessing',
					'clearAudioNodesAction',
					'sendStateUpdateToParent'
				] as const
			},
			{
				// Handler for expected close (1000, 1005, 1011)
				guard: ({ event }) => {
					const closeEvent = event as Extract<WhisperLiveEvent, { type: 'WEBSOCKET.CLOSE' }>;
					return closeEvent.code === 1000 || closeEvent.code === 1005 || closeEvent.code === 1011;
				},
				target: '.stopping',
				actions: [
					log(({ event }) => `[WhisperLive] WEBSOCKET.CLOSE received from child actor (expected code: ${(event as any).code}). Transitioning to stopping.`),
					'assignConnectionClosed'
				] as const
			}
		],
		'WEBSOCKET.ERROR': {
			target: '.error',
			actions: [
				log('[WhisperLive] WEBSOCKET.ERROR received from child actor.'),
				'assignConnectionError',
				'markAsStopping', // Ensure cleanup flags are set
				'sendStopToWorklet',
				'removeWorkletMessageHandler',
				'stopAudioProcessing',
				'clearAudioNodesAction',
				'sendStateUpdateToParent'
			] as const
		},
		'WEBSOCKET.MESSAGE': [
            {
                // Transition for final segments -> Reconnect
                guard: 'isFinalSegment',
                target: '.connectingWebSocket', // <<< Target connectingWebSocket >>>
                actions: [
                    log('[WhisperLive] Final segment received. Reconnecting WebSocket...'),
                    'processWebSocketMessage',
                    'assignTranscriptionUpdate',
                    'sendStateUpdateToParent',
                    'sendFinalizedUpdateToParent',
                    // --- Cleanup before restarting WS ---
                    'stopWebSocketActorAction',     // Send STOP to the old actor
                    'clearWebSocketActor',        // Clear the actor ref in context
                    'clearTranscriptionBuffers',  // Clear transcript parts
                    // --- Restart WS ---
                    'spawnWebSocketActor'         // Spawn a new actor and set status to connecting
                ] // No 'as const' here
            },
            {
                // Actions for non-final segments (no transition)
                actions: [
                    'processWebSocketMessage',
                    'assignTranscriptionUpdate',
                    'sendStateUpdateToParent'
                ] as const
            }
        ],
		'WORKLET_AUDIO_CHUNK': {
			guard: ({ context }) => !context.isStopping && context.websocketActor !== null,
			actions: ['forwardAudioToWebsocket']
		},
        'SERVER_READY': {
			actions: ['assignServerReady', 'sendStateUpdateToParent', log('[WhisperLive] SERVER_READY processed.')] as const
        },
        'SERVER_WAIT': {
            actions: ['assignServerWait', 'sendStateUpdateToParent', log('[WhisperLive] Received SERVER_WAIT from server.')] as const
        },
        'SERVER_DISCONNECT': [
			{ actions: log('[WhisperLive/GlobalOn] WARNING: SERVER_DISCONNECT triggered.') },
			{
				target: '.error',
				actions: ['markAsStopping', 'sendStopToWorklet', 'removeWorkletMessageHandler', 'assignServerDisconnect', 'stopWebSocketActorAction', 'stopAudioProcessing', 'clearAudioNodesAction', 'sendStateUpdateToParent'] as const
			}
		],
        'LANGUAGE_DETECTED': {
            actions: ['assignDetectedLanguage', 'sendStateUpdateToParent'] as const
        },
        'WORKLET_RMS_UPDATE': {
            actions: ['assignRmsLevel', 'sendStateUpdateToParent'] as const
        },
	},

	states: {
		idle: {
			entry: [log('[WhisperLive] Entering idle state.'), 'clearDynamicContext', 'assignClientId', 'sendStateUpdateToParent'] as const,
			on: {
				START_LISTENING: 'initializingAudio'
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
                         log(({ context }) => `[WhisperLive/AudioInit] After assignAudioContextAndWorkletReady: isWorkletReady=${context.isWorkletReady}`),
                         'setupWorkletMessageHandler',
                         'spawnWebSocketActor'
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
                           'setupWorkletMessageHandler',
                           'spawnWebSocketActor'
                       ] as const
				 },
                 onError: {
                     target: 'error',
                     actions: [log('[WhisperLive/Perms] micPermissionActor failed directly.'), 'assignGenericPermissionError']
                 }
			 }
		},
		waitingForSpeech: {
			entry: [log('[WhisperLive] Entering waitingForSpeech state (WS may be stopped).'), 'sendStateUpdateToParent'],
			on: {
				VAD_SPEECH_START: {
					actions: [
						log('[WhisperLive] VAD_SPEECH_START in waiting. Re-spawning WebSocket actor...'),
						'stopWebSocketActorAction',
						'spawnWebSocketActor'
					],
					target: 'connectingWebSocket'
				},
				STOP_LISTENING: { target: 'stopping' },
			}
		},
		connectingWebSocket: {
			entry: [log('[WhisperLive] Entering connectingWebSocket state (Waiting for WEBSOCKET.OPEN from child)...'), 'sendStateUpdateToParent'] as const,
			 on: {
				 STOP_LISTENING: { target: 'stopping' },
				 'SERVER_READY': {
					 actions: ['assignServerReady', 'sendStateUpdateToParent'] as const,
					 target: 'streamingAudio'
				 },
			 },
			 exit: log('[WhisperLive] Exiting connectingWebSocket state.')
		},
		streamingAudio: {
			 entry: [log('[WhisperLive] Entering streamingAudio state (WS connected, Server Ready).'), 'sendStateUpdateToParent'] as const,
			 exit: [log('[WhisperLive] Exiting streamingAudio state.')],
			 on: {
				 STOP_LISTENING: { target: 'stopping' },
			 }
		},
		stopping: {
			 entry: [
				 log('[WhisperLive] Entering stopping state.'),
				 'markAsStopping',
                 'removeWorkletMessageHandler',
                 'sendStopToWorklet',
                 'stopWebSocketActorAction',
                 'stopAllProcessing',
                 'sendStateUpdateToParent'
			 ] as const,
			 always: { target: 'idle' }
		},
		error: {
			entry: [
				'markAsStopping',
                'removeWorkletMessageHandler',
				'logError',
				'sendErrorToParent',
                'sendStopToWorklet',
				'stopWebSocketActorAction',
				'stopAllProcessing',
				'clearDynamicContext'
			] as const,
			on: {
				START_LISTENING: { target: 'initializingAudio' },
			}
		}
	}
}); 