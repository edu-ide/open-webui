import { setup, assign, log } from 'xstate';

// --- Types ---
// Simplified context - perhaps keep remoteParty if it represents the assistant?
interface CallSessionContext {
    // remoteParty?: string; // Identifier for the assistant/model?
    errorMessage?: string; // Store error messages
}

type CallSessionEvent =
    | { type: 'ACTIVATE' } // User opens the overlay
    | { type: 'DEACTIVATE' } // User closes the overlay
    | { type: 'ERROR'; message: string }; // An error occurred during activation?

// --- Machine Setup ---

export const callMachine = setup({
    types: {
        context: {} as CallSessionContext,
        events: {} as CallSessionEvent,
    },
    actors: {
        // No call-specific actors needed anymore
    },
    actions: {
        // assignRemoteParty: assign({ // Keep if needed
        //     remoteParty: ({ event }) => event.payload.remoteParty,
        //     errorMessage: undefined
        // }),
        clearDetails: assign({
            errorMessage: undefined
        }),
        assignError: assign({
            errorMessage: ({ event }) => event.type === 'ERROR' ? event.message : 'Unknown error'
        }),
        logActive: log('Voice session active.'),
        logIdle: log('Voice session idle.'),
        logError: log(({context}) => `Error: ${context.errorMessage}`)
    },
    guards: {
        // No guards needed for this simple structure
    },
}).createMachine({
    id: 'callSession', // Renamed ID
    initial: 'idle',
    context: {
        // remoteParty: undefined,
        errorMessage: undefined
    },
    states: {
        idle: {
            entry: 'logIdle',
            on: {
                ACTIVATE: { target: 'active', actions: 'clearDetails' },
            },
        },
        active: {
            entry: 'logActive',
            // STT/TTS interactions happen while in this state
            on: {
                DEACTIVATE: { target: 'idle' },
                ERROR: { target: 'error', actions: 'assignError' },
            },
        },
        error: {
            entry: 'logError',
            on: {
                // Allow resetting to idle from error state
                ACTIVATE: { target: 'active', actions: 'clearDetails' },
                DEACTIVATE: { target: 'idle' },
            }
        },
    },
}); 