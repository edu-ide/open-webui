# CopilotKit + MCP Integration

이 디렉토리는 CopilotKit과 MCP (Model Context Protocol) 통합을 구현합니다.

## 구조

```
copilot/
├── CopilotMCPDemo.tsx      # 메인 데모 페이지
├── CopilotMCPProvider.tsx  # CopilotKit Provider 래퍼
├── CopilotMCPClient.tsx    # MCP 클라이언트 통합
└── README.md              # 이 파일
```

## CopilotKit open-mcp-client 참고

실제 CopilotKit의 open-mcp-client 구현은:
- https://github.com/CopilotKit/open-mcp-client

주요 특징:
1. **Frontend (Next.js/React)**: CopilotKit UI 제공
2. **Agent (Python/LangGraph)**: MCP 서버와 실제 통신
3. **useCoAgent**: agent state 관리 (MCP 서버 설정 등)

## 현재 구현

우리의 구현은 Spring Boot 환경에 맞게 조정되었습니다:

1. **Frontend**: React + CopilotKit
   - `useCopilotAction`으로 MCP 도구를 액션으로 등록
   - `useCopilotReadable`로 MCP 상태 공유
   - CopilotSidebar UI 제공

2. **Backend**: Spring Boot
   - `/api/v2/copilot` 엔드포인트
   - CopilotKitService가 Spring AI ChatClient와 연동
   - McpService가 MCP 도구 관리

## 사용법

```tsx
// 1. 데모 페이지 접속
http://localhost:3000/copilot-mcp

// 2. MCP 도구 사용 예시
"What's the weather in Seoul?"
"Calculate the average of [1, 2, 3, 4, 5]"
"Search for Spring AI configuration"
```

## 개선 사항

실제 open-mcp-client처럼 구현하려면:
1. LangGraph agent를 Spring Boot로 포팅
2. 실제 MCP 서버 연결 구현
3. useCoAgent로 동적 MCP 설정 관리