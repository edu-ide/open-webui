import type { Writable } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { config, settings, models as modelsStore, TTSWorker, showCallOverlay, showControls } from '$lib/stores'; // Correct store imports
import { sttService } from '$lib/services/sttService';
import KokoroWorker from '$lib/workers/KokoroWorker?worker';

// Define the expected type for the i18n object passed as an argument
interface I18n {
	t: (key: string, options?: any) => string;
	language?: string; // Add other properties if needed
}

// Accept necessary values and the TTSWorker store as arguments
export async function handleCallButtonClick(
	i18nInstance: I18n,
	selectedModelIds: string[],
	configValue: any, // Use any for now
	settingsValue: any, // Use any for now
	ttsWorkerValue: any, // Use actual TTSWorker type if available
	TTSWorkerStore: Writable<any> // Pass the store itself for .set()
): Promise<void> {
	// No more get() calls here, use the passed arguments directly
	const $i18n = i18nInstance;
	const $config = configValue;
	const $settings = settingsValue;
	const $TTSWorker = ttsWorkerValue;

	console.log('settings', $settings?.audio?.stt?.engine);

	if (!($config && $settings)) {

		// Handle cases where config or settings might be undefined initially
		toast.error($i18n.t('Configuration not loaded yet.'));
		return;
	}

	if (selectedModelIds.length > 1) {
		toast.error($i18n.t('Select only one model to call'));
		return;
	}

	// Check STT engine configuration before proceeding
	if ($config.audio.stt.engine === 'web') {
		toast.error($i18n.t('Call feature is not supported when using Web STT engine'));
		return;
	}

	// If Whisper-Live is the engine, ensure sttService is started
	if ($config.audio.stt.engine === 'whisper-live') {
		try {
			await sttService.startRecording(); // Ensure external STT starts
		} catch (err) {
			console.error('Error starting sttService for CallOverlay:', err);
			toast.error($i18n.t('Could not start Whisper-Live recording.'));
		}
	}

	// check if user has access to getUserMedia
	try {
		let stream = await navigator.mediaDevices.getUserMedia({
			audio: true // Keep requesting audio, might be needed for permissions
		});

		if (stream) {
			const tracks = stream.getTracks();
			tracks.forEach((track) => track.stop());
		}
		stream = null;

		if ($settings.audio?.tts?.engine === 'browser-kokoro') {
			if (!$TTSWorker) {
				// TODO: Verify correct parameters and initialization
				const newTTSWorker = new KokoroWorker({ });
				// await newTTSWorker.init();
				TTSWorkerStore.set(newTTSWorker); // Use the passed store for .set()
			}
		}

		showCallOverlay.set(true);
		showControls.set(true);
	} catch (err) {
		toast.error($i18n.t('Permission denied when accessing media devices'));
	}
} 