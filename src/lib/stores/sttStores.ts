import { writable } from 'svelte/store';

// STT 녹음 진행 상태
export const sttIsRecording = writable<boolean>(false);

// STT 클라이언트의 현재 상태 메시지 (예: Connecting..., Recording..., Server ready)
export const sttStatusMessage = writable<string>('Idle');

// STT 처리 중 발생한 오류 메시지
export const sttError = writable<string | null>(null);

// 가장 최근에 확정된(finalized) STT 텍스트 조각
// 이 값은 소비된 후 초기화될 수 있도록 설계하는 것이 좋음 (예: 컴포넌트에서 null로 설정)
export const sttLastFinalizedText = writable<string | null>(null);

// 현재 인식 중인(아직 확정되지 않은) 텍스트 세그먼트
export const sttCurrentSegment = writable<string>(''); 