#!/bin/bash
# React Migration mirrord 간소화 스크립트

SERVICE_NAME="react-migration"
SERVICE_PORT="5173"
NAMESPACE="ugot-frontend"

# 서비스별 agent 라벨
AGENT_LABEL="mirrord-service=$SERVICE_NAME"

echo "🚀 $SERVICE_NAME mirrord 개발 환경"

case "${1:-dev}" in
    "dev"|"start")
        echo "🔄 Starting $SERVICE_NAME with mirrord..."
        
        # 기존 해당 서비스의 mirrord agent pod 정리
        echo "🧹 기존 $SERVICE_NAME mirrord agent pod 정리 중..."
        kubectl delete pods -A -l "app=mirrord,mirrord-service=$SERVICE_NAME" --force --grace-period=0 2>/dev/null || true
        
        # pod 완전 삭제 대기 (최대 30초)
        for i in {1..30}; do
            if ! kubectl get pods -A -l "app=mirrord,mirrord-service=$SERVICE_NAME" --no-headers 2>/dev/null | grep -q .; then
                echo "✅ 기존 $SERVICE_NAME mirrord agent pod 정리 완료"
                break
            fi
            echo "   대기 중... ($i/30)"
            sleep 1
        done
        
        # .mirrord-lock 파일 생성 (Tilt 자동 빌드 비활성화)
        touch .mirrord-lock
        echo "🔒 Tilt 자동 빌드 비활성화"
        
        # Node.js 메모리 설정
        export NODE_OPTIONS="--max-old-space-size=512"
        
        # cleanup 함수 정의 (종료 시 자동 실행)
        cleanup() {
            echo ""
            echo "🧹 정리 중..."
            
            # .mirrord-lock 파일 제거
            if [ -f .mirrord-lock ]; then
                rm -f .mirrord-lock
                echo "🔓 Tilt 자동 빌드 재활성화"
            fi
            
            # mirrord agent pod 정리
            kubectl delete pods -A -l "app=mirrord,mirrord-service=$SERVICE_NAME" --force --grace-period=0 2>/dev/null || true
            echo "✅ 정리 완료"
        }
        
        # 종료 시그널 trap 설정
        trap cleanup EXIT INT TERM
        
        # mirrord 실행
        echo "💡 HMR 접속: http://$SERVICE_NAME.local"
        echo "💡 Ctrl+C로 종료하면 자동으로 정리됩니다."
        
        # exec 대신 일반 실행으로 변경 (trap이 작동하도록)
        mirrord exec \
            -f .mirrord/mirrord.json \
            -- npm run dev
        ;;
        
    "stop")
        echo "🛑 Stopping $SERVICE_NAME..."
        
        # 해당 서비스의 mirrord agent pod 정리
        kubectl delete pods -A -l "app=mirrord,mirrord-service=$SERVICE_NAME" --force --grace-period=0 2>/dev/null || true
        
        # 프로세스 종료
        pkill -f "$SERVICE_NAME.*dev" 2>/dev/null || true
        pkill -f "vite.*$SERVICE_PORT" 2>/dev/null || true
        kill -9 $(lsof -ti:$SERVICE_PORT) 2>/dev/null || true
        
        # .mirrord-lock 파일 제거 (Tilt 자동 빌드 재활성화)
        rm -f .mirrord-lock
        echo "🔓 Tilt 자동 빌드 재활성화"
        
        echo "✅ $SERVICE_NAME 중지 완료"
        ;;
        
    "status")
        echo "📊 $SERVICE_NAME 상태:"
        echo "  Lock 파일: $(test -f .mirrord-lock && echo '🔒 있음' || echo '🔓 없음')"
        echo "  프로세스: $(pgrep -f "vite.*$SERVICE_PORT" >/dev/null && echo '🟢 실행중' || echo '🔴 중지됨')"
        echo "  Agent: $(kubectl get pods -A -l "app=mirrord,mirrord-service=$SERVICE_NAME" --no-headers 2>/dev/null | wc -l) 개"
        ;;
        
    "clean")
        echo "🧹 $SERVICE_NAME 전체 정리..."
        
        # 해당 서비스의 모든 mirrord agent 정리
        kubectl delete pods -A -l "app=mirrord,mirrord-service=$SERVICE_NAME" --force --grace-period=0 2>/dev/null || true
        
        # 모든 관련 프로세스 종료
        pkill -f "$SERVICE_NAME" 2>/dev/null || true
        pkill -f "vite" 2>/dev/null || true
        kill -9 $(lsof -ti:$SERVICE_PORT) 2>/dev/null || true
        
        # Lock 파일 제거
        rm -f .mirrord-lock
        
        echo "✅ $SERVICE_NAME 정리 완료"
        ;;
        
    *)
        echo "사용법: $0 [dev|stop|status|clean]"
        echo "  dev    - mirrord로 개발 시작"
        echo "  stop   - 해당 서비스만 중지"
        echo "  status - 상태 확인"
        echo "  clean  - 전체 정리"
        ;;
esac
