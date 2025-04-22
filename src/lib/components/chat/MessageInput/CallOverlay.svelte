<script lang="ts">
	import { config, models, settings, showCallOverlay, TTSWorker } from '$lib/stores';
	import { onMount, tick, getContext, onDestroy, createEventDispatcher } from 'svelte';
	import { useMachine } from '@xstate/svelte';

	const dispatch = createEventDispatcher();

	import { blobToFile } from '$lib/utils';
	import { generateEmoji } from '$lib/apis';
	import { synthesizeOpenAISpeech, transcribeAudio } from '$lib/apis/audio';

	import { toast } from 'svelte-sonner';

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import VideoInputMenu from './CallOverlay/VideoInputMenu.svelte';
	import { KokoroWorker } from '$lib/workers/KokoroWorker';
    // Import the new TTS machine
    import { ttsMachine, type TTSContext } from '$lib/machines/ttsMachine';
    // Import the new Call machine
    import { callMachine } from '$lib/machines/callMachine';
    // Import the new STT machine
    import { sttMachine, type SttContext } from '$lib/machines/sttMachine';
	import type { ActorRefFrom } from 'xstate';

	// --- Type Helper ---
	function assertIs<T extends Element>(element: Element | null, constructor: new () => T): T | null {
		if (element && element instanceof constructor) {
			return element;
		}
		return null;
	}

	const i18n = getContext<any>('i18n');

	export let eventTarget: EventTarget;
	export let submitPrompt: Function;
	export let stopResponse: Function; // Keep this prop to stop backend generation
	export let files;
	export let chatId;
	export let modelId;

	let wakeLock: any = null;
	let model: any = null;

	let loading = false; // Keep for transcription loading (might be combined later)
	// let interrupted = false; // Replaced by TTS machine state/events
	// let assistantSpeaking = false; // Replaced by TTS machine state/events

	// let emoji = null; // Replaced by TTS machine context
	let camera = false;
	let cameraStream: MediaStream | null = null;

	let chatStreaming = false; // Keep track of backend streaming

	let videoElement: HTMLVideoElement | null = null;
	let canvasElement: HTMLCanvasElement | null = null;
	let audioElement: HTMLAudioElement | null = null; // Used by TTS machine via context/logic if needed

	// --- State Machines ---

    // TTS Machine - Pass necessary functions/config as input
    const { snapshot: ttsSnapshot, send: sendTts } = useMachine(ttsMachine, {
        input: {
            // Pass static config and potentially reactive refs/stores
            ttsSettings: $settings?.audio, // Pass the whole audio settings object
            configSettings: undefined, // $config doesn't have audio settings
            apiConfig: {
                token: localStorage.token, // Get token at instantiation time
                modelId: modelId,
                chatId: chatId,
            },
            // Pass functions directly
            generateEmoji: generateEmoji,
            synthesizeSpeech: synthesizeOpenAISpeech,
            ttsWorker: $TTSWorker, // Pass the worker instance
        }
    });

    // Call Machine
    const { snapshot: callSnapshot, send: sendCall } = useMachine(callMachine);

    // STT Machine
    const { snapshot: sttSnapshot, send: sendStt } = useMachine(sttMachine, {
        input: {
            // Pass transcription function and token
            transcribeFn: transcribeAudio,
            apiToken: localStorage.token, // Get token at instantiation
            // Optionally pass custom sensitivity/silence duration
            // minDecibels: -50, // Example
            // silenceDuration: 2000 // Example
        }
    });

	// Reactive aliases for easier template access
    $: ttsStateValue = $ttsSnapshot.value;
    $: ttsContext = $ttsSnapshot.context;
    $: currentEmoji = $ttsSnapshot.context.currentEmoji; // For template display
    $: assistantSpeaking = $ttsSnapshot.matches('speaking'); // Derive from TTS machine state
    $: callStateValue = $callSnapshot.value; // Alias for call machine state
    $: sttStateValue = $sttSnapshot.value; // Alias for STT machine state
    $: sttContextState = $sttSnapshot.context; // Alias for STT context

	// --- Camera Variables ---
	let videoInputDevices: MediaDeviceInfo[] = [];
	let selectedVideoInputDeviceId: string | null = null;

	// --- Functions ---

	const getVideoInputDevices = async () => {
		// ... (getVideoInputDevices logic remains the same)
		const devices = await navigator.mediaDevices.enumerateDevices();
		videoInputDevices = devices.filter((device) => device.kind === 'videoinput');

		if (!!navigator.mediaDevices.getDisplayMedia) {
			videoInputDevices = [
				...videoInputDevices,
				{
					deviceId: 'screen',
					label: 'Screen Share',
					kind: 'videoinput',
					groupId: 'screen',
					toJSON: function() { return this; }
				} as MediaDeviceInfo
			];
		}

		console.log(videoInputDevices);
		if (selectedVideoInputDeviceId === null && videoInputDevices.length > 0) {
			selectedVideoInputDeviceId = videoInputDevices[0].deviceId;
		}
	};

	const startCamera = async () => {
		// ... (startCamera logic remains the same)
		await getVideoInputDevices();

		if (cameraStream === null) {
			camera = true;
			await tick();
			try {
				await startVideoStream();
			} catch (err: any) {
				console.error('Error accessing webcam: ', err);
				toast.error(`Error accessing webcam: ${err.message}`);
				camera = false;
			}
		}
	};

	const startVideoStream = async () => {
		// ... (startVideoStream logic remains the same)
        const video = videoElement;
		if (video) {
			if (selectedVideoInputDeviceId === 'screen') {
				if (!navigator.mediaDevices.getDisplayMedia) {
					console.error('Screen sharing not supported by this browser.');
					toast.error('Screen sharing not supported by this browser.');
					return;
				}
				cameraStream = await navigator.mediaDevices.getDisplayMedia({
					video: {
					},
					audio: false
				});
			} else {
				cameraStream = await navigator.mediaDevices.getUserMedia({
					video: {
						deviceId: selectedVideoInputDeviceId ? { exact: selectedVideoInputDeviceId } : undefined
					}
				});
			}

			if (cameraStream) {
				await getVideoInputDevices();
				video.srcObject = cameraStream;
				await video.play();
			}
		}
	};

	const stopVideoStream = async () => {
		// ... (stopVideoStream logic remains the same)
		if (cameraStream) {
			const tracks = cameraStream.getTracks();
			tracks.forEach((track) => track.stop());
		}
		if (videoElement) {
			videoElement.srcObject = null;
		}
		cameraStream = null;
	};

	const takeScreenshot = (): string | null => {
		// ... (takeScreenshot logic remains the same)
        const video = videoElement;
		const canvas = canvasElement;

		if (!canvas || !video || video.readyState < video.HAVE_METADATA) {
			console.error("Canvas or Video element not found or video not ready for screenshot.");
			return null;
		}

		const context = canvas.getContext('2d');
		if (!context) {
			console.error("Failed to get 2D context from canvas.");
			return null;
		}

		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

		try {
		const dataURL = canvas.toDataURL('image/png');
			console.log("Screenshot Data URL length:", dataURL.length);
		return dataURL;
		} catch (e) {
			console.error("Error generating screenshot data URL:", e);
			return null;
		}
	};

	const stopCamera = async () => {
		// ... (stopCamera logic remains the same)
		await stopVideoStream();
		camera = false;
	};

    // --- Event Handlers ---

	const chatStartHandler = async (e: Event) => {
		const { id } = (e as CustomEvent).detail;
		console.log(`Received chat start event for message ID ${id}`);
		chatStreaming = true;
        // Reset TTS machine for the new message stream
        sendTts({ type: 'RESET' });
        // currentMessageId is now managed within TTS machine if needed, or implicitly by queue
	};

	const chatEventHandler = async (e: Event) => {
		const { id, content } = (e as CustomEvent).detail;
        // Queue the content chunk to the TTS machine
        if (content) {
             console.log(`Queueing TTS content for message ID ${id}: "${content.substring(0,30)}..."`);
             sendTts({ type: 'QUEUE_MESSAGE', item: { id, content } });
        }
	};

	const chatFinishHandler = async (e: Event) => {
		const { id } = (e as CustomEvent).detail;
		console.log(`Received chat finish event for message ID ${id}`);
		chatStreaming = false;
        // finishedMessages is now implicitly handled by the TTS queue becoming empty
	};

    // --- Reactive Effects for STT Machine ---

    // Wire up MediaRecorder events from STT context
	$: {
		const recorder = $sttSnapshot.context.mediaRecorder;
		if (recorder) {
			recorder.ondataavailable = (event: BlobEvent) => {
				if (event.data.size > 0 && $sttSnapshot.matches('recording')) {
					// Send data to STT machine
					console.log(`[CallOverlay] Sending RECORDING_DATA_AVAILABLE, size: ${event.data.size}`);
					sendStt({ type: 'RECORDING_DATA_AVAILABLE', data: event.data });
				}
			};
			recorder.onstop = () => {
				console.log('MediaRecorder stopped (native onstop). STT Machine State:', $sttSnapshot.value);
			};
		}
	}

    // Call Session Machine: Trigger activation when overlay becomes visible
    let overlayJustOpened = false; // Flag to prevent re-triggering on hot reload
    $: {
        if ($showCallOverlay && !overlayJustOpened && $callSnapshot?.matches('idle')) {
            console.log("CallOverlay opened, activating session...");
            // Send ACTIVATE instead of OUTGOING_CALL, no payload needed
            sendCall({ type: 'ACTIVATE' });
            overlayJustOpened = true; // Set flag
        } else if (!$showCallOverlay && overlayJustOpened) {
            overlayJustOpened = false; // Reset flag when overlay closes
        }
    }

    // STT Machine: Handle transcription result
    let previousSttState = $sttSnapshot.value;
    $: {
        if (previousSttState !== 'transcribed' && $sttSnapshot.matches('transcribed')) {
            const transcribedText = $sttSnapshot.context.transcribedText;
            console.log('[CallOverlay] STT Transcribed:', transcribedText);
            if (transcribedText && transcribedText.trim() !== '') {
                // Stop any ongoing TTS before submitting new prompt
                sendTts({ type: 'INTERRUPT' });

                // Add screenshot if camera is on
                if (camera && cameraStream) {
					const imageUrl = takeScreenshot();
					files = imageUrl ? [{ type: 'image', url: imageUrl }] : [];
				} else {
					files = [];
				}

                // Submit the transcribed text
                loading = true; // Show loading indicator while submitting
                console.log('[CallOverlay] Submitting prompt with transcribed text...');
                submitPrompt(transcribedText, { _raw: true })
                    .then((_responses: any) => {
                        console.log('Assistant responses after STT:', _responses);
                        // Responses might trigger TTS via chat events
                    })
                    .catch((error: any) => {
                        console.error("Error submitting prompt after STT:", error);
				        toast.error(`${error.message || error}`);
                    })
                    .finally(() => {
                        loading = false;
                        // Optionally send event back to STT machine to go back to listening?
                        console.log('[CallOverlay] Prompt submission finished. Going back to listening.');
                        sendStt({ type: 'START_LISTENING' });
			});
		} else {
                // Handle empty transcription
                files = [];
                console.log('[CallOverlay] Empty transcription result, going back to listening.');
				toast.info("Couldn't hear anything clearly.");
                // Go back to listening state?
                sendStt({ type: 'START_LISTENING' });
            }
        }
        previousSttState = $sttSnapshot.value;
    }

    // --- Call State Controlled STT Start/Stop ---
    let previousCallState = $callSnapshot.value;
    $: {
        if (previousCallState !== 'active' && $callSnapshot.matches('active')) {
            // Call became active, start STT
            console.log('[CallOverlay] Call active, starting STT...');
            sendStt({ type: 'START_LISTENING', payload: { token: localStorage.token } });
        } else if (previousCallState === 'active' && !$callSnapshot.matches('active')) {
            // Call is no longer active, stop STT
            console.log('[CallOverlay] Call inactive, stopping STT...');
            sendStt({ type: 'STOP_LISTENING' }); // Or RESET depending on desired behavior
            // Maybe also reset the STT machine completely?
             sendStt({ type: 'RESET' });
        }
        previousCallState = $callSnapshot.value;
    }

    // --- Lifecycle ---

	onMount(() => {
		// ... (Wake Lock logic remains the same)
		const setWakeLock = async () => {
			try {
				wakeLock = await navigator.wakeLock.request('screen');
				wakeLock.addEventListener('release', () => {
					console.log('Wake Lock released');
				});
			} catch (err) {
				console.log("Wake Lock request failed:", err);
			}
		};

		if ('wakeLock' in navigator) {
			setWakeLock();
			document.addEventListener('visibilitychange', async () => {
				if (wakeLock !== null && document.visibilityState === 'visible') {
					await setWakeLock();
				}
			});
		}

		model = $models.find((m: any) => m.id === modelId);

        // Update TTS machine config (token might be available now)
         sendTts({
             type: 'UPDATE_CONFIG',
             config: {
                 apiConfig: { token: localStorage.token, modelId, chatId }
                 // Pass other config if needed
             }
         });

		// Attach chat event listeners
		eventTarget.addEventListener('chat:start', chatStartHandler);
		eventTarget.addEventListener('chat', chatEventHandler);
		eventTarget.addEventListener('chat:finish', chatFinishHandler);

		// Cleanup function
		return () => {
			console.log("CallOverlay unmounting - cleanup initiated");

			// Stop state machines
			// REMOVE: sendCall({ type: 'END_CALL' });
            // Stop/Reset STT Machine
            sendStt({ type: 'STOP_LISTENING' }); // Or RESET?
            sendStt({ type: 'RESET' });

			sendTts({ type: 'INTERRUPT' }); // Interrupt any ongoing TTS
			sendTts({ type: 'RESET' });    // Clear queue and state

			stopCamera(); // Ensure camera stops

			// Remove event listeners
			eventTarget.removeEventListener('chat:start', chatStartHandler);
			eventTarget.removeEventListener('chat', chatEventHandler);
			eventTarget.removeEventListener('chat:finish', chatFinishHandler);

			// Release wake lock
			if (wakeLock) {
				wakeLock.release();
				wakeLock = null;
			}
		};
	});

	onDestroy(async () => {
		console.log("CallOverlay onDestroy called");
		// Ensure machines stop and resources are released
		// REMOVE: sendCall({ type: 'END_CALL' });
        // Stop/Reset STT Machine
        sendStt({ type: 'STOP_LISTENING' });
        sendStt({ type: 'RESET' });

		await stopCamera();

		if (wakeLock) {
			wakeLock.release().catch((e: any) => console.error("Error releasing wake lock on destroy:", e));
			wakeLock = null;
		}
	});
</script>

{#if $showCallOverlay}
	<audio id="audioElement" bind:this={audioElement} style="display:none;"></audio>

	<div class="max-w-lg w-full h-full max-h-[100dvh] flex flex-col justify-between p-3 md:p-6">
		{#if camera}
			<!-- Top section when camera is ON -->
			<button
				type="button"
				class="flex justify-center items-center w-full h-20 min-h-20"
				on:click={() => {
					// Interrupt TTS if speaking
					if (assistantSpeaking) {
						sendTts({ type: 'INTERRUPT' });
					}
				}}
				title={assistantSpeaking ? $i18n.t('Tap to interrupt') : ''}
			>
				{#if currentEmoji}
					<div
						class="transition-all rounded-full text-center"
						style="font-size:{$sttSnapshot.context.rmsLevel * 100 > 4 ? '4.5' : $sttSnapshot.context.rmsLevel * 100 > 2 ? '4.25' : $sttSnapshot.context.rmsLevel * 100 > 1 ? '3.75' : '3.5'}rem; width: 100%;"
					>
						{currentEmoji}
					</div>
                {:else if loading || $sttSnapshot.matches('recording') || assistantSpeaking || $ttsSnapshot.matches('fetchingAudio')}
					<!-- Show spinner while loading transcription, recording, assistant speaking, or fetching audio -->
                    <svg
                        class="size-12 {loading ? 'text-gray-900 dark:text-gray-400' : assistantSpeaking ? 'text-green-500' : 'text-blue-500'}"
						viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
						<style>.spinner_qM83{animation:spinner_8HQG 1.05s infinite}.spinner_oXPr{animation-delay:.1s}.spinner_ZTLf{animation-delay:.2s}@keyframes spinner_8HQG{0%,57.14%{animation-timing-function:cubic-bezier(.33,.66,.66,1);transform:translate(0)}28.57%{animation-timing-function:cubic-bezier(.33,0,.66,.33);transform:translateY(-6px)}100%{transform:translate(0)}}</style><circle class="spinner_qM83" cx="4" cy="12" r="3"/><circle class="spinner_qM83 spinner_oXPr" cx="12" cy="12" r="3"/><circle class="spinner_qM83 spinner_ZTLf" cx="20" cy="12" r="3"/>
					</svg>
				{:else}
					<!-- Profile image / Listening indicator (based on STT machine state) -->
					<div
						class="transition-all rounded-full bg-cover bg-center bg-no-repeat {$sttSnapshot.matches('listening') || $sttSnapshot.matches('recording') ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' : ''} {$sttSnapshot.context.rmsLevel * 100 > 4 ? ' size-[4.5rem]' : $sttSnapshot.context.rmsLevel * 100 > 2 ? ' size-16' : $sttSnapshot.context.rmsLevel * 100 > 1 ? 'size-14' : 'size-12'} {(model?.info?.meta?.profile_image_url ?? '/static/favicon.png') !== '/static/favicon.png' ? '' : 'bg-black dark:bg-white'}"
						style={(model?.info?.meta?.profile_image_url ?? '/static/favicon.png') !== '/static/favicon.png'
							? `background-image: url('${model?.info?.meta?.profile_image_url}');`
							: ''}
					/>
				{/if}
			</button>
		{/if}

		<!-- Main Content Area -->
		<div class="flex justify-center items-center flex-1 h-full w-full max-h-full overflow-hidden">
			{#if !camera}
				<!-- Content when camera is OFF -->
				<button
					type="button"
					class="relative flex justify-center items-center"
					on:click={() => {
                        // Interrupt TTS if speaking
						if (assistantSpeaking) {
                            sendTts({ type: 'INTERRUPT' });
						}
					}}
					title={assistantSpeaking ? $i18n.t('Tap to interrupt') : ''}
				>
					{#if currentEmoji}
						<div
							class="transition-all rounded-full text-center"
							style="font-size:{$sttSnapshot.context.rmsLevel * 100 > 4 ? '13' : $sttSnapshot.context.rmsLevel * 100 > 2 ? '12' : $sttSnapshot.context.rmsLevel * 100 > 1 ? '11.5' : '11'}rem; width:100%;"
						>
							{currentEmoji}
						</div>
                     {:else if loading || assistantSpeaking || $ttsSnapshot.matches('fetchingAudio')}
						<!-- Loading/Thinking spinner (large) -->
						<svg class="size-44 text-gray-900 dark:text-gray-400" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
							<style>.spinner_qM83{animation:spinner_8HQG 1.05s infinite}.spinner_oXPr{animation-delay:.1s}.spinner_ZTLf{animation-delay:.2s}@keyframes spinner_8HQG{0%,57.14%{animation-timing-function:cubic-bezier(.33,.66,.66,1);transform:translate(0)}28.57%{animation-timing-function:cubic-bezier(.33,0,.66,.33);transform:translateY(-6px)}100%{transform:translate(0)}}</style><circle class="spinner_qM83" cx="4" cy="12" r="3"/><circle class="spinner_qM83 spinner_oXPr" cx="12" cy="12" r="3"/><circle class="spinner_qM83 spinner_ZTLf" cx="20" cy="12" r="3"/>
						</svg>
					{:else}
						<!-- Profile image / Listening indicator (based on STT machine state) -->
						<div
							class="transition-all rounded-full bg-cover bg-center bg-no-repeat {$sttSnapshot.matches('listening') || $sttSnapshot.matches('recording') ? 'ring-4 ring-blue-500 ring-offset-4 dark:ring-offset-gray-800' : ''} {$sttSnapshot.context.rmsLevel * 100 > 4 ? ' size-52' : $sttSnapshot.context.rmsLevel * 100 > 2 ? 'size-48' : $sttSnapshot.context.rmsLevel * 100 > 1 ? 'size-44' : 'size-40'} {(model?.info?.meta?.profile_image_url ?? '/static/favicon.png') !== '/static/favicon.png' ? '' : 'bg-black dark:bg-white'}"
							style={(model?.info?.meta?.profile_image_url ?? '/static/favicon.png') !== '/static/favicon.png'
								? `background-image: url('${model?.info?.meta?.profile_image_url}');`
								: ''}
						/>
					{/if}
					{#if $sttSnapshot.matches('listening') || $sttSnapshot.matches('recording')}
						<!-- Microphone Icon Overlay when Listening/Recording (based on audio machine) -->
						<div class="absolute inset-0 flex justify-center items-center">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-16 text-white/80 drop-shadow-lg">
								<path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
								<path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.041h3a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1 0-1.5h3v-2.041a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
							</svg>
						</div>
					{/if}
				</button>
			{:else}
                <!-- Camera View -->
				<div class="relative flex video-container w-full max-h-full pt-2 pb-4 md:py-6 px-2 h-full">
					<video id="camera-feed" bind:this={videoElement} autoplay class="rounded-2xl h-full min-w-full object-cover object-center" playsinline muted />
					<canvas id="camera-canvas" bind:this={canvasElement} style="display:none;" />
					<div class=" absolute top-4 md:top-8 left-4">
						<button type="button" class="p-1.5 text-white cursor-pointer backdrop-blur-md bg-black/20 rounded-full hover:bg-black/40 transition-colors" title="Stop Camera" on:click={stopCamera}>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-6"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
						</button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Bottom Control Bar -->
		<div class="flex justify-between items-center pb-2 w-full">
			<!-- Left Button: Camera -->
			<div>
				{#if camera}
					<VideoInputMenu devices={videoInputDevices} on:change={async (e) => { selectedVideoInputDeviceId = e.detail; await stopVideoStream(); await startVideoStream(); }}>
						<button class=" p-3 rounded-full bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" type="button" title="Switch Camera/Screen">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clip-rule="evenodd" /></svg>
						</button>
					</VideoInputMenu>
				{:else}
					<Tooltip content={$i18n.t('Camera')}>
						<button class=" p-3 rounded-full bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" type="button" on:click={async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); stream.getTracks().forEach(track => track.stop()); startCamera(); } catch (err) { console.error("Error requesting camera permission:", err); const errorMessage = err instanceof Error ? err.message : String(err); toast.error(`Camera permission denied or error: ${errorMessage}`); } }}>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg>
						</button>
					</Tooltip>
				{/if}
			</div>

			<!-- Center Status Text -->
			<div>
				<button class="cursor-default" on:click={() => { if (assistantSpeaking) { sendTts({ type: 'INTERRUPT' }); } }}>
					<div class=" line-clamp-1 text-sm font-medium text-center px-4">
						{#if $callSnapshot.matches('error')}
                            <span class="text-red-500">{$i18n.t('Call Error')}: {$callSnapshot.context.errorMessage ?? 'Unknown'}</span>
                        {:else if $sttSnapshot.matches('error')}
                             <span class="text-red-500">{$i18n.t('STT Error')}: {$sttSnapshot.context.errorMessage ?? 'Unknown'}</span>
						{:else if loading}
							{$i18n.t('Thinking...')}
						{:else if assistantSpeaking}
							{$i18n.t('Tap to interrupt')}
						{:else if $sttSnapshot.matches('listening') || $sttSnapshot.matches('recording')}
							{$i18n.t('Listening...')}
                        {:else if $ttsSnapshot.matches('fetchingAudio')}
                             {$i18n.t('Preparing audio...')}
						{:else if $callSnapshot.matches('active') && !assistantSpeaking && !$sttSnapshot.matches('listening') && !$sttSnapshot.matches('recording')}
                            {$i18n.t('Ready')}
						{:else}
							<!-- Idle state (when overlay closed) or default -->
                            {model?.name ?? $i18n.t('Ready')}
						{/if}
					</div>
				</button>
			</div>

			<!-- Right Button: Close Overlay -->
			<div>
				<button class=" p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors" title="End Call" on:click={() => { /* sendAudio({ type: 'STOP' }); */ sendStt({ type: 'STOP_LISTENING' }); sendStt({ type: 'RESET' }); sendTts({ type: 'INTERRUPT' }); sendTts({ type: 'RESET' }); /* sendCall({ type: 'END_CALL' }); */ showCallOverlay.set(false); dispatch('close'); }} type="button">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.29-.077.431 1.57 2.796 4.03 5.256 6.827 6.827.14.086.33.057.43-.078l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clip-rule="evenodd" /></svg>
				</button>
			</div>
		</div>
	</div>
{/if}
