import { setup, assign, sendParent, log, forwardTo, sendTo, type ActorRef } from 'xstate';
import type { SttConfiguratorContext } from './sttConfiguratorMachine'; // To know parent context/events if needed

// --- Types ---

// Context specific to the Web Speech API worker
export interface WebSpeechWorkerContext {
	parent: ActorRef<any, any>; // Reference to the parent (Configurator)
	recognition: SpeechRecognition | null;
	lang: string; // Language setting
	continuous: boolean;
	interimResults: boolean;
	currentTranscript: string; // Accumulate interim results for a segment
	finalTranscript: string | null; // Store the last finalized transcript
	error: string | null;
	isListening: boolean; // Reflects API state
}

// Events handled/sent by this machine
export type WebSpeechWorkerEvent =
	| { type: 'START' } // Triggered by parent to start listening
	| { type: 'STOP' } // Triggered by parent to stop listening
	| { type: 'UPDATE_SETTINGS'; settings: Partial<Pick<WebSpeechWorkerContext, 'lang' | 'continuous' | 'interimResults'>> }
	// Internal events mapping SpeechRecognition events
	| { type: 'recognition.start' }
	| { type: 'recognition.end' }
	| { type: 'recognition.error'; error: SpeechRecognitionErrorEvent }
	| { type: 'recognition.result'; results: SpeechRecognitionResultList; resultIndex: number };


// Type predicate for result event might be helpful
// function isRecognitionResultEvent(event: WebSpeechWorkerEvent): event is { type: 'recognition.result', results: SpeechRecognitionResultList, resultIndex: number } {
//  return event.type === 'recognition.result';
// }

// --- Machine Setup ---

export const webSpeechWorkerMachine = setup({
	types: {
		context: {} as WebSpeechWorkerContext,
		events: {} as WebSpeechWorkerEvent,
		input: {} as Pick<WebSpeechWorkerContext, 'parent' | 'lang' | 'continuous' | 'interimResults'>,
	},
	actions: {
		// Action to send current state snapshot to parent
		sendStateUpdateToParent: sendParent(({ context }) => ({
			type: 'WORKER_STATE_UPDATE',
			state: {
				isListening: context.isListening,
				error: context.error,
				currentTranscript: context.currentTranscript,
				finalTranscript: context.finalTranscript,
			}
		})),

		initializeRecognition: assign({
			recognition: ({ context, self }) => {
				console.log('[WebSpeechWorker] Initializing SpeechRecognition...');
				const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
				if (!SpeechRecognition) {
					console.error('[WebSpeechWorker] Web Speech API not supported.');
					// Send error to parent immediately
					sendParent({ type: 'WORKER_ERROR', error: 'Web Speech API not supported' }); // Keep this for initial unsupported error
					return null;
				}

				const recognition = new SpeechRecognition();
				recognition.lang = context.lang;
				recognition.continuous = context.continuous;
				recognition.interimResults = context.interimResults;

				// Event Listeners
				recognition.onstart = () => self.send({ type: 'recognition.start' });
				recognition.onend = () => self.send({ type: 'recognition.end' });
				recognition.onerror = (event) => self.send({ type: 'recognition.error', error: event });
				recognition.onresult = (event) => self.send({ type: 'recognition.result', results: event.results, resultIndex: event.resultIndex });

				console.log('[WebSpeechWorker] SpeechRecognition initialized.');
				return recognition;
			}
		}),
		startRecognition: ({ context }) => {
			if (context.recognition) {
				console.log('[WebSpeechWorker] Starting recognition...');
				try {
					context.recognition.start();
				} catch (err) {
					// Handle potential immediate start error (though delay should help)
					console.error('[WebSpeechWorker] Error calling recognition.start():', err);
					// Consider sending an error to parent or self here if needed
				}
			} else {
				console.error('[WebSpeechWorker] Cannot start: recognition object not available.');
			}
		},
		stopRecognition: ({ context }) => {
			if (context.recognition) {
				console.log('[WebSpeechWorker] Stopping recognition...');
				// Avoid calling stop if already stopped/ended, which can cause errors
				try {
					context.recognition.stop();
				} catch (e) {
					console.warn('[WebSpeechWorker] Ignoring error during stop:', e);
				}
			}
		},
		cleanupRecognition: assign({ // Just assign the cleanup values
			recognition: null,
			isListening: false,
			currentTranscript: '',
			finalTranscript: null,
			error: null
		}),
		processResults: assign({
			currentTranscript: ({ event, context }) => {
				if (event.type !== 'recognition.result') return context.currentTranscript;

				let interimTranscript = '';
				for (let i = event.resultIndex; i < event.results.length; ++i) {
					if (!event.results[i].isFinal) {
						interimTranscript += event.results[i][0].transcript;
					}
				}
				console.log(`[WebSpeechWorker] Interim: "${interimTranscript}"`);
				return interimTranscript;
			},
			finalTranscript: ({ event, context }) => {
				if (event.type !== 'recognition.result') return context.finalTranscript;

				let finalTranscriptSegment = '';
				for (let i = event.resultIndex; i < event.results.length; ++i) {
					if (event.results[i].isFinal) {
						finalTranscriptSegment += event.results[i][0].transcript;
					}
				}

				if (finalTranscriptSegment.trim()) {
					console.log(`[WebSpeechWorker] Final Segment: "${finalTranscriptSegment.trim()}"`);
					// Return the new final transcript
					return finalTranscriptSegment.trim();
				}

				// If no new final segment, keep the existing one
				return context.finalTranscript;
			}
		}),
		// Define setListening as a simple assign action
		setListeningAction: assign({ isListening: true }),
		// Define setNotListening as a simple assign action
		setNotListeningAction: assign({ isListening: false }),
		// Define assignError as a simple assign action
		assignErrorAction: assign({
			error: ({ event }) => {
				if (event.type === 'recognition.error') {
					console.error('[WebSpeechWorker] Recognition Error:', event.error);
					return `Speech recognition error: ${event.error.error}` + (event.error.message ? ` (${event.error.message})` : '');
				}
				return 'Unknown error';
			},
			isListening: false,
			currentTranscript: '',
			finalTranscript: null // Clear transcript on error
		}),
		sendErrorToParent: sendParent(({ context }) => ({ // Keep this specific action for explicit error sending if needed
			type: 'WORKER_ERROR',
			error: context.error ?? 'Unknown Web Speech Error'
		})),
		// Define clearError as a simple assign action
		clearErrorAction: assign({ error: null }),
		// Define clearFinalTranscript as a simple assign action
		clearFinalTranscriptAction: assign({ finalTranscript: null }),
	},
	guards: {
		isRecognitionAvailable: ({ context }) => context.recognition !== null,
		// Guard to check if the error is 'no-speech'
		isNoSpeechError: ({ event }) => {
			return event.type === 'recognition.error' && event.error.error === 'no-speech';
		}
	},
	delays: { // Define standard delays
		RESTART_DELAY: 50
	}
}).createMachine({
	id: 'webSpeechWorker',
	context: ({ input }) => ({
		parent: input.parent,
		recognition: null,
		lang: input.lang || 'en-US',
		continuous: input.continuous ?? true,
		interimResults: input.interimResults ?? true,
		currentTranscript: '',
		finalTranscript: null,
		error: null,
		isListening: false,
	}),
	initial: 'idle',
	states: {
		idle: {
			entry: ['cleanupRecognition', 'sendStateUpdateToParent'], // Send update after cleanup
			on: {
				START: {
					target: 'initializing',
					actions: ['clearErrorAction', 'sendStateUpdateToParent'] // Send update after clear
				}
			}
		},
		initializing: {
			entry: ['initializeRecognition'],
			always: [
				{ target: 'listening', guard: 'isRecognitionAvailable' },
				{ target: 'error' } // If init fails (no API support), error is sent in initializeRecognition
			]
		},
		listening: {
			entry: ['startRecognition', 'setListeningAction', 'sendStateUpdateToParent'], // Send update after setListening
			on: {
				STOP: { target: 'stopping' },
				'recognition.result': { actions: ['processResults', 'sendStateUpdateToParent'] }, // Send update after processing
				'recognition.start': { actions: [log('[WebSpeechWorker] Recognition started.')] }, // isListening already true
				'recognition.end': {
					target: 'restarting', // Go to restarting state after end
					actions: ['setNotListeningAction', 'sendStateUpdateToParent', log('[WebSpeechWorker] Recognition ended.')] // Send update after setNotListening
				},
				'recognition.error': [
					// If 'no-speech', just log and restart via 'restarting'
					{
						target: 'restarting',
						guard: 'isNoSpeechError',
						actions: [log("[WebSpeechWorker] 'no-speech' error, attempting restart."), 'setNotListeningAction', 'sendStateUpdateToParent'] // Send update after setNotListening
					},
					// Other errors go to error state
					{
						target: 'error',
						actions: ['assignErrorAction', 'sendStateUpdateToParent'] // Send update after assigning error
					}
				]
			}
		},
		restarting: {
			// Use 'after' for delayed transition
			after: {
				RESTART_DELAY: [ // Use named delay
					// If continuous mode is on, go back to listening
					{ target: 'listening', guard: ({ context }) => context.continuous },
					// Otherwise, go idle
					{ target: 'idle' }
				]
			}
		},
		stopping: {
			entry: ['stopRecognition'], // Stop first
			// recognition.end should naturally occur after stop() is called
			on: {
				'recognition.end': {
					target: 'idle',
					actions: ['setNotListeningAction', 'sendStateUpdateToParent', log('[WebSpeechWorker] Recognition stopped.')] // Send update after setNotListening
				},
				// Timeout if recognition.end doesn't fire after stop? Maybe not needed.
				// Handle potential error during stop command itself? (less likely)
				'recognition.error': {
					target: 'error',
					actions: ['assignErrorAction', 'sendStateUpdateToParent', log('[WebSpeechWorker] Error during stopping.')] // Send update after assigning error
				}
			}
		},
		error: {
			// assignErrorAction or initializeRecognition should have already sent the error state update via sendStateUpdateToParent
			entry: ['sendErrorToParent', 'cleanupRecognition', 'sendStateUpdateToParent'], // Send explicit WORKER_ERROR, cleanup, send final state update
			on: {
				START: { target: 'initializing', actions: ['clearErrorAction', 'sendStateUpdateToParent'] } // Send update after clearing error
			}
		}
	}
});

console.log('[WebSpeechWorker] Machine definition complete'); 