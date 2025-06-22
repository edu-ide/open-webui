# React Migration Development Guide

OpenWebUI React Migration 프로젝트의 개발자 가이드입니다.

## 목차

1. [개발 환경 설정](#개발-환경-설정)
2. [API 클라이언트 패턴](#api-클라이언트-패턴)
3. [인증 및 상태 관리](#인증-및-상태-관리)
4. [에러 핸들링](#에러-핸들링)
5. [환경 설정](#환경-설정)
6. [개발 워크플로우](#개발-워크플로우)
7. [배포 가이드](#배포-가이드)
8. [트러블슈팅](#트러블슈팅)

## 개발 환경 설정

### 필수 요구사항

- Node.js 20+ 
- npm 또는 yarn
- Docker (선택사항)
- Kubernetes (배포용)

### 로컬 개발 시작

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.development

# 개발 서버 시작
npm run dev
```

### 환경 변수 설정

`.env.development` 파일에서 다음 변수들을 설정하세요:

```bash
# API 설정
VITE_API_BASE_URL=http://localhost:8080
VITE_API_TIMEOUT=30000

# 인증 설정
VITE_AUTH_TOKEN_KEY=access_token
VITE_AUTH_REFRESH_KEY=refresh_token

# WebSocket 설정
VITE_WS_URL=ws://localhost:8080/ws

# 개발 플래그
VITE_DEV_MODE=true
VITE_DEBUG_API=true
```

## API 클라이언트 패턴

### 아키텍처 개요

이 프로젝트는 edusense의 API 클라이언트 패턴을 채택하여 다음과 같은 구조를 사용합니다:

```
src/
├── api/                      # API 클라이언트 코드
│   ├── base.ts              # BaseAPI 클래스
│   ├── configuration.ts      # 설정 클래스
│   ├── common.ts            # 공통 타입과 유틸리티
│   └── apis/                # 개별 API 클라이언트들
│       ├── auth-api.ts      # 인증 API
│       └── chat-api.ts      # 채팅 API
├── services/                # 서비스 레이어
│   └── api-service.ts       # 통합 API 서비스
└── hooks/                   # React 훅들
    └── useApiService.ts     # API 서비스 훅
```

### API 클라이언트 사용법

#### 1. 기본 사용

```typescript
import { useApiService } from '../hooks/useApiService';

function MyComponent() {
  const apiService = useApiService();
  
  const handleLogin = async () => {
    const [response, error] = await apiService.auth.login({
      username: 'user@example.com',
      password: 'password123'
    });
    
    if (error) {
      console.error('로그인 실패:', error.message);
      return;
    }
    
    console.log('로그인 성공:', response.data);
  };
}
```

#### 2. 안전한 API 호출

모든 API 호출은 `safeApiCall` 패턴을 사용하여 에러를 안전하게 처리합니다:

```typescript
const [data, error] = await apiService.callSafely(() => 
  apiService.chatApi.getChatSessions(page, size)
);

if (error) {
  // 에러 처리
  console.error('API 호출 실패:', error);
} else {
  // 성공 처리
  console.log('데이터:', data);
}
```

#### 3. 타입 안전성

모든 API 응답은 TypeScript 타입으로 정의되어 있습니다:

```typescript
interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
  timestamp: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  // ...
}
```

## 인증 및 상태 관리

### 인증 플로우

1. **토큰 기반 인증**: JWT 토큰을 사용한 Bearer 인증
2. **자동 토큰 갱신**: 만료 시 자동으로 refresh token 사용
3. **인증 상태 동기화**: Context API를 통한 전역 상태 관리

### AuthContext 사용법

```typescript
import { useAuth } from '../contexts/AuthContext';

function LoginComponent() {
  const { signIn, isAuthenticated, user, isLoading } = useAuth();
  
  const handleSubmit = async (credentials) => {
    try {
      await signIn(credentials);
      // 로그인 성공 후 처리
    } catch (error) {
      // 에러 처리
    }
  };
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <div>
      {isAuthenticated ? (
        <p>환영합니다, {user?.name}님!</p>
      ) : (
        <LoginForm onSubmit={handleSubmit} />
      )}
    </div>
  );
}
```

### 토큰 관리

- **저장**: localStorage에 안전하게 저장
- **자동 갱신**: 401 에러 시 자동으로 refresh token 사용
- **클리어**: 로그아웃 시 모든 토큰 삭제

## 에러 핸들링

### Error Boundary

React Error Boundary를 사용하여 컴포넌트 레벨에서 에러를 포착합니다:

```typescript
import { ErrorBoundary } from '../components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### API 에러 처리

```typescript
// 자동으로 에러를 AppError 타입으로 변환
interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

// 사용 예제
const [data, error] = await apiService.callSafely(() => 
  apiService.chatApi.getChatSessions()
);

if (error) {
  switch (error.code) {
    case 'HTTP_401':
      // 인증 에러 처리
      break;
    case 'NETWORK_ERROR':
      // 네트워크 에러 처리
      break;
    default:
      // 기타 에러 처리
  }
}
```

### 로딩 상태 관리

다양한 로딩 컴포넌트를 제공합니다:

```typescript
import { 
  LoadingSpinner, 
  PageLoading, 
  OverlayLoading,
  SkeletonLoading 
} from '../components/common/LoadingSpinner';

// 페이지 전체 로딩
<PageLoading label="데이터를 불러오는 중..." />

// 오버레이 로딩
<OverlayLoading label="처리 중..." />

// 스켈레톤 로딩
<SkeletonLoading lines={3} />
```

## 환경 설정

### 개발/운영 환경 분리

#### 개발 환경 (.env.development)

```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_DEV_MODE=true
VITE_DEBUG_API=true
VITE_ENABLE_EXPERIMENTAL_FEATURES=true
```

#### 운영 환경 (.env.production)

```bash
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_DEV_MODE=false
VITE_DEBUG_API=false
VITE_ENABLE_ANALYTICS=true
```

### Vite 설정

`vite.config.ts`에서 환경별 설정을 관리합니다:

```typescript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // 개발 환경에서만 프록시 설정
    server: {
      proxy: mode === 'development' ? {
        '/api': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
        },
      } : undefined,
    },
  };
});
```

## 개발 워크플로우

### 1. 기능 개발

```bash
# 새 기능 브랜치 생성
git checkout -b feature/새기능이름

# 개발 서버 시작
npm run dev

# 개발 진행...

# 린트 및 타입 체크
npm run lint
npm run build  # TypeScript 체크 포함
```

### 2. 테스트

```bash
# 단위 테스트 (설정 시)
npm test

# E2E 테스트 (Playwright)
npm run test:e2e
```

### 3. 빌드 및 배포

```bash
# 운영 빌드
npm run build

# 빌드 결과 미리보기
npm run preview

# Docker 이미지 빌드
docker build -t react-migration:latest .
```

### 4. Hot Reload 최적화

WSL 환경에서의 개발을 위한 설정:

```bash
# .env.development
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
VITE_HMR_OVERLAY=true
```

## 배포 가이드

### Docker 배포

```bash
# 이미지 빌드
docker build -t react-migration:latest .

# 컨테이너 실행
docker run -p 3000:3000 react-migration:latest
```

### Kubernetes 배포

```bash
# Kubernetes 리소스 배포
kubectl apply -f k8s/deployment.yaml

# 서비스 상태 확인
kubectl get pods -n ugot -l app=react-migration
kubectl get svc -n ugot react-migration
```

### Tilt를 사용한 개발

```bash
# Tilt 시작 (hot reload 포함)
tilt up

# 특정 서비스만 빌드
tilt trigger react-migration
```

## API 엔드포인트 설정

### 환경별 API URL

- **개발**: `http://localhost:8080`
- **스테이징**: `http://gateway.ugot.svc.cluster.local`
- **운영**: `https://api.yourdomain.com`

### API 프록시 설정

개발 환경에서는 CORS 문제를 해결하기 위해 Vite 프록시를 사용:

```typescript
// vite.config.ts
proxy: {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
  '/ws': {
    target: 'ws://localhost:8080',
    ws: true,
  },
}
```

## 트러블슈팅

### 일반적인 문제들

#### 1. HMR이 작동하지 않는 경우

```bash
# 환경 변수 설정
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true

# 또는 vite.config.ts에서
server: {
  watch: {
    usePolling: true,
  },
}
```

#### 2. 인증 토큰 관련 문제

```typescript
// 토큰 상태 확인
const apiService = useApiService();
console.log('인증 상태:', apiService.isAuthenticated);

// 수동으로 인증 체크
await apiService.checkAuth();
```

#### 3. API 호출 실패

```typescript
// 디버그 모드 활성화
localStorage.setItem('debug', 'true');

// API 요청/응답 로그 확인
// 개발자 도구 Console 탭에서 확인
```

#### 4. 빌드 에러

```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# TypeScript 캐시 클리어
npx tsc --build --clean
```

### 성능 최적화

#### 1. 번들 크기 최적화

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'ui-vendor': ['@heroui/react'],
      },
    },
  },
}
```

#### 2. 코드 스플리팅

```typescript
// 동적 import 사용
const LazyComponent = React.lazy(() => import('./LazyComponent'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyComponent />
    </Suspense>
  );
}
```

### 디버깅 도구

#### 1. React Developer Tools

브라우저 확장 프로그램으로 React 컴포넌트 상태를 디버깅

#### 2. Redux DevTools (상태 관리 사용 시)

상태 변경 추적 및 디버깅

#### 3. Network 탭

API 호출 모니터링 및 디버깅

## 추가 리소스

- [React 19 문서](https://react.dev/)
- [Vite 문서](https://vitejs.dev/)
- [HeroUI 컴포넌트](https://heroui.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Kubernetes 문서](https://kubernetes.io/)

## 기여하기

1. 이슈 생성 또는 기존 이슈 할당받기
2. 기능 브랜치 생성
3. 개발 및 테스트
4. Pull Request 생성
5. 코드 리뷰 진행
6. 머지 완료

문의사항이나 도움이 필요한 경우 팀 슬랙 채널을 이용해 주세요.