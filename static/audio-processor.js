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

    // Listen for messages from the main thread (start/stop recording)
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this._isRecording = true;
        console.log('[AudioWorklet] Recording started.');
      } else if (event.data.type === 'stop') {
        this._isRecording = false;
        console.log('[AudioWorklet] Recording stopped.');
      } else if (event.data.type === 'setTargetSampleRate') {
        this._targetSampleRate = event.data.targetSampleRate;
        console.log(`[AudioWorklet] Target sample rate set to ${this._targetSampleRate}`);
      }
    };
  }

  /**
   * Called by the system for each block of audio data.
   * @param {Float32Array[][]} inputs - Array of inputs, each input is an array of channels, each channel is a Float32Array.
   * @param {Float32Array[][]} outputs - Array of outputs (we don't modify outputs here).
   * @param {Record<string, Float32Array>} parameters - Audio parameters.
   * @returns {boolean} - Return true to keep the processor alive.
   */
  process(inputs, outputs, parameters) {
    // We expect a single input, single channel
    if (!this._isRecording || !inputs || !inputs[0] || !inputs[0][0]) {
      return true; // Keep processor alive even if not recording
    }

    const inputData = inputs[0][0]; // Get the Float32Array for the first channel

    // Resample the audio data to 16kHz
    // 'sampleRate' is a global variable available in AudioWorkletGlobalScope
    const resampledData = resample(inputData, sampleRate, this._targetSampleRate);

    // Send the resampled Float32 data's ArrayBuffer back to the main thread
    // The ArrayBuffer needs to be transferred, not copied, for performance.
    // Note: We send the Float32 buffer directly, as deduced from Python client analysis
    this.port.postMessage(resampledData.buffer, [resampledData.buffer]);

    return true; // Keep processor alive
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
