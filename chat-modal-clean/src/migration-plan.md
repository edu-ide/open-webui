# 세 프로젝트 통합 마이그레이션 계획

## 목표: React 19 + HeroUI + Tailwind v4 통합 환경

### Phase 1: React 19 업그레이드 (모든 프로젝트)

#### 1.1 GUI 메인 프로젝트
```json
{
  "overrides": {
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2"
  }
}
```

#### 1.2 microblog-lms 프로젝트
```json
{
  "overrides": {
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2"
  }
}
```

### Phase 2: UI 시스템 통합 - HeroUI + Tailwind v4

#### 2.1 모든 프로젝트에 HeroUI 추가
```json
{
  "dependencies": {
    "@heroui/react": "^2.7.9",
    "@heroui/theme": "^2.4.16",
    "@heroui/toast": "^2.0.10"
  }
}
```

#### 2.2 Tailwind v4 업그레이드
```json
{
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.8",
    "@tailwindcss/vite": "^4.1.8"
  }
}
```

#### 2.3 Emotion → HeroUI 마이그레이션 전략
- Emotion 컴포넌트를 점진적으로 HeroUI로 교체
- 공통 디자인 시스템 컴포넌트 라이브러리 생성
- CSS-in-JS에서 Tailwind 클래스로 전환

### Phase 3: 빌드 도구 및 설정 통합

#### 3.1 통합 Vite 설정
```typescript
// vite.config.ts (공통)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react({
      plugins: [['@swc/plugin-emotion', {}]]
    }),
    tailwindcss()
  ],
  build: {
    target: 'esnext',
    minify: 'swc'
  }
})
```

#### 3.2 통합 TypeScript 설정
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
```

### Phase 4: 상태 관리 표준화

#### 4.1 표준 상태 관리 스택
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.74.3",
    "zustand": "^5.0.3",
    "axios": "^1.9.0"
  }
}
```

#### 4.2 Redux Toolkit → Zustand 마이그레이션 (GUI 메인)
- 복잡한 상태는 Zustand로 단순화
- 서버 상태는 TanStack Query로 관리

### Phase 5: 공통 패키지 최적화

#### 5.1 표준 의존성 버전
```json
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@heroui/react": "^2.7.9",
    "framer-motion": "^12.15.0",
    "lucide-react": "^0.511.0",
    "react-hook-form": "^7.57.0",
    "react-hot-toast": "^2.5.2",
    "react-router-dom": "^7.6.1",
    "axios": "^1.9.0",
    "@tanstack/react-query": "^5.74.3",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "vite": "^6.3.5",
    "typescript": "~5.8.3",
    "@vitejs/plugin-react-swc": "^3.9.0",
    "@tailwindcss/postcss": "^4.1.8",
    "@tailwindcss/vite": "^4.1.8"
  }
}
```

## 마이그레이션 순서

### 1주차: React 19 업그레이드
- [ ] open-webui 설정을 참고하여 GUI 메인, microblog-lms React 19 업그레이드
- [ ] 타입 에러 및 호환성 이슈 해결

### 2주차: Tailwind v4 업그레이드
- [ ] 모든 프로젝트 Tailwind v4로 업그레이드
- [ ] PostCSS 설정 업데이트
- [ ] 기존 Tailwind 클래스 호환성 검증

### 3주차: HeroUI 도입
- [ ] HeroUI 컴포넌트 라이브러리 추가
- [ ] 기본 컴포넌트들 HeroUI로 교체 시작
- [ ] 디자인 시스템 문서화

### 4주차: 상태 관리 표준화
- [ ] TanStack Query 도입 (GUI 메인, microblog-lms)
- [ ] Redux → Zustand 마이그레이션 계획 수립
- [ ] XState 사용처 Zustand로 전환 검토

### 5-6주차: 점진적 통합
- [ ] Emotion 컴포넌트 → HeroUI 전환
- [ ] 공통 컴포넌트 라이브러리 구축
- [ ] 성능 최적화 및 번들 크기 분석

## 위험 요소 및 대응책

### 1. React 19 호환성 이슈
- **위험**: 기존 라이브러리들의 React 19 미지원
- **대응**: overrides 사용하여 강제 호환성 확보

### 2. Emotion → HeroUI 전환 복잡성
- **위험**: 기존 스타일링 로직 재작성 필요
- **대응**: 점진적 마이그레이션, 두 시스템 병행 운영

### 3. 상태 관리 마이그레이션
- **위험**: Redux → Zustand 전환 시 상태 손실
- **대응**: 단계별 마이그레이션, 철저한 테스트

## 성공 지표

- [ ] 모든 프로젝트가 React 19 기반으로 실행
- [ ] 통합된 HeroUI + Tailwind v4 디자인 시스템
- [ ] 번들 크기 20% 이상 감소
- [ ] 빌드 시간 30% 이상 단축
- [ ] 공통 컴포넌트 재사용률 80% 이상