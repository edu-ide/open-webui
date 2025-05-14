import asyncio
import json
import logging
import uuid # uuid 파싱 및 임의 비밀번호 생성용

from aiokafka import AIOKafkaConsumer

# Open WebUI 모델 및 유틸리티 (경로는 실제 프로젝트 구조에 맞게 조정 필요)
from open_webui.models.users import Users
from open_webui.models.auths import Auths

# --- Kafka 설정 (TODO: 실제 환경에서는 환경 변수나 설정 파일에서 불러와야 합니다) ---
KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092' # Spring demo.yml의 kafka.bootstrap-servers 참조
KAFKA_USER_CREATED_TOPIC = 'user.created'    # Spring demo.yml의 AuthEventKafkaListener 토픽 참조
KAFKA_CONSUMER_GROUP = 'open-webui-user-provisioning-group' # 적절한 그룹 ID

log = logging.getLogger(__name__)
# TODO: 로그 레벨 설정은 main.py나 로깅 설정 파일에서 관리

async def consume_user_created_events():
    log.info(f"Attempting to connect to Kafka brokers at {KAFKA_BOOTSTRAP_SERVERS}")
    consumer = None
    try:
        consumer = AIOKafkaConsumer(
            KAFKA_USER_CREATED_TOPIC,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_CONSUMER_GROUP,
            value_deserializer=lambda m: m.decode('utf-8') if m else None, # 변경: JSON 파싱 대신 단순 UTF-8 디코딩
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
            log.info(f"Received message: Topic={msg.topic}, Partition={msg.partition}, Offset={msg.offset}, Key={msg.key}, Value='{msg.value}'") # Log value as string
            try:
                # msg.value는 이제 문자열 (예: UUID)
                uuid_string = msg.value
                if not isinstance(uuid_string, str) or not uuid_string.strip():
                    log.warning(f"Skipping empty or non-string message value: {uuid_string}")
                    continue

                # Kafka 메시지 값(UUID 문자열)을 username(oauth_sub)으로 사용
                username = uuid_string # 이것이 Open WebUI의 oauth_sub가 됨
                
                # 필수 필드 생성 (이메일 및 이름은 username 기반으로 생성)
                # TODO: 더 나은 방법은 인증 서버가 email, name 등의 정보를 포함한 JSON 메시지를 보내는 것
                email = f"{username}@kafka.auto-provisioned.com" # 임시 이메일 형식
                name = username # 이름을 username으로 설정

                # Open WebUI DB에 이미 사용자가 있는지 확인 (oauth_sub 또는 email 기준)
                if Users.get_user_by_oauth_sub(username) or Users.get_user_by_email(email.lower()):
                    log.warning(f"User with username/oauth_sub '{username}' or email '{email}' already exists in Open WebUI. Skipping provisioning.")
                    continue
                
                log.info(f"User '{username}' (Email: {email}) not found in Open WebUI. Proceeding with provisioning.")

                # Open WebUI 역할 결정 (기본 'user')
                # TODO: 역할 정보도 Kafka 메시지에 포함되거나, 별도 로직으로 결정 필요
                open_webui_role = "user"

                # Open WebUI DB에 새 사용자 정보 저장
                new_user = Auths.insert_new_auth(
                    email=email.lower(),
                    password=str(uuid.uuid4()),  # 외부 인증 사용자는 임의의 비밀번호 사용
                    name=name,
                    profile_image_url="/user.png", # 기본 프로필 이미지
                    role=open_webui_role,
                    oauth_sub=username  # 인증 서버의 username(여기서는 UUID)을 oauth_sub로 저장
                )

                if new_user:
                    log.info(f"Successfully provisioned user '{username}' (Email: {email}, Role: {open_webui_role}) in Open WebUI via Kafka event.")
                else:
                    log.error(f"Failed to provision user '{username}' (Email: {email}) in Open WebUI via Kafka event.")

            except Exception as e: # Catch broader exceptions during message processing
                log.error(f"Error processing Kafka message for user provisioning (value: '{msg.value}'): {e}", exc_info=True)
    finally:
        if consumer:
            log.info("Stopping Kafka consumer...")
            await consumer.stop()
            log.info("Kafka consumer stopped.") 