<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// --- Type Definitions ---
	interface ServerMessageData {
		uid: string;
		status?: 'WAIT';
		message?: string | number;
		language?: string;
		segments?: Segment[];
		backend?: string;
		// faster-whisper specific - might differ for whisper.cpp
		server_backend?: string; // e.g., "faster_whisper"
		transcription_time?: number;
		inference_time?: number;
		// whisper.cpp specific - might differ for faster-whisper
		final?: boolean; // Used by whisper.cpp for final segment
	}

	interface Segment {
		text: string;
		start?: number;
		end?: number;
		// faster_whisper specific
		completed?: boolean;
		// whisper.cpp specific
		final?: boolean;
		speaker?: string; // If speaker diarization is enabled
	}

	// --- Props ---
	export let recording: boolean = false; // 양방향 바인딩
	export let serverUrl: string = 'ws://localhost:9090'; // 기본값 하드코딩
	export let language: string = 'ko'; // 기본 한국어
	export let model: string = 'large-v3-turbo'; // 기본 모델
	export let useVad: boolean = true; // VAD 사용 여부

	// --- Internal State ---
	let isConnected: boolean = false;
	let currentFullTranscript: string = '';
	let previousFullTranscript: string = ''; // Stores the transcript when the last 'finalized' event was dispatched
	let statusMessage: string = 'Initializing...';
	let isServerReady: boolean = false;
	let isWorkletReady: boolean = false;

	// --- Refs ---
	let socket: WebSocket | null = null;
	let audioContext: AudioContext | null = null;
	let audioWorkletNode: AudioWorkletNode | null = null;
	let sourceNode: MediaStreamAudioSourceNode | null = null;
	let inputStream: MediaStream | null = null;
	let clientId: string = `web-${generateUUID()}`;

	// --- Helper Functions ---
	function generateUUID(): string {
		// Simple UUID generation (for client ID)
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	// --- WebSocket Logic ---
	const connectWebSocket = () => {
		if (socket && socket.readyState !== WebSocket.CLOSED) {
			console.log('[WhisperLiveClient] Closing existing WebSocket connection.');
			socket.close();
		}
		isConnected = false;
		isServerReady = false;
		currentFullTranscript = '';
		previousFullTranscript = '';
		statusMessage = 'Connecting...';
		dispatch('status', statusMessage);

		console.log(`[WhisperLiveClient] Attempting to connect to ${serverUrl}`);
		socket = new WebSocket(serverUrl);

		socket.onopen = () => {
			console.log('[WhisperLiveClient] WebSocket connected!');
			isConnected = true;
			isServerReady = false; // Reset on new connection
			statusMessage = 'Connected, waiting for server...';
			dispatch('status', statusMessage);
			// Send initial configuration
			socket?.send(
				JSON.stringify({
					uid: clientId,
					language: language,
					task: 'transcribe',
					model: model,
					use_vad: useVad
				})
			);
		};

		socket.onmessage = (event: MessageEvent) => {
			// console.log(`[WhisperLiveClient] Raw message received:`, event.data);
			try {
				if (typeof event.data === 'string') {
					const data: ServerMessageData = JSON.parse(event.data);
					// console.log("[WhisperLiveClient] Parsed JSON data:", data);

					if (data.uid !== clientId) return;

					if (data.message === 'SERVER_READY') {
						console.log('[WhisperLiveClient] SERVER_READY received.');
						isServerReady = true;
						statusMessage = 'Server ready!';
						dispatch('status', statusMessage);
						// Automatically start recording if intended (prop might control this later)
						if (recording) {
							startAudioProcessing();
						}
						return;
					}
					if (data.status === 'WAIT') {
						console.log('[WhisperLiveClient] Server busy message received.');
						statusMessage = `Server busy. Wait: ${Math.round(data.message as number)}s`;
						dispatch('status', statusMessage);
						isServerReady = false;
						stopAudioProcessing(); // Stop local processing if server is busy
						return;
					} else if (data.message === 'DISCONNECT') {
						console.log('[WhisperLiveClient] Server disconnect message received.');
						statusMessage = 'Server disconnected.';
						dispatch('status', statusMessage);
						isServerReady = false;
						socket?.close(); // Close connection fully
						return;
					} else if (data.language) {
						console.log(`[WhisperLiveClient] Language detected: ${data.language}`);
						statusMessage = `Language: ${data.language}`;
						dispatch('status', statusMessage);
					} else if (data.segments && Array.isArray(data.segments)) {
						const incomingFullTranscript = data.segments
							.map((seg: Segment) => seg.text)
							.join(' ')
							.trim();
						currentFullTranscript = incomingFullTranscript; // Update internal state

						// Dispatch current segment (difference from previous finalized)
						let currentSegmentText = '';
						if (
							previousFullTranscript.length > 0 &&
							currentFullTranscript.startsWith(previousFullTranscript)
						) {
							const diffStartIndex =
								previousFullTranscript.length > 0 ? previousFullTranscript.length + 1 : 0;
							if (currentFullTranscript.length >= diffStartIndex) {
								currentSegmentText = currentFullTranscript.substring(diffStartIndex).trim();
							}
						} else {
							currentSegmentText = currentFullTranscript; // First segment or unrelated change
						}
						if (currentSegmentText) {
							dispatch('segment', currentSegmentText);
						}

						// Check for completion/finalization flag
						const lastSegment = data.segments[data.segments.length - 1];
						const isFinal = lastSegment?.completed || lastSegment?.final; // Check both flags

						if (isFinal) {
							// console.log("[WhisperLiveClient] Utterance finalized flag detected.");
							let finalizedText = '';
							if (
								previousFullTranscript.length > 0 &&
								incomingFullTranscript.startsWith(previousFullTranscript)
							) {
								const diffStartIndex =
									previousFullTranscript.length > 0 ? previousFullTranscript.length + 1 : 0;
								if (incomingFullTranscript.length >= diffStartIndex) {
									finalizedText = incomingFullTranscript.substring(diffStartIndex).trim();
								} else {
									console.warn('[WhisperLiveClient] Final flag, but transcript shorter?');
								}
							} else {
								finalizedText = incomingFullTranscript; // First block
							}

							if (finalizedText) {
								// console.log(`[WhisperLiveClient] Dispatching finalized text: "${finalizedText}"`);
								dispatch('finalized', finalizedText);
								previousFullTranscript = incomingFullTranscript; // Update base for next diff
							}
						}
					}
				}
			} catch (error) {
				console.error(
					'[WhisperLiveClient] Error processing message:',
					error,
					'Raw data:',
					event.data
				);
				dispatch('error', `Processing error: ${error.message}`);
			}
		};

		socket.onerror = (event: Event) => {
			console.error('[WhisperLiveClient] WebSocket error:', event);
			isConnected = false;
			recording = false; // Stop recording on error
			isServerReady = false;
			statusMessage = 'Connection error';
			dispatch('status', statusMessage);
			dispatch('error', 'WebSocket connection error.');
		};

		socket.onclose = (event: CloseEvent) => {
			console.log('[WhisperLiveClient] WebSocket closed:', event.reason);
			isConnected = false;
			if (recording) {
				// Ensure recording stops if connection drops
				stopAudioProcessing();
			}
			isServerReady = false;
			statusMessage = 'Disconnected';
			dispatch('status', statusMessage);
		};
	};

	// --- Audio Logic ---
	const initializeAudio = async () => {
		if (!audioContext) {
			try {
				audioContext = new AudioContext();
				console.log('[WhisperLiveClient] AudioContext created.');
				if (audioContext.state === 'suspended') {
					console.log('[WhisperLiveClient] AudioContext suspended. Waiting for user gesture.');
					statusMessage = 'Audio suspended. Click Start.';
					dispatch('status', statusMessage);
				}

				console.log('[WhisperLiveClient] Adding AudioWorklet module...');
				// IMPORTANT: Ensure 'audio-processor.js' is in the correct *static* path
				await audioContext.audioWorklet.addModule('/audio-processor.js');
				console.log('[WhisperLiveClient] AudioWorklet module added.');
				isWorkletReady = true;
				statusMessage = 'Audio ready. Connecting...';
				dispatch('status', statusMessage);
				return true; // Indicate success
			} catch (e) {
				console.error('[WhisperLiveClient] Error initializing AudioContext/Worklet:', e);
				statusMessage = 'Error initializing audio.';
				dispatch('status', statusMessage);
				dispatch('error', `Audio init error: ${e.message}`);
				isWorkletReady = false;
				return false; // Indicate failure
			}
		} else if (!isWorkletReady && audioContext.audioWorklet) {
			// If context exists but worklet wasn't ready (e.g., HMR)
			try {
				await audioContext.audioWorklet.addModule('/audio-processor.js');
				isWorkletReady = true;
				console.log('[WhisperLiveClient] AudioWorklet module re-added.');
				return true;
			} catch (e) {
				console.error('[WhisperLiveClient] Error re-adding Worklet:', e);
				isWorkletReady = false;
				return false;
			}
		}
		return isWorkletReady; // Return current readiness
	};

	const startAudioProcessing = async () => {
		if (!isWorkletReady) {
			statusMessage = 'Audio processor not ready.';
			dispatch('status', statusMessage);
			return;
		}
		if (!isConnected || !isServerReady) {
			statusMessage = 'Server not ready.';
			dispatch('status', statusMessage);
			return;
		}
		if (!audioContext) {
			statusMessage = 'Audio context lost.';
			dispatch('status', statusMessage);
			return;
		}

		// Resume context if suspended (requires user gesture like button click)
		if (audioContext.state === 'suspended') {
			try {
				await audioContext.resume();
				console.log('[WhisperLiveClient] AudioContext resumed.');
			} catch (e) {
				console.error('[WhisperLiveClient] Could not resume AudioContext:', e);
				statusMessage = 'Failed to start audio.';
				dispatch('status', statusMessage);
				dispatch('error', 'Could not resume AudioContext.');
				recording = false; // Update bound prop to reflect failure
				return;
			}
		}
		if (audioContext.state !== 'running') {
			statusMessage = 'Audio context not running.';
			dispatch('status', statusMessage);
			dispatch('error', 'AudioContext is not running.');
			recording = false;
			return;
		}

		// Reset transcripts
		currentFullTranscript = '';
		previousFullTranscript = '';
		statusMessage = 'Starting microphone...';
		dispatch('status', statusMessage);

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			inputStream = stream;

			// Disconnect previous nodes if they exist
			if (sourceNode) {
				sourceNode.disconnect();
				sourceNode = null;
			}
			if (audioWorkletNode) {
				audioWorkletNode.disconnect();
				audioWorkletNode = null;
			}

			audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
			// console.log("[WhisperLiveClient] AudioWorkletNode created.");

			audioWorkletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
				if (recording && isServerReady && socket && socket.readyState === WebSocket.OPEN) {
					socket.send(event.data);
				}
			};
			audioWorkletNode.port.onerror = (event) => {
				console.error('[WhisperLiveClient] Error from AudioWorkletProcessor:', event);
				dispatch('error', 'Audio processor error.');
				stopAudioProcessing(); // Stop on worklet error
			};

			sourceNode = audioContext.createMediaStreamSource(stream);
			sourceNode.connect(audioWorkletNode);
			audioWorkletNode.connect(audioContext.destination); // Connect to output for potential monitoring (optional)
			// console.log("[WhisperLiveClient] Audio graph connected.");

			audioWorkletNode.port.postMessage({ type: 'start' });
			statusMessage = 'Recording...';
			dispatch('status', statusMessage);
		} catch (error) {
			console.error('[WhisperLiveClient] Error starting microphone:', error);
			statusMessage = `Mic Error: ${error.message}`;
			dispatch('status', statusMessage);
			dispatch('error', `Mic error: ${error.message}`);
			stopAudioProcessing(); // Ensure cleanup on error
			recording = false; // Update state back
		}
	};

	const stopAudioProcessing = () => {
		// console.log("[WhisperLiveClient] stopAudioProcessing called...");
		if (!recording && !inputStream && !audioWorkletNode && !sourceNode) {
			// console.log("[WhisperLiveClient] Stop unnecessary: Already stopped.");
			return;
		}

		// Dispatch any remaining text as finalized before stopping everything
		let remainingText = '';
		if (
			previousFullTranscript.length > 0 &&
			currentFullTranscript.startsWith(previousFullTranscript)
		) {
			const diffStartIndex =
				previousFullTranscript.length > 0 ? previousFullTranscript.length + 1 : 0;
			if (currentFullTranscript.length >= diffStartIndex) {
				remainingText = currentFullTranscript.substring(diffStartIndex).trim();
			}
		} else if (currentFullTranscript) {
			// If there was no previous, the whole current is remaining
			remainingText = currentFullTranscript.trim();
		}
		if (remainingText) {
			// console.log(`[WhisperLiveClient] Finalizing remaining text on stop: "${remainingText}"`);
			dispatch('finalized', remainingText);
		}
		currentFullTranscript = '';
		previousFullTranscript = '';

		if (audioWorkletNode) {
			try {
				audioWorkletNode.port.postMessage({ type: 'stop' });
				// console.log("[WhisperLiveClient] Sent stop to worklet.");
				// Disconnect should happen *after* ensuring the stop message is likely processed
				// A small delay might be safest, but often direct disconnect is okay
				setTimeout(() => {
					if (audioWorkletNode) {
						audioWorkletNode.disconnect();
						audioWorkletNode = null;
						// console.log("[WhisperLiveClient] Disconnected worklet node.");
					}
				}, 100); // Short delay
			} catch (e) {
				console.error('[WhisperLiveClient] Error sending stop or disconnecting worklet:', e);
				if (audioWorkletNode) {
					try {
						audioWorkletNode.disconnect();
					} catch (e2) {}
				}
				audioWorkletNode = null;
			}
		}

		if (sourceNode) {
			sourceNode.disconnect();
			sourceNode = null;
			// console.log("[WhisperLiveClient] Disconnected source node.");
		}

		if (inputStream) {
			inputStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
			inputStream = null;
			// console.log("[WhisperLiveClient] Stopped input stream tracks.");
		}

		if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
			// Optionally send a "client_disconnect" message if the protocol supports it
			// socket.send(JSON.stringify({ uid: clientId, type: "client_disconnect" }));
		}

		statusMessage = isConnected ? 'Server ready! Click Start.' : 'Disconnected';
		dispatch('status', statusMessage);
		// No need to set 'recording = false' here, Svelte's binding handles it
	};

	// --- Lifecycle and Reactivity ---
	$: if (recording) {
		// Called when 'recording' prop becomes true
		initializeAudio().then((success) => {
			if (success) {
				if (!isConnected) {
					connectWebSocket(); // Connect WS if audio is ready but not connected
				} else if (isServerReady) {
					startAudioProcessing(); // Start processing if WS already connected and server ready
				}
				// If connected but server not ready, onmessage handler will trigger startAudioProcessing
			} else {
				recording = false; // Set back to false if audio init failed
			}
		});
	} else {
		// Called when 'recording' prop becomes false
		stopAudioProcessing();
	}

	onMount(async () => {
		console.log('[WhisperLiveClient] Mounted.');
		// Initial audio setup is now triggered by the 'recording' prop change $:
		// We can still attempt early connection if needed, or wait for recording toggle.
		// Let's attempt audio init early, connection will happen when ready/recording starts
		await initializeAudio();
		if (isWorkletReady) {
			// If recording is true on mount (e.g., parent state persists), try connecting/starting
			if (recording) {
				if (!isConnected) {
					connectWebSocket();
				} else if (isServerReady) {
					startAudioProcessing();
				}
			}
		}
	});

	onDestroy(() => {
		console.log('[WhisperLiveClient] Destroying.');
		stopAudioProcessing(); // Clean up audio
		socket?.close(); // Clean up WebSocket
		audioContext
			?.close()
			.catch((e) => console.error('[WhisperLiveClient] Error closing AudioContext:', e));
		console.log('[WhisperLiveClient] Cleanup finished.');
	});
</script>

<!-- 이 컴포넌트는 UI를 직접 렌더링하지 않고 로직만 처리합니다. -->
<!-- 필요 시 상태 표시 등을 위한 slot을 추가할 수 있습니다. -->
<!-- <slot {statusMessage}></slot> -->
