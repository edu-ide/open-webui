# backend/open_webui/audio_handlers/__init__.py
from .local_handler import handle_local_stt
from .openai_handler import handle_openai_stt
from .deepgram_handler import handle_deepgram_stt
from .azure_handler import handle_azure_stt

# You can optionally define an __all__ variable if needed
__all__ = [
    "handle_local_stt",
    "handle_openai_stt",
    "handle_deepgram_stt",
    "handle_azure_stt",
] 