import time
import logging
from fastapi import Request
from open_webui.models.users import UserModel # 필요시

log = logging.getLogger(__name__)

XAI_MODEL_ID = "xai/grok-3"
XAI_MODEL_NAME = "XAI Grok-3 Beta (XAI Provider)"

async def get_models(request: Request, user: UserModel = None):
    # In a real scenario, you might check a config flag like:
    # if not request.app.state.config.ENABLE_XAI_PROVIDER:
    #     return []

    grok_model = {
        "id": XAI_MODEL_ID,
        "name": XAI_MODEL_NAME,
        "object": "model",
        "created": int(time.time()),
        "owned_by": "xai",  # Source identifier
        "info": { # Basic metadata structure
            "meta": {
                "id": XAI_MODEL_ID,
                "name": XAI_MODEL_NAME,
                # Access control info could be added here if needed
                # e.g., "access_control": None (public) 
            }
        },
        # "tags": [], # Other necessary fields
    }
    log.info(f"xai.py: Providing model: {XAI_MODEL_ID}")
    return [grok_model] 