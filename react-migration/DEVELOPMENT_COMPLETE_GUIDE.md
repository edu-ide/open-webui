# React Migration 개발 환경 완성 가이드

## 📋 개요

이 문서는 react-migration 프로젝트의 완전한 개발 환경 설정과 사용법을 제공합니다. 모든 설정이 완료되어 개발자가 즉시 개발을 시작할 수 있습니다.

## 🎯 구성 완료 항목

### ✅ 1. Tiltfile 통합 및 검증
- **Tiltfile.react-migration**: React Migration 전용 빌드 설정
- **메인 Tiltfile 통합**: 전체 시스템과 연동
- **Live Update 지원**: 소스 코드 변경 시 자동 리빌드
- **CPU 최적화**: 병렬 처리 제한으로 시스템 안정성 확보

### ✅ 2. package.json 스크립트 최적화
완전한 개발 워크플로우를 지원하는 스크립트들:

```json
{
  "dev": "vite --host 0.0.0.0 --port 3000",
  "dev:debug": "vite --host 0.0.0.0 --port 3000 --debug",
  "build": "vite build",
  "build:with-tsc": "tsc -b && vite build",
  "build:production": "NODE_ENV=production tsc -b && vite build",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "type-check": "tsc --noEmit",
  "test": "playwright test",
  "docker:build": "docker build -t react-migration .",
  "docker:run": "docker run -p 3000:3000 react-migration",
  "tilt:up": "tilt up -f ../../../Tiltfile.react-migration",
  "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,css,md}\""
}
```

### ✅ 3. VSCode 개발 환경 설정 (.vscode 폴더)
완전한 IDE 지원:

- **settings.json**: TypeScript, ESLint, Prettier 통합 설정
- **launch.json**: 디버깅 구성 (React App, Chrome, Playwright, Docker)
- **tasks.json**: 빌드, 테스트, 배포 작업 자동화
- **extensions.json**: 권장 확장 프로그램
- **snippets.code-snippets**: React, Spring AI, API 서비스 코드 스니펫

### ✅ 4. GitHub Actions CI/CD 기본 설정
완전한 DevOps 파이프라인:

- **CI Pipeline**: 테스트, 린트, 빌드, 보안 스캔
- **E2E Tests**: Playwright 자동화 테스트
- **Docker Build & Push**: 컨테이너 이미지 관리
- **배포 자동화**: Staging/Production 환경 배포
- **의존성 검토**: 보안 취약점 자동 검사

### ✅ 5. 개발 워크플로우 테스트 및 검증
검증 완료된 기능들:

- ✅ TypeScript 컴파일 (타입 체크)
- ✅ ESLint 코드 품질 검사
- ✅ Vite 빌드 시스템
- ✅ Docker 컨테이너 빌드
- ✅ 개발 서버 실행

## 🚀 빠른 시작

### 1. 로컬 개발 시작

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev

# 브라우저에서 http://localhost:3000 접속
```

### 2. Docker 개발 환경

```bash
# Docker 빌드
npm run docker:build

# Docker 실행
npm run docker:run

# 브라우저에서 http://localhost:3000 접속
```

### 3. Tilt 하이브리드 개발

```bash
# 전체 인프라 시작
tilt up

# React Migration만 개발 모드로 시작
./mirrord-dev.sh dev react-migration

# 또는 Tilt에서 관리
npm run tilt:up
```

## 🛠️ 개발 워크플로우

### 코드 품질 관리

```bash
# 코드 포맷팅
npm run format

# 린트 검사
npm run lint

# 린트 자동 수정
npm run lint:fix

# TypeScript 타입 체크
npm run type-check
```

### 테스트 실행

```bash
# E2E 테스트 실행
npm run test

# 테스트 UI 모드
npm run test:ui

# 테스트 디버그 모드
npm run test:debug
```

### 빌드 및 배포

```bash
# 개발 빌드
npm run build

# 프로덕션 빌드 (TypeScript 포함)
npm run build:with-tsc

# 웹 컴포넌트 빌드
npm run build:webcomponent

# 빌드 분석
npm run build:analyze
```

## 🔧 VSCode 통합 개발

### 디버깅
1. **F5** 키로 React 앱 실행 + Chrome 디버깅
2. **Ctrl+Shift+P** → "Tasks: Run Task" → 원하는 작업 선택
3. 브레이크포인트 설정하여 디버깅

### 권장 확장 프로그램
설치 후 **Ctrl+Shift+P** → "Extensions: Show Recommended Extensions"

- ESLint
- Prettier
- TypeScript
- Tailwind CSS IntelliSense
- Playwright Test
- Docker
- Kubernetes

### 코드 스니펫
- `rfc` → React Functional Component
- `hook` → Custom Hook
- `apiservice` → API Service
- `springai` → Spring AI Chat Component
- `testcomp` → Test Component
- `pwtest` → Playwright Test

## 🐳 Docker 및 Kubernetes

### Docker 개발
```bash
# 개발용 컨테이너 (볼륨 마운트)
npm run docker:dev

# 프로덕션 빌드
npm run docker:build
```

### Kubernetes 배포
```bash
# K8s 리소스 적용
npm run k8s:apply

# K8s 리소스 삭제
npm run k8s:delete
```

## 🔄 CI/CD 파이프라인

### GitHub Actions 워크플로우
- **Push to develop**: Staging 배포
- **Push to main**: Production 배포
- **Pull Request**: 자동 테스트 및 코드 리뷰

### 배포 환경
- **Development**: `http://localhost:3000`
- **Staging**: 자동 배포 (develop 브랜치)
- **Production**: 자동 배포 (main 브랜치)

## 📁 프로젝트 구조

```
react-migration/
├── .github/workflows/       # GitHub Actions CI/CD
├── .vscode/                # VSCode 설정
├── dist/                   # 빌드 결과물
├── k8s/                   # Kubernetes 매니페스트
├── src/                   # 소스 코드
│   ├── api/              # API 클라이언트
│   ├── components/       # React 컴포넌트
│   ├── contexts/         # Context API
│   ├── hooks/           # Custom Hooks
│   ├── lib/             # 라이브러리 (Spring AI 등)
│   ├── pages/           # 페이지 컴포넌트
│   └── utils/           # 유틸리티 함수
├── Dockerfile           # Docker 설정
├── package.json         # 의존성 및 스크립트
├── tsconfig.json       # TypeScript 설정
├── vite.config.ts      # Vite 설정
└── playwright.config.ts # 테스트 설정
```

## 🎨 기술 스택

### 핵심 기술
- **React 19** + **TypeScript**
- **Vite** (빌드 도구)
- **HeroUI** (UI 컴포넌트)
- **Tailwind CSS** (스타일링)
- **Spring AI** (AI 통합)

### 개발 도구
- **ESLint** + **Prettier** (코드 품질)
- **Playwright** (E2E 테스트)
- **Docker** (컨테이너화)
- **Tilt** (Kubernetes 개발)

### DevOps
- **GitHub Actions** (CI/CD)
- **Kubernetes** (오케스트레이션)
- **nginx** (웹 서버)

## 🚦 환경 변수

### 개발 환경 (.env.local)
```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_AUTH_TOKEN_KEY=access_token
VITE_DEBUG_API=true
VITE_DEV_MODE=true
```

### 프로덕션 환경
```bash
VITE_API_BASE_URL=https://api.production.com
VITE_DEBUG_API=false
VITE_DEV_MODE=false
VITE_ENABLE_ANALYTICS=true
```

## 📞 지원 및 문의

### 문제 해결
1. **빌드 실패**: `npm run clean && npm install` 후 재시도
2. **타입 오류**: `npm run type-check`로 확인
3. **Docker 문제**: `docker system prune -af` 후 재빌드
4. **Tilt 문제**: `tilt down && tilt up` 재시작

### 개발 지원
- **문서**: `DEVELOPMENT_GUIDE.md`, `TILT_GUIDE.md`
- **예제**: `src/components/` 폴더의 컴포넌트들
- **테스트**: `tests/` 폴더의 테스트 케이스들

---

## 🎉 개발 환경 완성!

모든 설정이 완료되었습니다. 이제 다음과 같이 즉시 개발을 시작할 수 있습니다:

1. **`npm install`** - 의존성 설치
2. **`npm run dev`** - 개발 서버 시작
3. **VSCode에서 프로젝트 열기** - 모든 설정이 자동 적용
4. **F5 키로 디버깅 시작** - React + Chrome 통합 디버깅

Happy Coding! 🚀