# syntax=docker/dockerfile:1
# Multi-stage build for React Migration App
FROM node:20-alpine as builder

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm ci --silent

# 소스 코드 복사
COPY . .

# Vite 환경 변수를 ARG로 받아서 ENV로 설정
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_API_TIMEOUT=30000
ARG VITE_AUTH_TOKEN_KEY=access_token
ARG VITE_AUTH_REFRESH_KEY=refresh_token
ARG VITE_WS_URL=ws://localhost:8080/ws
ARG VITE_DEV_MODE=false
ARG VITE_DEBUG_API=false
ARG VITE_OPENAI_API_URL=https://api.openai.com/v1
ARG VITE_ANTHROPIC_API_URL=https://api.anthropic.com
ARG VITE_ENABLE_ANALYTICS=false
ARG VITE_ENABLE_EXPERIMENTAL_FEATURES=false
ARG VITE_APP_NAME="OpenWebUI React Migration"
ARG VITE_APP_VERSION=1.0.0
ARG NODE_ENV=production

# Vite 환경 변수 설정
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_TIMEOUT=$VITE_API_TIMEOUT
ENV VITE_AUTH_TOKEN_KEY=$VITE_AUTH_TOKEN_KEY
ENV VITE_AUTH_REFRESH_KEY=$VITE_AUTH_REFRESH_KEY
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_DEV_MODE=$VITE_DEV_MODE
ENV VITE_DEBUG_API=$VITE_DEBUG_API
ENV VITE_OPENAI_API_URL=$VITE_OPENAI_API_URL
ENV VITE_ANTHROPIC_API_URL=$VITE_ANTHROPIC_API_URL
ENV VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS
ENV VITE_ENABLE_EXPERIMENTAL_FEATURES=$VITE_ENABLE_EXPERIMENTAL_FEATURES
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV NODE_ENV=$NODE_ENV

# TypeScript 체크 및 빌드
RUN npm run build

# Nginx를 사용하여 정적 파일 서빙
FROM nginx:alpine

# 빌드된 파일 복사 (Vite는 dist 폴더에 빌드)
COPY --from=builder /app/dist /usr/share/nginx/html

# 보안 강화된 Nginx 설정
RUN echo 'server { \
    listen 3000; \
    server_name _; \
    \
    # Security headers \
    add_header X-Frame-Options "SAMEORIGIN" always; \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
    add_header Referrer-Policy "strict-origin-when-cross-origin" always; \
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always; \
    \
    # Compression \
    gzip on; \
    gzip_vary on; \
    gzip_min_length 1024; \
    gzip_comp_level 6; \
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json; \
    \
    # Main location \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
        \
        # Cache static assets \
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
            expires 1y; \
            add_header Cache-Control "public, immutable"; \
        } \
    } \
    \
    # API proxy \
    location /api { \
        proxy_pass http://gateway.ugot.svc.cluster.local:8080; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_buffering off; \
        proxy_request_buffering off; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
    } \
    \
    # WebSocket proxy \
    location /ws { \
        proxy_pass http://gateway.ugot.svc.cluster.local:8080; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    \
    # Health check \
    location /health { \
        access_log off; \
        return 200 "healthy"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Remove default nginx config (if exists)
RUN rm -f /etc/nginx/conf.d/default.conf.default || true

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]