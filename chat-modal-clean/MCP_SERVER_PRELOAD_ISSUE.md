# MCP 서버 미리 등록 문제 분석 및 해결방안

## 🔍 문제 현황

MCP 설정 모달을 열었을 때 미리 등록되어야 할 "Upbit MCP Server"가 표시되지 않고, "Add Server" 버튼만 보이는 문제가 발생하고 있습니다.

## 🔍 문제 원인 분석

### 1. 타이밍 이슈 (주요 원인)

```typescript
// 현재 코드 (문제가 있는 부분)
const getMcpManager = () => {
  if (!mcpManager) {
    mcpManager = new McpManager();
    // 문제: setTimeout으로 지연 추가
    setTimeout(() => {
      DEFAULT_SERVERS.forEach(async (server) => {
        // 서버 추가 로직
      });
    }, 100);
  }
  return mcpManager;
};
```

**문제점:**
- `useMcpServers` hook의 `useEffect`가 먼저 실행되어 빈 서버 목록을 가져옴
- 100ms 후에 DEFAULT_SERVERS가 추가되지만, 이미 컴포넌트는 빈 상태로 렌더링됨
- 이벤트 리스너가 설정되기 전에 서버 추가가 완료되면 상태 업데이트를 놓칠 수 있음

### 2. 이벤트 전파 문제

```typescript
// useMcpServers에서 이벤트 리스닝
useEffect(() => {
  const handleServerAdded = () => {
    setServers(manager.getAllServers());
  };
  
  manager.on('serverAdded', handleServerAdded);
  // ...
}, []);
```

**문제점:**
- 이벤트 리스너 등록 전에 서버가 추가되면 `serverAdded` 이벤트를 놓침
- React Query 캐시 무효화가 제대로 작동하지 않을 수 있음

### 3. 싱글톤 패턴의 한계

**문제점:**
- 컴포넌트가 마운트될 때마다 새로운 이벤트 리스너가 추가될 수 있음
- 메모리 누수 가능성
- 상태 동기화가 복잡함

## 💡 해결방안

### 즉시 적용 가능한 해결책

#### 1. 타이밍 문제 해결 (우선 적용)

```typescript
const getMcpManager = () => {
  if (!mcpManager) {
    mcpManager = new McpManager();
    
    // 즉시 서버 추가 (setTimeout 제거)
    DEFAULT_SERVERS.forEach(async (server) => {
      try {
        const existingServers = mcpManager!.getAllServers();
        const serverExists = existingServers.some(s => s.config.id === server.id);
        if (!serverExists) {
          await mcpManager!.addServer(server);
        }
      } catch (error) {
        console.error('Error adding default server:', error);
      }
    });
  }
  return mcpManager;
};
```

#### 2. 상태 동기화 강화

```typescript
// useMcpServers에서 polling 방식 추가
useEffect(() => {
  // 초기 로드
  setServers(manager.getAllServers());
  
  // 서버가 없을 경우 재시도 로직
  const checkServers = () => {
    const currentServers = manager.getAllServers();
    if (currentServers.length === 0) {
      setTimeout(() => {
        setServers(manager.getAllServers());
      }, 200);
    }
  };
  
  checkServers();
  
  // 이벤트 리스너 설정
  // ...
}, []);
```

#### 3. 초기화 상태 확인

```typescript
// McpManager에 초기화 플래그 추가
export class McpManager extends EventEmitter {
  private isInitialized = false;
  
  constructor() {
    super();
    this.initialize();
  }
  
  private async initialize() {
    // 기본 서버 추가
    // ...
    this.isInitialized = true;
    this.emit('initialized');
  }
  
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }
}
```

### 장기적 개선 방안

#### 1. React Context 기반 상태 관리

```typescript
// McpContext 생성
export const McpContext = createContext<{
  servers: McpServerState[];
  addServer: (config: McpServerConfig) => Promise<void>;
  // ...
}>(null!);

// Provider 컴포넌트
export const McpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [servers, setServers] = useState<McpServerState[]>([]);
  const manager = useMemo(() => new McpManager(), []);
  
  // 초기화 및 이벤트 처리
  // ...
  
  return (
    <McpContext.Provider value={{ servers, addServer, ... }}>
      {children}
    </McpContext.Provider>
  );
};
```

#### 2. 지연 로딩 패턴

```typescript
// 서버 목록이 로드될 때까지 로딩 상태 표시
const McpSettingsModal = ({ isOpen, onClose }) => {
  const { servers, isLoading } = useMcpServers();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  // 모달 렌더링
};
```

## 🛠️ 권장 수정 순서

1. **즉시 수정**: `setTimeout` 제거 및 즉시 서버 추가
2. **단기 수정**: 재시도 로직 및 초기화 상태 확인 추가  
3. **중기 수정**: React Context 기반 상태 관리로 전환
4. **장기 수정**: MCP 서버 관리를 위한 전용 상태 관리 라이브러리 도입

## 📝 테스트 방법

1. **개발 환경에서 확인**:
   ```bash
   npm run dev
   ```

2. **브라우저 개발자 도구에서 확인**:
   - Console에서 "MCP Servers:" 로그 확인
   - Network 탭에서 SSE 연결 상태 확인

3. **수동 테스트**:
   - 페이지 새로고침 후 MCP 설정 모달 열기
   - "Upbit MCP Server"가 목록에 표시되는지 확인
   - 연결/해제 기능 정상 작동 확인

## 🎯 예상 결과

수정 완료 후:
- MCP 설정 모달을 열면 즉시 "Upbit MCP Server"가 표시됨
- 서버 연결/해제 기능이 정상 작동함
- 페이지 새로고침 후에도 일관된 동작 보장