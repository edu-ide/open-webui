import logging
import os
from pydub import AudioSegment
from pydub.utils import mediainfo

# Import necessary config values or pass them as arguments if needed
from open_webui.config import (
    WHISPER_MODEL_AUTO_UPDATE,
    WHISPER_MODEL_DIR,
)
from open_webui.env import (
    DEVICE_TYPE,
)

log = logging.getLogger(__name__)

# --- Utility Functions Moved Here ---

def get_audio_format(file_path):
    """Check if the given file needs to be converted or is already supported."""
    if not os.path.isfile(file_path):
        log.error(f"[Audio Utils] File not found: {file_path}")
        return "error"

    try:
        info = mediainfo(file_path)
        format_name = info.get("format_name", "").lower()
        log.debug(f"[Audio Utils] mediainfo for {file_path}: format_name='{format_name}'")

        if "aac" in info.get("codec_name", "").lower() and "mp4" in format_name:
             log.info(f"[Audio Utils] Detected MP4 (AAC) format for {file_path}. Needs conversion.")
             return "mp4"
        elif "ogg" in format_name:
             log.info(f"[Audio Utils] Detected OGG format for {file_path}. Needs conversion.")
             return "ogg"
        elif "matroska" in format_name or "webm" in format_name:
             log.info(f"[Audio Utils] Detected WebM/Matroska format for {file_path}. Directly supported.")
             return "webm"
        elif "wav" in format_name:
             log.info(f"[Audio Utils] Detected WAV format for {file_path}. Directly supported.")
             return "wav"
        else:
             log.warning(f"[Audio Utils] Unknown or potentially unsupported format '{format_name}' for {file_path}.")
             return None # Let the handler decide based on API support
    except Exception as e:
        log.error(f"[Audio Utils] Error getting media info for {file_path}: {e}")
        return "error"

def convert_audio_to_wav(file_path, output_path, conversion_type=None):
    """Convert audio file to WAV format. conversion_type is optional."""
    try:
        if conversion_type:
             audio = AudioSegment.from_file(file_path, format=conversion_type)
        else:
             # Let pydub guess the format if not provided
             audio = AudioSegment.from_file(file_path)
        audio.export(output_path, format="wav")
        log.info(f"[Audio Utils] Converted {file_path} (format: {conversion_type or 'guessed'}) to {output_path}")
    except Exception as e:
        log.error(f"[Audio Utils] Conversion failed from {file_path} to {output_path}: {e}")
        raise # Re-raise the exception

def set_faster_whisper_model(model: str, auto_update: bool = False):
    """Loads or initializes the Faster-Whisper model."""
    whisper_model = None
    if model:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            log.error("faster_whisper is not installed. Please install it to use the local STT engine.")
            return None

        faster_whisper_kwargs = {
            "model_size_or_path": model,
            "device": DEVICE_TYPE if DEVICE_TYPE and DEVICE_TYPE == "cuda" else "cpu",
            "compute_type": "int8", # Consider making this configurable
            "download_root": WHISPER_MODEL_DIR,
            "local_files_only": not auto_update,
        }
        log.info(f"[Audio Utils] Attempting to load Faster-Whisper model with kwargs: {faster_whisper_kwargs}")
        try:
            whisper_model = WhisperModel(**faster_whisper_kwargs)
            log.info(f"[Audio Utils] Successfully loaded Faster-Whisper model '{model}'")
        except Exception as e1:
            log.warning(
                f"[Audio Utils] WhisperModel initialization failed with local_files_only=True ({e1}), attempting download..."
            )
            faster_whisper_kwargs["local_files_only"] = False
            try:
                whisper_model = WhisperModel(**faster_whisper_kwargs)
                log.info(f"[Audio Utils] Successfully loaded Faster-Whisper model '{model}' after download attempt.")
            except Exception as e2:
                 log.error(f"[Audio Utils] Failed to load Faster-Whisper model '{model}' even after download attempt: {e2}")
                 # Depending on desired behavior, could raise error or return None
                 # raise RuntimeError(f"Could not load whisper model {model}: {e2}") from e2
                 return None
    return whisper_model 