<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { blobToFile } from '$lib/utils';
	import { transcribeAudio } from '$lib/apis/audio';
	import { toast } from 'svelte-sonner';

	// Props from parent CallOverlay
	export let showCallOverlay: boolean;
	export let settings: any; // Use more specific type if available
	export let submitPrompt: (text: string, options: { _raw?: boolean }) => Promise<any>;
	export let takeScreenshot: () => string | undefined;
	export let setFiles: (files: any[]) => void;
	export let setLoading: (loading: boolean) => void;
	export let setEmoji: (emoji: string | null) => void;
	export let stopAllAudio: () => Promise<void>;
	export let updateRMSLevel: (level: number) => void;
	export let isAssistantSpeaking: boolean;
	export let cameraStream: MediaStream | null;

	// Internal state
	let confirmed = false;
	let rmsLevel = 0;
	let hasStartedSpeaking = false;
	let mediaRecorder: MediaRecorder | null = null;
	let audioStream: MediaStream | null = null;
	let audioChunks: Blob[] = [];
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let animationFrameId: number | null = null;

	const MIN_DECIBELS = -55;

	// --- Functions moved from CallOverlay --- //

	const transcribeHandler = async (audioBlob: Blob) => {
		await tick();
		const file = blobToFile(audioBlob, 'recording.wav');

		const res = await transcribeAudio(localStorage.token, file).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		if (res) {
			console.log('Internal VAD - Transcribed text:', res.text);

			if (res.text !== '') {
				console.log('Internal VAD - Submitting prompt...');
				try {
					const _responses = await submitPrompt(res.text, { _raw: true });
					console.log('Internal VAD - Submission response:', _responses);
				} catch (error) {
					console.error('Internal VAD - Error during submission:', error);
				}
			}
		}
	};

	const stopRecordingCallback = async (_continue = true) => {
		if (showCallOverlay) {
			console.log('%c%s', 'color: blue; font-size: 16px;', '🔵 Internal VAD - stopRecordingCallback 🔵');

			const _audioChunks = audioChunks.slice(0);
			audioChunks = [];
			// Ensure mediaRecorder is fully stopped before possibly restarting
			if (mediaRecorder && mediaRecorder.state !== 'inactive') {
				mediaRecorder.stop(); // This will eventually trigger onstop, but we proceed
			}
			mediaRecorder = null; // Mark as null

			if (confirmed && _audioChunks.length > 0) {
				setLoading(true);
				setEmoji(null);
				let currentFiles = [];

				if (cameraStream) {
					const imageUrl = takeScreenshot();
					if (imageUrl) {
						currentFiles = [{ type: 'image', url: imageUrl }];
						setFiles(currentFiles);
					}
				}

				const audioBlob = new Blob(_audioChunks, { type: 'audio/wav' });
				await transcribeHandler(audioBlob);

				confirmed = false;
				setLoading(false);
			}

			// Restart recording if needed after processing
			if (_continue) {
				await tick(); // Allow state updates
				startRecording();
			}
		} else {
			// If overlay is hidden, ensure everything stops
			stopAudioStream();
		}
	};

	const startRecording = async () => {
		if (!showCallOverlay) return; // Don't start if overlay is hidden

		try {
			if (!audioStream) {
				audioStream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					}
				});
			}

			// Ensure mediaRecorder is not already running or being created
			if (!mediaRecorder && audioStream) {
				mediaRecorder = new MediaRecorder(audioStream);

				mediaRecorder.onstart = () => {
					console.log('Internal VAD - Recording started');
					audioChunks = [];
					hasStartedSpeaking = false; // Reset speaking flag on start
					confirmed = false; // Reset confirmed flag
				};

				mediaRecorder.ondataavailable = (event) => {
					if (hasStartedSpeaking && event.data.size > 0) {
						audioChunks.push(event.data);
					}
				};

				mediaRecorder.onstop = () => {
					console.log('Internal VAD - Recording stopped event');
					// Only call stopRecordingCallback if confirmed is true (silence detected)
					// Otherwise, it might have been stopped manually or by closing overlay
					if (confirmed) {
						stopRecordingCallback(); // Handle processing and potential restart
					}
				};

				// Start analysis *after* setting up the recorder
				analyseAudio(audioStream);
				// Start recording *after* analysis setup
				mediaRecorder.start(); // Start recording immediately
			}
		} catch (err) {
			console.error("Internal VAD - Error starting recording:", err);
			toast.error(`Error starting audio recording: ${err.message}`);
			stopAudioStream(); // Clean up on error
		}
	};

	const stopAudioStream = () => {
		console.log("Internal VAD - Stopping audio stream...");
		if (animationFrameId) {
			window.cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			try {
				confirmed = false; // Prevent onstop callback if manually stopped
				mediaRecorder.stop();
			} catch (error) {
				console.log('Internal VAD - Error stopping media recorder:', error);
			}
		}
		mediaRecorder = null;

		if (analyser) {
			analyser.disconnect();
			analyser = null;
		}
		if (audioContext && audioContext.state !== 'closed') {
			audioContext.close();
			audioContext = null;
		}

		if (audioStream) {
			audioStream.getTracks().forEach((track) => track.stop());
		}
		audioStream = null;
		audioChunks = [];
		hasStartedSpeaking = false;
		rmsLevel = 0;
		updateRMSLevel(rmsLevel);
		console.log("Internal VAD - Audio stream stopped.");
	};

	const calculateRMS = (data: Uint8Array) => {
		let sumSquares = 0;
		for (let i = 0; i < data.length; i++) {
			const normalizedValue = (data[i] - 128) / 128;
			sumSquares += normalizedValue * normalizedValue;
		}
		return Math.sqrt(sumSquares / data.length);
	};

	const analyseAudio = (stream: MediaStream) => {
		if (!audioContext || audioContext.state === 'closed') {
			audioContext = new AudioContext();
		}
		const audioStreamSource = audioContext.createMediaStreamSource(stream);

		if (!analyser) {
			analyser = audioContext.createAnalyser();
			analyser.minDecibels = MIN_DECIBELS;
		}

		audioStreamSource.connect(analyser);

		const bufferLength = analyser.frequencyBinCount;
		const domainData = new Uint8Array(bufferLength);
		const timeDomainData = new Uint8Array(analyser.fftSize);

		let lastSoundTime = Date.now();
		hasStartedSpeaking = false;

		console.log('Internal VAD - Sound detection starting...');

		const detectSound = () => {
			const processFrame = () => {
				if (!analyser || !mediaRecorder || !showCallOverlay) {
					console.log("Internal VAD - Stopping analysis loop.");
					animationFrameId = null; // Ensure loop stops
					return;
				}

				// Adjust analyser sensitivity based on assistant speaking state
				if (isAssistantSpeaking && !(settings?.voiceInterruption ?? false)) {
					analyser.minDecibels = -1; // Effectively mute input detection
					analyser.maxDecibels = 0;
				} else {
					analyser.minDecibels = MIN_DECIBELS;
					analyser.maxDecibels = -30;
				}

				analyser.getByteTimeDomainData(timeDomainData);
				analyser.getByteFrequencyData(domainData);

				rmsLevel = calculateRMS(timeDomainData);
				updateRMSLevel(rmsLevel); // Update parent

				const hasSound = domainData.some((value) => value > 0);
				if (hasSound) {
					if (!hasStartedSpeaking && mediaRecorder.state === 'recording') {
						console.log('%c%s', 'color: blue; font-size: 16px;', '🔵 Internal VAD - Sound detected, user speaking 🔵');
						hasStartedSpeaking = true;
						stopAllAudio(); // Interrupt TTS if configured
					}
					lastSoundTime = Date.now();
				}

				// Silence detection only after initial speech
				if (hasStartedSpeaking) {
					if (Date.now() - lastSoundTime > 2000) {
						if (mediaRecorder && mediaRecorder.state === 'recording') {
							console.log('%c%s', 'color: blue; font-size: 16px;', '🔵 Internal VAD - Silence detected 🔵');
							confirmed = true; // Mark for processing
							mediaRecorder.stop(); // Stop recording, onstop will handle the rest
							// No need to call stopRecordingCallback here, onstop handles it
							animationFrameId = null; // Stop this loop
							return; // Exit frame processing
						}
					}
				}

				animationFrameId = window.requestAnimationFrame(processFrame);
			};

			animationFrameId = window.requestAnimationFrame(processFrame);
		};

		detectSound();
	};

	// Lifecycle
	onMount(() => {
		console.log("InternalRecordingHandler mounted");
		if (showCallOverlay) {
			startRecording();
		}
	});

	onDestroy(() => {
		console.log("InternalRecordingHandler destroying...");
		stopAudioStream(); // Ensure all resources are cleaned up
		console.log("InternalRecordingHandler destroyed.");
	});

	// Reactive statement to handle overlay visibility changes
	$: if (showCallOverlay) {
		console.log("Internal VAD - Overlay shown, ensuring recording starts");
		if (!audioStream && !mediaRecorder) { // Start only if not already running
			startRecording();
		}
	} else {
		console.log("Internal VAD - Overlay hidden, stopping recording");
		stopAudioStream();
	}

</script>

<!-- This component has no UI, it only handles logic --> 