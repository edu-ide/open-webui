# 상태 머신 구조 (/src/lib/machines)

이 디렉토리는 애플리케이션의 Call Overlay 기능과 관련된 상태 관리 로직을 포함하는 XState 머신들을 관리합니다. 메인 머신(`callOverlayMachine`)은 여러 개의 자식 머신들을 조합하여 복잡한 상태 로직을 모듈화하고 관리합니다.

## 파일 구조

*   **`callOverlayMachine.ts`**: 메인 상태 머신. 전체 통화 오버레이 UI의 상태와 상호작용을 관리하고, 다른 자식 머신들을 오케스트레이션합니다.
*   **`callOverlayMachine.types.ts`**: `callOverlayMachine` 및 관련 파일들에서 사용되는 TypeScript 타입 정의 (Context, Events 등)를 포함합니다.
*   **`callOverlayMachine.actors.ts`**: `callOverlayMachine`에서 사용되는 단순 Promise 기반 액터 구현 (예: API 호출)을 포함합니다.
*   **`micPermissionMachine.ts`**: 마이크 권한 요청 및 오디오 스트림 획득 로직을 담당하는 자식 상태 머신입니다.
*   **`mediaRecorderMachine.ts`**: 오디오 스트림을 받아 녹음하고, VAD(음성 활동 감지)를 수행하며, 오디오 청크 및 VAD 관련 이벤트를 부모(`callOverlayMachine`)로 보내는 자식 상태 머신입니다.
*   **`ttsPlayerMachine.ts`**: TTS(Text-to-Speech) 텍스트 큐를 관리하고, 순차적으로 음성을 재생하며, 재생 상태 관련 이벤트를 부모(`callOverlayMachine`)로 보내는 자식 상태 머신입니다. 재생 중단(Abort) 기능도 지원합니다.
*   **`sttListenerMachine.ts`**: STT(Speech-to-Text) 서비스 (예: Whisper Live)와의 연결, 상태 관리, 최종 텍스트 및 관련 이벤트를 부모(`callOverlayMachine`)로 보내는 자식 상태 머신입니다. (현재 플레이스홀더 구현 포함)

## 머신 관계

1.  **`callOverlayMachine` (부모)**:
    *   애플리케이션의 초기화 시 또는 특정 상태에서 `micPermissionMachine`, `mediaRecorderMachine`, `ttsPlayerMachine`, `sttListenerMachine`을 `invoke`하여 자식 머신으로 실행합니다.
    *   `setup.actors` 필드를 통해 자식 머신 및 자체 액터들을 참조합니다.
    *   자식 머신들로부터 `sendParent`로 전송된 이벤트 (예: `VAD_SILENCE_DETECTED`, `TTS_PLAYER_SPEAKING`, `STT_FINAL_TEXT`)를 수신하여 자신의 상태를 업데이트하거나 다른 액션을 트리거합니다 (예: `submitInternalRecording` 액터 호출).
    *   필요에 따라 `sendTo` 액션을 사용하여 특정 자식 머신에게 이벤트 (예: `QUEUE_UPDATE`, `STOP`)를 보냅니다.
    *   Promise 기반 액터(`submitInternalRecording`, `submitWhisperLiveText`, `fetchTTSAudioActor`)는 상태 전이 내 `invoke`에서 직접 호출됩니다 (액터 로직은 `callOverlayMachine.actors.ts`에 정의됨).

2.  **자식 머신들 (`micPermissionMachine`, `mediaRecorderMachine`, `ttsPlayerMachine`, `sttListenerMachine`)**:
    *   각각 특정 기능(마이크 권한, 녹음/VAD, TTS 재생, STT 리스닝)에 대한 상태 로직을 독립적으로 관리합니다.
    *   `callOverlayMachine`에 의해 `invoke`되어 실행됩니다.
    *   자신의 상태 변경이나 중요한 이벤트 발생 시 `sendParent` 액션을 사용하여 관련 정보를 `callOverlayMachine`으로 보냅니다.
    *   `callOverlayMachine`으로부터 `sendTo`로 전달된 이벤트를 수신하여 내부 상태를 변경하거나 작업을 수행합니다.

## 장점

*   **모듈성**: 각 머신이 특정 책임만 가지므로 코드를 이해하고 수정하기 쉽습니다.
*   **테스트 용이성**: 각 머신을 독립적으로 테스트할 수 있습니다.
*   **확장성**: 새로운 기능을 추가하거나 기존 기능을 수정할 때 영향 범위를 최소화할 수 있습니다. 