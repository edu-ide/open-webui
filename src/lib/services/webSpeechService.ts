import { writable, get, type Writable } from 'svelte/store';

// Type polyfill / augmentation for Web Speech API
declare global {
    interface Window {
        SpeechRecognition: { new(): SpeechRecognition };
        webkitSpeechRecognition: { new(): SpeechRecognition };
    }
    interface SpeechRecognition extends EventTarget {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onstart: (() => void) | null;
        onresult: ((event: SpeechRecognitionEvent) => void) | null;
        onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
        // Add other properties/methods if needed
    }
    interface SpeechRecognitionEvent extends Event {
        readonly resultIndex: number;
        readonly results: SpeechRecognitionResultList;
    }
    interface SpeechRecognitionResultList {
        readonly length: number;
        item(index: number): SpeechRecognitionResult;
        [index: number]: SpeechRecognitionResult;
    }
    interface SpeechRecognitionResult {
        readonly isFinal: boolean;
        readonly length: number;
        item(index: number): SpeechRecognitionAlternative;
        [index: number]: SpeechRecognitionAlternative;
    }
    interface SpeechRecognitionAlternative {
        readonly transcript: string;
        readonly confidence: number;
    }
    interface SpeechRecognitionErrorEvent extends Event {
        readonly error: string; // Note: Standard says SpeechRecognitionErrorCode, but browsers often use string
        readonly message: string;
    }
    // Ensure SpeechRecognitionErrorCode is defined if needed, though often error is just a string
    // type SpeechRecognitionErrorCode = 'no-speech' | 'aborted' | 'audio-capture' | 'network' | 'not-allowed' | 'service-not-allowed' | 'bad-grammar' | 'language-not-supported';
}

// Stores for Web Speech API state
export const webSpeechStatus: Writable<string> = writable('Idle'); // e.g., Idle, Listening, Error, Stopped
export const webSpeechIsRecording: Writable<boolean> = writable(false);
export const webSpeechCurrentSegment: Writable<string> = writable('');
export const webSpeechLastFinalizedText: Writable<string | null> = writable(null);
export const webSpeechError: Writable<string | null> = writable(null);

let recognition: SpeechRecognition | null = null;
let finalTranscript = '';
let interimTranscript = '';

// Check for SpeechRecognition API availability
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const browserSupportsSpeechRecognition = !!SpeechRecognitionImpl;

function initializeRecognition() {
    if (!browserSupportsSpeechRecognition) {
        webSpeechStatus.set('Error: Not Supported');
        console.error('Browser does not support SpeechRecognition API.');
        return;
    }

    if (recognition) {
        console.log('Recognition already initialized.');
        return;
    }

    recognition = new SpeechRecognitionImpl();
    recognition.continuous = true; // Keep listening even after pauses
    recognition.interimResults = true; // Get results while speaking
    // TODO: Make language configurable, perhaps via settings store?
    recognition.lang = 'en-US'; // Default to US English, make this dynamic later

    recognition.onstart = () => {
        webSpeechStatus.set('Listening');
        webSpeechIsRecording.set(true);
        webSpeechError.set(null);
        finalTranscript = '';
        interimTranscript = '';
        webSpeechCurrentSegment.set('');
        webSpeechLastFinalizedText.set(null);
        console.log('Web Speech Recognition started');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
        interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
                // Set finalized text store and clear current segment
                webSpeechLastFinalizedText.set(event.results[i][0].transcript.trim());
                webSpeechCurrentSegment.set(''); // Clear segment after final
            } else {
                interimTranscript += event.results[i][0].transcript;
                // Update current segment store
                webSpeechCurrentSegment.set(interimTranscript);
            }
        }
        console.log('Result - Final:', finalTranscript, 'Interim:', interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error, event.message);
        webSpeechStatus.set(`Error: ${event.error}`);
        webSpeechError.set(event.message || event.error);
        webSpeechIsRecording.set(false);
        // Consider stopping recognition here or based on error type
        if (event.error === 'no-speech' || event.error === 'network') {
            // Optionally try restarting or just stop
            stopRecognition();
        } else {
            stopRecognition(); // Stop on most errors
        }
    };

    recognition.onend = () => {
        console.log('Web Speech Recognition ended.');
        // Only set to Idle if it wasn't stopped due to an error already handled
        webSpeechStatus.update(s => s.startsWith('Error') ? s : 'Idle');
        webSpeechIsRecording.set(false);
        // Don't clear last finalized text here, it should persist
        // Optionally clear current segment if needed, or keep the last interim
        // webSpeechCurrentSegment.set('');
        recognition = null; // Allow re-initialization
    };

    webSpeechStatus.set('Initialized');
}

function startRecognition() {
    if (!browserSupportsSpeechRecognition) {
        console.error('Cannot start: SpeechRecognition not supported.');
        return;
    }

    if (!recognition) {
        console.log('Initializing recognition before starting...');
        initializeRecognition();
        // Need a slight delay for initialization to potentially complete?
        // Or handle state better (e.g., "Initializing")
        // For now, assume initialize is synchronous enough or rely on onstart
    }

    if (recognition && !get(webSpeechIsRecording)) {
        try {
            finalTranscript = '';
            interimTranscript = '';
            recognition.start();
        } catch (e) {
            console.error('Error starting recognition:', e);
            webSpeechStatus.set('Error: Start Failed');
            webSpeechError.set(e instanceof Error ? e.message : String(e));
            webSpeechIsRecording.set(false);
        }
    } else {
        console.log('Recognition already running or not initialized properly.');
    }
}

function stopRecognition() {
    if (recognition && get(webSpeechIsRecording)) {
        try {
            recognition.stop();
            // onend handler will set status and recording flag
        } catch (e) {
            console.error('Error stopping recognition:', e);
            // Force state update if stop fails
            webSpeechStatus.set('Error: Stop Failed');
            webSpeechIsRecording.set(false);
        }
    } else {
        console.log('Recognition not running or not initialized.');
        // Ensure state is correct if called redundantly
        if (!recognition) webSpeechStatus.set('Idle');
        webSpeechIsRecording.set(false);
    }
}

// Ensure recognition is initialized when the service is loaded
// initializeRecognition(); // Or initialize lazily when start is called

// Export the service object
export const webSpeechService = {
    initialize: initializeRecognition,
    start: startRecognition,
    stop: stopRecognition,
    isSupported: browserSupportsSpeechRecognition,
    // Expose stores for external use
    status: webSpeechStatus,
    isRecording: webSpeechIsRecording,
    currentSegment: webSpeechCurrentSegment,
    lastFinalizedText: webSpeechLastFinalizedText,
    error: webSpeechError
};

// Type definition for the service (optional but good practice)
export type WebSpeechService = typeof webSpeechService; 