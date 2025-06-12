# MCP Backend API Integration

## Backend API 설계

### 1. API Gateway 설정

Spring Cloud Gateway를 통해 MCP 서버들을 프록시하는 설정:

```yaml
# gateway/application.yml
spring:
  cloud:
    gateway:
      routes:
        # MCP SSE 서버들
        - id: mcp-shrimp
          uri: http://localhost:9093
          predicates:
            - Path=/api/mcp/servers/shrimp/**
          filters:
            - StripPrefix=3
            
        - id: mcp-spring-manager
          uri: http://localhost:9090
          predicates:
            - Path=/api/mcp/servers/spring-manager/**
          filters:
            - StripPrefix=3
            
        - id: mcp-database
          uri: http://localhost:9091
          predicates:
            - Path=/api/mcp/servers/database/**
          filters:
            - StripPrefix=3
```

### 2. MCP Controller (백엔드)

```java
@RestController
@RequestMapping("/api/mcp")
public class McpController {
    
    @Autowired
    private McpServerRegistry registry;
    
    @GetMapping("/servers")
    public List<McpServerInfo> listServers() {
        return registry.getServers();
    }
    
    @PostMapping("/servers/{serverId}/connect")
    public McpConnectionStatus connect(@PathVariable String serverId) {
        return registry.connect(serverId);
    }
    
    @DeleteMapping("/servers/{serverId}/disconnect")
    public void disconnect(@PathVariable String serverId) {
        registry.disconnect(serverId);
    }
    
    @GetMapping("/servers/{serverId}/tools")
    public List<McpTool> listTools(@PathVariable String serverId) {
        return registry.getTools(serverId);
    }
    
    @PostMapping("/servers/{serverId}/tools/execute")
    public McpExecutionResult executeTool(
        @PathVariable String serverId,
        @RequestBody McpToolRequest request
    ) {
        return registry.executeTool(serverId, request);
    }
}
```

### 3. WebSocket/SSE 프록시

```java
@Component
public class McpWebSocketProxy {
    
    @EventListener
    public void handleWebSocketConnection(SessionConnectEvent event) {
        String serverId = extractServerId(event);
        // MCP 서버로 WebSocket 연결 프록시
        proxyWebSocketConnection(serverId, event.getSession());
    }
    
    private void proxyWebSocketConnection(String serverId, WebSocketSession session) {
        McpServer server = registry.getServer(serverId);
        if (server.getType() == McpServerType.SSE) {
            // SSE를 WebSocket으로 변환
            SseEmitter emitter = createSseConnection(server);
            bridgeSseToWebSocket(emitter, session);
        }
    }
}
```

### 4. Spring AI Integration

```java
@Configuration
public class SpringAiMcpConfig {
    
    @Bean
    public McpToolProvider mcpToolProvider(McpServerRegistry registry) {
        return new McpToolProvider(registry);
    }
    
    @Bean
    public ChatClient chatClient(
        ChatClient.Builder builder,
        McpToolProvider mcpToolProvider
    ) {
        return builder
            .defaultTools(mcpToolProvider.getTools())
            .build();
    }
}
```

### 5. 보안 설정

```java
@Configuration
@EnableWebSecurity
public class McpSecurityConfig {
    
    @Bean
    public SecurityFilterChain mcpFilterChain(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/mcp/**").authenticated()
                .requestMatchers("/ws/mcp/**").authenticated()
            )
            .oauth2ResourceServer(OAuth2ResourceServerConfigurer::jwt)
            .build();
    }
}
```

## Frontend 통합

### 1. API 클라이언트 설정

```typescript
// src/services/api/mcpApi.ts
import axios from 'axios';

const mcpApi = axios.create({
  baseURL: '/api/mcp',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 인증 토큰 추가
mcpApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const mcpApiClient = {
  // 서버 관리
  listServers: () => mcpApi.get('/servers'),
  connectServer: (serverId: string) => mcpApi.post(`/servers/${serverId}/connect`),
  disconnectServer: (serverId: string) => mcpApi.delete(`/servers/${serverId}/disconnect`),
  
  // 도구 관리
  listTools: (serverId: string) => mcpApi.get(`/servers/${serverId}/tools`),
  executeTool: (serverId: string, toolName: string, args: any) => 
    mcpApi.post(`/servers/${serverId}/tools/execute`, { toolName, arguments: args }),
};
```

### 2. WebSocket 연결

```typescript
// src/services/mcp/WebSocketClient.ts
export class WebSocketClient extends McpClient {
  private ws: WebSocket | null = null;
  
  async connect(): Promise<void> {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/mcp/${this.config.id}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      this.updateStatus('connected');
      this.initialize();
    };
    
    this.ws.onmessage = (event) => {
      const response = JSON.parse(event.data);
      this.handleResponse(response);
    };
    
    this.ws.onerror = (error) => {
      this.updateStatus('error', 'WebSocket connection error');
    };
    
    this.ws.onclose = () => {
      this.updateStatus('disconnected');
    };
  }
  
  protected async sendRequest(request: JsonRpcRequest): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    
    this.ws.send(JSON.stringify(request));
  }
}
```

## 배포 고려사항

### 1. Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcp-servers-config
data:
  servers.json: |
    {
      "servers": [
        {
          "id": "shrimp-task-manager",
          "name": "Shrimp Task Manager",
          "type": "sse",
          "url": "http://mcp-shrimp-service:9093/mcp/messages"
        },
        {
          "id": "spring-server-manager",
          "name": "Spring Server Manager",
          "type": "sse",
          "url": "http://mcp-spring-service:9090/mcp/messages"
        }
      ]
    }
```

### 2. Service Mesh (Istio) 설정

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: mcp-services
spec:
  hosts:
  - mcp-gateway
  http:
  - match:
    - uri:
        prefix: /api/mcp
    route:
    - destination:
        host: gateway-service
        port:
          number: 8080
    timeout: 30s
    retries:
      attempts: 3
      perTryTimeout: 10s
```

### 3. 모니터링

- Prometheus 메트릭스 수집
- Grafana 대시보드
- ELK 스택 로그 수집
- Jaeger 분산 트레이싱