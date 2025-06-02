import { sttLastFinalizedText } from '$lib/stores/sttStores'; // Assuming path is correct
import type { Unsubscriber } from 'svelte/store';
import { tick } from 'svelte';

// Define the type for the callback function more precisely
type SubmitCallbackOptions = {
	_raw?: boolean;
	files?: any[]; // Use a more specific type if available
};
type SubmitCallback = (text: string, options: SubmitCallbackOptions) => Promise<any>; // Or appropriate return type

let unsubscribe: Unsubscriber | null = null;
let isInitialized = false; // Prevent multiple initializations

interface InitOptions {
	submitPromptCallback: SubmitCallback;
	takeScreenshotCallback: () => string | undefined; // Callback to take screenshot
	getFilesCallback: () => any[]; // Callback to get current files
	setFilesCallback: (files: any[]) => void; // Callback to update files in parent
	setLoadingCallback: (loading: boolean) => void; // Callback to update loading state
	setEmojiCallback: (emoji: string | null) => void; // Callback to update emoji state
	getCameraStreamCallback: () => MediaStream | null; // Callback to get camera stream
}

export function initializeWhisperLive(options: InitOptions): void {
	if (isInitialized) {
		console.warn('WhisperLiveHandler is already initialized.');
		return;
	}
	console.log('Initializing WhisperLiveHandler...');

	const {
		submitPromptCallback,
		takeScreenshotCallback,
		getFilesCallback,
		setFilesCallback,
		setLoadingCallback,
		setEmojiCallback,
		getCameraStreamCallback
	} = options;

	unsubscribe = sttLastFinalizedText.subscribe(async (text) => {
		// Check if the handler is still initialized before processing
		if (!isInitialized) return;

		console.log(`WhisperLiveHandler: sttLastFinalizedText updated: "${text}"`);
		if (text) { // Process only non-null/non-empty text
			// Consume the text immediately
			sttLastFinalizedText.set(null);

			setLoadingCallback(true);
			setEmojiCallback(null);
			let currentFiles = getFilesCallback(); // Get current files via callback

			const cameraStream = getCameraStreamCallback();
			if (cameraStream) {
				const imageUrl = takeScreenshotCallback();
				if(imageUrl) {
					currentFiles = [{ type: 'image', url: imageUrl }];
					setFilesCallback(currentFiles); // Update files in parent via callback
				}
			}

			console.log(`WhisperLiveHandler: Submitting prompt with text: "${text}" and files:`, currentFiles);
			try {
				const _responses = await submitPromptCallback(text, { _raw: true, files: currentFiles });
				console.log('WhisperLiveHandler: Submission response:', _responses);
			} catch (error) {
				console.error("WhisperLiveHandler: Error during submission:", error);
				// Optionally handle submission errors (e.g., show a toast via another callback)
			} finally {
				setLoadingCallback(false);
			}
		}
	});

	isInitialized = true;
	console.log('WhisperLiveHandler initialized successfully.');
}

export function destroyWhisperLive(): void {
	if (unsubscribe) {
		console.log('Destroying WhisperLiveHandler...');
		unsubscribe();
		unsubscribe = null;
	}
	isInitialized = false; // Mark as uninitialized
	console.log('WhisperLiveHandler destroyed.');
} 