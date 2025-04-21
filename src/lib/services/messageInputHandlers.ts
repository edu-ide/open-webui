import type { Writable } from 'svelte/store';
// Use 'any' for Config and Model types to avoid external type dependencies for now
// import type { Config as AppConfig, Model } from '$lib/stores';
type AppConfig = any; // Temporary type
type Model = any; // Temporary type

// Import the actual service object
import { sttService } from '$lib/services/sttService';

// Define the expected shape of the toast object and t function if possible
// Using 'any' for simplicity if exact types are unknown/complex
type ToastFunction = (message: string) => void;
interface ToastObject {
    info: ToastFunction;
    error: ToastFunction;
    warning: ToastFunction;
    success: ToastFunction;
}
type TranslationFunction = (key: string, vars?: object) => string;

interface HandleHeadsetClickParams {
    config: AppConfig | null; // Use temporary type
    selectedModelIds: string[];
    models: Model[]; // Use temporary type
    showCallOverlayStore: Writable<boolean>;
    sttService: typeof sttService;
    i18n_t: TranslationFunction;
    toast: ToastObject;
}

export const handleHeadsetClickService = async ({
    config,
    selectedModelIds,
    models,
    showCallOverlayStore,
    sttService,
    i18n_t,
    toast
}: HandleHeadsetClickParams): Promise<void> => {
    console.log('handleHeadsetClickService invoked - always attempting CallOverlay');
    // @ts-ignore - Temporarily ignore potential type error for config.audio
    const sttEngine = config?.audio?.stt?.engine;
    console.log('STT Engine:', sttEngine);

    console.log('Attempting to show CallOverlay');
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const primaryModelId = selectedModelIds.length > 0 ? selectedModelIds[0] : null;
        const primaryModel = primaryModelId ? models.find((m) => m.id === primaryModelId) : null;

        // @ts-ignore - Temporarily ignore potential type error for vision capability check
        const needsCameraCheck = primaryModel?.info?.meta?.capabilities?.vision ?? false;

        if (needsCameraCheck) {
            try {
                await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (videoError) {
                console.warn('Camera access denied or not available:', videoError);
            }
        }

        if (sttEngine === 'whisper-live') {
            console.log('Starting STT service for whisper-live before showing overlay');
            await sttService.startRecording().catch((err) => {
                console.error('Failed to start STT service for whisper-live:', err);
                toast.error(i18n_t('Failed to start Whisper-Live service.'));
            });
        }

        // @ts-ignore - Temporarily ignore potential type error for config.audio
        if (config?.audio?.tts?.engine === 'browser-kokoro') {
            console.log('Kokoro TTS engine detected. Ensure worker is initialized if needed.');
            // Logic for Kokoro TTS worker initialization might need adjustment/checking
        }

        showCallOverlayStore.set(true);

    } catch (error) {
        console.error('Error accessing media devices:', error);
        toast.error(
            i18n_t('Microphone access denied. Please allow microphone access in your browser settings.')
        );
    }
};