import logging
import json
import os
import requests
import time

from fastapi import HTTPException

# Import necessary functions from the main audio router file
from open_webui.utils.audio_utils import get_audio_format, convert_audio_to_wav

log = logging.getLogger(__name__)

# Define Azure specific constants here
AZURE_MAX_FILE_SIZE_MB = 200
AZURE_MAX_FILE_SIZE = AZURE_MAX_FILE_SIZE_MB * 1024 * 1024

# Azure Batch Transcription requires polling, define constants
AZURE_POLLING_INTERVAL_SECONDS = 5
AZURE_POLLING_TIMEOUT_SECONDS = 300 # 5 minutes timeout for the job

def poll_for_transcription_results(transcription_url: str, api_key: str) -> dict:
    """Polls the Azure Batch Transcription API for results."""
    start_time = time.time()
    while True:
        if time.time() - start_time > AZURE_POLLING_TIMEOUT_SECONDS:
            log.error(f"[Azure STT] Polling timed out after {AZURE_POLLING_TIMEOUT_SECONDS} seconds for URL: {transcription_url}")
            raise TimeoutError("Azure transcription job polling timed out.")

        log.debug(f"[Azure STT] Polling job status at: {transcription_url}")
        headers = {"Ocp-Apim-Subscription-Key": api_key}
        response = requests.get(transcription_url, headers=headers)
        response.raise_for_status() # Raise error for bad status codes
        status_data = response.json()

        job_status = status_data.get("status", "").lower()
        log.info(f"[Azure STT] Job status: {job_status}")

        if job_status == "succeeded":
            # Job succeeded, now fetch the actual results file URL
            results_url = status_data.get("links", {}).get("files")
            if not results_url:
                log.error("[Azure STT] Job succeeded but results file URL not found in response.")
                raise ValueError("Azure transcription job succeeded but failed to provide results URL.")

            log.info(f"[Azure STT] Fetching results file list from: {results_url}")
            results_response = requests.get(results_url, headers=headers)
            results_response.raise_for_status()
            results_files_data = results_response.json()

            # Find the actual transcription file (.json) within the results
            transcript_content_url = None
            for file_info in results_files_data.get("values", []):
                if file_info.get("kind") == "Transcription" and file_info.get("name", "").endswith(".json"):
                    transcript_content_url = file_info.get("links", {}).get("contentUrl")
                    break

            if not transcript_content_url:
                log.error("[Azure STT] Could not find transcription JSON URL in results files.")
                raise ValueError("Azure transcription results file URL not found.")

            log.info(f"[Azure STT] Downloading transcription from: {transcript_content_url}")
            # Download the actual transcript JSON
            transcript_res = requests.get(transcript_content_url) # May need SAS token if URL requires auth
            transcript_res.raise_for_status()
            transcript_data = transcript_res.json()

            # Extract the combined phrase or full transcript
            # The structure depends on the Azure API version and settings
            # Example: looking for combinedRecognizedPhrases
            combined_phrases = transcript_data.get("combinedRecognizedPhrases", [])
            if combined_phrases:
                full_transcript = " ".join([phrase.get("lexical", "") for phrase in combined_phrases])
                return {"text": full_transcript.strip()}
            else:
                # Fallback or alternative structure check
                log.warning("[Azure STT] 'combinedRecognizedPhrases' not found, trying other keys or returning raw data.")
                # You might need to parse transcript_data differently based on API version/settings
                # For simplicity, returning raw for now if specific structure isn't found
                # return {"text": json.dumps(transcript_data)} # Or raise error
                raise ValueError("Could not extract transcript from Azure results JSON.")

        elif job_status in ["failed", "canceled"]:
            log.error(f"[Azure STT] Transcription job failed or was canceled. Status: {job_status}")
            error_details = status_data.get("properties", {}).get("error", {})
            raise Exception(f"Azure transcription job failed: {error_details.get('message', 'Unknown error')}")
        elif job_status == "notstarted" or job_status == "running":
            # Job still in progress, wait and poll again
            log.debug(f"[Azure STT] Job status is {job_status}. Waiting {AZURE_POLLING_INTERVAL_SECONDS} seconds...")
            time.sleep(AZURE_POLLING_INTERVAL_SECONDS)
        else:
            log.error(f"[Azure STT] Encountered unexpected job status: {job_status}")
            raise Exception(f"Unexpected Azure transcription job status: {job_status}")

def handle_azure_stt(request, file_path: str, filename: str, file_dir: str, id: str, original_extension: str) -> dict:
    """Handles STT using the Azure Speech-to-Text Batch API."""
    log.info(f"[Azure STT] Processing file: {file_path}")

    # Check file exists and size
    if not os.path.exists(file_path):
        log.error(f"[Azure STT] Audio file not found: {file_path}")
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size > AZURE_MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size ({file_size / (1024*1024):.1f}MB) exceeds Azure's limit of {AZURE_MAX_FILE_SIZE_MB}MB",
        )

    api_key = request.app.state.config.AUDIO_STT_AZURE_API_KEY
    region = request.app.state.config.AUDIO_STT_AZURE_REGION
    locales_str = request.app.state.config.AUDIO_STT_AZURE_LOCALES

    if not api_key or not region:
        raise HTTPException(
            status_code=400,
            detail="Azure API key and region are required for Azure STT",
        )

    # Determine locales
    locales = locales_str.split(",") if locales_str and len(locales_str) >= 2 else [
        "en-US", "es-ES", "es-MX", "fr-FR", "hi-IN", "it-IT", "de-DE",
        "en-GB", "en-IN", "ja-JP", "ko-KR", "pt-BR", "zh-CN",
    ] # Default locales
    log.info(f"[Azure STT] Using locales: {locales}")

    # --- Check format and convert if necessary --- 
    # Azure Batch API generally prefers audio accessible via URL (Blob Storage).
    # Direct upload is possible but more complex via REST.
    # Assuming WAV is generally safe if direct upload or SDK is used, but conversion
    # might be skipped if using Blob storage with supported formats.
    audio_format = get_audio_format(file_path)
    file_to_process = file_path # Start with original path
    cleanup_file = None

    # Convert to WAV if not already WAV, as it's commonly supported by SDKs/direct uploads
    if audio_format != "wav" and audio_format != "error":
        converted_wav_path = os.path.join(file_dir, f"{id}_converted.wav")
        log.info(f"[Azure STT] Format '{audio_format}' detected, converting to WAV -> {converted_wav_path}")
        try:
             conversion_input_format = audio_format if audio_format else None
             convert_audio_to_wav(file_path, converted_wav_path, conversion_input_format)
             file_to_process = converted_wav_path # Use converted file path
             cleanup_file = converted_wav_path # Mark for cleanup
        except Exception as conversion_error:
             log.error(f"[Azure STT] Audio conversion failed: {conversion_error}")
             raise Exception(f"Audio conversion failed for Azure: {conversion_error}")
    elif audio_format == "error":
         log.error(f"[Azure STT] Could not determine audio format for {file_path}")
         raise Exception("Could not process audio file for Azure.")
    else:
        log.info(f"[Azure STT] Format 'wav' detected, using directly: {file_to_process}")

    r = None
    transcription_url = None # To store the job status URL
    try:
        # === Azure Batch Transcription API v3.1 ===
        # This requires the audio to be in Azure Blob Storage or accessible via a public URL.
        # Direct upload via REST API is complex.
        # Using the SDK is highly recommended for Azure Batch transcription.
        # This handler will raise NotImplementedError until SDK or Blob Upload is implemented.

        log.warning("[Azure STT] Azure Batch Transcription via REST requires audio accessible by URL (e.g., Azure Blob Storage) or using the Azure SDK. Direct file upload is not straightforward via REST.")
        log.warning("[Azure STT] Please configure Azure Blob Storage and provide the audio URL, or implement transcription using the Azure Speech SDK for Python.")

        # Example Payload Structure (assuming audio is accessible via URL)
        audio_file_url = None # Needs to be set to the Blob URL or other accessible URL
        if not audio_file_url:
             raise NotImplementedError("Azure STT handler requires the audio file to be accessible via a URL (e.g., Azure Blob Storage). Please provide audio_file_url or use the Azure SDK.")

        job_payload = {
             "contentUrls": [audio_file_url],
             "locale": locales[0], # Primary locale for the job
             "displayName": f"Open-WebUI Transcription job {id}",
             "properties": {
                 "diarizationEnabled": True,
                 "wordLevelTimestampsEnabled": False,
                 "punctuationMode": "DictatedAndAutomatic",
                 "profanityFilterMode": "Masked",
                 "languageIdentification": {
                     "candidateLocales": ",".join(locales)
                 }
                 # Add destinationContainerUrl if using private blobs with SAS
             }
        }

        create_job_url = f"https://{region}.api.cognitive.microsoft.com/speechtotext/batch/v3.1/transcriptions"
        headers = {
            "Ocp-Apim-Subscription-Key": api_key,
            "Content-Type": "application/json"
        }

        log.info(f"[Azure STT] Creating transcription job for URL: {audio_file_url}")
        r = requests.post(create_job_url, headers=headers, json=job_payload, timeout=30)
        r.raise_for_status()

        # Get the URL to check the job status from the 'Location' header
        transcription_url = r.headers.get("Location")
        if not transcription_url:
             log.error("[Azure STT] Failed to get transcription job URL from response headers.")
             raise ValueError("Azure job creation succeeded but did not return a location URL.")

        log.info(f"[Azure STT] Job created successfully. Polling status at: {transcription_url}")

        # Poll for results
        result_data = poll_for_transcription_results(transcription_url, api_key)

        # Save the successful transcript
        transcript_file = os.path.join(file_dir, f"{id}.json")
        try:
            with open(transcript_file, "w") as f:
                # Save the extracted text, not the polling status data
                json.dump(result_data, f)
            log.info(f"[Azure STT] Transcript saved to {transcript_file}")
        except Exception as e:
             log.error(f"[Azure STT] Failed to save transcript file {transcript_file}: {e}")

        log.debug(f"[Azure STT] Transcription result: {result_data.get('text', '')[:100]}...")
        return result_data # Return the extracted {'text': ...} dict

    except NotImplementedError as nie:
         log.error(f"[Azure STT] Feature not implemented: {nie}")
         raise Exception(f"Azure STT handler needs implementation: {nie}")
    except requests.exceptions.RequestException as e:
        log.exception(f"[Azure STT] Error during API call: {e}")
        detail = f"Error connecting to Azure API: {e}"
        if r is not None:
            try:
                res_text = r.text
                try:
                    res_json = r.json()
                    if "error" in res_json:
                        detail = f"External API Error: Code {res_json['error'].get('code', '')}, Message: {res_json['error'].get('message', res_text)}"
                    else:
                        detail = f"External API Error: Status {r.status_code}, Response: {res_text[:200]}"
                except ValueError:
                     detail = f"External API Error: Status {r.status_code}, Response: {res_text[:200]}"
            except Exception:
                 detail = f"External API Error: Status {r.status_code}, could not read response."
        raise Exception(detail)
    except TimeoutError as te:
        log.error(f"[Azure STT] Polling failed: {te}")
        raise Exception(f"Azure transcription job timed out.")
    except Exception as e:
        log.exception(f"[Azure STT] An unexpected error occurred: {e}")
        raise Exception(f"An unexpected error occurred during Azure STT: {e}")
    finally:
         # Cleanup converted file if it exists
         if cleanup_file and os.path.exists(cleanup_file):
             try:
                 os.remove(cleanup_file)
                 log.info(f"[Azure STT] Cleaned up temporary converted file: {cleanup_file}")
             except Exception as cleanup_error:
                 log.error(f"[Azure STT] Error cleaning up temp file {cleanup_file}: {cleanup_error}") 