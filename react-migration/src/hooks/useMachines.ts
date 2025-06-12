/**
 * Custom React hooks for XState machines integration
 */

import { useMachine, useActor } from '@xstate/react';
import { callMachine } from '../machines/callMachine';
import { chatMachine } from '../machines/chatMachine';
// import { sttMachine } from '../machines/sttMachine';
// import { ttsMachine } from '../machines/ttsMachine';
// import { sttManagerMachine } from '../machines/sttManagerMachine';
// import { sttConfiguratorMachine } from '../machines/sttConfiguratorMachine';
// import { whisperLiveSttMachine } from '../machines/whisperLiveSttMachine';
// import { webSpeechWorkerMachine } from '../machines/webSpeechWorkerMachine';

/**
 * Hook for call machine
 */
export function useCallMachine() {
  return useMachine(callMachine, {});
}

/**
 * Hook for chat machine  
 */
export function useChatMachine() {
  return useMachine(chatMachine, {
    input: {
      backendSubmitFn: async (prompt: string) => {
        console.log('Dummy submit function:', prompt);
        return { status: 'submitted', id: Date.now().toString() };
      }
    }
  });
}

// Complex machines with compilation issues - will be added later
// /**
//  * Hook for STT machine with required input
//  */
// export function useSttMachine(input: {
//   audioStream: MediaStream;
//   minDecibels: number;
//   silenceDuration: number;
//   transcribeFn: (token: string, audioFile: File) => Promise<{ text: string }>;
//   apiToken: string;
//   parent: any;
// }) {
//   return useMachine(sttMachine, {
//     input
//   });
// }

// /**
//  * Hook for TTS machine
//  */
// export function useTtsMachine() {
//   return useMachine(ttsMachine, {});
// }

// /**
//  * Hook for STT manager machine
//  */
// export function useSttManagerMachine() {
//   return useMachine(sttManagerMachine, {});
// }

// /**
//  * Hook for STT configurator machine
//  */
// export function useSttConfiguratorMachine() {
//   return useMachine(sttConfiguratorMachine, {});
// }

// /**
//  * Hook for Whisper Live STT machine
//  */
// export function useWhisperLiveSttMachine() {
//   return useMachine(whisperLiveSttMachine, {});
// }

// /**
//  * Hook for Web Speech Worker machine
//  */
// export function useWebSpeechWorkerMachine() {
//   return useMachine(webSpeechWorkerMachine, {});
// }

/**
 * Generic hook for any actor reference
 */
export function useActorRef(actorRef: any) {
  return useActor(actorRef);
}