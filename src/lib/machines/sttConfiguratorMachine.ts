import {
	setup,
	assign,
	log,
	sendTo,
	stopChild,
	type ActorRefFrom,
	type AnyActorLogic,
	type EventObject,
	type MachineContext,
	type AnyActorRef
} from 'xstate';

// Import the manager/worker machines this configurator will spawn
import { sttManagerMachine, type SttManagerContext } from './sttManagerMachine'; // Whisper Manager
import { webSpeechWorkerMachine, type WebSpeechWorkerContext } from './webSpeechWorkerMachine'; // Web Speech Worker
import { whisperLiveSttMachine, type WhisperLiveContext, type WhisperLiveInput } from './whisperLiveSttMachine'; // Whisper Live Worker

// <<< 모듈 로드 로그 >>>
console.log('[sttConfiguratorMachine.ts] Module loaded');

// --- Types ---

export type SttEngine = 'whisper' | 'web' | 'whisper-live' | 'none';

// Union type for the spawned actor reference
type SpawnedActor =
	| ActorRefFrom<typeof sttManagerMachine>
	| ActorRefFrom<typeof webSpeechWorkerMachine>
	| ActorRefFrom<typeof whisperLiveSttMachine>;

export interface SttConfiguratorContext extends MachineContext {
	sttEngineSetting: SttEngine;
	apiToken: string | null;
	transcribeFn?: SttManagerContext['transcribeFn']; // Needed ONLY for whisper manager
	whisperLiveWsUrl?: string; // Optional URL for Whisper Live
	// Reference to the spawned actor (manager or worker)
	managerRef: SpawnedActor | null; // Use the union type
	// Mirrored state from the active worker/manager
	workerIsListening: boolean;
	workerError: string | null;
	workerCurrentTranscript: string | null;
	workerFinalTranscript: string | null;
	workerRmsLevel: number; // Added RMS level from worker
}

export type SttConfiguratorEvent =
	| { type: 'CONFIG_UPDATE'; settings: Partial<Pick<SttConfiguratorContext, 'sttEngineSetting' | 'apiToken' | 'transcribeFn' | 'whisperLiveWsUrl'>> }
	| { type: 'START_SESSION'; initialConfig?: Partial<SttConfiguratorContext> }
	| { type: 'STOP_SESSION' }
	| { type: 'START_CALL' } // Forwarded to applicable actors
	| { type: 'STOP_CALL' } // Forwarded to applicable actors
	// Events received FROM spawned actors
	| { type: 'WORKER_STATE_UPDATE'; state: any } // Keep 'any' for now, or create a union type
	| { type: 'MANAGER_TRANSCRIPTION_UPDATE'; finalTranscript: string | null } // Can be null
	| { type: 'MANAGER_RMS_UPDATE'; value: number }
	| { type: 'WORKER_ERROR'; error: string }
	| { type: 'error.actor.manager' }; // Generic actor error

// --- Machine Setup ---

export const sttConfiguratorMachine = setup({
	types: {
		context: {} as SttConfiguratorContext,
		events: {} as SttConfiguratorEvent,
		input: {} as Partial<SttConfiguratorContext>,
	},
	actors: {
		// Define actor logic sources here if needed (not needed for spawning existing machines)
	},
	actions: {
		assignConfig: assign({
			sttEngineSetting: ({ context, event }) => {
				if (event.type === 'CONFIG_UPDATE' && event.settings.sttEngineSetting) return event.settings.sttEngineSetting;
				if (event.type === 'START_SESSION' && event.initialConfig?.sttEngineSetting) return event.initialConfig.sttEngineSetting;
				return context.sttEngineSetting;
			},
			apiToken: ({ context, event }) => {
				if (event.type === 'CONFIG_UPDATE' && event.settings.apiToken) return event.settings.apiToken;
				if (event.type === 'START_SESSION' && event.initialConfig?.apiToken) return event.initialConfig.apiToken;
				return context.apiToken;
			},
			transcribeFn: ({ context, event }) => {
				// Only assign if relevant for whisper engine
				if (context.sttEngineSetting === 'whisper') {
					if (event.type === 'CONFIG_UPDATE' && event.settings.transcribeFn) return event.settings.transcribeFn;
					if (event.type === 'START_SESSION' && event.initialConfig?.transcribeFn) return event.initialConfig.transcribeFn;
				}
				return context.transcribeFn;
			},
			whisperLiveWsUrl: ({ context, event }) => {
				// Assign URL if relevant for whisper-live engine
				if (context.sttEngineSetting === 'whisper-live') {
					if (event.type === 'CONFIG_UPDATE' && event.settings.whisperLiveWsUrl) return event.settings.whisperLiveWsUrl;
					if (event.type === 'START_SESSION' && event.initialConfig?.whisperLiveWsUrl) return event.initialConfig.whisperLiveWsUrl;
				}
				return context.whisperLiveWsUrl;
			}
		}),
		spawnActor: assign({ // Renamed from spawnManager
			managerRef: ({ context, spawn, self }): SpawnedActor | null => { // Use union type
				console.log(`[Configurator] Attempting to spawn actor for engine type: ${context.sttEngineSetting}`);

				try {
					switch (context.sttEngineSetting) {
						case 'whisper':
							if (!context.apiToken || !context.transcribeFn) {
								console.error('[Configurator] Cannot spawn Whisper manager: missing apiToken or transcribeFn.');
								return null;
							}
							const whisperInput = { apiToken: context.apiToken, transcribeFn: context.transcribeFn };
							const whisperManager = spawn(sttManagerMachine, { input: whisperInput });
							console.log(`[Configurator] Whisper Manager spawned: ${whisperManager.id}`);
							return whisperManager;

						case 'web':
							const webInput: Pick<WebSpeechWorkerContext, 'parent' | 'lang' | 'continuous' | 'interimResults'> = {
								parent: self,
								lang: 'ko-KR', // Make configurable?
								continuous: true,
								interimResults: true,
							};
							const webWorker = spawn(webSpeechWorkerMachine, { input: webInput });
							console.log(`[Configurator] WebSpeech Worker spawned directly: ${webWorker.id}`);
							return webWorker;

						case 'whisper-live':
							// Remove fallback logic
							// console.warn('[Configurator] Whisper Live logic not yet implemented. Spawning Whisper as fallback.');
							// console.warn('[Configurator] Whisper Live logic not yet implemented. Spawning Whisper as fallback.');
							const wsUrl = context.whisperLiveWsUrl || 'ws://localhost:9090'; // Use configured URL or default placeholder
							console.log(`[Configurator] Spawning Whisper Live Worker. URL: ${wsUrl}`);
							if (!wsUrl) {
								console.error('[Configurator] Cannot spawn Whisper Live worker: Missing WebSocket URL (whisperLiveWsUrl).');
								return null;
							}
							// Check for API token (optional based on server needs)
							// if (!context.apiToken) { ... }
							const liveInput: WhisperLiveInput = { // Use the specific input type
								wsUrl: wsUrl,
								apiToken: context.apiToken,
								parent: self // Pass self as parent
							};
							const liveWorker = spawn(whisperLiveSttMachine, { input: liveInput });
							console.log(`[Configurator] Whisper Live worker spawned: ${liveWorker.id}`);
							return liveWorker;

						case 'none':
						default:
							console.error(`[Configurator] Cannot spawn actor: Invalid or 'none' STT engine setting: ${context.sttEngineSetting}`);
							return null;
					}
				} catch (error) {
					console.error('[Configurator] Error during actor spawn process:', error);
					return null;
				}
			}
		}),
		stopActor: assign({ // Renamed from stopManager
			managerRef: null, // Clear the reference
			workerIsListening: false,
			workerError: null,
			workerCurrentTranscript: null,
			workerFinalTranscript: null,
			workerRmsLevel: 0
		}),
		// Start the spawned worker/manager
		startWorker: sendTo(
			({ context }) => context.managerRef!,
			{ type: 'START_LISTENING' } // Event to start the worker
		),
		// Forward commands applicable to specific workers/managers
		forwardCommand: sendTo(
			({ context }) => context.managerRef!,
			({ event, context }) => {
				const targetActor = context.managerRef;
				if (!targetActor) return undefined;

				// Determine target type (more robustly if possible, e.g., checking machine definition)
				const targetIsWhisperManager = context.sttEngineSetting === 'whisper';
				const targetIsWebWorker = context.sttEngineSetting === 'web';
				const targetIsLiveWorker = context.sttEngineSetting === 'whisper-live';

				// Commands for Whisper Manager
				if (targetIsWhisperManager) {
					if (event.type === 'START_CALL') {
						if (!context.apiToken || !context.transcribeFn) return undefined;
						return { type: 'START_CALL', payload: { token: context.apiToken, transcribeFn: context.transcribeFn } };
					} else if (event.type === 'STOP_CALL') {
						return { type: 'STOP_CALL' };
					}
				}
				// Commands for WebSpeech Worker
				else if (targetIsWebWorker) {
					if (event.type === 'START_CALL') { // Map START_CALL to START
						return { type: 'START' };
					} else if (event.type === 'STOP_CALL') { // Map STOP_CALL to STOP
						return { type: 'STOP' };
					}
				}
				// Commands for Whisper Live Worker
				else if (targetIsLiveWorker) {
					if (event.type === 'START_CALL') { // Map START_CALL to START_LISTENING
						return { type: 'START_LISTENING' };
					} else if (event.type === 'STOP_CALL') { // Map STOP_CALL to STOP_LISTENING
						return { type: 'STOP_LISTENING' };
					}
					// Do NOT forward AUDIO_CHUNK here
				}

				console.warn(`[Configurator] Event type ${event.type} not forwarded to actor ${context.managerRef?.id}.`);
				return undefined; // Explicitly return undefined if not forwarded
			}
		),
		logSpawn: log('[Configurator] Entering active state, attempting to spawn actor...'),
		// Assign state received from ANY worker/manager
		assignWorkerState: assign({
			workerError: ({ context, event }) => {
				if (event.type === 'WORKER_STATE_UPDATE') {
					// Check if error is null or a string
					return typeof event.state?.error === 'string' || event.state?.error === null ? event.state.error : context.workerError;
				}
				if (event.type === 'WORKER_ERROR') { // Handle direct error event
					return event.error ?? 'Unknown worker error';
				}
				return context.workerError;
			},
			workerCurrentTranscript: ({ context, event }) => {
				if (event.type === 'WORKER_STATE_UPDATE') {
					const currentTranscript = typeof event.state?.currentTranscript === 'string' || event.state?.currentTranscript === null ? event.state.currentTranscript : context.workerCurrentTranscript;
					// console.log(`[Configurator/AssignState] Updating currentTranscript: ${currentTranscript}`); // Verbose log, enable if needed
					return currentTranscript;
				}
				return context.workerCurrentTranscript;
			},
			workerFinalTranscript: ({ context, event }) => {
				// Priority 1: Direct update from MANAGER_TRANSCRIPTION_UPDATE
				if (event.type === 'MANAGER_TRANSCRIPTION_UPDATE') {
					console.log(`[Configurator/AssignState] Updating finalTranscript from MANAGER_TRANSCRIPTION_UPDATE: ${event.finalTranscript}`);
					// Accept string or null directly from this event
					return event.finalTranscript;
				}

				// Priority 2: Update from WORKER_STATE_UPDATE only if it contains a valid string
				if (event.type === 'WORKER_STATE_UPDATE') {
					const finalTranscriptFromState = event.state?.finalTranscript;
					// ONLY update if the state provides a non-null, non-empty string
					if (typeof finalTranscriptFromState === 'string' && finalTranscriptFromState.trim() !== '') {
						 console.log(`[Configurator/AssignState] Updating finalTranscript from WORKER_STATE_UPDATE (valid string): ${finalTranscriptFromState}`);
						return finalTranscriptFromState;
					}
					 // Optionally log ignored null/empty updates from WORKER_STATE_UPDATE
					 // else if (finalTranscriptFromState === null || finalTranscriptFromState === '') {
					 //    console.log(`[Configurator/AssignState] Ignoring finalTranscript from WORKER_STATE_UPDATE (null/empty). Current: ${context.workerFinalTranscript}`);
					 //}
				}

				// Otherwise, keep the existing value
				return context.workerFinalTranscript;
			},
			workerRmsLevel: ({ context, event }) => {
				if (event.type === 'WORKER_STATE_UPDATE' && typeof event.state?.rmsLevel === 'number') {
					return event.state.rmsLevel;
				}
				if (event.type === 'MANAGER_RMS_UPDATE') {
					return event.value;
				}
				return context.workerRmsLevel; // Keep existing if not updated
			}
		}),
		clearWorkerState: assign({
			workerIsListening: false,
			workerError: null,
			workerCurrentTranscript: null,
			workerFinalTranscript: null, // Ensure reset to null
			workerRmsLevel: 0 // Reset RMS level
		}),
		// Action to send the appropriate start command based on the engine type
		sendStartCommandToActor: sendTo(
			({ context }) => context.managerRef!,
			({ context }) => {
				if (!context.managerRef) {
					console.error('[Configurator] Cannot send start command: managerRef is null.');
					return undefined;
				}
				const targetActorId = context.managerRef.id;

				switch (context.sttEngineSetting) {
					case 'whisper':
						if (context.apiToken && context.transcribeFn) {
							console.log(`[Configurator] Sending START_CALL to Whisper Manager ${targetActorId}`);
							return { type: 'START_CALL', payload: { token: context.apiToken, transcribeFn: context.transcribeFn } };
						} else {
							console.error('[Configurator] Cannot send START_CALL to Whisper Manager: missing token or transcribeFn.');
							return undefined;
						}
					case 'web':
						console.log(`[Configurator] Sending START to WebSpeech Worker ${targetActorId}`);
						return { type: 'START' };
					case 'whisper-live':
						console.log(`[Configurator] Sending START_LISTENING to Whisper Live Worker ${targetActorId}`);
						return { type: 'START_LISTENING' };
					case 'none':
					default:
						console.warn(`[Configurator] No start command sent for engine type: ${context.sttEngineSetting}`);
						return undefined;
				}
			}
		),
		// Action to explicitly set listening state
		setListening: assign({ workerIsListening: ({ event }, params: { value: boolean }) => params.value }),
		sendAppropriateStopCommand: sendTo(
			({ context }) => context.managerRef!,
			({ context }) => {
				if (!context.managerRef) return undefined;
				const targetActorId = context.managerRef.id;
				console.log(`[Configurator] Sending appropriate stop command to ${targetActorId} for engine ${context.sttEngineSetting}`);
				switch (context.sttEngineSetting) {
					case 'whisper':
						return { type: 'STOP_CALL' };
					case 'web':
						return { type: 'STOP' };
					case 'whisper-live':
						return { type: 'STOP_LISTENING' };
					default:
						console.warn(`[Configurator] No specific stop command for engine: ${context.sttEngineSetting}`);
						return undefined; // Or send a generic STOP?
				}
			}
		),
	},
	guards: {
		hasActorRef: ({ context }) => context.managerRef !== null, // Renamed from hasManagerRef
		shouldForwardCommand: ({ event }) => ['START_CALL', 'STOP_CALL'].includes(event.type),
		spawnFailed: ({ context }) => context.managerRef === null && context.sttEngineSetting !== 'none',
		// Guard to check if the event is a direct error from the spawned actor
		isActorErrorEvent: ({ event }) => event.type === 'error.actor.manager' || event.type === 'WORKER_ERROR',
	},
}).createMachine({
	id: 'sttConfigurator',
	context: ({ input }) => ({
		sttEngineSetting: input?.sttEngineSetting ?? 'none',
		apiToken: input?.apiToken ?? null,
		transcribeFn: input?.transcribeFn, // Should only be relevant if engine is whisper
		whisperLiveWsUrl: input?.whisperLiveWsUrl, // Added for live engine
		managerRef: null,
		workerIsListening: false,
		workerError: null,
		workerCurrentTranscript: null,
		workerFinalTranscript: null, // Ensure initialized as null
		workerRmsLevel: 0 // Initialize RMS level
	}),
	initial: 'idle',
	states: {
		idle: {
			entry: log('[Configurator] Entering idle state.'),
			on: {
				START_SESSION: {
					target: 'active',
					actions: ['assignConfig']
				}
			}
		},
		active: {
			entry: [
				log('[Configurator] Entering active state, attempting to spawn actor...'),
				'spawnActor',
				'sendStartCommandToActor', // Send the appropriate start command based on engine
				{ type: 'setListening', params: { value: true } } // Assume listening starts
			] as const,
			on: {
				STOP_SESSION: { 
					target: 'idle', 
					actions: [
						log('[Configurator] STOP_SESSION received. Cleaning up...'),
						'sendAppropriateStopCommand', // Send graceful stop command
						stopChild(({ context }) => context.managerRef), // Stop the actor instance
						assign({ // Clear context after stopping child
							managerRef: null,
							workerIsListening: false,
							workerError: null,
							workerCurrentTranscript: null,
							workerFinalTranscript: null,
							workerRmsLevel: 0
						}),
						{ type: 'setListening', params: { value: false } }
					]
				 },
				CONFIG_UPDATE: {
					target: 'active', // Re-enter to potentially respawn with new config
					actions: ['assignConfig']
				},
				// Handle updates FROM the worker/manager
				WORKER_STATE_UPDATE: { actions: 'assignWorkerState' },
				MANAGER_TRANSCRIPTION_UPDATE: { actions: 'assignWorkerState' }, // Use same action
				MANAGER_RMS_UPDATE: { actions: 'assignWorkerState' },
				WORKER_ERROR: { 
					target: 'error', 
					actions: [{ type: 'setListening', params: { value: false } }, 'assignWorkerState']
				}, 
				'error.actor.manager': { 
					target: 'error', 
					actions: [{ type: 'setListening', params: { value: false } }, assign({ workerError: 'Actor terminated unexpectedly.' }), 'clearWorkerState'] 
				}, 

				// Forward commands TO the worker/manager
				'*': {
					guard: 'shouldForwardCommand',
					actions: 'forwardCommand'
				}
			},
		},
		error: {
			entry: [
				log('[Configurator] Entering error state.'), 
				{ type: 'setListening', params: { value: false } }, // Ensure listening is false on error
				'clearWorkerState'
			],
			on: {
				// Allow retry by restarting the session
				START_SESSION: { target: 'active', actions: 'assignConfig' },
				// Allow config update in error state before retry
				CONFIG_UPDATE: { actions: 'assignConfig' }
			}
		}
	}
});

console.log('[sttConfiguratorMachine.ts] Machine definition complete'); 
console.log('[sttConfiguratorMachine.ts] Machine definition complete'); 