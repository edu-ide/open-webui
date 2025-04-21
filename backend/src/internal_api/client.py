import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# 생성된 클라이언트 임포트 (src 기준 경로)
from generated_internal_client.internal_api_client import ApiClient, Configuration, ApiException
from generated_internal_client.internal_api_client.api.internal_user_api import InternalUserApi

# Open WebUI 설정에서 API 기본 URL 가져오기
from open_webui.env import DEMO_INTERNAL_API_BASE_URL, SRC_LOG_LEVELS

log = logging.getLogger(__name__)
log.setLevel(SRC_LOG_LEVELS.get("INTERNAL_API_CLIENT", logging.INFO)) # 로그 레벨 설정

# --- 내부 API 설정 ---

# Configuration 인스턴스 생성 (재사용 가능)
# 여기서 타임아웃, 기본 헤더 등 추가 설정 가능
_internal_api_config = Configuration(host=DEMO_INTERNAL_API_BASE_URL)

# --- API 클라이언트 컨텍스트 관리자 ---

@asynccontextmanager
async def get_internal_api_client() -> AsyncGenerator[ApiClient, None]:
    """
    비동기 컨텍스트 관리자를 사용하여 ApiClient 인스턴스를 제공합니다.
    호출자는 'async with get_internal_api_client() as client:' 형태로 사용합니다.
    """
    client = ApiClient(configuration=_internal_api_config)
    try:
        log.debug("내부 API 클라이언트 생성됨")
        yield client
    finally:
        # ApiClient가 별도의 close 메서드를 제공하지 않지만,
        # HTTP 클라이언트(예: aiohttp ClientSession)가 있다면 여기서 닫아야 합니다.
        # 현재 생성된 클라이언트는 httpx 또는 aiohttp 클라이언트를 내부적으로 관리할 수 있습니다.
        # OpenAPI Generator Python 클라이언트의 기본 동작 확인 필요 (대부분 자동으로 처리됨)
        log.debug("내부 API 클라이언트 컨텍스트 종료")
        # await client.close() # 필요 시 구현

# --- API 인스턴스 의존성 함수 (FastAPI용) ---

async def get_internal_user_api() -> InternalUserApi:
    """
    FastAPI 의존성 주입을 위한 함수.
    InternalUserApi 인스턴스를 생성하여 반환합니다.
    ApiClient의 라이프사이클 관리는 내부적으로 처리됩니다.
    """
    # 주의: 이 방식은 매 요청마다 ApiClient를 생성할 수 있습니다.
    # 성능 최적화가 필요하면 애플리케이션 레벨에서 클라이언트를 관리하고
    # 여기서는 해당 클라이언트를 가져오도록 수정할 수 있습니다. (예: FastAPI lifespan 이벤트 사용)
    async with get_internal_api_client() as client:
        return InternalUserApi(api_client=client)

# 필요에 따라 다른 내부 API (예: InternalContentApi 등)를 위한 의존성 함수 추가 가능
# async def get_internal_content_api() -> InternalContentApi:
#     async with get_internal_api_client() as client:
#         return InternalContentApi(api_client=client) 