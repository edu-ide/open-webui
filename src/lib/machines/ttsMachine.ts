// src/lib/machines/ttsMachine.ts
import { setup, assign, fromPromise, sendParent, log } from 'xstate';
import type { ActorRefFrom } from 'xstate';

// --- Types ---

interface MessageItem {
	id: string; // Original chat message ID
	content: string; // Sentence/chunk to speak
}

export interface TTSContext {
	messageQueue: MessageItem[];
	audioCache: Map<string, HTMLAudioElement | boolean>; // URL or true for browser synth
	emojiCache: Map<string, string>;
	currentMessageItem: MessageItem | null;
	currentAudio: HTMLAudioElement | SpeechSynthesisUtterance | null;
	currentEmoji: string | null;
	errorMessage: string | null;
	// Config needed for TTS/Emoji (passed as input)
	ttsSettings?: any; // Replace 'any' with actual type from $settings.audio.tts
	configSettings?: any; // Replace 'any' with actual type from $config.audio.tts
	apiConfig?: {
		token: string | null;
		modelId: string;
		chatId: string;
	};
	// Functions/Workers needed (passed as input)
	generateEmoji?: (token: string, modelId: string, content: string, chatId: string) => Promise<string | null>;
	synthesizeSpeech?: (token: string, voice: string, content: string) => Promise<Response | null>; // Backend TTS
	ttsWorker?: { generate: (options: { text: string, voice: string }) => Promise<string | null> }; // Kokoro worker URL expected
}

export type TTSEvent =
	| { type: 'QUEUE_MESSAGE'; item: MessageItem }
	| { type: 'PROCESS_QUEUE' }
	| { type: 'FETCH_FAILED'; content: string; error: string }
	| { type: 'PLAYBACK_ENDED' }
	| { type: 'PLAYBACK_ERROR'; error: string }
	| { type: 'INTERRUPT' }
	| { type: 'RESET' }
	| { type: 'UPDATE_CONFIG'; config: Pick<TTSContext, 'ttsSettings' | 'configSettings' | 'apiConfig' | 'generateEmoji' | 'synthesizeSpeech' | 'ttsWorker'> };


// --- Machine Setup ---

export const ttsMachine = setup({
	types: {
		context: {} as TTSContext,
		events: {} as TTSEvent,
        input: {} as Partial<Pick<TTSContext, 'ttsSettings' | 'configSettings' | 'apiConfig' | 'generateEmoji' | 'synthesizeSpeech' | 'ttsWorker'>>, // Input type for initial config
	},
	actors: {
		// Actor to fetch/prepare audio for a single message item
		fetchAudioActor: fromPromise(async ({ input }: { input: { item: MessageItem, context: TTSContext }}) => {
            const { item, context } = input;
            const { content } = item;
            const { audioCache, emojiCache, ttsSettings, configSettings, apiConfig, generateEmoji, synthesizeSpeech, ttsWorker } = context;

            console.log(`[ttsMachine] Fetching audio for: "${content.substring(0, 30)}..."`);

            if (audioCache.has(content)) {
                console.log(`[ttsMachine] Audio cache hit for: "${content.substring(0, 30)}..."`);
                const audio = audioCache.get(content)!;
                const emoji = emojiCache.get(content) ?? null;
                 // Send event immediately if cached
                 // Need access to self.send here, or handle this differently?
                 // Maybe return immediately instead of sending event?
                return { content, audio, emoji };
            }

            let generatedEmoji: string | null = null;
            let audioData: HTMLAudioElement | boolean = false; // Default to false (error or browser)

            try {
                // 1. Generate Emoji (if enabled) - Assuming settings structure
                const showEmoji = ttsSettings?.showEmojiInCall ?? false;
                if (showEmoji && apiConfig?.token && generateEmoji) {
                    try {
                        generatedEmoji = await generateEmoji(apiConfig.token, apiConfig.modelId, content, apiConfig.chatId);
                        if (generatedEmoji) {
                            emojiCache.set(content, generatedEmoji); // Update cache immediately
                        }
                    } catch(e: any) { console.error("Emoji generation failed:", e); }
                }

                // 2. Synthesize Audio based on engine
                 const engine = ttsSettings?.engine ?? 'backend'; // Default or check config?
                 const backendEngine = configSettings?.engine ?? '';
                 const voice = ttsSettings?.voice ?? configSettings?.voice;

                 if (engine === 'browser-kokoro' && ttsWorker) {
                     const blobUrl = await ttsWorker.generate({ text: content, voice: voice });
                     if (blobUrl) {
                         audioData = new Audio(blobUrl);
                     } else { throw new Error('Kokoro TTS generation failed'); }
                 } else if (backendEngine !== '' && apiConfig?.token && synthesizeSpeech) {
                     const res = await synthesizeSpeech(apiConfig.token, voice, content);
                     if (res) {
                         const blob = await res.blob();
                         const blobUrl = URL.createObjectURL(blob);
                         audioData = new Audio(blobUrl);
                     } else { throw new Error('Backend TTS synthesis failed'); }
                 } else {
                     // Fallback to browser native synthesis (mark as true)
                     console.log("[ttsMachine] Using browser native TTS.");
                     audioData = true;
                 }

                // Cache the result
                audioCache.set(content, audioData);

                return { content, audio: audioData, emoji: generatedEmoji };

            } catch (error: any) {
                 console.error(`[ttsMachine] Error fetching audio for "${content.substring(0, 30)}...":`, error);
                 // Don't cache errors, let it retry next time? Or cache failure?
                 // audioCache.set(content, false); // Mark as failed?
                 throw error; // Rethrow to trigger onError in invoke
            }
		}),

        // Actor to handle actual playback (either SpeechSynthesis or HTMLAudioElement)
        playbackActor: fromPromise(async ({ input }: { input: { audio: HTMLAudioElement | boolean, content: string, emoji: string | null, context: TTSContext }}) => {
            const { audio, content, emoji, context } = input;
            const { ttsSettings } = context;

            if (audio === true) { // Browser native SpeechSynthesis
                await new Promise<void>((resolve, reject) => {
                    let voices: SpeechSynthesisVoice[] = [];
                    const getVoicesLoop = setInterval(() => {
                        voices = speechSynthesis.getVoices();
                        if (voices.length > 0) {
                            clearInterval(getVoicesLoop);
                            const voiceURI = ttsSettings?.voice; // Check actual setting path
                            const voice = voices.find(v => v.voiceURI === voiceURI);
                            const utterance = new SpeechSynthesisUtterance(content);
                            utterance.rate = ttsSettings?.playbackRate ?? 1; // Check actual setting path
                            if (voice) utterance.voice = voice;

                            utterance.onend = () => { console.log("Browser TTS ended"); resolve(); };
                            utterance.onerror = (e) => {
                                console.error("Browser TTS error:", e);
                                const errorMsg = e instanceof SpeechSynthesisErrorEvent ? e.error : 'Unknown TTS Error';
                                // Don't reject for 'interrupted', resolve instead
                                if (errorMsg === 'interrupted') {
                                    console.log("Browser TTS interrupted.");
                                    resolve();
                                } else {
                                    reject(new Error(errorMsg));
                                }
                            };
                             // Store utterance reference in context? Might be tricky with actor scope
                             // context.currentAudio = utterance; // This context is local to actor?
                             speechSynthesis.speak(utterance);
                         }
                     }, 50);
                 });
             } else { // HTMLAudioElement playback
                const audioElement = audio as HTMLAudioElement;
                 await new Promise<void>((resolve, reject) => {
                     // Assume audioElement is pre-configured outside if needed, or configure here
                     audioElement.playbackRate = ttsSettings?.playbackRate ?? 1; // Check setting path
                     audioElement.onended = () => { console.log("AudioElement ended"); resolve(); };
                     audioElement.onerror = (e) => { console.error("AudioElement error:", e); reject(e); };
                     // context.currentAudio = audioElement;
                     audioElement.play().catch(reject); // Start playing
                 });
             }
             // Short delay after playback finishes naturally
             await new Promise(r => setTimeout(r, 50));
         }),
	},
	actions: {
		enqueue: assign({
			messageQueue: ({ context, event }) => {
				if (event.type === 'QUEUE_MESSAGE') {
                    // Avoid adding duplicates? Or handle based on ID?
					return [...context.messageQueue, event.item];
				}
				return context.messageQueue;
			}
		}),
        // Assigns the next message to process and removes it from queue
        dequeueAndAssign: assign({
            messageQueue: ({ context }) => context.messageQueue.slice(1),
            currentMessageItem: ({ context }) => context.messageQueue[0] ?? null,
            currentAudio: null, // Clear previous audio/emoji
            currentEmoji: null,
            errorMessage: null, // Clear previous error
        }),
        assignAudioAndEmoji: assign({
            // This might not be needed if fetchAudioActor returns data handled by invoke.onDone
            // Kept for potential direct caching logic
             audioCache: ({ context, event }) => {
                 if (event.type === 'AUDIO_READY') {
                     context.audioCache.set(event.content, event.audio);
                 }
                 return context.audioCache; // Return the map itself
             },
            emojiCache: ({context, event}) => {
                if (event.type === 'AUDIO_READY' && event.emoji) {
                    context.emojiCache.set(event.content, event.emoji);
                }
                return context.emojiCache;
            }
        }),
        assignCurrentAudio: assign({
             currentAudio: ({ event }) => {
                 if (event.type === 'PLAYBACK_STARTED') return event.audio;
                 return null;
             },
             currentEmoji: ({event}) => {
                 if (event.type === 'PLAYBACK_STARTED') return event.emoji;
                 return null;
             }
        }),
		clearCurrentAudio: assign({
			currentAudio: null,
            currentEmoji: null,
            currentMessageItem: null,
		}),
        assignError: assign({
            errorMessage: ({ event }) => {
                 if (event.type === 'FETCH_FAILED') return event.error;
                 if (event.type === 'PLAYBACK_ERROR') return event.error;
                 // Handle invoke errors from onError transitions if needed
                 if ('error' in event && event.error instanceof Error) return event.error.message;
                 if ('error' in event) return String(event.error);
                 return 'An unknown TTS error occurred';
            }
        }),
		stopPlaybackAction: ({ context }) => {
            console.log("[ttsMachine] Stopping playback action...");
			const { currentAudio } = context;
			if (currentAudio instanceof SpeechSynthesisUtterance) {
                console.log("[ttsMachine] Cancelling SpeechSynthesis...");
				speechSynthesis.cancel();
			} else if (currentAudio instanceof HTMLAudioElement) {
                 console.log("[ttsMachine] Pausing HTMLAudioElement...");
				currentAudio.pause();
				currentAudio.currentTime = 0;
                // Detach src to release resources?
                // currentAudio.src = "";
			}
		},
        clearQueue: assign({ messageQueue: [] }),
        updateConfig: assign(({ event }) => {
             if (event.type === 'UPDATE_CONFIG') {
                 // Selectively assign only the provided config keys
                 const { ttsSettings, configSettings, apiConfig, generateEmoji, synthesizeSpeech, ttsWorker } = event.config;
                 return {
                     ...(ttsSettings && { ttsSettings }),
                     ...(configSettings && { configSettings }),
                     ...(apiConfig && { apiConfig }),
                     ...(generateEmoji && { generateEmoji }),
                     ...(synthesizeSpeech && { synthesizeSpeech }),
                     ...(ttsWorker && { ttsWorker }),
                 };
             }
             return {};
        }),
        logContext: ({context}) => console.log("[ttsMachine] Context:", context),
        logError: ({context}) => console.error("[ttsMachine] Error State:", context.errorMessage),
	},
    guards: {
        isQueueNotEmpty: ({ context }) => context.messageQueue.length > 0,
        isAudioCached: ({ context, event }) => {
            // Guard needs access to the item being processed, maybe check currentMessageItem?
            const item = context.currentMessageItem;
             return !!item && context.audioCache.has(item.content);
        }
    }
}).createMachine({
	id: 'tts',
	context: ({ input }) => ({ // Initialize context from input
		messageQueue: [],
		audioCache: new Map<string, HTMLAudioElement | boolean>(),
		emojiCache: new Map<string, string>(),
		currentMessageItem: null,
		currentAudio: null,
        currentEmoji: null,
		errorMessage: null,
        // Initialize from input, provide defaults if needed
        ttsSettings: input?.ttsSettings ?? {},
        configSettings: input?.configSettings ?? {},
        apiConfig: input?.apiConfig ?? undefined,
        generateEmoji: input?.generateEmoji ?? undefined,
        synthesizeSpeech: input?.synthesizeSpeech ?? undefined,
        ttsWorker: input?.ttsWorker ?? undefined,
	}),
	initial: 'idle',
	states: {
		idle: {
             entry: ['clearCurrentAudio'],
			 on: {
				QUEUE_MESSAGE: { actions: 'enqueue', target: 'processingQueue' },
                PROCESS_QUEUE: 'processingQueue', // Allow manual trigger
                RESET: { actions: ['clearQueue', 'clearCurrentAudio'] },
                UPDATE_CONFIG: { actions: 'updateConfig'}
			 }
		},
        // Decides what to do next based on the queue
        processingQueue: {
             entry: log("Processing queue..."),
             always: [
                 { target: 'idle', guard: ({context}) => context.messageQueue.length === 0, actions: log("Queue empty, back to idle.") },
                 // If queue not empty, dequeue and move to fetching
                 { target: 'fetchingAudio', actions: ['dequeueAndAssign', log("Dequeued message, fetching audio.")] }
             ]
        },
        // Fetches or retrieves audio from cache
		fetchingAudio: {
             invoke: {
                 id: 'fetchAudioActor',
                 src: 'fetchAudioActor',
                 input: ({ context }) => ({ item: context.currentMessageItem!, context }),
                 onDone: {
                     target: 'speaking',
                     actions: [
                         // Assign fetched data AND currentAudio/Emoji here
                         assign({
                             currentMessageItem: ({ context }) => context.currentMessageItem, // Keep current item info
                             currentAudio: ({ event }) => {
                                 // event is DoneActorEvent from fetchAudioActor
                                 // event.output = { content, audio, emoji }
                                 const audioData = event.output.audio;
                                 // If browser synth (true), create utterance now for context
                                 if (audioData === true) {
                                     // Check if SpeechSynthesisUtterance is available
                                     if (typeof SpeechSynthesisUtterance !== 'undefined') {
                                         return new SpeechSynthesisUtterance(event.output.content);
                                     } else {
                                         console.warn("SpeechSynthesisUtterance not supported, cannot set context.");
                                         return null; // Or handle appropriately
                                     }
                                 }
                                 // Type guard for HTMLAudioElement
                                 if (audioData instanceof HTMLAudioElement) {
                                    return audioData;
                                 }
                                 // Handle potential false or unexpected types
                                 console.warn("Unexpected audio data type in fetchAudioActor onDone:", audioData);
                                 return null;
                             },
                             currentEmoji: ({ event }) => event.output.emoji,
                             // Update caches
                             audioCache: ({ context, event }) => {
                                 context.audioCache.set(event.output.content, event.output.audio);
                                 return context.audioCache;
                             },
                             emojiCache: ({ context, event }) => {
                                 if (event.output.emoji) {
                                      context.emojiCache.set(event.output.content, event.output.emoji);
                                 }
                                 return context.emojiCache;
                             }
                         }),
                         log("Audio fetch successful, moving to speaking.")
                     ]
                 },
                 onError: {
                     target: 'error', // Go to error state on fetch failure
                     actions: ['assignError', log("Audio fetch failed.")]
                 }
             },
             on: {
                // Allow interruption while fetching
                INTERRUPT: { target: 'idle', actions: ['stopPlaybackAction', 'clearQueue', log("Interrupted while fetching.")] },
                RESET: { target: 'idle', actions: ['clearQueue', 'clearCurrentAudio']}
            }
		},
        // Plays the fetched audio
		speaking: {
            invoke: {
                id: 'playbackActor',
                src: 'playbackActor',
                input: ({ context }) => { // Input now only needs context
                    // Get audio/content/emoji from context, assigned in previous step
                    const { currentMessageItem, currentEmoji } = context;
                    if (!currentMessageItem) {
                        console.error("Missing currentMessageItem for playback");
                        throw new Error("Missing currentMessageItem for playback");
                    }

                    // Retrieve the audio source (HTMLAudioElement or boolean) from the cache
                    const audioSource = context.audioCache.get(currentMessageItem.content);
                    if (audioSource === undefined) {
                        console.error("Audio not found in cache for playback:", currentMessageItem.content);
                        throw new Error("Audio not found in cache for playback");
                    }

                    return {
                        audio: audioSource, // Pass original boolean or AudioElement
                        content: currentMessageItem.content,
                        emoji: currentEmoji,
                        context: context,
                        // REMOVE self
                    };
                },
                onDone: {
                    target: 'processingQueue', // After playing, process next item
                    actions: ['clearCurrentAudio', log("Playback finished, processing queue.")]
                },
                onError: {
                    target: 'error', // Go to error on playback failure
                    actions: ['assignError', 'clearCurrentAudio', log("Playback failed.")]
                }
            },
			on: {
				INTERRUPT: { target: 'idle', actions: ['stopPlaybackAction', 'clearQueue', log("Interrupted while speaking.")] },
                RESET: { target: 'idle', actions: ['stopPlaybackAction', 'clearQueue', 'clearCurrentAudio']}
                // PLAYBACK_STARTED event is sent *by* the actor, not handled here
			}
		},
        error: {
             entry: 'logError',
             on: {
                 // Allow restarting the queue processing after an error
                 PROCESS_QUEUE: 'processingQueue',
                 RESET: { target: 'idle', actions: ['clearQueue', 'clearCurrentAudio']}
             }
        }
	}
});