import { get } from 'svelte/store';
import { sttIsRecording, sttStatusMessage, sttError, sttLastFinalizedText, sttCurrentSegment } from '$lib/stores/sttStores';

// --- Type Definitions (WhisperLiveClient와 동일) ---
interface ServerMessageData {
    uid: string;
    status?: 'WAIT';
    message?: string | number;
    language?: string;
    segments?: Segment[];
    backend?: string;
    server_backend?: string;
    transcription_time?: number;
    inference_time?: number;
    final?: boolean;
}

interface Segment {
    text: string;
    start?: number;
    end?: number;
    completed?: boolean;
    final?: boolean;
    speaker?: string;
}

// --- Service State ---
let isConnected: boolean = false;
let currentFullTranscript: string = '';
let previousFullTranscript: string = '';
let isServerReady: boolean = false;
let isWorkletReady: boolean = false;

let socket: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let audioWorkletNode: AudioWorkletNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let inputStream: MediaStream | null = null;
let clientId: string = `web-${generateUUID()}`;

// --- Configuration (하드코딩된 기본값) ---
let config = {
    serverUrl: 'ws://localhost:9090',
    language: 'ko',
    model: 'large-v3-turbo',
    useVad: true,
};

// --- Helper Functions ---
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- WebSocket Logic ---
const connectWebSocket = () => {
    if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.log("[STT Service] Closing existing WebSocket connection.");
        socket.close();
    }
    isConnected = false;
    isServerReady = false;
    currentFullTranscript = '';
    previousFullTranscript = '';
    sttStatusMessage.set('Connecting...');
    sttError.set(null);

    console.log(`[STT Service] Attempting to connect to ${config.serverUrl}`);
    socket = new WebSocket(config.serverUrl);

    socket.onopen = () => {
        console.log("[STT Service] WebSocket connected!");
        isConnected = true;
        isServerReady = false;
        sttStatusMessage.set('Connected, waiting for server...');
        const initialData = {
            uid: clientId,
            language: config.language,
            task: 'transcribe',
            model: config.model,
            use_vad: config.useVad,
            vad_parameters: { "onset": 0.2 }
        };
        console.log("[STT Service] Sending initial data:", initialData);
        socket?.send(JSON.stringify(initialData));
    };

    socket.onmessage = (event: MessageEvent) => {
        console.log("[STT Service] Raw message received:", event.data);
        try {
            if (typeof event.data === 'string') {
                const data: ServerMessageData = JSON.parse(event.data);
                console.log("[STT Service] Parsed message data:", data);
                if (data.uid !== clientId) return;

                if (data.message === "SERVER_READY") {
                    console.log("[STT Service] SERVER_READY received.");
                    isServerReady = true;
                    sttStatusMessage.set('Server ready!');
                    if (get(sttIsRecording)) {
                        startAudioProcessing();
                    }
                    return;
                }
                if (data.status === "WAIT") {
                    console.log("[STT Service] Server busy message received.");
                    sttStatusMessage.set(`Server busy. Wait: ${Math.round(data.message as number)}s`);
                    isServerReady = false;
                    stopAudioProcessing(false);
                    return;
                } else if (data.message === "DISCONNECT") {
                    console.log("[STT Service] Server disconnect message received.");
                    sttStatusMessage.set("Server disconnected.");
                    isServerReady = false;
                    socket?.close();
                    stopAudioProcessing(false);
                    return;
                } else if (data.language) {
                    sttStatusMessage.set(`Language: ${data.language}`);
                }
                else if (data.segments && Array.isArray(data.segments)) {
                    const incomingFullTranscript = data.segments.map((seg: Segment) => seg.text).join(' ').trim();
                    console.log(`[STT Service] Incoming transcript: "${incomingFullTranscript}", Previous: "${previousFullTranscript}"`);
                    currentFullTranscript = incomingFullTranscript;

                    let currentSegmentText = '';
                    if (previousFullTranscript.length > 0 && currentFullTranscript.startsWith(previousFullTranscript)) {
                        const diffStartIndex = previousFullTranscript.length > 0 ? previousFullTranscript.length + 1 : 0;
                        if (currentFullTranscript.length >= diffStartIndex) {
                            currentSegmentText = currentFullTranscript.substring(diffStartIndex).trim();
                        }
                    } else {
                        currentSegmentText = currentFullTranscript;
                    }
                    console.log(`[STT Service] Setting sttCurrentSegment: "${currentSegmentText}"`);
                    sttCurrentSegment.set(currentSegmentText);

                    const lastSegment = data.segments[data.segments.length - 1];
                    const isFinal = lastSegment?.completed || lastSegment?.final;
                    console.log(`[STT Service] Last segment final flag: ${isFinal}`);

                    if (isFinal) {
                        console.log("[STT Service] Processing final segment.");
                        let finalizedText = '';
                        if (previousFullTranscript.length > 0 && incomingFullTranscript.startsWith(previousFullTranscript)) {
                            const diffStartIndex = previousFullTranscript.length > 0 ? previousFullTranscript.length + 1 : 0;
                            if (incomingFullTranscript.length >= diffStartIndex) {
                                finalizedText = incomingFullTranscript.substring(diffStartIndex).trim();
                            } else {
                                console.warn("[STT Service] Final flag, but transcript shorter?");
                            }
                        } else {
                            finalizedText = incomingFullTranscript;
                        }

                        if (finalizedText) {
                            console.log(`[STT Service] Setting sttLastFinalizedText: "${finalizedText}", Updating previousFullTranscript to: "${incomingFullTranscript}"`);
                            sttLastFinalizedText.set(finalizedText);
                            previousFullTranscript = incomingFullTranscript;
                            console.log("[STT Service] Clearing sttCurrentSegment after final.");
                            sttCurrentSegment.set('');
                        } else {
                            console.log("[STT Service] Final flag received but no finalized text generated.");
                        }
                    }
                } else {
                    console.log("[STT Service] Received message without segments.");
                }
            }
        } catch (error) {
            console.error("[STT Service] Error processing message:", error, "Raw data:", event.data);
            sttError.set(`Processing error: ${error.message}`);
            stopAudioProcessing(false);
        }
    };

    socket.onerror = (event: Event) => {
        console.error("[STT Service] WebSocket error:", event);
        isConnected = false;
        isServerReady = false;
        sttError.set('WebSocket connection error.');
        sttStatusMessage.set('Connection error');
        stopAudioProcessing(false);
    };

    socket.onclose = (event: CloseEvent) => {
        console.log("[STT Service] WebSocket closed:", event.reason);
        isConnected = false;
        isServerReady = false;
        sttStatusMessage.set('Disconnected');
        if (get(sttIsRecording)) {
            stopAudioProcessing(false);
        }
    };
};

// --- Audio Logic ---
const initializeAudio = async (): Promise<boolean> => {
    if (audioContext && isWorkletReady) return true;

    try {
        if (!audioContext) {
            audioContext = new AudioContext();
            console.log("[STT Service] AudioContext created.");
        }

        if (audioContext.state === 'suspended') {
            console.log("[STT Service] AudioContext suspended. Waiting for user gesture to resume.");
            sttStatusMessage.set('Audio suspended. Click Start.');
            return false;
        }

        if (!isWorkletReady) {
            await audioContext.audioWorklet.addModule('/audio-processor.js');
            console.log("[STT Service] AudioWorklet module added.");
            isWorkletReady = true;
        }

        sttStatusMessage.set('Audio ready');
        return true;
    } catch (e) {
        console.error("[STT Service] Error initializing AudioContext/Worklet:", e);
        sttError.set(`Audio init error: ${e.message}`);
        sttStatusMessage.set("Error initializing audio.");
        isWorkletReady = false;
        audioContext = null;
        return false;
    }
};

const startAudioProcessing = async () => {
    console.log("[STT Service] startAudioProcessing called.");
    if (!isWorkletReady) { sttStatusMessage.set("Audio processor not ready."); return; }
    if (!isConnected || !isServerReady) { sttStatusMessage.set("Server not ready."); return; }
    if (!audioContext) { sttStatusMessage.set("Audio context lost."); return; }

    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log("[STT Service] AudioContext resumed.");
        } catch (e) {
            console.error("[STT Service] Could not resume AudioContext:", e);
            sttError.set('Could not resume AudioContext.');
            sttStatusMessage.set('Failed to start audio.');
            sttIsRecording.set(false);
            return;
        }
    }
    if (audioContext.state !== 'running') {
        sttError.set('AudioContext is not running.');
        sttStatusMessage.set('Audio context not running.');
        sttIsRecording.set(false);
        return;
    }

    console.log("[STT Service] Resetting transcripts in startAudioProcessing.");
    currentFullTranscript = '';
    previousFullTranscript = '';
    sttLastFinalizedText.set(null);
    sttCurrentSegment.set('');
    sttStatusMessage.set('Starting microphone...');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        inputStream = stream;

        if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
        if (audioWorkletNode) { audioWorkletNode.disconnect(); audioWorkletNode = null; }

        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');

        audioWorkletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (get(sttIsRecording) && isServerReady && socket && socket.readyState === WebSocket.OPEN) {
                socket.send(event.data);
            }
        };
        audioWorkletNode.port.onmessageerror = (event) => {
            console.error("[STT Service] Error from AudioWorkletProcessor port:", event);
            sttError.set('Audio processor port error.');
            stopAudioProcessing(false);
        };

        sourceNode = audioContext.createMediaStreamSource(stream);
        sourceNode.connect(audioWorkletNode);
        audioWorkletNode.connect(audioContext.destination);

        audioWorkletNode.port.postMessage({ type: 'start' });
        sttStatusMessage.set('Recording...');

    } catch (error) {
        console.error("[STT Service] Error starting microphone:", error);
        sttError.set(`Mic error: ${error.message}`);
        sttStatusMessage.set(`Mic Error: ${error.message}`);
        stopAudioProcessing(false);
    }
};

const stopAudioProcessing = (triggeredByUser: boolean) => {
    console.log(`[STT Service] stopAudioProcessing called (triggeredByUser: ${triggeredByUser})`);

    if (!triggeredByUser) {
        sttIsRecording.set(false);
    }

    if (inputStream) {
        inputStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        inputStream = null;
        console.log("[STT Service] Stopped input stream tracks.");
    }
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
        console.log("[STT Service] Disconnected source node.");
    }

    if (audioWorkletNode) {
        try {
            audioWorkletNode.port.postMessage({ type: 'stop' });
            console.log("[STT Service] Sent stop to worklet.");
            const nodeToDisconnect = audioWorkletNode;
            audioWorkletNode = null;
            setTimeout(() => {
                try {
                    nodeToDisconnect.disconnect();
                    console.log("[STT Service] Disconnected worklet node after delay.");
                } catch (e) { }
            }, 100);
        } catch (e) {
            console.error("[STT Service] Error sending stop or disconnecting worklet:", e);
            if (audioWorkletNode) { try { audioWorkletNode.disconnect(); } catch (e2) { } }
            audioWorkletNode = null;
        }
    }

    console.log(`[STT Service] Finalizing text in stopAudioProcessing. Current: "${currentFullTranscript}", Previous: "${previousFullTranscript}"`);
    let remainingText = '';
    if (previousFullTranscript.length > 0 && currentFullTranscript.startsWith(previousFullTranscript)) {
        const diffStartIndex = previousFullTranscript.length > 0 ? previousFullTranscript.length + 1 : 0;
        if (currentFullTranscript.length >= diffStartIndex) {
            remainingText = currentFullTranscript.substring(diffStartIndex).trim();
        }
    } else if (currentFullTranscript) {
        remainingText = currentFullTranscript.trim();
    }

    if (remainingText) {
        console.log(`[STT Service] Setting final sttLastFinalizedText from stop: "${remainingText}"`);
        sttLastFinalizedText.set(remainingText);
    } else {
        console.log("[STT Service] No remaining text to finalize in stop.");
    }
    console.log("[STT Service] Resetting transcripts in stopAudioProcessing.");
    currentFullTranscript = '';
    previousFullTranscript = '';
    sttCurrentSegment.set('');

    if (!isConnected) {
        sttStatusMessage.set('Disconnected');
    } else if (!isServerReady) {
        sttStatusMessage.set('Connected, waiting for server...');
    } else {
        sttStatusMessage.set('Server ready! Click Start.');
    }
};

// --- Public Service Interface ---
export const sttService = {
    /**
     * Whisper Live STT 녹음을 시작합니다.
     * 오디오 컨텍스트 초기화, WebSocket 연결, 오디오 처리를 시작합니다.
     */
    startRecording: async () => {
        console.log("[STT Service] startRecording requested.");
        sttError.set(null);
        const audioReady = await initializeAudio();
        if (!audioReady) {
            console.warn("[STT Service] Audio not fully ready, waiting for user interaction or context resume.");
            if (audioContext?.state === 'suspended') {
                try {
                    await audioContext.resume();
                    console.log("[STT Service] AudioContext resumed on start request.");
                    sttIsRecording.set(true);
                } catch (e) {
                    sttError.set('Failed to resume audio context.');
                    sttStatusMessage.set('Audio Error');
                    return;
                }
            } else {
                return;
            }
        } else {
            sttIsRecording.set(true);
        }
    },

    /**
     * Whisper Live STT 녹음을 중지합니다.
     * 오디오 처리를 중지하고 관련 리소스를 정리합니다. WebSocket 연결은 유지됩니다.
     */
    stopRecording: () => {
        console.log("[STT Service] stopRecording requested.");
        sttIsRecording.set(false);
    },

    /**
     * STT 서비스의 설정을 업데이트합니다. (필요 시 구현)
     * @param newConfig Partial<typeof config>
     */
    updateConfig: (newConfig: Partial<typeof config>) => {
        config = { ...config, ...newConfig };
        console.log("[STT Service] Config updated:", config);
    },

    /**
     * STT 서비스와 관련된 모든 리소스를 정리합니다. (앱 종료 시 등)
     */
    cleanup: () => {
        console.log("[STT Service] Cleanup requested.");
        sttIsRecording.set(false);
        stopAudioProcessing(false);
        socket?.close();
        audioContext?.close().catch(e => console.error("[STT Service] Error closing AudioContext:", e));
        audioContext = null;
        isWorkletReady = false;
        console.log("[STT Service] Cleanup finished.");
    }
};

// --- Reactivity based on sttIsRecording store ---
sttIsRecording.subscribe(recording => {
    console.log(`[STT Service] sttIsRecording changed to: ${recording}`);
    if (recording) {
        // Always attempt to connect when recording starts
        console.log("[STT Service] Recording started, initiating WebSocket connection.");
        // initializeAudio is called within startRecording method before setting the store
        // Ensure worklet is ready before connecting (or handle in connectWebSocket)
        if (isWorkletReady) { // Check if audio context/worklet is ready
            connectWebSocket(); // Always connect/reconnect
        } else {
            console.warn("[STT Service] Recording started but Worklet not ready. Connection deferred until ready.");
            // Perhaps initializeAudio needs to be re-checked or called here if it failed initially?
            // For now, relying on initializeAudio being called before sttIsRecording is set true.
        }
    } else {
        // Triggered when sttIsRecording becomes false
        console.log("[STT Service] sttIsRecording became false, stopping audio processing and closing WebSocket.");
        stopAudioProcessing(true); // Stop local audio processing
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("[STT Service] Closing WebSocket connection.");
            socket.close();
        }
        // Reset flags explicitly on stop
        isConnected = false;
        isServerReady = false;
    }
}); 