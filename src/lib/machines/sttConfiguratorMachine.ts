import {
	setup,
	assign,
	log,
	sendTo,
	stopChild,
	type ActorRefFrom,
	type AnyActorLogic,
	type EventObject,
	type MachineContext
} from 'xstate';

// Import the manager machine(s) this configurator will spawn
import { sttManagerMachine, type SttManagerContext } from './sttManagerMachine';
// Placeholder for engine-specific managers if needed later
// import { webSpeechManagerMachine } from './webSpeechManagerMachine';
// import { whisperLiveManagerMachine } from './whisperLiveManagerMachine';

// <<< 모듈 로드 로그 >>>
console.log('[sttConfiguratorMachine.ts] Module loaded');

// --- Types ---

export type SttEngine = 'whisper' | 'web' | 'whisper-live' | 'none';

export interface SttConfiguratorContext extends MachineContext {
	sttEngineSetting: SttEngine;
	apiToken: string | null;
	transcribeFn?: SttManagerContext['transcribeFn']; // Needed for whisper manager
	// Reference to the spawned manager actor
	managerRef: ActorRefFrom<typeof sttManagerMachine> | null; // Use specific type for now
	// Potentially mirror some state from manager for UI
	// isListening: boolean;
	// errorMessage: string | null;
}

export type SttConfiguratorEvent =
	| { type: 'CONFIG_UPDATE'; settings: Partial<Pick<SttConfiguratorContext, 'sttEngineSetting' | 'apiToken' | 'transcribeFn'>> }
	| { type: 'START_SESSION'; initialConfig?: Partial<Pick<SttConfiguratorContext, 'sttEngineSetting' | 'apiToken' | 'transcribeFn'>> }
	| { type: 'STOP_SESSION' }
	// Events to forward to the manager
	| { type: 'START_CALL' } // Payload removed, assuming token/fn are already configured
	| { type: 'STOP_CALL' }
	// Events received from the manager (if needed for state mirroring)
	// | { type: 'MANAGER_STATUS_UPDATE', status: Partial<Pick<SttConfiguratorContext, 'isListening' | 'errorMessage'>> }
	// Internal events
	| { type: 'error.actor.manager' };


// --- Machine Setup ---

export const sttConfiguratorMachine = setup({
	types: {
		context: {} as SttConfiguratorContext,
		events: {} as SttConfiguratorEvent,
		input: {} as Partial<Pick<SttConfiguratorContext, 'sttEngineSetting' | 'apiToken' | 'transcribeFn'>>,
	},
	actors: {
		// Define manager actor logic sources here if needed, or rely on imported machines
		// whisperManager: sttManagerMachine, // Example if using specific actor names
	},
	actions: {
		assignConfig: assign({
			sttEngineSetting: ({ context, event }) => {
				console.log('[Configurator Assign] Event type:', event.type);
				if (event.type === 'CONFIG_UPDATE') {
					console.log('[Configurator Assign] Assigning sttEngineSetting from CONFIG_UPDATE:', event.settings.sttEngineSetting);
					return event.settings.sttEngineSetting ?? context.sttEngineSetting;
				} else if (event.type === 'START_SESSION') {
					console.log('[Configurator Assign] Assigning sttEngineSetting from START_SESSION:', event.initialConfig?.sttEngineSetting);
					return event.initialConfig?.sttEngineSetting ?? context.sttEngineSetting;
				}
				return context.sttEngineSetting;
			},
			apiToken: ({ context, event }) => {
				if (event.type === 'CONFIG_UPDATE') {
					console.log('[Configurator Assign] Assigning apiToken from CONFIG_UPDATE:', event.settings.apiToken);
					return event.settings.apiToken ?? context.apiToken;
				} else if (event.type === 'START_SESSION') {
					console.log('[Configurator Assign] Assigning apiToken from START_SESSION:', event.initialConfig?.apiToken);
					return event.initialConfig?.apiToken ?? context.apiToken;
				}
				return context.apiToken;
			},
			transcribeFn: ({ context, event }) => {
				if (event.type === 'CONFIG_UPDATE') {
					console.log('[Configurator Assign] Assigning transcribeFn from CONFIG_UPDATE (exists):', !!event.settings.transcribeFn);
					return event.settings.transcribeFn ?? context.transcribeFn;
				} else if (event.type === 'START_SESSION') {
					console.log('[Configurator Assign] Assigning transcribeFn from START_SESSION (exists):', !!event.initialConfig?.transcribeFn);
					return event.initialConfig?.transcribeFn ?? context.transcribeFn;
				}
				return context.transcribeFn;
			},
		}),
		spawnManager: assign({
			managerRef: ({ context, spawn }) => {
				const commonInput = {
					apiToken: context.apiToken,
					// Pass any other common config needed by all manager types
				};

				// Log context values right before spawning
				console.log(`[Configurator Spawn] Attempting spawn. Engine: '${context.sttEngineSetting}', Token: '${context.apiToken ? '***' : 'null'}', Fn Exists: ${!!context.transcribeFn}`);

				try {
					switch (context.sttEngineSetting) {
						case 'whisper':
							if (!context.apiToken || !context.transcribeFn) {
								console.error('[Configurator] Cannot spawn Whisper manager: missing apiToken or transcribeFn.');
								return null;
							}
							const whisperInput = { ...commonInput, transcribeFn: context.transcribeFn };
							const whisperManager = spawn(sttManagerMachine, {
								input: whisperInput
							});
							console.log(`[Configurator] Manager spawned: ${whisperManager.id}`);
							return whisperManager;

						case 'web':
							console.warn('[Configurator] Web Speech Manager logic not yet implemented. Spawning Whisper as fallback.');
							if (!context.apiToken || !context.transcribeFn) {
								console.error('[Configurator] Cannot spawn fallback Whisper manager: missing apiToken or transcribeFn.');
								return null;
							}
							// Fallback to Whisper for now
							const webFallbackInput = { ...commonInput, transcribeFn: context.transcribeFn };
							const webFallbackManager = spawn(sttManagerMachine, {
								input: webFallbackInput
							});
							console.log(`[Configurator] Fallback manager spawned: ${webFallbackManager.id}`);
							return webFallbackManager;

						case 'whisper-live':
							console.warn('[Configurator] Whisper Live Manager logic not yet implemented. Spawning Whisper as fallback.');
							if (!context.apiToken || !context.transcribeFn) {
								console.error('[Configurator] Cannot spawn fallback Whisper manager: missing apiToken or transcribeFn.');
								return null;
							}
							// Fallback to Whisper for now
							const liveFallbackInput = { ...commonInput, transcribeFn: context.transcribeFn };
							const liveFallbackManager = spawn(sttManagerMachine, {
								input: liveFallbackInput
							});
							console.log(`[Configurator] Fallback manager spawned: ${liveFallbackManager.id}`);
							return liveFallbackManager;

						case 'none':
						default:
							console.error(`[Configurator] Cannot spawn manager: Invalid or 'none' STT engine setting: '${context.sttEngineSetting}'`);
							return null;
					}
				} catch (error) {
					console.error('[Configurator] Error during manager spawn process:', error);
					return null;
				}
			}
		}),
		stopManager: assign({
			managerRef: ({ context }) => {
				if (context.managerRef) {
					console.log(`[Configurator] Stopping manager: ${context.managerRef.id}`);
					stopChild(context.managerRef);
				}
				return null;
			}
		}),
		// Forward event, return undefined if type is unexpected (should be filtered by guard)
		forwardToManager: sendTo(
			({ context }) => context.managerRef!,
			({ event, context }) => {
				if (event.type === 'START_CALL') {
					if (!context.apiToken || !context.transcribeFn) {
						console.error('[Configurator] Cannot forward START_CALL: missing token or transcribeFn in configurator context.');
						return undefined; // Don't send anything if config is missing
					}
					// Ensure the payload matches the SttManagerEvent definition
					const payload: { token: string | null, transcribeFn: SttManagerContext['transcribeFn'] } = {
						token: context.apiToken,
						transcribeFn: context.transcribeFn
					};
					return {
						type: 'START_CALL',
						payload
					};
				} else if (event.type === 'STOP_CALL') {
					return { type: 'STOP_CALL' };
				}
				// Guard should prevent this, but return undefined just in case
				console.error('[Configurator] Unexpected event type in forwardToManager, returning undefined:', event);
				return undefined;
			}
		),
	},
	guards: {
		hasManagerRef: ({ context }) => context.managerRef !== null,
		shouldForwardEvent: ({ event }) => ['START_CALL', 'STOP_CALL'].includes(event.type),
	},
}).createMachine({
	id: 'sttConfigurator',
	context: ({ input }) => ({
		sttEngineSetting: input?.sttEngineSetting ?? 'none',
		apiToken: input?.apiToken ?? null,
		transcribeFn: input?.transcribeFn,
		managerRef: null,
	}),
	initial: 'idle',
	states: {
		idle: {
			entry: ['stopManager'], // Ensure cleanup on entering idle
			on: {
				CONFIG_UPDATE: {
					actions: ['assignConfig']
				},
				START_SESSION: {
					target: 'active',
					actions: ['assignConfig'] // Assign config passed with START_SESSION
				}
			}
		},
		active: {
			entry: ['spawnManager', log('[Configurator] Entering active state, spawning manager...')],
			always: {
				target: 'error',
				guard: ({ context }) => context.managerRef === null // If spawning failed
			},
			on: {
				STOP_SESSION: {
					target: 'idle',
					actions: [log('[Configurator] STOP_SESSION received.')]
				},
				CONFIG_UPDATE: {
					// Option 1: Re-spawn manager immediately (might interrupt ongoing process)
					// target: 'active',
					// actions: ['assignConfig', 'stopManager', 'spawnManager']
					// Option 2: Just update config, manager might handle it internally or on next start
					actions: ['assignConfig', log('[Configurator] Config updated while active. Manager restart might be needed manually via STOP/START_SESSION.')]
				},
				// Forward relevant events
				'*': {
					guard: 'shouldForwardEvent',
					actions: ['forwardToManager']
				},
				'error.actor.manager': {
					target: 'error',
					actions: [log('[Configurator] Error received from manager actor.')]
				}
			},
			exit: ['stopManager'] // Stop manager when leaving active state
		},
		error: {
			entry: [log('[Configurator] Entering error state.')],
			on: {
				START_SESSION: {
					target: 'active',
					actions: ['assignConfig']
				},
				CONFIG_UPDATE: {
					actions: ['assignConfig']
				}
			}
		}
	}
});

console.log('[sttConfiguratorMachine.ts] Machine definition complete'); 