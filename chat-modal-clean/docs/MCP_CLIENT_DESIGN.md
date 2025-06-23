# MCP (Model Context Protocol) Client Design for React

## 1. MCP 프로토콜 개요

### 1.1 MCP 서버 타입
현재 프로젝트에서 사용 중인 MCP 서버들:
- **SSE (Server-Sent Events)**: shrimp-task-manager, spring_server_manager, mcp_database_server, upbit-mcp-server, naver-news-mcp-server
- **STDIO (Standard Input/Output)**: github, sequentialthinking, claude-code
- **Command-based**: context7, playwright

### 1.2 핵심 프로토콜 메시지
```typescript
// JSON-RPC 2.0 기반 프로토콜
interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
```

### 1.3 주요 메서드
- `initialize`: 서버 초기화 및 capabilities 협상
- `tools/list`: 사용 가능한 도구 목록 조회
- `tools/call`: 도구 실행
- `resources/list`: 리소스 목록 조회
- `prompts/list`: 프롬프트 목록 조회

## 2. React MCP 클라이언트 요구사항

### 2.1 기능 요구사항
1. **서버 연결 관리**
   - 다중 MCP 서버 동시 연결 지원
   - SSE, WebSocket, HTTP 프로토콜 지원
   - 자동 재연결 및 연결 상태 모니터링

2. **도구 관리**
   - 각 서버별 도구 목록 조회
   - 도구 검색 및 필터링
   - 도구 실행 및 결과 표시
   - 도구 즐겨찾기 기능

3. **실행 관리**
   - 비동기 도구 실행
   - 실행 진행 상태 표시
   - 실행 취소 기능
   - 실행 히스토리

4. **모니터링**
   - 실시간 통신 로그
   - 서버 상태 대시보드
   - 성능 메트릭스

### 2.2 비기능 요구사항
- TypeScript 기반 타입 안전성
- React Query를 통한 상태 관리
- 반응형 UI 디자인
- 다국어 지원 (i18n)

## 3. UI/UX 설계

### 3.1 화면 구성
```
┌─────────────────────────────────────────────────────────────┐
│  MCP Client Dashboard                                       │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│  Server List    │  Main Content Area                       │
│  ┌───────────┐  │  ┌─────────────────────────────────────┐ │
│  │ ● shrimp  │  │  │ Tools Explorer                      │ │
│  │ ● github  │  │  │ ┌─────────────┬─────────────────┐  │ │
│  │ ○ context7│  │  │ │ Tool List   │ Tool Details    │  │ │
│  └───────────┘  │  │ │             │                 │  │ │
│                 │  │ │ - analyze   │ Name: analyze   │  │ │
│  Quick Actions  │  │ │ - execute   │ Server: shrimp  │  │ │
│  ┌───────────┐  │  │ │ - plan      │ Input Schema:   │  │ │
│  │ Connect   │  │  │ │             │ {...}           │  │ │
│  │ Disconnect│  │  │ └─────────────┴─────────────────┘  │ │
│  │ Refresh   │  │  └─────────────────────────────────────┘ │
│  └───────────┘  │                                           │
│                 │  Execution Log                            │
│                 │  ┌─────────────────────────────────────┐ │
│                 │  │ [2025-01-06 10:30:15] Executing...  │ │
│                 │  └─────────────────────────────────────┘ │
└─────────────────┴───────────────────────────────────────────┘
```

### 3.2 컴포넌트 구조
```typescript
// 주요 컴포넌트
- McpDashboard (메인 대시보드)
  - ServerList (서버 목록)
    - ServerItem (개별 서버)
  - ToolsExplorer (도구 탐색기)
    - ToolList (도구 목록)
    - ToolDetails (도구 상세)
    - ToolExecutor (도구 실행기)
  - ExecutionLog (실행 로그)
  - ConnectionStatus (연결 상태)
```

## 4. 백엔드-프론트엔드 연동 아키텍처

### 4.1 통신 아키텍처
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Client   │────▶│  API Gateway     │────▶│  MCP Servers    │
│                 │◀────│  (Spring Boot)   │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         │                       │                         │
         ▼                       ▼                         ▼
    WebSocket/SSE           Proxy/Route              Native MCP
```

### 4.2 API 설계
```typescript
// REST API Endpoints
GET  /api/mcp/servers          // 서버 목록 조회
POST /api/mcp/servers/connect  // 서버 연결
POST /api/mcp/servers/{id}/disconnect  // 서버 연결 해제
GET  /api/mcp/servers/{id}/tools      // 도구 목록 조회
POST /api/mcp/servers/{id}/tools/execute  // 도구 실행

// WebSocket/SSE Endpoints
WS   /ws/mcp/{serverId}        // 실시간 통신
SSE  /sse/mcp/{serverId}       // Server-Sent Events
```

### 4.3 상태 관리 (React Query)
```typescript
// MCP 서버 상태 관리
interface McpServerState {
  id: string;
  name: string;
  type: 'sse' | 'stdio' | 'websocket';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  capabilities: McpCapabilities;
  tools: McpTool[];
}

// React Query Hooks
const useMcpServers = () => useQuery(['mcp', 'servers'], fetchServers);
const useMcpTools = (serverId: string) => useQuery(['mcp', 'tools', serverId], () => fetchTools(serverId));
const useMcpExecute = () => useMutation(executeTool);
```

## 5. 구현 로드맵

### Phase 1: 기본 인프라 (1주)
- [ ] MCP 프로토콜 타입 정의
- [ ] 기본 API 클라이언트 구현
- [ ] React Query 설정
- [ ] 기본 UI 레이아웃

### Phase 2: 서버 연결 관리 (1주)
- [ ] 서버 목록 UI
- [ ] 연결/해제 기능
- [ ] 연결 상태 모니터링
- [ ] 자동 재연결

### Phase 3: 도구 관리 (2주)
- [ ] 도구 목록 조회
- [ ] 도구 상세 정보
- [ ] 도구 실행 UI
- [ ] 실행 결과 표시

### Phase 4: 고급 기능 (2주)
- [ ] 실시간 로그
- [ ] 실행 히스토리
- [ ] 성능 모니터링
- [ ] 에러 처리

### Phase 5: 최적화 및 마무리 (1주)
- [ ] 성능 최적화
- [ ] 테스트 작성
- [ ] 문서화
- [ ] 배포 준비

## 6. 기술 스택

### Frontend
- React 18.x
- TypeScript 5.x
- React Query (TanStack Query)
- Ant Design / Material-UI
- Socket.io-client (WebSocket)
- EventSource (SSE)

### Backend Integration
- Spring Boot 3.x
- Spring WebFlux (반응형)
- SSE/WebSocket 지원
- MCP 프록시 서버

## 7. 보안 고려사항
- API 인증/인가
- MCP 서버 접근 제어
- 통신 암호화 (TLS)
- 입력 검증 및 sanitization

## 8. 확장성 고려사항
- 플러그인 아키텍처
- 커스텀 MCP 서버 지원
- 다중 테넌트 지원
- 수평적 확장 가능