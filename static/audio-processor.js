/**
 * Resamples Float32Array audio data to a target sample rate (16kHz).
 * This function needs to be self-contained within the worklet scope.
 * @param {Float32Array} audioData - The input audio data.
 * @param {number} inputSampleRate - The sample rate of the input audio data.
 * @param {number} outputSampleRate - The target sample rate (usually 16000).
 * @returns {Float32Array} The resampled audio data.
 */
function resample(audioData, inputSampleRate, outputSampleRate) {
  if (inputSampleRate === outputSampleRate) {
    return audioData;
  }
  const targetLength = Math.round(audioData.length * (outputSampleRate / inputSampleRate));
  const resampledData = new Float32Array(targetLength);
  const springFactor = (audioData.length - 1) / (targetLength - 1);
  resampledData[0] = audioData[0];
  for (let i = 1; i < targetLength; i++) {
    const index = i * springFactor;
    const leftIndex = Math.floor(index);
    const rightIndex = Math.min(Math.ceil(index), audioData.length - 1);
    const fraction = index - leftIndex;
    resampledData[i] = audioData[leftIndex] + (audioData[rightIndex] - audioData[leftIndex]) * fraction;
  }
  return resampledData;
}

// Define the AudioWorkletProcessor
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._isRecording = false; // Flag to control processing/posting
    this._targetSampleRate = 16000; // Target sample rate for Whisper
    this._rmsUpdateInterval = 100; // Send RMS update every 100ms (approx)
    this._lastRmsUpdateTime = 0;

    // VAD parameters
    this._vadThreshold = 0.02; // Adjust this threshold based on testing
    this._vadSilenceDuration = 2000; // Silence duration in ms to trigger VAD_SILENCE_START (Increased from 1000)
    this._isSpeaking = false; // Current VAD state
    this._silenceStartTime = 0; // Timestamp when silence started

    // Throttling trackers for logging
    this._lastProcessLogTime = 0;

    // Listen for messages from the main thread (start/stop recording)
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        // console.log('[AudioWorklet] Recording started.');
        this._isRecording = true;
        this._lastRmsUpdateTime = currentTime;
        this._isSpeaking = false; // Reset VAD state on start
        this._silenceStartTime = 0;
      } else if (event.data.type === 'stop') {
        // console.log(`[AudioWorklet] Received 'stop' message. _isRecording set to: ${this._isRecording}`);
        // console.log('[AudioWorklet] Recording stopped.');
        this._isRecording = false;
      } else if (event.data.type === 'setTargetSampleRate') {
        this._targetSampleRate = event.data.targetSampleRate;
        // console.log(`[AudioWorklet] Target sample rate set to ${this._targetSampleRate}`);
      } else if (event.data.type === 'updateVadThreshold') {
          this._vadThreshold = event.data.threshold;
          // console.log(`[AudioWorklet] VAD threshold updated to ${this._vadThreshold}`);
      } else if (event.data.type === 'updateVadSilenceDuration') {
          this._vadSilenceDuration = event.data.duration;
          // console.log(`[AudioWorklet] VAD silence duration updated to ${this._vadSilenceDuration}`);
      }
    };
  }

  /**
   * Calculates the RMS level of an audio buffer.
   * @param {Float32Array} buffer - The audio data.
   * @returns {number} The RMS level (0-1 range, approximately).
   */
  _calculateRMS(buffer) {
    let sumOfSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumOfSquares += buffer[i] * buffer[i];
    }
    const meanSquare = sumOfSquares / buffer.length;
    const rms = Math.sqrt(meanSquare);
    // Use raw RMS for VAD, normalize for UI feedback later if needed
    // return Math.min(rms * 5, 1.0); // Normalization removed for VAD
    return rms;
  }

  /**
   * Called by the system for each block of audio data.
   * @param {Float32Array[][]} inputs - Array of inputs, each input is an array of channels, each channel is a Float32Array.
   * @param {Float32Array[][]} outputs - Array of outputs (we don't modify outputs here).
   * @param {Record<string, Float32Array>} parameters - Audio parameters.
   * @returns {boolean} - Return true to keep the processor alive.
   */
  process(inputs, outputs, parameters) {
    // --- Throttled logging for process call ---
 
    // -----------------------------------------

    if (!this._isRecording || !inputs || !inputs[0] || !inputs[0][0]) {
      return true; // Keep processor alive
    }

    const inputData = inputs[0][0];
    const nowMs = currentTime * 1000;
    const currentRms = this._calculateRMS(inputData);

    // --- VAD Logic --- 
    const isSpeechDetected = currentRms > this._vadThreshold;

    if (isSpeechDetected) {
      // Speech detected
      this._silenceStartTime = 0; // Reset silence timer
      if (!this._isSpeaking) {
        // Transition: Silence -> Speech
        this._isSpeaking = true;
        // console.log(`[AudioWorklet] VAD: Speech Start (RMS: ${currentRms.toFixed(4)})`);
        // console.log('[AudioWorklet] VAD: Posting VAD_SPEECH_START');
        if (this._isRecording) this.port.postMessage({ type: 'VAD_SPEECH_START' });
      }
    } else {
      // Silence detected
      if (this._isSpeaking) {
        // Transition: Speech -> Silence
        this._isSpeaking = false;
        this._silenceStartTime = nowMs; // Start silence timer
        // console.log(`[AudioWorklet] VAD: Speech End (RMS: ${currentRms.toFixed(4)})`);
        // Optionally send VAD_SPEECH_END event if needed by main thread
        // this.port.postMessage({ type: 'VAD_SPEECH_END' });
      } else if (this._silenceStartTime > 0) {
        // Continuing silence
        const silenceDuration = nowMs - this._silenceStartTime;
        if (silenceDuration >= this._vadSilenceDuration) {
          // Silence duration threshold reached
          // console.log(`[AudioWorklet] VAD: Silence threshold reached (${silenceDuration}ms).`);
          // console.log('[AudioWorklet] VAD: Posting VAD_SILENCE_START');
          if (this._isRecording) this.port.postMessage({ type: 'VAD_SILENCE_START' });
          this._silenceStartTime = 0; // Reset timer to prevent repeated events
        }
      }
    }

    // --- RMS Update for UI --- 
    if (nowMs - this._lastRmsUpdateTime > this._rmsUpdateInterval) {
      if (this._isRecording) {
        // Log RMS update sending (already throttled by interval)
        // console.log(`[AudioWorklet] Posting RMS_UPDATE (Value: ${Math.min(currentRms * 5, 1.0).toFixed(4)})`); // Optional: uncomment if needed, already throttled
        this.port.postMessage({ type: 'RMS_UPDATE', value: Math.min(currentRms * 5, 1.0) });
      }
      this._lastRmsUpdateTime = nowMs;
    }

    // --- Audio Chunk Resampling and Sending --- 
    const resampledData = resample(inputData, sampleRate, this._targetSampleRate);
    if (this._isRecording) { // Send audio whenever recording, regardless of VAD state
      this.port.postMessage(resampledData.buffer, [resampledData.buffer]);
    }

    // Always return true to keep the processor node alive until explicitly terminated
    return true;
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
