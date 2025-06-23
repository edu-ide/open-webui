# OAuth2 구현 문서

## 개요
이 문서는 microblog-lms의 react-migration-ai-chat 모듈에 구현된 DCR OAuth2 인증 시스템에 대해 설명합니다.

## 주요 구성 요소

### 1. DCR OAuth2 Client (`/src/lib/services/dcrOAuth2Client.ts`)
- **역할**: Dynamic Client Registration 및 OAuth2 흐름 관리
- **주요 기능**:
  - `registerClient()`: 클라이언트 동적 등록
  - `startAuthorization()`: 인증 URL 생성 (PKCE 지원)
  - `handleCallback()`: 인증 코드를 토큰으로 교환
  - `refreshAccessToken()`: 토큰 갱신
  - `makeAuthenticatedRequest()`: 인증된 API 요청

### 2. Auth Service (`/src/lib/services/authService.ts`)
- **역할**: 싱글톤 인증 서비스
- **주요 기능**:
  - `initialize()`: 인증 상태 초기화 및 확인
  - `login()`: OAuth2 로그인 프로세스 시작
  - `handleCallback()`: OAuth2 콜백 처리
  - `getAccessToken()`: 유효한 액세스 토큰 반환
  - `fetch()`: 인증된 fetch 래퍼
  - 자동 토큰 갱신 타이머

### 3. OAuth2 Stores (`/src/lib/stores/oauth2.ts`)
- **상태 관리**:
  - `oauth2Authenticated`: 인증 상태
  - `oauth2Session`: 세션 정보
  - `oauth2User`: 사용자 정보
  - `oauth2Error`: 에러 상태
  - `oauth2Loading/Authenticating/Refreshing`: 로딩 상태

### 4. 인증 라우트
- **로그인 페이지** (`/src/routes/auth/login/+page.svelte`)
  - OAuth2 로그인 UI
  - 에러 처리
  - 기능 소개

- **콜백 페이지** (`/src/routes/auth/callback/+page.svelte`)
  - OAuth2 콜백 처리
  - 코드 교환
  - 리다이렉트 관리

### 5. Enhanced AI Chat Service
- **OAuth2 통합**:
  - 토큰 기반 인증 대체
  - `authService.fetch()` 사용
  - MCP 통합 시 OAuth2 토큰 사용

## 인증 흐름

### 1. 초기화
```typescript
// 앱 시작 시
const isAuthenticated = await authService.initialize();
```

### 2. 로그인
```typescript
// 로그인 버튼 클릭
await authService.login(); // OAuth2 제공자로 리다이렉트
```

### 3. 콜백 처리
```typescript
// /auth/callback 페이지에서
const success = await authService.handleCallback(code, state);
```

### 4. API 요청
```typescript
// 인증된 요청
const response = await authService.fetch('https://api.example.com/data');
```

## 환경 변수 설정

```env
VITE_AUTH_SERVER_URL=https://auth.ugot.uk
VITE_CLIENT_NAME=AI Chat Client
```

## 보안 고려사항

### PKCE (Proof Key for Code Exchange)
- 코드 챌린지 및 검증자 사용
- 인증 코드 가로채기 공격 방지

### 상태 매개변수
- CSRF 공격 방지
- 각 인증 요청마다 고유한 상태 생성

### 토큰 저장
- 세션 스토리지 사용 (localStorage 대신)
- XSS 공격 위험 감소

### 자동 토큰 갱신
- 만료 5분 전 자동 갱신
- 갱신 실패 시 재인증 요구

## 기존 시스템과의 호환성

### 하이브리드 지원
```typescript
// OAuth2 우선, 토큰 폴백
if ($oauth2Authenticated) {
    token = await authService.getAccessToken();
} else if (localStorage.token) {
    token = localStorage.token;
}
```

### 점진적 마이그레이션
- 기존 토큰 기반 인증 유지
- OAuth2가 사용 가능할 때만 활성화
- API 호출 시 자동 전환

## 문제 해결

### 인증 실패
1. 브라우저 콘솔에서 오류 확인
2. OAuth2 서버 상태 확인
3. 리다이렉트 URI 설정 확인

### 토큰 갱신 실패
1. 리프레시 토큰 유효성 확인
2. 네트워크 연결 확인
3. 재로그인 필요 여부 확인

### CORS 문제
1. OAuth2 서버 CORS 설정 확인
2. 허용된 origin 확인
3. 인증 헤더 포함 여부 확인

## 향후 개선 사항

1. **Silent Authentication**
   - iframe을 통한 무음 재인증
   - 사용자 경험 개선

2. **Multi-Provider Support**
   - 여러 OAuth2 제공자 지원
   - 소셜 로그인 통합

3. **Token Storage Enhancement**
   - 보안 강화된 토큰 저장소
   - 암호화된 저장

4. **Session Management**
   - 세션 타임아웃 관리
   - 동시 세션 제한

## 테스트

### 단위 테스트
```typescript
// DCR Client 테스트
describe('DCROAuth2Client', () => {
    it('should register client successfully', async () => {
        // 테스트 구현
    });
});
```

### 통합 테스트
```typescript
// Auth Service 테스트
describe('AuthService', () => {
    it('should complete full auth flow', async () => {
        // 테스트 구현
    });
});
```

### E2E 테스트
```typescript
// Playwright 테스트
test('OAuth2 login flow', async ({ page }) => {
    await page.goto('/auth/login');
    await page.click('button:has-text("Sign in with OAuth2")');
    // OAuth2 제공자 로그인
    // 콜백 처리 확인
});
```