/**
 * 오디오 처리와 관련된 유틸리티 함수들
 */

/**
 * 오디오 청크 배열을 단일 Blob으로 처리하는 함수
 * @param audioChunks 녹음된 오디오 청크 배열
 * @returns 단일 오디오 Blob
 */
export async function processAudioChunks(audioChunks: Blob[]): Promise<Blob> {
  if (!audioChunks || audioChunks.length === 0) {
    throw new Error('오디오 청크가 없습니다');
  }

  // 모든 청크를 단일 Blob으로 결합
  return new Blob(audioChunks, { type: 'audio/webm' });
}

/**
 * RMS 레벨 계산을 위한 유틸리티 함수
 * @param audioBuffer 오디오 데이터 버퍼
 * @returns RMS 레벨 (0-1 사이 값)
 */
export function calculateRMSLevel(audioBuffer: Float32Array): number {
  let sum = 0;
  
  // 모든 샘플의 제곱 합계 계산
  for (let i = 0; i < audioBuffer.length; i++) {
    sum += audioBuffer[i] * audioBuffer[i];
  }
  
  // 평균값의 제곱근 계산 (RMS)
  return Math.sqrt(sum / audioBuffer.length);
}

/**
 * 오디오 분석기 생성 함수
 * @param audioStream 오디오 스트림
 * @param onLevel RMS 레벨 업데이트 콜백
 * @returns 정리 함수
 */
export function createAudioAnalyzer(
  audioStream: MediaStream,
  onLevel: (level: number) => void
): () => void {
  // AudioContext 생성
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const microphone = audioContext.createMediaStreamSource(audioStream);
  
  microphone.connect(analyser);
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  // 분석 함수
  const analyzeAudio = () => {
    if (audioContext.state === 'closed') return;
    
    analyser.getByteFrequencyData(dataArray);
    
    // RMS 계산
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength) / 128.0;
    
    // 콜백 호출
    onLevel(rms);
    
    // 다음 프레임에서 다시 분석
    requestAnimationFrame(analyzeAudio);
  };
  
  // 분석 시작
  analyzeAudio();
  
  // 정리 함수 반환
  return () => {
    if (audioContext.state !== 'closed') {
      audioContext.close();
    }
  };
}

/**
 * MediaRecorder 생성 함수
 * @param audioStream 오디오 스트림
 * @param onDataAvailable 데이터 이용 가능시 콜백
 * @returns MediaRecorder 객체
 */
export function createMediaRecorder(
  audioStream: MediaStream,
  onDataAvailable: (data: Blob) => void
): MediaRecorder {
  const options = { mimeType: 'audio/webm' };
  
  try {
    const mediaRecorder = new MediaRecorder(audioStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        onDataAvailable(event.data);
      }
    };
    
    return mediaRecorder;
  } catch (error) {
    console.error('MediaRecorder 생성 오류:', error);
    throw new Error('MediaRecorder를 생성할 수 없습니다: ' + String(error));
  }
} 