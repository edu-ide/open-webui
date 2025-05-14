import asyncio
import json
import logging
import uuid
import aiohttp
import os
from typing import Optional # Optional 임포트 추가
from authlib.integrations.httpx_client import AsyncOAuth2Client # Authlib 임포트
import httpx

from aiokafka import AIOKafkaConsumer

# Open WebUI 모델 및 유틸리티 (경로는 실제 프로젝트 구조에 맞게 조정 필요)
from open_webui.models.users import Users
from open_webui.models.auths import Auths
# from open_webui.env import AUTHSERVER_API_BASE_URL, AUTHSERVER_API_TOKEN # 설정 파일에서 가져올 경우

# --- Kafka 설정 --- (환경 변수 또는 설정 파일에서 로드 권장)
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
KAFKA_USER_CREATED_TOPIC = os.getenv('KAFKA_USER_CREATED_TOPIC', 'user.created')
KAFKA_CONSUMER_GROUP = os.getenv('KAFKA_CONSUMER_GROUP', 'open-webui-user-provisioning-group')

# --- Authserver API 및 OAuth2 클라이언트 설정 --- (환경 변수 또는 설정 파일에서 로드 권장)
AUTHSERVER_API_BASE_URL = os.getenv('AUTHSERVER_API_BASE_URL', 'http://localhost:8881/api') # demo.yml의 app.authserver.uri 와 유사하게 /api 까지 포함 가능
AUTHSERVER_TOKEN_ENDPOINT = os.getenv('AUTHSERVER_TOKEN_ENDPOINT', 'http://localhost:8881/oauth2/token') # demo.yml의 authserver.token-uri 와 일치
OPENWEBUI_CLIENT_ID = os.getenv('OPENWEBUI_CLIENT_ID', 'demo-service-client') # authserver에 등록된 OpenWebUI 클라이언트 ID
OPENWEBUI_CLIENT_SECRET = os.getenv('OPENWEBUI_CLIENT_SECRET', 'demo-service-secret') # authserver에 등록된 OpenWebUI 클라이언트 시크릿
AUTHSERVER_SCOPES = os.getenv('AUTHSERVER_SCOPES', 'internal.read') # demo.yml의 scope와 유사 (필요한 스코프)
# 사용자 정보 조회 엔드포인트 (BASE_URL 이후의 경로)
AUTHSERVER_USER_ENDPOINT_TEMPLATE = os.getenv('AUTHSERVER_USER_ENDPOINT_TEMPLATE', "/users/{}") # demo의 /api/users/{uuid} 와 유사

log = logging.getLogger(__name__)
# TODO: 로그 레벨 설정은 main.py나 로깅 설정 파일에서 관리

# OAuth2 클라이언트 세션 관리 (애플리케이션 레벨 또는 필요시 생성)
# 이 세션은 자동으로 토큰을 관리 (획득, 갱신 등) 합니다.
# 프로그램 시작 시 한 번 생성하거나, fetch_user_from_authserver 내에서 지역적으로 생성할 수 있습니다.
# 여기서는 fetch_user_from_authserver 호출 시마다 세션을 만들도록 간략화 (실제로는 재사용 고려)

async def fetch_user_from_authserver(user_uuid: str):
    """authserver에서 UUID로 사용자 정보를 조회합니다 (OAuth2 클라이언트 자격 증명 사용)."""
    
    if not all([OPENWEBUI_CLIENT_ID, OPENWEBUI_CLIENT_SECRET, AUTHSERVER_TOKEN_ENDPOINT]):
        log.error("OAuth2 client_id, client_secret, or token_endpoint is not configured.")
        return None

    user_info_url_path = AUTHSERVER_USER_ENDPOINT_TEMPLATE.format(user_uuid)
    url = f"{AUTHSERVER_API_BASE_URL.rstrip('/')}{user_info_url_path}"

    log.info(f"Fetching user info from authserver using OAuth2: {url}")
    
    try:
        async with AsyncOAuth2Client(
            client_id=OPENWEBUI_CLIENT_ID,
            client_secret=OPENWEBUI_CLIENT_SECRET,
            token_endpoint=AUTHSERVER_TOKEN_ENDPOINT,
            scope=AUTHSERVER_SCOPES,
            timeout=10 # 타임아웃 설정 (초)
        ) as client: # OAuth2Client를 세션처럼 사용
            # === 디버깅을 위해 명시적으로 토큰 요청 ===
            try:
                token = await client.fetch_token() # client_credentials grant type은 기본값
                log.info(f"Successfully fetched token: {token}")
            except Exception as e:
                log.error(f"Error explicitly fetching token: {e}", exc_info=True)
                return None # 토큰 발급 실패 시 여기서 중단
            # =======================================
            
            # GET 요청 시 client.get 사용
            resp = await client.get(url, headers={"Accept": "application/json"})
            resp.raise_for_status() # 2xx 이외의 상태 코드일 경우 예외 발생
            
            user_data = resp.json()
            log.info(f"Successfully fetched user data from authserver for UUID {user_uuid}: {user_data}")
            return user_data

    except httpx.HTTPStatusError as e: # httpx의 HTTP 상태 코드 에러로 변경
        if e.response.status_code == 404:
            log.warning(f"User with UUID {user_uuid} not found on authserver (404). URL: {url}, Message: {e.response.text}")
        else:
            log.error(f"Error fetching user from authserver for UUID {user_uuid}. Status: {e.response.status_code}, Message: {e.response.text}, URL: {url}")
        return None
    except httpx.RequestError as e: # httpx의 일반적인 요청 에러로 변경 (ConnectionError, Timeout 등 포함)
        log.error(f"Request error while fetching user from authserver for UUID {user_uuid}. URL: {url}, Error: {e}")
        return None
    except Exception as e:
        log.error(f"Unexpected error while fetching user from authserver for UUID {user_uuid}. URL: {url}, Error: {e}", exc_info=True)
        return None

async def consume_user_created_events():
    log.info(f"Attempting to connect to Kafka brokers at {KAFKA_BOOTSTRAP_SERVERS}")
    consumer = None
    try:
        consumer = AIOKafkaConsumer(
            KAFKA_USER_CREATED_TOPIC,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_CONSUMER_GROUP,
            value_deserializer=lambda m: m.decode('utf-8') if m else None,
            key_deserializer=lambda m: m.decode('utf-8') if m else None,
            auto_offset_reset='earliest',
            enable_auto_commit=True,
            auto_commit_interval_ms=5000
        )
        await consumer.start()
        log.info(f"Kafka consumer started successfully for topic '{KAFKA_USER_CREATED_TOPIC}'. Group ID: '{KAFKA_CONSUMER_GROUP}'")
    except Exception as e:
        log.error(f"Failed to start Kafka consumer: {e}", exc_info=True)
        return

    try:
        async for msg in consumer:
            log.info(f"Received message: Topic={msg.topic}, Partition={msg.partition}, Offset={msg.offset}, Key={msg.key}, Value='{msg.value}'")
            try:
                user_uuid_from_kafka = msg.value
                if not isinstance(user_uuid_from_kafka, str) or not user_uuid_from_kafka.strip():
                    log.warning(f"Skipping empty or non-string message value: {user_uuid_from_kafka}")
                    continue

                authserver_user_data = await fetch_user_from_authserver(user_uuid_from_kafka)

                if not authserver_user_data:
                    log.warning(f"Could not retrieve user details from authserver for UUID '{user_uuid_from_kafka}'. Skipping provisioning.")
                    continue
                
                email = authserver_user_data.get('email')
                name = authserver_user_data.get('name', user_uuid_from_kafka)
                
                # profileImageUrl 처리: None일 경우 기본값 "/user.png" 사용
                auth_profile_url = authserver_user_data.get('profileImageUrl')
                profile_image_url_to_save = auth_profile_url if auth_profile_url is not None else "/user.png"

                authserver_roles_raw = authserver_user_data.get('roles')
                open_webui_role = "user"
                if isinstance(authserver_roles_raw, str):
                    if "ADMIN" in authserver_roles_raw.upper():
                        open_webui_role = "admin"
                elif isinstance(authserver_roles_raw, list):
                    if any("ADMIN" in str(role).upper() for role in authserver_roles_raw):
                        open_webui_role = "admin"
                
                oauth_sub = authserver_user_data.get('uuid', user_uuid_from_kafka)
                is_enabled = authserver_user_data.get('enabled', True)
                if not is_enabled:
                    log.warning(f"User with UUID '{oauth_sub}' is disabled on authserver. Skipping provisioning.")
                    continue

                if not email:
                    log.error(f"Email is missing in authserver response for UUID '{user_uuid_from_kafka}'. Skipping provisioning.")
                    continue
                
                if Users.get_user_by_oauth_sub(oauth_sub) or Users.get_user_by_email(email.lower()):
                    log.warning(f"User with oauth_sub '{oauth_sub}' or email '{email}' already exists in Open WebUI. Skipping provisioning.")
                    continue
                
                log.info(f"User with oauth_sub '{oauth_sub}' (Email: {email}, Role: {open_webui_role}) not found in Open WebUI. Proceeding with provisioning.")

                new_user = Auths.insert_new_auth(
                    email=email.lower(),
                    password=str(uuid.uuid4()),
                    name=name,
                    profile_image_url=profile_image_url_to_save,
                    role=open_webui_role,
                    oauth_sub=oauth_sub
                )

                if new_user:
                    log.info(f"Successfully provisioned user '{oauth_sub}' (Email: {email}, Role: {open_webui_role}) in Open WebUI via Kafka event.")
                else:
                    log.error(f"Failed to provision user '{oauth_sub}' (Email: {email}) in Open WebUI via Kafka event.")

            except Exception as e:
                log.error(f"Error processing Kafka message for user provisioning (value: '{msg.value}'): {e}", exc_info=True)
    finally:
        if consumer:
            log.info("Stopping Kafka consumer...")
            await consumer.stop()
            log.info("Kafka consumer stopped.") 