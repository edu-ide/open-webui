import {
	setup,
	assign,
	fromCallback,
	log,
	sendTo,
	stopChild,
	type ActorRefFrom,
	type AnyActorLogic,
	type Subscription,
	fromPromise,
	createActor,
	type DoneActorEvent,
	type AssignArgs,
	type Spawner,
	type PromiseActorLogic,
	type ErrorActorEvent,
	sendParent
} from 'xstate';
import { sttMachine, type SttContext, type SttEvent } from './sttMachine'; // Standard STT
// import { whisperLiveSttMachine, type WhisperLiveContext } from './whisperLiveSttMachine'; // Comment out if not used
// Placeholder imports for other engine workers (implement these later)
// import { webSpeechWorkerMachine } from './webSpeechWorkerMachine';
// import { whisperLiveWorkerMachine } from './whisperLiveWorkerMachine';

// <<< 모듈 로드 로그 추가 >>>
console.log('[sttManagerMachine.ts] Module loaded (Whisper Manager)');
// <<< -------------------- >>>

// --- Types ---

// type SttMode = 'standard' | 'whisper-live' | 'none'; // Removed, mode is implicitly 'whisper'

// Combine relevant context parts from the worker machine for UI display
interface DisplayContext {
	isListening: boolean;
	isRecording: boolean;
	currentSegment: string | null;
	lastFinalizedText: string | null;
	statusMessage: string;
	errorMessage: string | null;
	rmsLevel: number;
}

// Updated SttManagerContext (Whisper-specific)
export interface SttManagerContext extends DisplayContext {
	// currentMode removed
	// sttEngineSetting removed
	apiToken: string | null;
	transcribeFn: SttContext['transcribeFn']; // Now required, not optional
	managerAudioStream: MediaStream | null;
	minDecibels: number; // Config for workers
	silenceDuration: number; // Config for workers
	activeWorker: ActorRefFrom<typeof sttMachine> | null; // Back to specific type
	processingWorkers: ActorRefFrom<typeof sttMachine>[]; // Back to specific type
	finalTranscript: string; // Accumulate results
}

// Update Event Types
type SttManagerEvent =
	| { type: 'START_CALL'; payload: { token: string | null, transcribeFn: SttContext['transcribeFn'] } } // Payload structure is key
	| { type: 'STOP_CALL' }
	| { type: 'RESET' }
	// CONFIG_UPDATE might be simplified or removed if only managed by configurator now
	// | { type: 'CONFIG_UPDATE'; settings: { token?: string | null } } // Example simplified version
	| DoneActorEvent<MediaStream, 'micPermissionActor'>
	| { type: 'error.platform.micPermissionActor'; error: unknown }
	| { type: 'WORKER_SILENCE_DETECTED'; workerRef: ActorRefFrom<typeof sttMachine> }
	| { type: 'WORKER_TRANSCRIPTION_RESULT'; text: string; workerRef: ActorRefFrom<typeof sttMachine> }
	| { type: 'WORKER_RMS_UPDATE'; value: number; workerRef: ActorRefFrom<typeof sttMachine> }
	| { type: 'WORKER_ERROR'; error: string; workerRef: ActorRefFrom<typeof sttMachine> };

// Type predicate functions for events
function isMicPermissionSuccessEvent(event: SttManagerEvent): event is DoneActorEvent<MediaStream, 'micPermissionActor'> {
	return event.type === 'xstate.done.actor.micPermissionActor' && event.output instanceof MediaStream && event.output.active;
}

function isMicPermissionPlatformErrorEvent(event: SttManagerEvent | ErrorActorEvent): event is ErrorActorEvent {
	return event.type === 'xstate.error.actor.micPermissionActor';
}

function isPermissionDeniedError(event: SttManagerEvent): boolean {
	if (isMicPermissionPlatformErrorEvent(event)) {
		const errorEvent = event as ErrorActorEvent;
		const error = errorEvent.error;
		return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
	}
	return false;
}

// --- 액터 로직을 미리 정의 ---
const micPermissionActorLogic = fromPromise<MediaStream>(async () => {
	console.log('[sttManager] Requesting microphone permission...');
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		throw new Error('MediaDevices API not available.');
	}
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	console.log('[sttManager] Permission granted, stream received.');
	if (!(stream instanceof MediaStream)) {
		console.error('[sttManager] getUserMedia did not return a valid MediaStream!');
		throw new Error('Invalid MediaStream received.');
	}
	return stream;
});
// ---------------------------

// --- Machine Setup ---

export const sttManagerMachine = setup({
	types: {
		context: {} as SttManagerContext,
		events: {} as SttManagerEvent,
		// Input type updated - no sttEngineSetting
		input: {} as Partial<Pick<SttManagerContext, 'minDecibels' | 'silenceDuration' | 'apiToken' | 'transcribeFn'>>,
	},
	actors: {
		micPermissionActor: micPermissionActorLogic
	},
	actions: {
		assignApiToken: assign({
			apiToken: ({ event, context }) => {
				if (event.type === 'START_CALL') return event.payload.token ?? context.apiToken;
				// if (event.type === 'CONFIG_UPDATE' && event.settings.token) return event.settings.token;
				return context.apiToken;
			}
		}),
		// assignEngineSetting action removed
		assignFinalizedText: assign({
			finalTranscript: ({ event, context }) => {
				if (event.type === 'WORKER_TRANSCRIPTION_RESULT' && typeof event.text === 'string') {
					console.log(`[SttManager] Appending finalized text: "${event.text}"`);
					return (context.finalTranscript + ' ' + event.text).trim();
				}
				return context.finalTranscript;
			},
			statusMessage: 'Received result'
		}),
		assignChildError: assign({
			errorMessage: ({ event }) => {
				if (event.type === 'WORKER_ERROR') return event.error;
				return 'Unknown worker error';
			},
			statusMessage: 'Error',
			isListening: false,
			isRecording: false
		}),
		resetDisplayContext: assign({
			// ... (remains the same, currentMode removed)
			isListening: false,
			isRecording: false,
			currentSegment: null,
			lastFinalizedText: null,
			statusMessage: 'Idle',
			errorMessage: null,
			rmsLevel: 0,
			// currentMode: 'none', // Removed
		}),
		assignStream: assign({
			managerAudioStream: ({ event }) => {
				const successEvent = event as DoneActorEvent<MediaStream, 'micPermissionActor'>;
				console.log('[sttManager] Assigning active MediaStream.');
				return successEvent.output;
			},
			errorMessage: null
		}),
		assignError: assign({
			errorMessage: ({ context, event }) => {
				console.error("[sttManager] Error event received:", event);
				let message = context.errorMessage ?? 'An unknown manager error occurred';

				if (event.type === 'WORKER_ERROR') {
					message = event.error;
				}
				else if (isMicPermissionPlatformErrorEvent(event as SttManagerEvent | ErrorActorEvent)) {
					const errorEvent = event as unknown as ErrorActorEvent;
					const error = errorEvent.error;
					if (error instanceof Error) {
						message = error.message;
					} else if (typeof error === 'string') {
						message = error;
					} else {
						try { message = JSON.stringify(error); } catch { message = 'Unknown platform error object'; }
					}
				}
				return message;
			},
			managerAudioStream: null,
			activeWorker: null,
			processingWorkers: [],
			statusMessage: 'Error'
		}),
		assignPermissionDeniedError: assign({ errorMessage: 'Microphone permission denied.' }),
		stopAllWorkersAction: ({ context }: { context: SttManagerContext }) => {
			console.warn('[sttManager/Action] !!! stopAllWorkersAction called (sending CLEANUP) !!!');
			const workersToStop: ActorRefFrom<typeof sttMachine>[] = [];
			if (context.activeWorker) {
				workersToStop.push(context.activeWorker);
			}
			workersToStop.push(...context.processingWorkers);

			if (workersToStop.length > 0) {
				console.log(`[sttManager] Sending CLEANUP to ${workersToStop.length} workers (will self-terminate).`);
				// Send CLEANUP event ONLY
				const cleanupActions = workersToStop.map(worker => sendTo(worker, { type: 'CLEANUP' }));
				// REMOVE stopChild actions
				// const stopActions = workersToStop.map(worker => stopChild(worker));
				// Return combined actions
				// return [...cleanupActions, ...stopActions];
				return cleanupActions; // Return only cleanup actions
			}
			return [];
		},
		assignConfig: assign({ // Assigns only token and transcribeFn now
			apiToken: ({ event, context }) => {
				if (event.type === 'START_CALL') return event.payload.token ?? context.apiToken;
				return context.apiToken;
			},
			transcribeFn: ({ event, context }) => {
				if (event.type === 'START_CALL') return event.payload.transcribeFn; // Should always be provided on START_CALL
				return context.transcribeFn; // Should retain if already set
			}
		}),
		// Simplified spawnInitialWorker - always spawns sttMachine (Whisper worker)
		spawnInitialWorker: assign({
			activeWorker: ({ context, spawn, self }: AssignArgs<SttManagerContext, SttManagerEvent, any, any>) => {
				if (!context.managerAudioStream || !context.managerAudioStream.active) {
					console.error('[sttManager] Cannot spawn worker: inactive or missing audio stream.');
					return null;
				}
				if (!context.apiToken || !context.transcribeFn) {
					console.error('[sttManager] Cannot spawn whisper worker: missing apiToken or transcribeFn.');
					return null;
				}

				console.log('[sttManager] Spawning initial Whisper worker (sttMachine)...');
				try {
					const worker = spawn(sttMachine, {
						id: `sttWorker-${Date.now()}`,
						input: {
							parent: self,
							audioStream: context.managerAudioStream,
							minDecibels: context.minDecibels,
							silenceDuration: context.silenceDuration,
							apiToken: context.apiToken,
							transcribeFn: context.transcribeFn
						},
					});
					return worker;
				} catch (error) {
					console.error('[sttManager] Error spawning worker:', error);
					return null;
				}
			}
		}),
		// Keep the assign action for spawning/updating workers, maybe rename for clarity
		spawnNewWorkerAndUpdateLists: assign({
			activeWorker: ({ context, spawn, event, self }: AssignArgs<SttManagerContext, SttManagerEvent, any, any>) => {
				// Spawn logic only
				if (event.type !== 'WORKER_SILENCE_DETECTED') return context.activeWorker;

				if (!context.managerAudioStream || !context.managerAudioStream.active) {
					console.error('[sttManager] Cannot spawn new worker: inactive or missing audio stream.');
					return context.activeWorker;
				}
				if (!context.apiToken || !context.transcribeFn) {
					console.error('[sttManager] Cannot spawn new whisper worker: missing apiToken or transcribeFn.');
					return context.activeWorker;
				}

				console.log('[sttManager] Spawning new Whisper worker (sttMachine) due to silence...');
				 try {
					const newWorker = spawn(sttMachine, {
						id: `sttWorker-${Date.now()}`,
						input: {
							parent: self,
							audioStream: context.managerAudioStream,
							minDecibels: context.minDecibels,
							silenceDuration: context.silenceDuration,
							apiToken: context.apiToken,
							transcribeFn: context.transcribeFn
						}
					});
					 return newWorker;
				} catch (error) {
					console.error('[sttManager] Error spawning new worker:', error);
					return context.activeWorker;
				}
			},
			processingWorkers: ({ context, event }) => {
				if (event.type === 'WORKER_SILENCE_DETECTED') {
					const workerRef = event.workerRef;
					if (workerRef && !context.processingWorkers.some(w => w.id === workerRef.id)) {
						return [...context.processingWorkers, workerRef];
					}
				}
				return context.processingWorkers;
			}
		}),
		removeProcessedWorker: assign({
			processingWorkers: ({ context, event }) => {
				if (event.type === 'WORKER_TRANSCRIPTION_RESULT' && event.workerRef) {
					console.log(`[SttManager] Removing worker ${event.workerRef.id} from processing list.`);
					return context.processingWorkers.filter(ref => ref.id !== event.workerRef.id);
				} else if (event.type === 'WORKER_ERROR' && event.workerRef) {
					console.log(`[SttManager] Removing errored worker ${event.workerRef.id} from processing list.`);
					return context.processingWorkers.filter(ref => ref.id !== event.workerRef.id);
				}
				return context.processingWorkers;
			}
		}),
		assignStoppedWorkers: assign({
			activeWorker: null,
			processingWorkers: []
		}),
		cleanupStream: ({ context }) => {
			if (context.managerAudioStream) {
				console.log('[sttManager] Cleaning up manager audio stream.');
				context.managerAudioStream.getTracks().forEach(track => track.stop());
			}
		},
		resetManagerContext: assign({
			managerAudioStream: null,
			activeWorker: null,
			processingWorkers: [],
			finalTranscript: '',
			errorMessage: null,
			apiToken: null,
			transcribeFn: undefined,
			isListening: false,
			isRecording: false,
			currentSegment: null,
			lastFinalizedText: null,
			statusMessage: 'Idle',
			rmsLevel: 0,
		}),
		// Action to send RMS update to parent (Configurator)
		sendRmsUpdateToParent: sendParent(({ event }) => {
			// Type guard
			if (event.type === 'WORKER_RMS_UPDATE') {
				// Optional: Log the RMS being forwarded
				// console.log(`[sttManager] Forwarding MANAGER_RMS_UPDATE: ${event.value.toFixed(4)}`);
				return { type: 'MANAGER_RMS_UPDATE', value: event.value };
			}
			// Should not happen
			console.warn('[sttManager] sendRmsUpdateToParent called with wrong event type:', event.type);
			return undefined;
		}),
		// Maybe update manager's internal RMS too?
		assignRmsLevel: assign({
			rmsLevel: ({ event, context }) => {
				if (event.type === 'WORKER_RMS_UPDATE') {
					return event.value;
				}
				return context.rmsLevel; // Keep existing if wrong event
			}
		}),
		sendErrorToParent: sendParent(({ context }) => {
			console.log(`[sttManager] Sending WORKER_ERROR to parent: ${context.errorMessage}`);
			return {
				type: 'WORKER_ERROR',
				error: context.errorMessage ?? 'Unknown manager error occurred'
			};
		})
	},
	guards: {
		hasActiveStream: ({ context }) => !!context.managerAudioStream && context.managerAudioStream.active,
		hasRequiredConfig: ({ context }) => !!context.apiToken && !!context.transcribeFn, // Now checks transcribeFn too
		isPermissionSuccess: (context, event) => isMicPermissionSuccessEvent(event as SttManagerEvent),
		isPermissionPlatformError: (context, event) => isMicPermissionPlatformErrorEvent(event as SttManagerEvent | ErrorActorEvent),
		isPermissionDeniedError: (context, event) => isPermissionDeniedError(event as SttManagerEvent),
		canSpawnNewWorker: ({ context }) =>
			(!!context.managerAudioStream && context.managerAudioStream.active) &&
			(!!context.apiToken && !!context.transcribeFn),
	},
}).createMachine({
	id: 'sttManager',
	context: ({ input }) => {
		console.log('[sttManagerMachine] context function executing with input:', JSON.stringify(input));
		// Default context for Whisper Manager
		return {
			// currentMode removed
			// sttEngineSetting removed
			apiToken: input?.apiToken ?? null,
			// transcribeFn is now required, ensure it's provided or default handled if possible
			transcribeFn: input?.transcribeFn!, // Non-null assertion, assuming configurator ensures this
			managerAudioStream: null,
			minDecibels: input?.minDecibels ?? -45,
			silenceDuration: input?.silenceDuration ?? 1500,
			activeWorker: null,
			processingWorkers: [],
			finalTranscript: '',
			// Display context defaults
			isListening: false,
			isRecording: false,
			currentSegment: null,
			lastFinalizedText: null,
			statusMessage: 'Initializing...',
			errorMessage: null,
			rmsLevel: 0,
		}
	},
	initial: 'idle',
	states: {
		idle: {
			entry: ['resetManagerContext', log('[SttManager] Entering idle state')],
			on: {
				START_CALL: {
					target: 'requestingPermission',
					actions: [
						log('[SttManager] START_CALL received in idle state, transitioning...'),
						{ type: 'assignConfig' }
					]
				}
			}
		},
		requestingPermission: {
			entry: log('[sttManager] Entering requestingPermission state...'),
			invoke: {
				id: 'micPermissionActor',
				src: 'micPermissionActor',
				onDone: {
					target: 'managing',
					actions: { type: 'assignStream' },
					guard: ({ event }) => event.output instanceof MediaStream && event.output.active
				},
				onError: [
					{
						guard: ({ event }) => {
							const error = event.error;
							return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
						},
						target: 'error',
						actions: { type: 'assignPermissionDeniedError' }
					},
					{
						guard: ({ event }) => event.type === 'xstate.error.actor.micPermissionActor',
						target: 'error',
						actions: { type: 'assignError' }
					}
				]
			},
			on: {
				STOP_CALL: { target: 'idle' }
			}
		},
		managing: {
			entry: [
				log('[sttManager] Entering managing state...'),
				{ type: 'spawnInitialWorker' }
			],
			always: [
				{
					target: 'error',
					// Temporarily remove the !context.activeWorker check to test timing hypothesis
					guard: ({ context }) => (!context.managerAudioStream || !context.managerAudioStream.active)  || !context.activeWorker  || !context.apiToken || !context.transcribeFn,
					actions: assign({ errorMessage: 'Failed to initialize managing state: Invalid stream, worker spawn failed, or missing config.' })
				}
			],
			on: {
				WORKER_SILENCE_DETECTED: {
					guard: ({ context }) =>
						(!!context.managerAudioStream && context.managerAudioStream.active) &&
						(!!context.apiToken && !!context.transcribeFn),
					// Define actions explicitly here
					actions: [
						log(({ event }) => `[sttManager] SUCCESS: Received WORKER_SILENCE_DETECTED from ${ (event as any).workerRef?.id }`),
						log(({ event }) => `[sttManager] WORKER_SILENCE_DETECTED from ${ (event as any).workerRef?.id }. Sending PROCESS_CHUNKS...`),
						// Send PROCESS_CHUNKS to the worker that detected silence
						sendTo(
							({ event }) => (event as any).workerRef, // Target the worker from the event
							{ type: 'PROCESS_CHUNKS' }
						),
						// Assign new active worker and update processing list
						{ type: 'spawnNewWorkerAndUpdateLists' },
						log('[sttManager] Handled silence, spawned new worker.') // Log completion
					]
				},
				WORKER_TRANSCRIPTION_RESULT: {
					actions: [
						{ type: 'assignFinalizedText' },
						sendParent(({ context }) => ({
							type: 'MANAGER_TRANSCRIPTION_UPDATE',
							finalTranscript: context.finalTranscript
						})),
						'removeProcessedWorker',
						stopChild(({ event }) => (event as any).workerRef),
						log('[sttManager] Processed transcription result and notified parent.')
					]
				},
				WORKER_RMS_UPDATE: {
					// Update manager context AND forward to configurator
					actions: ['assignRmsLevel', 'sendRmsUpdateToParent']
				},
				WORKER_ERROR: {
					target: 'error',
					actions: [
						{ type: 'assignChildError' },
						'removeProcessedWorker',
						stopChild(({ event }) => (event as any).workerRef),
						log('[sttManager] Worker error occurred, transitioning to error state.')
					]
				},
				STOP_CALL: {
					target: 'idle',
					actions: [log('[sttManager] Stopping call.')]
				}
			},
			exit: [
				'cleanupStream',
				log('[sttManager/State] Executing stopAllWorkersAction in exit handler of managing state.'),
				'stopAllWorkersAction',
				'assignStoppedWorkers'
			]
		},
		error: {
			entry: [
				log( ({context}) => `[SttManager] Entering error state: ${context.errorMessage}`),
				log('[sttManager/State] Executing cleanup actions in entry handler of error state.'),
				'sendErrorToParent',
				'cleanupStream',
				'stopAllWorkersAction',
				'assignStoppedWorkers'
			],
			on: {
				START_CALL: {
					target: 'requestingPermission',
					actions: [{ type: 'resetManagerContext' }, { type: 'assignConfig' }]
				},
				RESET: {
					target: 'idle'
				}
			}
		}
	}
});

console.log('[sttManagerMachine.ts] Machine definition complete (Whisper Manager)'); 