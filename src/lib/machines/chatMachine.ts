import { setup, assign, fromPromise, log, sendTo } from 'xstate';

// --- Types ---

export interface ChatContext {
	currentPrompt: string | null;
	currentResponseId: string | null;
	currentResponseContent: string;
	errorMessage: string | null;
	isLoading: boolean;
	// Function to call the actual backend API, injected via input
	backendSubmitFn?: (prompt: string, options?: any) => Promise<any>; // Adjust return type as needed
}

type ChatEvent =
	| { type: 'SUBMIT_PROMPT'; payload: { prompt: string } }
	| { type: 'RECEIVE_CHUNK'; payload: { id: string; content: string } } // To be triggered externally based on chat events
	| { type: 'FINISH_STREAM'; payload: { id: string } } // To be triggered externally
	| { type: 'RESET' }
	// Internal events from actor
	| { type: '_API_SUCCESS'; output: any } // TODO: Define output type based on submitPrompt response
	| { type: '_API_ERROR'; error: string };

// --- Machine Setup ---

export const chatMachine = setup({
	types: {
		context: {} as ChatContext,
		events: {} as ChatEvent,
		input: {} as { backendSubmitFn: ChatContext['backendSubmitFn'] } // Expect submit function via input
	},
	actors: {
		submitPromptActor: fromPromise<any, { prompt: string; submitFn: ChatContext['backendSubmitFn'] }>(
			async ({ input }) => {
				const { prompt, submitFn } = input;
				if (!submitFn) {
					throw new Error('Backend submit function (backendSubmitFn) not provided.');
				}
				console.log(`[chatMachine/submitPromptActor] Submitting prompt: "${prompt}"`);
				// Assuming submitFn handles the streaming internally and its promise resolves
				// when the request is *accepted* or an initial error occurs.
				// The actual stream data (RECEIVE_CHUNK, FINISH_STREAM) will likely come from
				// external event listeners in CallOverlay that call submitFn.
				// This actor mainly triggers the call and handles immediate errors/success confirmation.
				const response = await submitFn(prompt, { _raw: true }); // Using _raw based on CallOverlay usage
				console.log('[chatMachine/submitPromptActor] Submission response:', response);
				// What does submitPrompt resolve with? Need to adjust _API_SUCCESS payload.
				// For now, just pass the response.
				return response;
			}
		)
	},
	actions: {
		assignSubmitting: assign({
			isLoading: true,
			errorMessage: null,
			currentPrompt: ({ event }) => (event.type === 'SUBMIT_PROMPT' ? event.payload.prompt : null),
			currentResponseId: null,
			currentResponseContent: ''
		}),
		assignStreamingStart: assign((contextAndEvent) => {
			// Assuming the chat:start event logic (setting ID) will happen
			// externally and potentially trigger an event here later.
			// For now, just mark as not loading.
			console.log('[chatMachine] Streaming potentially starting (based on API success)');
			return {
				// isLoading: false // Don't set to false yet
				// currentResponseId might be set by an external event handler later
			};
		}),
		assignError: assign({
			isLoading: false, // Error ends loading
			errorMessage: ({ event }) => {
				if (event.type === '_API_ERROR') return event.error;
				return 'An unknown error occurred.';
			}
		}),
		assignChunk: assign({
			// Set isLoading to false only on the first chunk
			isLoading: ({ context, event }) => {
				if (event.type === 'RECEIVE_CHUNK' && context.currentResponseContent === '') {
					console.log('[chatMachine] First chunk received, setting isLoading to false.');
					return false;
				}
				return context.isLoading; // Keep current state otherwise
			},
			currentResponseContent: ({ context, event }) => {
				if (event.type === 'RECEIVE_CHUNK') {
					return context.currentResponseContent + event.payload.content;
				}
				return context.currentResponseContent;
			},
			currentResponseId: ({ context, event }) => {
				if (event.type === 'RECEIVE_CHUNK' && context.currentResponseId === null) {
					return event.payload.id;
				}
				return context.currentResponseId;
			}
			// TODO: Add action to send QUEUE_MESSAGE to ttsMachine here?
		}),
		assignStreamFinished: assign({
			currentPrompt: null,
			isLoading: false // Ensure loading is false when finished
		}),
		resetContext: assign({
			currentPrompt: null,
			currentResponseId: null,
			currentResponseContent: '',
			errorMessage: null,
			isLoading: false
		})
	},
	guards: {}
}).createMachine({
	id: 'chatMachine',
	initial: 'idle',
	context: ({ input }) => ({
		currentPrompt: null,
		currentResponseId: null,
		currentResponseContent: '',
		errorMessage: null,
		isLoading: false,
		backendSubmitFn: input.backendSubmitFn
	}),
	states: {
		idle: {
			on: {
				SUBMIT_PROMPT: {
					target: 'submitting',
					actions: 'assignSubmitting'
				},
				RESET: {
					actions: 'resetContext'
				}
			}
		},
		submitting: {
			invoke: {
				id: 'submitPromptActor',
				src: 'submitPromptActor',
				input: ({ context }) => ({
					prompt: context.currentPrompt!,
					submitFn: context.backendSubmitFn
				}),
				onDone: {
					// API call was accepted, likely streaming will start via external events
					target: 'streamingResponse', // Go directly to streaming state to wait for chunks
					actions: 'assignStreamingStart'
				},
				onError: {
					target: 'error',
					actions: 'assignError'
				}
			},
			on: {
				// Allow reset while submitting
				RESET: { target: 'idle', actions: 'resetContext' }
			}
		},
		streamingResponse: {
			// This state primarily waits for external RECEIVE_CHUNK / FINISH_STREAM events
			on: {
				RECEIVE_CHUNK: {
					actions: 'assignChunk'
					// TODO: Send QUEUE_MESSAGE to TTS actor
				},
				FINISH_STREAM: {
					target: 'idle', // Go back to idle after stream finishes
					actions: 'assignStreamFinished'
				},
				RESET: {
					target: 'idle',
					actions: 'resetContext'
					// TODO: Should also stop TTS playback?
				},
				// Handle error during streaming (e.g., connection lost)? Needs specific event.
			}
		},
		error: {
			on: {
				SUBMIT_PROMPT: { // Allow retrying
					target: 'submitting',
					actions: 'assignSubmitting'
				},
				RESET: {
					target: 'idle',
					actions: 'resetContext'
				}
			}
		}
	}
}); 