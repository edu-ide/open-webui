# 1. 공식 Python 런타임 이미지를 기본 이미지로 사용합니다.
FROM python:3.11-slim

# 2. 작업 디렉토리를 /app 으로 설정합니다.
WORKDIR /app

# 3. 시스템 패키지 업데이트 및 필요한 도구 설치 (필요한 경우)
# RUN apt-get update && apt-get install -y --no-install-recommends gcc

# 4. requirements.txt 파일을 작업 디렉토리로 복사합니다.
#    Dockerfile과 같은 위치에 requirements.txt가 있다고 가정합니다.
COPY requirements.txt .

# 5. 복사된 requirements.txt를 사용하여 Python 의존성을 설치합니다.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 6. 백엔드 애플리케이션 코드 전체를 작업 디렉토리로 복사합니다.
#    open_webui 디렉토리와 src 디렉토리 등을 복사합니다.
COPY ./backend/open_webui ./open_webui
COPY ./backend/src ./src

# CHANGELOG.md 파일 복사
# 가정: CHANGELOG.md는 이 Dockerfile의 빌드 컨텍스트(예: 'open-webui/backend/')의 부모 디렉토리, 즉 'open-webui/' 프로젝트 루트에 위치합니다.
# Python 코드가 /CHANGELOG.md 에서 파일을 찾을 수 있도록 해당 위치로 복사합니다.
COPY ./CHANGELOG.md /CHANGELOG.md

# COPY . . # 만약 backend 폴더 전체를 복사하고 싶다면, 단 .dockerignore에 명시된 파일/폴더는 제외됩니다.

# 7. FastAPI 애플리케이션이 실행될 포트를 지정합니다. (예: 8080)
#    다른 워크플로우(deploy-to-hf-spaces.yml)에서 app_port: 8080을 사용하고 있어 8080으로 설정합니다.
EXPOSE 8080

# 8. Uvicorn을 사용하여 FastAPI 애플리케이션을 실행하는 명령입니다.
#    open_webui.main:app 은 FastAPI 애플리케이션 인스턴스의 위치입니다.
#    실제 애플리케이션 구조에 맞게 수정해야 할 수 있습니다.
#    (integration-test.disabled 에서 uvicorn open_webui.main:app --port "8080" 사용 확인)
CMD ["uvicorn", "open_webui.main:app", "--host", "0.0.0.0", "--port", "8080"] 