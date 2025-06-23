# React Migration - Tilt 개발 가이드

## 개요
edusense의 Tiltfile 패턴을 기반으로 한 react-migration 프론트엔드 개발 환경 설정 가이드입니다.

## 핵심 설정 파일

### 1. Dockerfile
- **Multi-stage 빌드**: Node.js 빌드 단계 + Nginx 서빙 단계
- **환경변수**: ARG → ENV 패턴으로 빌드 시 동적 설정
- **API 프록시**: Nginx에서 `/api` 경로를 백엔드로 프록시

### 2. Tiltfile 설정
- **메인 Tiltfile**: `/mnt/sdc1/ws/edu-ide/edusense-ide/extensions/pearai-submodule/gui/my-mfe-project/Tiltfile`
- **프론트엔드 Tiltfile**: `/mnt/sdc1/ws/edu-ide/edusense-ide/extensions/pearai-submodule/gui/my-mfe-project/Tiltfile.frontend`
- **독립 Tiltfile**: `/mnt/sdc1/ws/edu-ide/edusense-ide/extensions/pearai-submodule/gui/my-mfe-project/Tiltfile.react-migration`

### 3. Helm Chart 설정
- **Values 파일**: `/mnt/sdc1/ws/edu-ide/edusense-ide/extensions/pearai-submodule/gui/my-mfe-project/k8s-deployments/helm/ugot-frontend/values.yaml`
- **Deployment 템플릿**: `/mnt/sdc1/ws/edu-ide/edusense-ide/extensions/pearai-submodule/gui/my-mfe-project/k8s-deployments/helm/ugot-frontend/templates/deployments.yaml`

## 주요 기능

### 1. Live Update
```python
live_update=[
    sync('./open-webui/react-migration/src', '/app/src'),
    sync('./open-webui/react-migration/public', '/app/public'),
    sync('./open-webui/react-migration/package.json', '/app/package.json'),
    run('cd /app && npm install', trigger=['./open-webui/react-migration/package.json']),
    run('cd /app && npm run build && nginx -s reload', trigger=['./open-webui/react-migration/src'])
]
```

### 2. 환경별 설정
- **로컬 개발**: `localhost` 주소 사용
- **K8s 클러스터**: Kubernetes 내부 서비스 주소 사용
- **환경 감지**: `TILT_MODE` 환경변수로 제어

### 3. 백엔드 연동
- **API 게이트웨이**: `http://gateway.ugot.svc.cluster.local`
- **인증 서버**: `http://authserver.ugot.svc.cluster.local`
- **서비스 디스커버리**: Kubernetes DNS 활용

## 개발 워크플로우

### 1. 전체 시스템 시작
```bash
# 하이브리드 모드 (권장)
tilt up

# Pure K8s 모드
TILT_MODE=pure tilt up

# 개발 모드
TILT_MODE=dev tilt up
```

### 2. 개별 서비스 모니터링
- **Tilt UI**: http://localhost:10350
- **React Migration**: http://localhost:3000
- **라벨 필터링**: `frontend` 라벨로 프론트엔드 서비스만 표시

### 3. 코드 변경 시
1. 소스 파일 수정
2. Tilt가 자동으로 Live Update 실행
3. 브라우저에서 변경사항 확인

## 개발 환경 최적화

### 1. CPU 사용량 제어
```bash
# 순차 처리로 CPU 부하 감소
MAX_PARALLEL_UPDATES=1 tilt up

# Live Update 비활성화
ENABLE_LIVE_UPDATE=false tilt up
```

### 2. 메모리 최적화
```bash
# Docker 정리
tilt trigger cleanup-docker

# 이미지만 정리
tilt trigger cleanup-images
```

### 3. 디버깅
```bash
# 파드 상태 확인
tilt trigger debug-pods-status

# 로그 확인
tilt trigger debug-check-logs
```

## 포트 구성

| 서비스 | 로컬 포트 | 컨테이너 포트 | 용도 |
|--------|----------|--------------|------|
| react-migration | 3000 | 3000 | React 앱 |
| microblog-lms | 5174 | 5174 | LMS 앱 |
| gateway | 8080 | 8080 | API 게이트웨이 |
| authserver | 8881 | 8080 | 인증 서버 |

## 트러블슈팅

### 1. 빌드 실패
- 의존성 설치 확인: `package.json` 파일 상태
- Docker 캐시 정리: `docker system prune -af`
- Tilt 리소스 재시작: Tilt UI에서 리소스 클릭 후 재시작

### 2. 네트워크 연결 문제
- 서비스 상태 확인: `kubectl get pods -n ugot-frontend`
- 서비스 로그 확인: `kubectl logs -n ugot-frontend deployment/react-migration`
- 백엔드 서비스 상태 확인: `kubectl get pods -n ugot`

### 3. Live Update 동작 안함
- 파일 경로 확인
- Trigger 패턴 확인
- Tilt UI에서 로그 확인

## 확장 방법

### 1. 새로운 환경변수 추가
1. `Dockerfile`에 ARG/ENV 추가
2. `Tiltfile.frontend`에 build_args 추가
3. `values.yaml`에 환경변수 추가

### 2. 추가 프록시 경로 설정
1. `Dockerfile`의 Nginx 설정 수정
2. 백엔드 서비스 주소 확인

### 3. 의존성 서비스 추가
1. `k8s_resource`에 `resource_deps` 추가
2. 헬스체크 설정 추가

이 가이드를 통해 edusense 패턴을 따라 효율적인 React Migration 개발 환경을 구축할 수 있습니다.