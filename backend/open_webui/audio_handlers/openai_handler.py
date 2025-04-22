# backend/open_webui/audio_handlers/openai_handler.py
import logging
import json
import os
import requests

# Import necessary functions from the new utils file
from open_webui.utils.audio_utils import get_audio_format, convert_audio_to_wav

log = logging.getLogger(__name__)

def handle_openai_stt(request, file_path: str, filename: str, file_dir: str, id: str, original_extension: str) -> dict:
    """Handles STT using the OpenAI API."""
    log.info(f"[OpenAI STT] Processing file: {file_path}")

    file_to_send = file_path
    cleanup_file = None # File to delete after conversion if needed
    api_filename = filename # Filename to send to the API

    audio_format = get_audio_format(file_path)

    # If format needs conversion (mp4, ogg, or unknown/unsupported)
    if audio_format in ["mp4", "ogg", None] and audio_format != "error":
         converted_wav_path = os.path.join(file_dir, f"{id}_converted.wav") # Use file_dir
         log.info(f"[OpenAI STT] Format '{audio_format or 'unknown'}' requires conversion to WAV -> {converted_wav_path}")
         try:
             conversion_input_format = audio_format if audio_format else None
             convert_audio_to_wav(file_path, converted_wav_path, conversion_input_format)
             file_to_send = converted_wav_path
             cleanup_file = converted_wav_path
             api_filename = os.path.basename(converted_wav_path) # Use converted filename for API
         except Exception as conversion_error:
             log.error(f"[OpenAI STT] Audio conversion failed for {file_path}: {conversion_error}")
             # If conversion fails, maybe try sending original? Or raise error.
             # Raising error is safer as original format likely won't work either.
             raise Exception(f"Audio conversion failed: {conversion_error}")

    elif audio_format == "webm" or audio_format == "wav":
         log.info(f"[OpenAI STT] Format '{audio_format}' is directly supported. Sending original.")
         # file_to_send remains the original file_path
         # api_filename remains the original filename
    elif audio_format == "error":
         log.error(f"[OpenAI STT] Could not determine audio format for {file_path} or file not found.")
         raise Exception("Could not process audio file: format check failed.")

    r = None
    try:
        log.info(f"[OpenAI STT] Sending file '{os.path.basename(file_to_send)}' (API filename: {api_filename}) to API.")
        with open(file_to_send, "rb") as audio_file_handle:
            files_data = {'file': (api_filename, audio_file_handle)}
            data_payload = {'model': request.app.state.config.STT_MODEL}

            r = requests.post(
                url=f"{request.app.state.config.STT_OPENAI_API_BASE_URL}/audio/transcriptions",
                headers={
                    "Authorization": f"Bearer {request.app.state.config.STT_OPENAI_API_KEY}"
                },
                files=files_data,
                data=data_payload,
            )
        r.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        data = r.json()
        log.info(f"[OpenAI STT] Successfully received transcription from API.")

        # Save the transcript
        transcript_file = os.path.join(file_dir, f"{id}.json")
        try:
            with open(transcript_file, "w") as f:
                json.dump(data, f)
            log.info(f"[OpenAI STT] Transcript saved to {transcript_file}")
        except Exception as e:
            log.error(f"[OpenAI STT] Failed to save transcript file {transcript_file}: {e}")

        return data
    except requests.exceptions.RequestException as e:
        log.exception(f"[OpenAI STT] Error during API call: {e}")
        detail = f"Error connecting to OpenAI API: {e}"
        if r is not None:
            try:
                # Try to get more specific error from response
                res_json = r.json()
                if "error" in res_json:
                    detail = f"External API Error: {res_json['error'].get('message', r.text)}"
                else:
                    detail = f"External API Error: Status {r.status_code}, Response: {r.text[:200]}" # Limit response length
            except ValueError: # Handle cases where response is not JSON
                detail = f"External API Error: Status {r.status_code}, Response: {r.text[:200]}"
        raise Exception(detail)
    except Exception as e:
        log.exception(f"[OpenAI STT] An unexpected error occurred: {e}")
        raise Exception(f"An unexpected error occurred during OpenAI STT: {e}")

    finally:
         # Ensure cleanup happens even if API call fails after conversion
         if cleanup_file and os.path.exists(cleanup_file):
             try:
                 os.remove(cleanup_file)
                 log.info(f"[OpenAI STT] Cleaned up temporary converted file: {cleanup_file}")
             except Exception as cleanup_error:
                 log.error(f"[OpenAI STT] Error cleaning up temp file {cleanup_file}: {cleanup_error}") 