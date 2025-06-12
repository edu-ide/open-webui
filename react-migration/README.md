# OpenWebUI React Migration

OpenWebUI의 React 마이그레이션 프로젝트입니다. edusense의 검증된 프론트엔드-백엔드 연동 패턴을 적용하여 안정적이고 확장 가능한 웹 애플리케이션을 구축합니다.

## 🚀 주요 특징

- **Modern React Stack**: React 19 + TypeScript + Vite
- **UI Components**: HeroUI (NextUI 계승) + Tailwind CSS  
- **State Management**: Zustand + TanStack Query
- **Authentication**: JWT 토큰 기반 인증
- **API Integration**: OpenAPI 기반 타입 안전 API 클라이언트
- **Error Handling**: React Error Boundary + 포괄적 에러 처리
- **Development Experience**: Hot Reload + TypeScript + ESLint
- **Container Ready**: Docker + Kubernetes 지원

## 🏗️ 아키텍처

### edusense 연동 패턴 적용

이 프로젝트는 edusense의 검증된 패턴을 적용합니다:

- **API 클라이언트**: OpenAPI 생성 + 안전한 호출 래퍼
- **인증 관리**: 토큰 기반 + 자동 갱신
- **상태 관리**: Context API + React Query
- **에러 핸들링**: Error Boundary + AppError 타입
- **환경 설정**: 개발/운영 분리 + 환경 변수 관리

```
src/
├── api/                     # API 클라이언트 (OpenAPI 생성)
├── services/                # 서비스 레이어
├── hooks/                   # React 훅들
├── contexts/                # Context 제공자들
├── components/              # 재사용 가능한 컴포넌트
├── pages/                   # 페이지 컴포넌트
└── utils/                   # 유틸리티 함수들
```

## 🛠️ 개발 시작하기

### 환경 요구사항

- Node.js 20+
- npm 또는 yarn
- Docker (선택사항)

### 로컬 개발

```bash
# 저장소 클론
git clone <repository-url>
cd react-migration

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.development

# 개발 서버 시작
npm run dev
```

### 환경 변수 설정

`.env.development` 파일에서 필요한 설정을 구성하세요:

```bash
# API 설정
VITE_API_BASE_URL=http://localhost:8080
VITE_API_TIMEOUT=30000

# 인증 설정  
VITE_AUTH_TOKEN_KEY=access_token
VITE_AUTH_REFRESH_KEY=refresh_token

# WebSocket 설정
VITE_WS_URL=ws://localhost:8080/ws

# 개발 모드 플래그
VITE_DEV_MODE=true
VITE_DEBUG_API=true
```

## 📱 사용 가능한 스크립트

```bash
# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build

# 웹컴포넌트 빌드
npm run build:webcomponent

# 린트 검사
npm run lint

# 빌드 미리보기
npm run preview
```

## 🔧 API 클라이언트 사용법

### 기본 사용법

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
  
  return <button onClick={handleLogin}>로그인</button>;
}
```

### 인증 상태 관리

```typescript
import { useAuth } from '../contexts/AuthContext';

function App() {
  const { isAuthenticated, user, signOut } = useAuth();
  
  return (
    <div>
      {isAuthenticated ? (
        <div>
          <p>환영합니다, {user?.name}님!</p>
          <button onClick={signOut}>로그아웃</button>
        </div>
      ) : (
        <LoginForm />
      )}
    </div>
  );
}
```

## 🐳 Docker 배포

### 이미지 빌드

```bash
docker build -t react-migration:latest .
```

### 컨테이너 실행

```bash
docker run -p 3000:3000 \
  -e VITE_API_BASE_URL=https://api.yourdomain.com \
  react-migration:latest
```

## ☸️ Kubernetes 배포

```bash
# 리소스 배포
kubectl apply -f k8s/deployment.yaml

# 상태 확인
kubectl get pods -n ugot -l app=react-migration
```

## 🎯 주요 기능

### 1. 인증 및 토큰 관리

- JWT 토큰 기반 인증
- 자동 토큰 갱신  
- 안전한 토큰 저장
- 인증 상태 전역 관리

### 2. API 통신

- OpenAPI 기반 타입 안전 클라이언트
- 안전한 API 호출 래퍼 
- 자동 에러 처리
- 재시도 로직

### 3. 에러 처리

- React Error Boundary
- 전역 에러 핸들링
- 사용자 친화적 에러 메시지
- 개발자 디버깅 지원

### 4. 로딩 상태

- 다양한 로딩 컴포넌트
- 스켈레톤 UI
- 오버레이 로딩
- 페이지 로딩

### 5. 반응형 디자인

- 모바일 퍼스트 접근
- 적응형 레이아웃
- 터치 친화적 인터페이스

## 🔍 환경별 설정

### 개발 환경

- Hot Reload 활성화
- API 프록시 설정
- 디버깅 도구 활성화
- 실험적 기능 활성화

### 운영 환경

- 프로덕션 최적화
- 압축 및 캐싱
- 보안 헤더 설정
- 모니터링 및 분석

## 📚 개발 가이드

더 자세한 개발 정보는 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)를 참고하세요.

## 🔧 Tilt 개발 환경

```bash
# Tilt 시작 (auto-reload 포함)
tilt up

# 특정 서비스 재빌드
tilt trigger react-migration
```

## 🐛 트러블슈팅

### HMR 문제

```bash
# WSL 환경에서 파일 감시 문제 해결
CHOKIDAR_USEPOLLING=true npm run dev
```

### API 연결 문제

```bash
# 프록시 설정 확인
# vite.config.ts의 proxy 설정 점검
```

### 빌드 에러

```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install
```

## 🤝 기여하기

1. 이슈 생성 또는 확인
2. 피처 브랜치 생성
3. 개발 진행
4. 테스트 실행
5. Pull Request 생성

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

## 🆘 지원

문제가 발생하거나 질문이 있으시면:

1. [Issues](../../issues) 페이지에서 기존 이슈 확인
2. 새로운 이슈 생성
3. 팀 슬랙 채널 문의

---

**Built with ❤️ using edusense patterns**
