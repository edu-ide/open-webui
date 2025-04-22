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
	finalTranscriptBuffer: string;
	errorMessage: string | null;
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
	| { type: 'WORKLET_READY' } // Added explicit event for worklet ready
	| { type: 'WORKLET_ERROR'; error: string }
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
	console.log(`[WebSocketActor/${input.parentMachineId}] Starting connection to ${input.url}`);
	let socket: WebSocket | null = null;

	const connect = () => {
		if (socket && socket.readyState !== WebSocket.CLOSED) return;
		console.log(`[WebSocketActor/${input.parentMachineId}] Attempting connect...`);
		sendBack({ type: 'WEBSOCKET.CONNECTING' } as any);
		try {
			socket = new WebSocket(input.url);
			socket.onopen = () => sendBack({ type: 'WEBSOCKET.OPEN' } as any);
			socket.onmessage = (event: MessageEvent) => {
				try {
                    // Send raw data back for parsing in the main machine
                    sendBack({ type: 'WEBSOCKET.MESSAGE', data: event.data } as any);
                 }
				catch (e) { sendBack({ type: 'WEBSOCKET.ERROR', error: 'Processing error' } as any); }
			};
			socket.onerror = () => sendBack({ type: 'WEBSOCKET.ERROR', error: 'WebSocket error' } as any);
			socket.onclose = (event: CloseEvent) => sendBack({ type: 'WEBSOCKET.CLOSE', code: event.code, reason: event.reason } as any);
		} catch (error: any) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			sendBack({ type: 'WEBSOCKET.ERROR', error: `WebSocket creation failed: ${message}` } as any);
		}
	};

	receive((event) => {
		// Commands *to* this actor
		if (event.type === 'START_LISTENING') connect(); // Connect when told
		else if (event.type === 'STOP_LISTENING') {
			if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, 'Client stopped');
		} else if (event.type === 'WORKLET_AUDIO_CHUNK') { // Audio data from main machine
			if (socket && socket.readyState === WebSocket.OPEN) {
				try { socket.send(event.data); } // Send ArrayBuffer
				catch (e: any) {
					const message = e instanceof Error ? e.message : 'Unknown error';
					sendBack({ type: 'WEBSOCKET.ERROR', error: `Send audio failed: ${message}` } as any);
				}
			}
		} else if (event.type === 'SEND_CONFIG') { // New command to send initial config
			if (socket && socket.readyState === WebSocket.OPEN) {
				try { socket.send(JSON.stringify(event.payload)); }
				catch (e: any) {
					const message = e instanceof Error ? e.message : 'Unknown error';
					sendBack({ type: 'WEBSOCKET.ERROR', error: `Send config failed: ${message}` } as any);
				}
			}
		}
	});

	return () => { // Cleanup
		if (socket && socket.readyState !== WebSocket.CLOSED) {
			socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
			socket.close(1000, 'Actor cleanup');
		}
		socket = null;
		console.log(`[WebSocketActor/${input.parentMachineId}] Stopped.`);
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
		}),
		assignStream: assign({ mediaStream: ({ event }) => (event as DoneActorEvent<MediaStream>).output, errorMessage: null }),
		assignPermissionError: assign({ errorMessage: 'Microphone permission denied.', connectionStatus: 'error' }),
		assignGenericPermissionError: assign({
			errorMessage: ({ event }) => {
                // Add type check before accessing properties
                if (event.type === 'xstate.error.actor.micPermissionActor' && event.error instanceof Error) {
                    return `Microphone permission error: ${event.error.message || event.error.name}`;
                } else if (event.type === 'xstate.error.actor.micPermissionActor') {
                    return 'Unknown microphone permission error';
                }
                return 'Generic permission error (unexpected event type)';
            }
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
		stopWebSocketActor: stopChild(({ context }) => context.websocketActor!),

		// WebSocket State Updates
		assignConnecting: assign({ connectionStatus: 'connecting', errorMessage: null }),
		assignConnectionOpen: assign({ connectionStatus: 'initializing', errorMessage: null }), // Move to initializing state after open
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
		assignServerDisconnect: assign({ isServerReady: false, connectionStatus: 'disconnected' }),
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
                // Ensure data is parsed if it's a string (common from WebSocket)
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch (e) {
                console.error("[WhisperLive] Failed to parse WS message data:", event.data, e);
                return { errorMessage: "Failed to parse server message" }; // Assign error
            }

			let updates: Partial<Pick<WhisperLiveContext, 'currentSegment' | 'finalTranscriptBuffer' | 'errorMessage'>> = {};

			// Adapt to common whisper.cpp/faster-whisper streaming JSON structures
			if (data?.segments && Array.isArray(data.segments)) {
				 const transcript = data.segments.map((s: any) => s.text || '').join(' ').trim();
				 const lastSegment = data.segments[data.segments.length - 1];
				 // Check standard whisper.cpp/faster-whisper finalization flags
				 const isFinal = lastSegment?.final === true || lastSegment?.type === 'final' || lastSegment?.completed === true || lastSegment?.segment_type === 'final'; // Add common variants

				 updates.currentSegment = transcript; // Always update intermediate/current
				 if (isFinal) {
					 updates.finalTranscriptBuffer = transcript; // Store the full final text
					 // Clear segment only if it makes sense for UI - might want to keep last partial visible
					 // updates.currentSegment = null;
				 }
                 updates.errorMessage = null; // Clear previous errors on successful transcription update
			} else if (data?.transcript && typeof data.transcript === 'string') {
                // Handle simpler format { "transcript": "...", "final": true/false }
                updates.currentSegment = data.transcript;
                if (data.final === true) {
                    updates.finalTranscriptBuffer = data.transcript;
                }
                updates.errorMessage = null;
            } else if (data?.type === 'partial_transcript' && data.data) {
                updates.currentSegment = data.data;
                updates.errorMessage = null;
            } else if (data?.type === 'final_transcript' && data.data) {
                updates.currentSegment = null; // Clear partial on final
                updates.finalTranscriptBuffer = context.finalTranscriptBuffer + data.data + ' '; // Append final
                updates.errorMessage = null;
            } else {
				// console.warn("[WhisperLive] Received WS message with unexpected structure:", data);
                // Don't modify context if structure is unknown
            }
			return updates;
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
			finalTranscriptBuffer: '',
			errorMessage: null
		}),
        // Renamed from clearContext for clarity
		clearDynamicContext: assign({
			audioContext: null,
			mediaStream: null,
			sourceNode: null,
			audioWorkletNode: null,
			isWorkletReady: false,
			connectionStatus: 'idle' as const,
			websocketActor: null,
			isServerReady: false,
			currentSegment: null,
			finalTranscriptBuffer: '',
			errorMessage: null
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
			({ context }) => context.websocketActor!, // Send directly to the actor ref
			({ event }): WhisperLiveEvent => {
				if (event.type === 'WORKLET_AUDIO_CHUNK') return event; // Forward event
				return { type: 'ignore' }; // Should not happen
			}
		),

		// --- AudioWorklet/Media Graph Management ---
		setupAndStartAudioProcessing: assign(( { context, self } ) => {
			if (!context.audioContext || !context.mediaStream || !context.isWorkletReady) {
				self.send({ type: 'WORKLET_ERROR', error: 'Pre-requisites not met for audio setup'});
				return {};
			}
			let sourceNode: MediaStreamAudioSourceNode | null = null;
			let audioWorkletNode: AudioWorkletNode | null = null;
			try {
				// Disconnect previous nodes if they exist (e.g., on retry)
				if (context.sourceNode) { try { context.sourceNode.disconnect(); } catch {} }
				if (context.audioWorkletNode) { try { context.audioWorkletNode.disconnect(); context.audioWorkletNode.port.close(); } catch {} }

				audioWorkletNode = new AudioWorkletNode(context.audioContext, 'audio-processor');
				audioWorkletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
					// Send the ArrayBuffer directly to the machine
					self.send({ type: 'WORKLET_AUDIO_CHUNK', data: ev.data });
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

				sourceNode = context.audioContext.createMediaStreamSource(context.mediaStream);
				sourceNode.connect(audioWorkletNode);
				// Do NOT connect workletNode to destination unless debugging audio output
				// audioWorkletNode.connect(context.audioContext.destination);

				// Tell the worklet to start processing AFTER connecting the graph
				audioWorkletNode.port.postMessage({ type: 'start' });
				console.log('[WhisperLive] Audio graph connected & worklet started.');

				return { sourceNode, audioWorkletNode, errorMessage: null }; // Assign nodes and clear error

			} catch (error: any) {
				console.error('[WhisperLive] Error setting up media graph:', error);
				self.send({ type: 'WORKLET_ERROR', error: `Audio graph setup failed: ${error instanceof Error ? error.message : 'Unknown'}` });
				return { sourceNode: null, audioWorkletNode: null }; // Clear nodes on error
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
            // Stop WS actor first
			if (context.websocketActor) {
				stopChild(context.websocketActor);
			}
            // Stop Audio Processing
            if (context.audioWorkletNode) { try { context.audioWorkletNode.port.postMessage({ type: 'stop' }); context.audioWorkletNode.port.close(); context.audioWorkletNode.disconnect(); } catch {} }
			try { context.sourceNode?.disconnect(); } catch {}
			context.mediaStream?.getTracks().forEach(track => track.stop());
            // Close Audio Context
            if (context.audioContext?.state !== 'closed') { context.audioContext?.close().catch(() => {}); }
        },

		// --- Parent Communication ---
		sendStateUpdateToParent: sendParent(({ context }) => ({
			type: 'WORKER_STATE_UPDATE',
			state: {
				isListening: context.connectionStatus === 'connected' && !!context.audioWorkletNode,
				error: context.errorMessage,
				currentTranscript: context.currentSegment,
				finalTranscript: context.finalTranscriptBuffer,
				connectionStatus: context.connectionStatus,
				isServerReady: context.isServerReady
			}
		})),
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
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch (e) {
				console.error('[WhisperLive] Failed to parse WS message:', e);
				// Don't send error event here, assignTranscriptionUpdate handles error state
				return;
			}

			try {
				// Handle control messages
				if (data?.message === 'SERVER_READY' || data?.type === 'server_ready') {
					self.send({ type: 'SERVER_READY' });
				} else if ((data?.status === 'WAIT' || data?.type === 'wait') && typeof data.duration === 'number') {
					self.send({ type: 'SERVER_WAIT', duration: data.duration });
				} else if (data?.message === 'DISCONNECT' || data?.type === 'disconnect') {
					self.send({ type: 'SERVER_DISCONNECT' });
				} else if (data?.language && typeof data.language === 'string') {
					self.send({ type: 'LANGUAGE_DETECTED', language: data.language });
				} else if (data?.error && typeof data.error === 'string') {
                    // Handle explicit error messages from server
                    assign({ errorMessage: data.error, connectionStatus: 'error' as const });
                    self.send({ type: 'WEBSOCKET.ERROR', error: data.error }); // Also trigger error event
                }
				// Segment/transcript updates are handled by assignTranscriptionUpdate action triggered by the same WEBSOCKET.MESSAGE event
			} catch (e) {
				console.error('[WhisperLive] Error processing parsed WS message logic:', e);
			}
		},

		// --- Logging ---
		logAudioStreamingStarted: log('[WhisperLive] Audio streaming started.'),
		logError: log(({ context }) => `[WhisperLive] Error state reached. Message: ${context.errorMessage ?? 'No error message'}`) // Enhanced log
	},
	guards: {
		// Use type assertion within the guard instead of GuardArgs
		isPermissionDeniedError: ({ event }) => {
            // Assert the event type for type safety
            const specificEvent = event as Extract<WhisperLiveEvent, { type: 'xstate.error.actor.micPermissionActor' }>;
			const error = specificEvent.error;
			return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
		},
		isWebSocketConnected: ({ context }) => context.websocketActor !== null && context.connectionStatus === 'connected',
		isServerReady: ({ context }) => context.isServerReady,
		// Guard to check if both worklet and server are ready for streaming
		canStreamAudio: ({ context }) => context.isWorkletReady && context.isServerReady && context.connectionStatus === 'connected',
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
		clientId: `web-${generateUUID()}`, // Generate initial client ID
		// Initial state for dynamic properties
		audioContext: null,
		mediaStream: null,
		sourceNode: null,
		audioWorkletNode: null,
		isWorkletReady: false,
		connectionStatus: 'idle',
		websocketActor: null,
		isServerReady: false,
		currentSegment: null,
		finalTranscriptBuffer: '',
		errorMessage: null,
	}),
	initial: 'idle',

	// Global event handlers
	on: {
		'GLOBAL.RESET': {
			// Target absolute state '.idle' from root
			target: '.idle', // Corrected target to be relative to root
			// Use the renamed clear action and combined stop action
			actions: ['clearDynamicContext', 'stopAllProcessing', 'sendStateUpdateToParent'] as const
		},
		'START': {
			// Target relative state within the current state's children (or root if at root)
			target: '.initializingAudio'
		},
		'STOP': {
			// Target relative state
			target: '.stopping'
		},
		'xstate.error.actor.micPermissionActor': {
			target: '.error',
			// Use the guard defined in setup by its string name
			guard: 'isPermissionDeniedError', // Reference specific guard
			actions: ['assignPermissionError', 'sendStateUpdateToParent'] as const
		},
		'WORKLET_READY': {
			// Assign ready state and update parent
			actions: ['assignWorkletReady', 'sendStateUpdateToParent'] as const
		},
		'WORKLET_ERROR': {
			target: '.error',
			// Assign error message and update parent
			actions: ['assignWorkletError', 'sendStateUpdateToParent'] as const
		},
		'WEBSOCKET.OPEN': {
			// Assign state, send initial config, update parent
			actions: ['assignConnectionOpen', 'sendInitConfigToWebSocket', 'sendStateUpdateToParent'] as const
		},
		'WEBSOCKET.CLOSE': {
            // Only transition to error on unexpected close, otherwise handled in 'stopping'
			target: '.error',
			// Condition to only transition if the closure was unexpected
            guard: ({ event }) => (event as Extract<WhisperLiveEvent, { type: 'WEBSOCKET.CLOSE' }>).code !== 1000 && (event as Extract<WhisperLiveEvent, { type: 'WEBSOCKET.CLOSE' }>).code !== 1005,
            // Assign state, potentially stop audio, update parent
			actions: ['assignConnectionClosed', 'stopAudioProcessing', 'sendStateUpdateToParent'] as const
		},
		'WEBSOCKET.ERROR': {
			target: '.error',
            // Assign error state, stop audio, update parent
			actions: ['assignConnectionError', 'stopAudioProcessing', 'sendStateUpdateToParent'] as const
		},
		'WEBSOCKET.MESSAGE': {
            // Process message (trigger internal events), assign transcript updates, send updates to parent
			actions: ['processWebSocketMessage', 'assignTranscriptionUpdate', 'sendStateUpdateToParent', 'sendFinalizedUpdateToParent'] as const
		},
		// Audio Worklet Events
		'WORKLET_AUDIO_CHUNK': {
			// Use guard defined in setup by its string name
			guard: 'canStreamAudio',
			actions: ['forwardAudioToWebsocket'] as const // Added as const
		},
        // Server state events dispatched by processWebSocketMessage
        'SERVER_READY': {
            actions: ['assignServerReady', 'sendStateUpdateToParent'] as const
        },
        'SERVER_WAIT': {
            target: '.connectingWebSocket', // Revert state if server is busy
            actions: ['assignServerWait', 'stopAudioProcessing', 'sendStateUpdateToParent'] as const
        },
        'SERVER_DISCONNECT': {
            target: '.error', // Treat server disconnect as an error
            actions: ['assignServerDisconnect', 'stopAudioProcessing', 'sendStateUpdateToParent'] as const
        },
        'LANGUAGE_DETECTED': {
            actions: ['assignDetectedLanguage', 'sendStateUpdateToParent'] as const
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
                     actions: [log('[WhisperLive/AudioInit] audioWorkletSetupActor succeeded.'), 'assignAudioContextAndWorkletReady'] as const
				 },
				 // Global WORKLET_ERROR handler manages errors from this actor
                 onError: {
                     target: 'error',
                     actions: log('[WhisperLive/AudioInit] audioWorkletSetupActor failed.') // Log specific failure point
                 }
			 },
			 // Skip if already done (e.g., retry after error)
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
					 target: 'connectingWebSocket',
                     actions: [log('[WhisperLive/Perms] micPermissionActor succeeded.'), 'assignStream'] as const
				 },
				 // Error handled by global 'xstate.error.actor.micPermissionActor' handler
                 onError: {
                     target: 'error', // Ensure transition to error on direct failure
                     actions: log('[WhisperLive/Perms] micPermissionActor failed directly.') // Log specific failure point
                 }
			 }
		},
		connectingWebSocket: {
			 entry: [log('[WhisperLive] Entering connectingWebSocket state.'), 'spawnWebSocketActor', 'startWebSocketActor'] as const,
			 on: {
				 // SERVER_READY event handled globally now
			 },
             // Wait for server readiness before moving on
             always: {
                // Use guard defined in setup by string name
                guard: 'canStreamAudio',
                target: 'streamingAudio'
             },
			 exit: log('[WhisperLive] Exiting connectingWebSocket state.')
		},
		streamingAudio: {
			 entry: ['setupAndStartAudioProcessing', 'logAudioStreamingStarted', 'sendStateUpdateToParent'] as const,
			 exit: ['stopAudioProcessing', 'clearAudioNodes', 'sendStateUpdateToParent'] as const,
			 on: {
				 // SERVER_WAIT and SERVER_DISCONNECT handled globally
			 }
		},
		stopping: {
			 entry: [
                 // Use combined stop action
				 'stopAllProcessing',
				 log('Stopping...'),
				 'sendStateUpdateToParent'
			 ] as const,
			 exit: [
				 // Use renamed clear action
				 'clearDynamicContext'
			 ] as const,
			 on: {
				 // Target idle directly on expected WebSocket close
				 'WEBSOCKET.CLOSE': {
                     target: 'idle',
                     // Ensure this transition only happens on normal close
                     guard: ({ event }) => (event as Extract<WhisperLiveEvent, { type: 'WEBSOCKET.CLOSE' }>).code === 1000 || (event as Extract<WhisperLiveEvent, { type: 'WEBSOCKET.CLOSE' }>).code === 1005
                 }
			 },
			 after: {
				 // Force idle if WS close doesn't happen (actor might be stuck/unresponsive)
				 3000: {
					 target: 'idle',
					 actions: [log('Force stop timeout.'), 'stopAllProcessing', 'clearDynamicContext'] as const // Ensure cleanup on timeout
				 }
			 }
		},
		error: {
			entry: [
				 'logError',
				 'sendErrorToParent',
				 // Use combined stop action for cleanup
				 'stopAllProcessing'
			 ] as const,
			exit: [
				 // Use renamed clear action
				 'clearDynamicContext'
			 ] as const,
			on: {
				START_LISTENING: { target: 'initializingAudio' }, // Retry initializes audio
				// GLOBAL.RESET handled globally
			}
		}
	}
}); 