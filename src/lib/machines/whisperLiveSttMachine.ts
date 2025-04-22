import { setup, assign, fromCallback, log, sendTo, type ActorRefFrom } from 'xstate';

// --- Types ---

export interface WhisperLiveContext {
	serviceRef: ActorRefFrom<typeof connectionServiceLogic> | null;
	currentSegment: string | null;
	lastFinalizedText: string | null;
	statusMessage: string;
	errorMessage: string | null;
	apiToken?: string | null; // If needed for the connection
}

type WhisperLiveEvent =
	| { type: 'START_LISTENING'; payload?: { token?: string | null } }
	| { type: 'STOP_LISTENING' }
	| { type: 'RESET' }
	// Events from the connection service actor
	| { type: 'SERVICE.CONNECTED'; status: string }
	| { type: 'SERVICE.DISCONNECTED'; status: string }
	| { type: 'SERVICE.ERROR'; error: string; status: string }
	| { type: 'SERVICE.UPDATE'; segment: string; status: string }
	| { type: 'SERVICE.FINALIZED'; text: string; status: string };

// --- Placeholder Connection Service Logic ---
// This should be replaced with actual WebSocket/Whisper-Live client logic
// It needs to handle connection, sending audio (if required by whisper-live),
// receiving transcription updates, and error handling.
const connectionServiceLogic = fromCallback<WhisperLiveEvent, { token?: string | null }>( (
	{ sendBack, receive, self } // Added self
) => {
	console.log('[WhisperLiveService] Actor starting...');
	// Placeholder: Simulate connection and events
	let connectionInterval: ReturnType<typeof setInterval> | null = null;
	let messageInterval: ReturnType<typeof setInterval> | null = null;
	let finalizeTimeout: ReturnType<typeof setTimeout> | null = null;
	let segmentCounter = 0;

	const connect = () => {
		console.log('[WhisperLiveService] Attempting to connect...');
		sendBack({ type: 'SERVICE.UPDATE', segment: '', status: 'Connecting...' });

		// Simulate connection delay
		setTimeout(() => {
			console.log('[WhisperLiveService] Connected.');
			sendBack({ type: 'SERVICE.CONNECTED', status: 'Listening...' });

			// Simulate receiving transcription updates
			messageInterval = setInterval(() => {
				segmentCounter++;
				const segment = `Segment ${segmentCounter}... `;
				console.log('[WhisperLiveService] Sending segment update:', segment);
				sendBack({ type: 'SERVICE.UPDATE', segment: segment, status: 'Recording...' });

				// Simulate a finalized text after some segments
				if (segmentCounter % 5 === 0) {
					const finalText = `Finalized text after ${segmentCounter} segments.`;
					console.log('[WhisperLiveService] Sending finalized text:', finalText);
					// Send finalized text UP to the parent (manager)
					self.send({ type: 'PARENT.FINALIZED', text: finalText });
					// Reset segment for next utterance
					sendBack({ type: 'SERVICE.UPDATE', segment: '', status: 'Recording...' });
				}
			}, 1500); // Send update every 1.5 seconds

			// Simulate an error occasionally
			/*
                 setTimeout(() => {
                     console.error('[WhisperLiveService] Simulating connection error.');
                     // Send error UP to parent
                     self.send({ type: 'PARENT.ERROR', error: 'Simulated connection error.' });
                     cleanup();
                 }, 8000);
                 */
		}, 2000); // 2 second connection delay
	};

	const cleanup = () => {
		console.log('[WhisperLiveService] Cleaning up service actor...');
		if (connectionInterval) clearInterval(connectionInterval);
		if (messageInterval) clearInterval(messageInterval);
		if (finalizeTimeout) clearTimeout(finalizeTimeout);
		connectionInterval = null;
		messageInterval = null;
		finalizeTimeout = null;
		segmentCounter = 0;
		sendBack({ type: 'SERVICE.DISCONNECTED', status: 'Service stopped.' }); // Inform parent state
	};

	receive((event) => {
		console.log('[WhisperLiveService] Received parent event:', event.type);
		if (event.type === 'START_LISTENING') {
			connect();
		} else if (event.type === 'STOP_LISTENING' || event.type === 'RESET') {
			cleanup();
		}
	});

	// Don't start connection immediately, wait for START_LISTENING from parent

	return cleanup; // Cleanup function
});

// --- Machine Setup ---

export const whisperLiveSttMachine = setup({
	types: {
		context: {} as WhisperLiveContext,
		events: {} as WhisperLiveEvent | { type: 'PARENT.FINALIZED'; text: string } | { type: 'PARENT.ERROR'; error: string } // Add parent events
	},
	actors: {
		connectionService: connectionServiceLogic
	},
	actions: {
		assignStatus: assign({
			statusMessage: ({ event }) => {
				if ('status' in event && typeof event.status === 'string') {
					return event.status;
				}
				return 'Initializing...';
			}
		}),
		assignToken: assign({
			apiToken: ({ event, context }) => {
				if (event.type === 'START_LISTENING' && event.payload?.token !== undefined) {
					return event.payload.token;
				}
				return context.apiToken;
			}
		}),
		assignServiceRef: assign({
			serviceRef: ({ spawn, self }) => // Added self
				spawn(connectionServiceLogic, { // Spawn the logic directly
					id: 'whisperLiveServiceActor',
                    // Send parent reference or use self.send within actor?
                    // Let's modify the actor to use self.send for parent communication
				})
		}),
		// Modify to send events TO the actor ref
		stopService: sendTo(({ context }) => context.serviceRef!, { type: 'STOP_LISTENING' }), // Use correct event type
		startService: sendTo(({ context }) => context.serviceRef!, { type: 'START_LISTENING' }),
		clearServiceRef: assign({ serviceRef: null }),
		assignError: assign({
			errorMessage: ({ event }) => {
				if (event.type === 'SERVICE.ERROR') return event.error;
                if (event.type === 'PARENT.ERROR') return event.error; // Handle error from child
				return 'An unknown error occurred.';
			},
			statusMessage: ({ event }) => (event.type === 'SERVICE.ERROR' || event.type === 'PARENT.ERROR' ? 'Error' : 'Error'),
			currentSegment: null
		}),
		clearError: assign({ errorMessage: null }),
		assignUpdate: assign({
			currentSegment: ({ event }) => (event.type === 'SERVICE.UPDATE' ? event.segment : null),
			statusMessage: ({ event }) => (event.type === 'SERVICE.UPDATE' ? event.status : 'Updating...')
		}),
        // Finalized text is now handled via PARENT.FINALIZED sent UP to manager
		// assignFinalized: assign({ ... }) // Remove this
		resetContext: assign({
			serviceRef: null,
			currentSegment: null,
			lastFinalizedText: null, // Keep this to store the last one received via parent event
			statusMessage: 'Idle',
			errorMessage: null
		}),
		setStatus: assign({
			statusMessage: ({ event }) => {
				if ('status' in event && typeof event.status === 'string') return event.status;
				if (event.type === 'START_LISTENING') return 'Initializing...';
				if (event.type === 'STOP_LISTENING') return 'Stopping...';
				if (event.type === 'RESET') return 'Resetting...';
				return 'Unknown';
			}
		}),
        // Action to send FINALIZED event to parent (manager)
        sendFinalizedToParent: sendTo(
            ({ system }) => system.get('sttManager'), // Assuming manager ID is 'sttManager'
            ({ event }) => {
                if (event.type === 'PARENT.FINALIZED') {
                    return { type: 'CHILD.FINALIZED', text: event.text };
                }
                return { type: 'ignore' }; // Should not happen based on trigger
            }
        ),
        // Action to send ERROR event to parent (manager)
        sendErrorToParent: sendTo(
            ({ system }) => system.get('sttManager'),
            ({ event }) => {
                 if (event.type === 'PARENT.ERROR') {
                     return { type: 'CHILD.ERROR', error: event.error };
                 }
                 return { type: 'ignore' };
             }
        )
	}
}).createMachine({
	id: 'whisperLiveStt',
	context: ({ input }) => ({
		serviceRef: null,
		currentSegment: null,
		lastFinalizedText: null,
		statusMessage: 'Idle',
		errorMessage: null,
		apiToken: input?.apiToken
	}),
	initial: 'idle',
	states: {
		idle: {
			entry: ['resetContext', 'clearServiceRef'],
			on: {
				START_LISTENING: {
					target: 'connecting',
					actions: ['assignToken', 'assignServiceRef', 'clearError', 'setStatus']
				}
			}
		},
		connecting: {
			entry: ['startService', log('Attempting connection...')],
			on: {
				'SERVICE.CONNECTED': {
					target: 'listening',
					actions: ['assignStatus', log('Connected to service.')]
				},
				'SERVICE.ERROR': { // Error reported by the service itself
					target: 'error',
					actions: ['assignError', 'clearServiceRef', log('Connection service error.')]
				},
                 'PARENT.ERROR': { // Error sent up from the service logic
                     target: 'error',
                     actions: 'sendErrorToParent' // Forward to manager
                 },
				'SERVICE.UPDATE': {
					actions: 'assignStatus'
				},
				STOP_LISTENING: {
					target: 'idle',
					actions: ['stopService', 'setStatus', log('Stopped during connection.')]
				},
				RESET: {
					target: 'idle',
					actions: ['stopService', 'setStatus']
				}
			}
		},
		listening: {
			entry: log('Listening via service...'),
			on: {
				'SERVICE.UPDATE': {
					actions: ['assignUpdate', 'assignStatus']
				},
                'PARENT.FINALIZED': { // Received from service actor
                    // Send it up to the manager machine
                    actions: 'sendFinalizedToParent'
                },
                'PARENT.ERROR': { // Error sent up from the service logic
                    target: 'error',
                    actions: 'sendErrorToParent' // Forward to manager
                },
				'SERVICE.DISCONNECTED': {
					target: 'idle',
					actions: ['clearServiceRef', 'assignStatus', log('Service disconnected.')]
				},
				'SERVICE.ERROR': { // Error reported by the service itself
					target: 'error',
					actions: ['assignError', 'clearServiceRef', log('Service error during listening.')]
				},
				STOP_LISTENING: {
					target: 'idle',
					actions: ['stopService', 'setStatus', log('Stopped listening.')]
				},
				RESET: {
					target: 'idle',
					actions: ['stopService', 'setStatus']
				}
			}
		},
		error: {
			entry: log(({ context }) => `WhisperLive Error: ${context.errorMessage}`),
			on: {
				START_LISTENING: {
					target: 'connecting',
					actions: ['assignToken', 'assignServiceRef', 'clearError', 'setStatus']
				},
				RESET: {
					target: 'idle',
					actions: 'setStatus'
				}
			}
		}
	}
}); 