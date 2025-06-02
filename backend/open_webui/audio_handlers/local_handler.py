# backend/open_webui/audio_handlers/local_handler.py
import logging
import json
import os

from open_webui.config import WHISPER_MODEL_AUTO_UPDATE
# Import the model loading function from the new utils file
from open_webui.utils.audio_utils import set_faster_whisper_model

log = logging.getLogger(__name__)

def handle_local_stt(request, file_path: str, filename: str, file_dir: str, id: str) -> dict:
    """Handles STT using the local Faster-Whisper model."""
    log.info(f"[Local STT] Processing file: {file_path}")

    # Ensure model is loaded
    if not hasattr(request.app.state, 'faster_whisper_model') or request.app.state.faster_whisper_model is None:
        log.warning("[Local STT] Faster-Whisper model not found in state. Attempting load...")
        # This assumes the config for WHISPER_MODEL is up-to-date in request.app.state.config
        request.app.state.faster_whisper_model = set_faster_whisper_model(
             request.app.state.config.WHISPER_MODEL, WHISPER_MODEL_AUTO_UPDATE
        )
        if request.app.state.faster_whisper_model is None:
             log.error("[Local STT] Failed to load local Faster-Whisper model.")
             raise Exception("Failed to load local Faster-Whisper model.")
        else:
             log.info("[Local STT] Faster-Whisper model loaded successfully.")


    model = request.app.state.faster_whisper_model
    try:
        # Check if file exists before transcribing
        if not os.path.exists(file_path):
            log.error(f"[Local STT] Audio file not found at path: {file_path}")
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        segments, info = model.transcribe(
            file_path,
            beam_size=5,
            vad_filter=request.app.state.config.WHISPER_VAD_FILTER,
        )
        log.info(
            "[Local STT] Detected language '%s' with probability %f"
            % (info.language, info.language_probability)
        )

        transcript = "".join([segment.text for segment in list(segments)])
        data = {"text": transcript.strip()}

        # Save the transcript to a json file
        transcript_file = os.path.join(file_dir, f"{id}.json")
        try:
            with open(transcript_file, "w") as f:
                json.dump(data, f)
            log.info(f"[Local STT] Transcript saved to {transcript_file}")
        except Exception as e:
            log.error(f"[Local STT] Failed to save transcript file {transcript_file}: {e}")
            # Decide if failure to save should halt the process or just be logged

        log.debug(f"[Local STT] Transcription result: {data.get('text', '')[:100]}...") # Log beginning of text
        return data
    except Exception as e:
        log.exception(f"[Local STT] Error during transcription for {file_path}: {e}")
        raise Exception(f"Local STT transcription failed: {e}") 