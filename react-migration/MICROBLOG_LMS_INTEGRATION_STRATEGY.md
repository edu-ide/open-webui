# Microblog-LMS Chat Modal 통합 전략

## 🎯 목표

React-migration 프로젝트를 microblog-lms의 chat modal로 활용하기 위한 최적 프로젝트 구조 설계

## 📋 현재 상황 분석

### 현재 프로젝트 특징
- **독립 실행 가능한 React 앱**: Vite + React 18 + TypeScript
- **MCP 서버 통합**: Zustand 기반 상태 관리
- **Complete UI 컴포넌트**: ChatContainer, ChatInput, Settings Modal 등
- **Tailwind CSS + Ant Design**: 스타일링 시스템

### Microblog-LMS 요구사항
- Chat modal로서 embed 가능해야 함
- 기존 LMS 시스템과 데이터 연동
- 독립적인 상태 관리 필요
- 스타일 충돌 방지

## 🏗️ 권장 프로젝트 구조

### Option 1: Git Submodule (권장)

```
microblog-lms/
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/
├── chat-modal/          # Git Submodule
│   ├── src/
│   │   ├── components/
│   │   ├── stores/
│   │   ├── services/
│   │   └── types/
│   ├── dist/            # Build output
│   ├── package.json
│   └── vite.config.ts
└── docs/
```

**장점:**
- ✅ 독립적인 개발 및 배포
- ✅ 버전 관리 분리
- ✅ 재사용성 극대화
- ✅ 다른 프로젝트에서도 활용 가능

**단점:**
- ❌ 초기 설정 복잡성
- ❌ 의존성 관리 주의 필요

### Option 2: Micro Frontend (고도화 단계)

```
microblog-lms/
├── shell-app/           # Container 앱
├── chat-module/         # 독립 배포 가능한 모듈
├── lms-core/
└── shared-libs/
```

**장점:**
- ✅ 완전한 독립성
- ✅ 런타임 통합
- ✅ 팀별 독립 개발 가능

**단점:**
- ❌ 복잡한 인프라 필요
- ❌ 번들 크기 증가 가능성

### Option 3: Monorepo (중간 복잡도)

```
microblog-lms/
├── packages/
│   ├── chat-modal/
│   ├── lms-core/
│   └── shared-ui/
├── apps/
│   └── web/
└── package.json (workspace)
```

## 🚀 추천 구현 방안: Git Submodule

### 1. 프로젝트 분리 및 설정

```bash
# 1. 현재 react-migration을 독립 저장소로 분리
cd react-migration
git init
git remote add origin <chat-modal-repo-url>

# 2. microblog-lms에서 submodule 추가
cd microblog-lms
git submodule add <chat-modal-repo-url> src/modules/chat-modal
```

### 2. 빌드 설정 최적화

**chat-modal/vite.config.ts**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/main.tsx',
      name: 'ChatModal',
      fileName: 'chat-modal',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})
```

### 3. 통합 인터페이스 설계

**chat-modal/src/types/integration.ts**
```typescript
export interface ChatModalProps {
  // LMS 연동 데이터
  userId: string;
  courseId?: string;
  contextData?: Record<string, any>;
  
  // UI 커스터마이징
  theme?: 'light' | 'dark';
  position?: 'bottom-right' | 'center' | 'sidebar';
  
  // 이벤트 핸들러
  onMessageSent?: (message: string) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

export interface LMSIntegration {
  // 사용자 컨텍스트 전달
  setUserContext: (context: UserContext) => void;
  
  // 채팅 내역 동기화
  syncChatHistory: (messages: ChatMessage[]) => void;
  
  // LMS 데이터 요청
  requestLMSData: (query: string) => Promise<any>;
}
```

### 4. CSS Isolation 전략

**chat-modal/src/styles/isolation.css**
```css
/* CSS Module 또는 Scoped Styles */
.chat-modal-container {
  /* 모든 스타일을 컨테이너 내부로 격리 */
  --chat-primary: #3b82f6;
  --chat-background: #ffffff;
  
  /* CSS Reset within modal */
  * {
    box-sizing: border-box;
  }
}

/* Tailwind CSS Prefix 적용 */
.chat-modal-container .chat-button {
  @apply chat-bg-blue-500 chat-text-white;
}
```

### 5. State Management 격리

**chat-modal/src/stores/integrationStore.ts**
```typescript
interface IntegrationState {
  lmsContext: LMSContext | null;
  isEmbedded: boolean;
  parentCallbacks: ParentCallbacks;
}

export const useIntegrationStore = create<IntegrationState>()((set) => ({
  lmsContext: null,
  isEmbedded: false,
  parentCallbacks: {},
  
  setLMSContext: (context) => set({ lmsContext: context }),
  setEmbeddedMode: (embedded) => set({ isEmbedded: embedded }),
}))
```

## 📦 배포 및 통합 방식

### 1. 개발 환경
```bash
# microblog-lms 개발 서버
npm run dev

# chat-modal 개발 (동시 실행)
cd src/modules/chat-modal
npm run dev
```

### 2. 프로덕션 빌드
```bash
# 1. Chat modal 빌드
cd src/modules/chat-modal
npm run build

# 2. LMS 앱에서 빌드된 모듈 사용
cd ../../
npm run build
```

### 3. LMS 앱에서 사용
```typescript
// microblog-lms/src/components/ChatModal.tsx
import { lazy, Suspense } from 'react'

const ChatModalComponent = lazy(() => 
  import('../modules/chat-modal/dist/chat-modal.es.js')
)

export function ChatModal(props: ChatModalProps) {
  return (
    <Suspense fallback={<div>Loading chat...</div>}>
      <ChatModalComponent {...props} />
    </Suspense>
  )
}
```

## 🔧 개발 워크플로우

### 1. Git Submodule 관리
```bash
# Submodule 업데이트
git submodule update --remote --merge

# 특정 브랜치 추적
git config -f .gitmodules submodule.src/modules/chat-modal.branch main

# Submodule 변경사항 커밋
cd src/modules/chat-modal
git add .
git commit -m "feat: new chat feature"
git push

cd ../../../
git add src/modules/chat-modal
git commit -m "update: chat-modal to latest version"
```

### 2. CI/CD 파이프라인
```yaml
# .github/workflows/build.yml
name: Build and Test
on: [push, pull_request]

jobs:
  test-chat-modal:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: recursive
      
      - name: Test Chat Modal
        run: |
          cd src/modules/chat-modal
          npm install
          npm test
          npm run build
      
      - name: Test LMS Integration
        run: |
          npm install
          npm test
```

## 🎯 최종 권장사항

### 즉시 적용 (Git Submodule)
1. **현재 react-migration을 독립 저장소로 분리**
2. **microblog-lms에 submodule로 추가**
3. **빌드 설정을 라이브러리 모드로 변경**
4. **CSS 격리 및 통합 인터페이스 구현**

### 장기 계획 (Micro Frontend)
1. **모듈 페더레이션 도입 검토**
2. **독립 배포 파이프라인 구축**
3. **다른 LMS 플랫폼으로 확장**

이 방식으로 하면 chat modal의 독립성을 유지하면서도 microblog-lms와 효과적으로 통합할 수 있습니다.