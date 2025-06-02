# XState 비주얼 에디터 설정 가이드

이 프로젝트에서는 XState v5를 사용하여 상태 머신을 관리하고 있습니다. XState v5에서 상태 머신을 시각적으로 편집하고 검사하기 위해 다음 단계를 따르세요.

## 타입 생성

상태 머신 파일에서 타입 생성을 위해 다음 명령어를 실행합니다:

```bash
npm run xstate
```

이 명령어는 `src/lib/machines/**/*.ts` 패턴과 일치하는 모든 상태 머신 파일에 대해 타입을 생성합니다.

## 비주얼 에디터 사용하기

XState v5에서는 [Stately.ai](https://stately.ai)에서 제공하는 웹 기반 비주얼 에디터를 사용합니다.

비주얼 에디터를 사용하려면:

1. 브라우저에서 [https://stately.ai/registry/new](https://stately.ai/registry/new)를 방문합니다.
2. 상태 머신 파일(예: `callOverlayMachine.ts`)의 내용을 복사합니다.
3. 페이지에 코드를 붙여넣고 `Parse` 버튼을 클릭합니다.
4. 상태 머신의 시각적 표현을 볼 수 있고 편집할 수 있습니다.

## 로컬 디버깅

개발 중에 상태 머신을 디버깅하려면, 브라우저 콘솔을 사용하여 다음과 같이 상태 변화를 확인할 수 있습니다:

```javascript
// CallOverlay.svelte 파일에서 이미 구현되어 있는 코드:
actor.subscribe((state) => {
  console.log('Machine snapshot:', state);
});
```

## XState v5에서 디버깅 활성화 (옵션)

XState v5에서는 상태 머신을 디버깅하기 위한 여러 가지 방법이 있습니다:

1. `actor.subscribe()` 메서드를 사용하여 상태 변화를 콘솔에 로깅합니다 (이미 구현됨).

2. 개발 중 상태를 시각화하려면 [stately.ai/viz](https://stately.ai/viz) 웹 애플리케이션을 사용하세요.

3. 코드에서 특정 시점의 상태를 검사하려면 `actor.getSnapshot()` 메서드를 사용하세요.

```javascript
// 현재 상태 스냅샷 가져오기
const snapshot = actor.getSnapshot();
console.log('Current state:', snapshot.value);
console.log('Current context:', snapshot.context);
```

## 참고 자료

- [XState v5 문서](https://stately.ai/docs/xstate)
- [Stately.ai Viz](https://stately.ai/viz)
- [XState v5 TypeScript 가이드](https://stately.ai/docs/typescript) 