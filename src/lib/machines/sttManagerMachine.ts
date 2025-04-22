import {
	setup,
	assign,
	fromCallback,
	log,
	sendTo,
	stopChild,
	type ActorRefFrom,
	type AnyActorLogic,
	type Subscription
} from 'xstate';
import { sttMachine, type SttContext } from './sttMachine'; // Standard STT
import { whisperLiveSttMachine, type WhisperLiveContext } from './whisperLiveSttMachine'; // Whisper-Live STT

// --- Types ---

type SttMode = 'standard' | 'whisper-live' | 'none';

// Combine relevant context parts from both child machines for UI display
interface DisplayContext {
	isListening: boolean; // General listening indicator
	isRecording: boolean; // General recording indicator (might differ slightly)
	currentSegment: string | null;
	lastFinalizedText: string | null;
	statusMessage: string;
	errorMessage: string | null;
	rmsLevel: number; // Specific to standard mode, defaults to 0 otherwise
}

export interface SttManagerContext extends DisplayContext {
	currentMode: SttMode;
	sttEngineSetting: 'whisper' | 'whisper-live' | string; // From config
	childRef: ActorRefFrom<AnyActorLogic> | null; // Actor ref for the active STT machine
	childSubscription: Subscription | null; // Store subscription
	apiToken: string | null; // Needed by both children
	transcribeFn?: SttContext['transcribeFn']; // Needed by standard machine
}

type SttManagerEvent =
	| { type: 'START_LISTENING'; payload?: { token?: string | null } }
	| { type: 'STOP_LISTENING' }
	| { type: 'RESET' }
	| { type: 'CONFIG_UPDATE'; settings: { sttEngine: string; token?: string | null } }
	// Internal events received via subscription callback
	| { type: 'CHILD.UPDATE'; snapshot: any }
	| { type: 'CHILD.ERROR'; error: string }
    | { type: '_AUDIO_ANALYSIS_UPDATE'; rms: number }
    | { type: 'STT_RESULT'; text: string };

// --- Machine Setup ---

export const sttManagerMachine = setup({
	types: {
		context: {} as SttManagerContext,
		events: {} as SttManagerEvent,
		// Input can provide initial settings
		input: {} as Partial<Pick<SttManagerContext, 'sttEngineSetting' | 'apiToken' | 'transcribeFn'>>
	},
	actors: {
		standardSttActor: sttMachine,
		whisperLiveSttActor: whisperLiveSttMachine
	},
	actions: {
		updateContextFromChild: assign((contextAndEvent) => {
			const { context, event } = contextAndEvent;
			if (event.type !== 'CHILD.UPDATE' || !event.snapshot) {
				return {};
			}
			const childSnapshot = event.snapshot;
			console.log('[SttManager] Received child snapshot:', childSnapshot);

			const childContext = childSnapshot.context as SttContext | WhisperLiveContext;
			const childValue = childSnapshot.value;

			// Default values
			let updatedFields: Partial<SttManagerContext> = {
				isListening: false,
				isRecording: false,
				currentSegment: null,
				// Keep lastFinalizedText unless explicitly updated by CHILD.FINALIZED?
				// lastFinalizedText: null,
				statusMessage: 'Idle',
				errorMessage: null,
				// rmsLevel: 0 // Remove RMS update from here, handle separately
			};

			// Update based on the current mode and child state
			if (context.currentMode === 'standard') {
				const standardContext = childContext as SttContext;
				updatedFields.isListening = childSnapshot.matches('listening');
				updatedFields.isRecording = childSnapshot.matches('recording');
				updatedFields.statusMessage = standardContext.errorMessage
					? `Error: ${standardContext.errorMessage}`
					: typeof childValue === 'string'
						? childValue // Use state value as status if simple string
						: 'Standard STT Active'; // Fallback status
				updatedFields.errorMessage = standardContext.errorMessage;
				// updatedFields.rmsLevel = standardContext.rmsLevel ?? 0; // Removed
				// standard machine doesn't have currentSegment directly
				updatedFields.currentSegment = null; // Or derive if needed later
			} else if (context.currentMode === 'whisper-live') {
				const whisperContext = childContext as WhisperLiveContext;
				updatedFields.isListening = childSnapshot.matches('listening') || childSnapshot.matches('initializing_socket') || childSnapshot.matches('connecting');
				updatedFields.isRecording = childSnapshot.matches('listening');
				updatedFields.currentSegment = whisperContext.currentSegment;
				// Don't clear lastFinalizedText here, handle in CHILD.FINALIZED
				updatedFields.statusMessage = whisperContext.statusMessage ?? 'Whisper-Live Active';
				updatedFields.errorMessage = whisperContext.errorMessage;
                updatedFields.rmsLevel = 0;
			} else {
				// Mode 'none' or unexpected state
				updatedFields.statusMessage = 'STT Disabled';
                updatedFields.rmsLevel = 0;
			}

			console.log('[SttManager] Updating context from child snapshot:', updatedFields);
			return updatedFields;
		}),
        // New action to specifically update RMS level
        assignRmsLevel: assign({
            rmsLevel: ({ event, context }) => {
                if (event.type === '_AUDIO_ANALYSIS_UPDATE') {
                    return event.rms;
                }
                // Return current context value if event type doesn't match
                // This shouldn't happen if called correctly, but safer
                return context.rmsLevel;
            }
        }),
		assignApiToken: assign({
			apiToken: ({ event, context }) => {
				if (event.type === 'START_LISTENING' && event.payload?.token) {
					return event.payload.token;
				}
				if (event.type === 'CONFIG_UPDATE' && event.settings.token) {
					return event.settings.token;
				}
				return context.apiToken; // Keep existing if not provided/updated
			}
		}),
		assignEngineSetting: assign({
			sttEngineSetting: ({ event, context }) => {
				if (event.type === 'CONFIG_UPDATE') {
					return event.settings.sttEngine;
				}
				return context.sttEngineSetting;
			}
		}),
		spawnStandardStt: assign({
			currentMode: 'standard',
			childRef: ({ spawn, context, self }) => {
				console.log('[SttManager] spawnStandardStt: Spawning child actor...');
				const actorRef = spawn('standardSttActor', {
					id: 'standardSttChild',
					input: {
						apiToken: context.apiToken,
						transcribeFn: context.transcribeFn
					}
				});
				console.log('[SttManager] spawnStandardStt: Spawned child actor ref:', actorRef);
				return actorRef;
			}
		}),
		subscribeToChild: assign({
			childSubscription: ({ context, self }) => {
				console.log('[SttManager] subscribeToChild: Checking context.childRef:', context.childRef);
				if (!context.childRef) {
					console.error('[SttManager] subscribeToChild: Cannot subscribe, childRef is null!');
					return null;
				}
				console.log('[SttManager] subscribeToChild: Attempting to subscribe...');
				try {
					const subscription = context.childRef.subscribe(snapshot => {
						 // console.log(`[SttManager/subscribe] Callback fired! Child state: ${snapshot.value}, Child RMS: ${snapshot.context.rmsLevel?.toFixed(4)}`); // Keep commented for now unless needed
						// Send general update
						self.send({ type: 'CHILD.UPDATE', snapshot });
						// Send RMS update for standard mode
						if (context.currentMode === 'standard') {
							 const rmsFromChild = snapshot.context.rmsLevel ?? 0;
							 self.send({ type: '_AUDIO_ANALYSIS_UPDATE', rms: rmsFromChild });
						}

						// --- Handle potential output events (fallback or for other machine types) ---
						if (snapshot.output) {
							if (snapshot.output.type === 'ERROR') {
								 // Log parent state BEFORE sending event
								console.log(`[SttManager/subscribe] Parent state is: ${self.getSnapshot().value}. Detected error output: "${snapshot.output.error}". Sending CHILD.ERROR.`);
								self.send({ type: 'CHILD.ERROR', error: snapshot.output.error });
							}
						}
					});
					console.log('[SttManager] subscribeToChild: Successfully subscribed.');
					return subscription;
				} catch (error) {
					console.error('[SttManager] subscribeToChild: Error subscribing:', error);
					return null;
				}
			}
		}),
		spawnWhisperLiveStt: assign({
			currentMode: 'whisper-live',
			childRef: ({ spawn, context, self }) => {
				console.log('[SttManager] Spawning Whisper-Live STT actor...');
				const actorRef = spawn('whisperLiveSttActor', {
					id: 'whisperLiveSttChild',
					input: { apiToken: context.apiToken }
				});
				console.log('[SttManager] Spawned whisperLiveSttChild ref:', actorRef);
				return actorRef;
			},
			childSubscription: ({ context, self }) => {
				if (!context.childRef) {
					console.error('[SttManager] subscribeToChild (whisper): Cannot subscribe, childRef is null!');
					return null;
				}
				console.log('[SttManager] Subscribing to whisperLiveSttChild...');
				try {
					const subscription = context.childRef.subscribe(snapshot => {
						// 항상 일반 업데이트 전송
						self.send({ type: 'CHILD.UPDATE', snapshot });
						// 현재는 ERROR 출력만 처리
						if (snapshot.output && snapshot.output.type === 'ERROR') {
							console.log(`[SttManager/subscribe] Detected error in whisper-live output: "${snapshot.output.error}". Sending CHILD.ERROR.`);
							self.send({ type: 'CHILD.ERROR', error: snapshot.output.error });
						}
						 // 다른 출력 처리 없음 (FINALIZED_TRANSCRIPTION 등)
					});
					console.log('[SttManager] Successfully subscribed to whisperLiveSttChild.');
					return subscription;
				} catch (error) {
					console.error('[SttManager] subscribeToChild (whisper): Error subscribing:', error);
					return null;
				}
			}
		}),
		cleanupChildActor: assign(( { context } ) => {
			console.log('[SttManager] Cleaning up child actor and subscription...');
			// Unsubscribe if subscription exists
			if (context.childSubscription) {
				try {
					context.childSubscription.unsubscribe();
					console.log('[SttManager] Unsubscribed from child.');
				} catch (e) {
					console.error('[SttManager] Error unsubscribing:', e);
				}
			}
			 // Stop the child actor - use stopChild logic conceptually
			 if (context.childRef) {
				 try {
					 context.childRef.stop?.(); // Use stop method if available (XState v5 standard)
					 console.log('[SttManager] Stopped child actor ref.');
				 } catch (e) {
					  console.error('[SttManager] Error stopping child actor ref:', e);
				 }
			}
			// Reset context fields
			return {
				childRef: null,
				childSubscription: null,
				 // Also reset status related to the child being active
				isListening: false,
				isRecording: false,
				currentSegment: null,
				rmsLevel: 0,
				// Keep errorMessage? Or clear it? Let's clear it here for now.
				 // errorMessage: null,
				 // Keep lastFinalizedText? Maybe.
				// Decide if status should revert to Idle or something else
				// statusMessage: 'Idle'
			};
		}),
		forwardToChild: sendTo(
			({ context }) => context.childRef!,
			({ event }) => event // Forward the original event
		),
        // Modify assignFinalizedText to handle STT_RESULT
        assignFinalizedText: assign({
            lastFinalizedText: ({ event, context }) => { // Add context here
                // Check for STT_RESULT event type
                if (event.type === 'STT_RESULT') {
                    console.log(`[SttManager] assignFinalizedText executed. Assigning text: "${event.text}"`);
                    return event.text;
                }
                console.warn(`[SttManager] assignFinalizedText called with unexpected event type: ${event.type}. Keeping previous value.`);
                return context.lastFinalizedText; // Return existing value
            },
            currentSegment: null,
            statusMessage: 'Finalized'
		}),
        // Specific action for child error update
        assignChildError: assign({
            errorMessage: ({ event }) => (event.type === 'CHILD.ERROR' ? event.error : 'Unknown child error'),
            statusMessage: 'Error',
            isListening: false,
            isRecording: false,
            currentSegment: null
        }),
		// Reset most of the display context, keep config
		resetDisplayContext: assign({
			isListening: false,
			isRecording: false,
			currentSegment: null,
			lastFinalizedText: null,
			statusMessage: 'Idle',
			errorMessage: null,
			rmsLevel: 0,
			currentMode: 'none',
			childRef: null,
            childSubscription: null // Reset subscription here too
		}),
        // Logging actions
        logDeterminingInfo: log(
			({ context }: { context: SttManagerContext }) => `[SttManager] In determiningMode. Engine setting: \"${context.sttEngineSetting}\". Is standard: ${context.sttEngineSetting === 'whisper'}. Is whisper-live: ${context.sttEngineSetting === 'whisper-live'}.`
		),
        logStandardActiveEntry: log('[SttManager] Entering standardActive state.'),
        logWhisperLiveActiveEntry: log('[SttManager] Entering whisperLiveActive state.'),
        logFallbackToIdle: log('[SttManager] Engine setting not matched, falling back to idle.'),
        logForwardingEvent: log(({ event }) => `[SttManager] Forwarding event ${event.type} to child`),
        sendStartToChild: sendTo(
            ({ context }) => context.childRef!,
            ({ context }) => ({
                type: 'START_LISTENING',
                payload: { token: context.apiToken }
            })
        ),
        logSentStart: log('Sent START_LISTENING to child after spawning.')
	},
	guards: {
		isStandardMode: ({ context }) => context.sttEngineSetting === 'whisper',
		isWhisperLiveMode: ({ context }) => context.sttEngineSetting === 'whisper-live',
		hasChildRef: ({ context }) => context.childRef !== null
	}
}).createMachine({
	id: 'sttManager',
	context: ({ input }) => ({
		currentMode: 'none',
		sttEngineSetting: input?.sttEngineSetting ?? 'whisper', // Default to standard whisper
		childRef: null,
        childSubscription: null, // Initialize subscription field
		apiToken: input?.apiToken ?? null,
		transcribeFn: input?.transcribeFn,
		// Initialize display context
		isListening: false,
		isRecording: false,
		currentSegment: null,
		lastFinalizedText: null,
		statusMessage: 'Initializing...',
		errorMessage: null,
		rmsLevel: 0
	}),
	initial: 'idle',
	states: {
		idle: {
			entry: ['resetDisplayContext', log('[SttManager] Entering idle state')],
			on: {
				START_LISTENING: {
					target: 'determiningMode',
					actions: 'assignApiToken' // Store token before determining mode
				},
				CONFIG_UPDATE: {
					actions: ['assignEngineSetting', 'assignApiToken'] // Update config while idle
				}
			}
		},
		determiningMode: {
			entry: ['logDeterminingInfo'],
			always: [
				{
					guard: 'isStandardMode',
					target: 'standardActive',
					actions: [
                        log('[SttManager] Transitioning to standardActive...'),
                        'spawnStandardStt',     // Assign childRef
                        'subscribeToChild',   // Assign childSubscription
                        'sendStartToChild',     // Send event to child
                        'logSentStart'
                    ]
				},
				{
					guard: 'isWhisperLiveMode',
					target: 'whisperLiveActive',
					actions: [
                        log('[SttManager] Transitioning to whisperLiveActive...'),
                        'spawnWhisperLiveStt', // This still has combined assign
                        'sendStartToChild',
                        'logSentStart'
                    ]
				},
				{
					target: 'idle',
					actions: 'logFallbackToIdle' // Fallback if no mode matches
				}
			]
		},
		standardActive: {
			entry: ['logStandardActiveEntry'],
			exit: log('[SttManager] Exiting standardActive state'),
			// Listen for events forwarded from the child actor OR events sent directly to the manager
			on: {
				STOP_LISTENING: {
					target: 'idle',
					actions: ['cleanupChildActor']
				},
				RESET: {
					target: 'idle',
					actions: ['cleanupChildActor']
				},
				CONFIG_UPDATE: {
					// Stop current child, go back to determining mode with new config
					target: 'determiningMode',
					actions: ['cleanupChildActor', 'assignEngineSetting', 'assignApiToken']
				},
				// Handle generic child updates (forwarded by onSnapshot)
				CHILD_UPDATE: {
                    actions: 'updateContextFromChild' // Handles status, errors etc. but NOT RMS
                },
                // Handle specific RMS update event from standard child (forwarded by onOutput)
                _AUDIO_ANALYSIS_UPDATE: {
                    actions: 'assignRmsLevel' // Use the new action
                },
                // Handle specific child errors if needed (forwarded by onOutput)
                CHILD_ERROR: {
                    actions: 'assignChildError'
                },
                // Handle finalized text (forwarded by onOutput)
                STT_RESULT: {
                    actions: [
                        log('[SttManager] STT_RESULT event handler triggered in standardActive state.'),
                        'assignFinalizedText',
                        log('[SttManager] Sending START_LISTENING back to child after STT_RESULT.'),
                        'sendStartToChild'
                    ]
                }
			},
            // Invoke logic removed as spawn seems to handle lifecycle and event forwarding
		},
		whisperLiveActive: {
			entry: ['logWhisperLiveActiveEntry'],
			exit: log('[SttManager] Exiting whisperLiveActive state'),
			on: {
				STOP_LISTENING: {
					target: 'idle',
					actions: ['cleanupChildActor']
				},
				RESET: {
					target: 'idle',
					actions: ['cleanupChildActor']
				},
				CONFIG_UPDATE: {
					target: 'determiningMode',
					actions: ['cleanupChildActor', 'assignEngineSetting', 'assignApiToken']
				},
                // Handle generic child updates (forwarded by onSnapshot)
				CHILD_UPDATE: {
                    actions: 'updateContextFromChild' // Handles status, errors etc.
                },
                // Handle specific finalized event from Whisper-Live (forwarded by onOutput)
                CHILD_FINALIZED: {
                    actions: 'assignFinalizedText'
                },
                 // Handle specific error event from Whisper-Live (forwarded by onOutput)
                CHILD_ERROR: {
                    actions: 'assignChildError'
                }
			}
		}
	}
}); 