<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { sttService } from '$lib/services/sttService';
	import { initializeWhisperLive, destroyWhisperLive } from '$lib/modules/call/whisperLiveHandler';
	import { sttCurrentSegment, sttLastFinalizedText } from '$lib/stores/sttStores';

	// Props from parent CallOverlay
	export let showCallOverlay: boolean;
	export let submitPrompt: (text: string, options: { _raw?: boolean, files?: any[] }) => Promise<any>; // Adjust submitPrompt type if needed
	export let takeScreenshot: () => string | undefined;
	export let setFiles: (files: any[]) => void;
	export let setLoading: (loading: boolean) => void;
	export let setEmoji: (emoji: string | null) => void;
	export let cameraStream: MediaStream | null;
	// We might need a way to get the current 'files' array if submitPrompt in the handler needs it.
	// Option 1: Pass files as prop (might need reactive updates)
	// Option 2: Modify whisperLiveHandler to accept getFilesCallback (like Internal handler)
	export let getFiles: () => any[]; // Using Option 2, aligning with whisperLiveHandler.ts expectation

	let isHandlerInitialized = false;

	function initializeHandler() {
		if (!isHandlerInitialized && showCallOverlay) {
			console.log("WhisperLiveUIHandler: Initializing...");
			initializeWhisperLive({
				submitPromptCallback: submitPrompt,
				takeScreenshotCallback: takeScreenshot,
				getFilesCallback: getFiles, // Pass the function to get files
				setFilesCallback: setFiles,
				setLoadingCallback: setLoading,
				setEmojiCallback: setEmoji,
				getCameraStreamCallback: () => cameraStream
			});
			// Reset STT stores upon initialization for clean start
			sttCurrentSegment.set('');
			sttLastFinalizedText.set(null);
			isHandlerInitialized = true;
			console.log("WhisperLiveUIHandler: Initialized.");
		} else {
			console.log("WhisperLiveUIHandler: Skipping initialization (already initialized or overlay hidden).")
		}
	}

	function destroyHandler() {
		if (isHandlerInitialized) {
			console.log("WhisperLiveUIHandler: Destroying...");
			destroyWhisperLive();
			sttService.stopRecording(); // Ensure STT service is stopped
			isHandlerInitialized = false;
			console.log("WhisperLiveUIHandler: Destroyed.");
		} else {
			console.log("WhisperLiveUIHandler: Skipping destruction (not initialized).")
		}
	}

	onMount(() => {
		console.log("WhisperLiveUIHandler mounted");
		initializeHandler(); // Attempt initialization on mount

		return () => {
			console.log("WhisperLiveUIHandler destroying (onMount cleanup)...");
			destroyHandler(); // Cleanup on component destroy
		};
	});

	// Reactive statement to handle overlay visibility changes after mount
	$: {
		if (showCallOverlay) {
			console.log("WhisperLiveUIHandler: Overlay shown, ensuring handler is initialized.");
			initializeHandler();
		} else {
			console.log("WhisperLiveUIHandler: Overlay hidden, destroying handler.");
			destroyHandler();
		}
	}

</script>

<!-- This component has no UI, it only handles logic --> 