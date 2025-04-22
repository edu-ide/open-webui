# backend/open_webui/audio_handlers/deepgram_handler.py
import logging
import json
import os
import requests
import mimetypes

# Import necessary functions from the new utils file
from open_webui.utils.audio_utils import get_audio_format

log = logging.getLogger(__name__)

def handle_deepgram_stt(request, file_path: str, filename: str, file_dir: str, id: str) -> dict:
    """Handles STT using the Deepgram API."""
    log.info(f"[Deepgram STT] Processing file: {file_path}")

    r = None
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            log.error(f"[Deepgram STT] Audio file not found at path: {file_path}")
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        # Determine the MIME type of the file
        mime, _ = mimetypes.guess_type(file_path)
        if not mime:
            audio_format_info = get_audio_format(file_path) # Use helper if guess fails
            if audio_format_info == "webm": mime = "audio/webm"
            elif audio_format_info == "ogg": mime = "audio/ogg"
            elif audio_format_info == "mp4": mime = "audio/mp4"
            elif audio_format_info == "wav": mime = "audio/wav"
            else: mime = "application/octet-stream" # Generic fallback
            log.info(f"[Deepgram STT] Guessed MIME type failed, using determined format/fallback: {mime}")
        else:
            log.info(f"[Deepgram STT] Guessed MIME type: {mime}")

        # Read the audio file data
        with open(file_path, "rb") as f:
            file_data = f.read()

        # Build headers and parameters
        headers = {
            "Authorization": f"Token {request.app.state.config.DEEPGRAM_API_KEY}",
            "Content-Type": mime,
        }

        params = {}
        stt_model = request.app.state.config.STT_MODEL
        if stt_model:
            params["model"] = stt_model
            log.info(f"[Deepgram STT] Using model: {stt_model}")
        else:
            log.info(f"[Deepgram STT] Using default model.")

        # Add other Deepgram parameters if needed (e.g., language, diarize, etc.)
        # params["language"] = "en-US"
        # params["diarize"] = "true"

        log.info(f"[Deepgram STT] Sending request to API with mime: {mime}")
        r = requests.post(
            "https://api.deepgram.com/v1/listen",
            headers=headers,
            params=params,
            data=file_data,
            timeout=60 # Add a timeout
        )
        r.raise_for_status() # Raise HTTPError for bad responses
        response_data = r.json()
        log.info(f"[Deepgram STT] Successfully received response from API.")

        # Extract transcript
        try:
            # Navigate through the Deepgram response structure
            transcript = response_data["results"]["channels"][0]["alternatives"][0].get("transcript", "")
            if not transcript:
                 log.warning("[Deepgram STT] Received empty transcript from Deepgram.")
        except (KeyError, IndexError, TypeError) as e:
            log.error(f"[Deepgram STT] Malformed response from Deepgram: {e}. Response: {response_data}")
            raise Exception("Failed to parse Deepgram response - unexpected format")

        data = {"text": transcript.strip()}

        # Save transcript
        transcript_file = os.path.join(file_dir, f"{id}.json")
        try:
            with open(transcript_file, "w") as f:
                json.dump(data, f)
            log.info(f"[Deepgram STT] Transcript saved to {transcript_file}")
        except Exception as e:
            log.error(f"[Deepgram STT] Failed to save transcript file {transcript_file}: {e}")

        log.debug(f"[Deepgram STT] Transcription result: {data.get('text', '')[:100]}...")
        return data

    except requests.exceptions.RequestException as e:
        log.exception(f"[Deepgram STT] Error during API call: {e}")
        detail = f"Error connecting to Deepgram API: {e}"
        if r is not None:
            try:
                # Try to get more specific error from response
                res_text = r.text
                try: # Try parsing as JSON first
                     res_json = r.json()
                     if "err_code" in res_json or "err_msg" in res_json:
                         detail = f"External API Error: {res_json.get('err_code','')} - {res_json.get('err_msg', res_text)}"
                     elif "error" in res_json:
                         detail = f"External API Error: {res_json['error']}"
                     else:
                         detail = f"External API Error: Status {r.status_code}, Response: {res_text[:200]}"
                except ValueError:
                     detail = f"External API Error: Status {r.status_code}, Response: {res_text[:200]}"
            except Exception:
                detail = f"External API Error: Status {r.status_code}, could not read response."
        raise Exception(detail)
    except Exception as e:
        log.exception(f"[Deepgram STT] An unexpected error occurred: {e}")
        raise Exception(f"An unexpected error occurred during Deepgram STT: {e}") 