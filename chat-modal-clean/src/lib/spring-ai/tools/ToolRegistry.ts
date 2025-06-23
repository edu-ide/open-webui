import type { 
  ToolRegistry as IToolRegistry, 
  FunctionTool, 
  ToolExecutionHistory,
  SecurityPolicy,
  ToolExecutionContext,
  FunctionCallRequest,
  FunctionCallResult,
  RateLimit
} from './types';

/**
 * 도구 레지스트리 구현
 */
export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, FunctionTool> = new Map();
  private executionHistory: ToolExecutionHistory[] = [];
  private securityPolicy: SecurityPolicy = {};

  /**
   * 도구 등록
   */
  register(tool: FunctionTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /**
   * 도구 등록 해제
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 도구 조회
   */
  get(name: string): FunctionTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 모든 도구 목록
   */
  list(): FunctionTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 카테고리별 도구 목록
   */
  listByCategory(category: string): FunctionTool[] {
    return this.list().filter(tool => tool.definition.category === category);
  }

  /**
   * 도구 검색
   */
  search(query: string): FunctionTool[] {
    const lowercaseQuery = query.toLowerCase();
    
    return this.list().filter(tool => {
      const definition = tool.definition;
      
      // 이름, 설명, 태그에서 검색
      return (
        definition.name.toLowerCase().includes(lowercaseQuery) ||
        definition.description.toLowerCase().includes(lowercaseQuery) ||
        (definition.tags && definition.tags.some(tag => 
          tag.toLowerCase().includes(lowercaseQuery)
        ))
      );
    });
  }

  /**
   * 도구 실행 (보안 검증 포함)
   */
  async execute(
    request: FunctionCallRequest, 
    context?: ToolExecutionContext
  ): Promise<FunctionCallResult> {
    const tool = this.get(request.functionName);
    
    if (!tool) {
      return {
        success: false,
        error: {
          code: 'FUNCTION_NOT_FOUND',
          message: `Function '${request.functionName}' not found`
        },
        timestamp: new Date()
      };
    }

    // 보안 검증
    const securityCheck = this.checkSecurity(request, context);
    if (!securityCheck.allowed) {
      return {
        success: false,
        error: {
          code: 'SECURITY_VIOLATION',
          message: securityCheck.reason || 'Security policy violation'
        },
        timestamp: new Date()
      };
    }

    // 매개변수 검증
    const validation = tool.validate(request.parameters);
    if (!validation.valid) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Parameter validation failed',
          details: validation.errors
        },
        timestamp: new Date()
      };
    }

    try {
      // 실행 시간 측정
      const startTime = Date.now();
      const result = await tool.execute(request, context);
      const executionTime = Date.now() - startTime;

      // 실행 이력 저장
      this.addExecutionHistory({
        id: this.generateId(),
        functionName: request.functionName,
        parameters: request.parameters,
        result,
        timestamp: new Date(),
        executionTime,
        userId: context?.userId,
        sessionId: context?.sessionId
      });

      return {
        ...result,
        executionTime
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          details: error
        },
        timestamp: new Date()
      };
    }
  }

  /**
   * 보안 검증
   */
  private checkSecurity(
    request: FunctionCallRequest, 
    context?: ToolExecutionContext
  ): { allowed: boolean; reason?: string } {
    const policy = this.securityPolicy;
    const tool = this.get(request.functionName);

    if (!tool) {
      return { allowed: false, reason: 'Function not found' };
    }

    // 차단된 함수 체크
    if (policy.blockedFunctions?.includes(request.functionName)) {
      return { allowed: false, reason: 'Function is blocked by security policy' };
    }

    // 허용된 함수 목록이 있는 경우 체크
    if (policy.allowedFunctions && !policy.allowedFunctions.includes(request.functionName)) {
      return { allowed: false, reason: 'Function not in allowed list' };
    }

    // 인증 요구 체크
    if ((policy.requireAuth || tool.definition.requiresAuth) && !context?.userId) {
      return { allowed: false, reason: 'Authentication required' };
    }

    // 위험한 함수 체크
    if (tool.definition.dangerous && context?.environment === 'production') {
      return { allowed: false, reason: 'Dangerous function not allowed in production' };
    }

    // 속도 제한 체크
    const rateLimitCheck = this.checkRateLimit(request.functionName, context);
    if (!rateLimitCheck.allowed) {
      return { allowed: false, reason: rateLimitCheck.reason };
    }

    return { allowed: true };
  }

  /**
   * 속도 제한 체크
   */
  private checkRateLimit(
    functionName: string, 
    context?: ToolExecutionContext
  ): { allowed: boolean; reason?: string } {
    const policy = this.securityPolicy;
    const rateLimits = policy.rateLimits || context?.rateLimits;
    
    if (!rateLimits) {
      return { allowed: true };
    }

    const rateLimit = (rateLimits as Record<string, RateLimit>)[functionName];
    if (!rateLimit) {
      return { allowed: true };
    }

    // 실제 속도 제한 로직 구현 (간단한 예시)
    const now = new Date();
    if (rateLimit.resetTime && now < rateLimit.resetTime) {
      if ((rateLimit.currentCalls || 0) >= rateLimit.maxCalls) {
        return { 
          allowed: false, 
          reason: `Rate limit exceeded. Try again after ${rateLimit.resetTime.toLocaleTimeString()}` 
        };
      }
    } else {
      // 새로운 윈도우 시작
      rateLimit.currentCalls = 0;
      rateLimit.resetTime = new Date(now.getTime() + rateLimit.windowMs);
    }

    // 호출 수 증가
    rateLimit.currentCalls = (rateLimit.currentCalls || 0) + 1;

    return { allowed: true };
  }

  /**
   * 보안 정책 설정
   */
  setSecurityPolicy(policy: SecurityPolicy): void {
    this.securityPolicy = { ...this.securityPolicy, ...policy };
  }

  /**
   * 보안 정책 조회
   */
  getSecurityPolicy(): SecurityPolicy {
    return { ...this.securityPolicy };
  }

  /**
   * 실행 이력 추가
   */
  private addExecutionHistory(history: ToolExecutionHistory): void {
    this.executionHistory.push(history);
    
    // 이력 크기 제한 (최대 1000개)
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }

  /**
   * 실행 이력 조회
   */
  getExecutionHistory(limit: number = 100): ToolExecutionHistory[] {
    return this.executionHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * 함수별 실행 이력 조회
   */
  getExecutionHistoryByFunction(functionName: string, limit: number = 50): ToolExecutionHistory[] {
    return this.executionHistory
      .filter(h => h.functionName === functionName)
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * 실행 이력 통계
   */
  getExecutionStats() {
    const stats = {
      totalExecutions: this.executionHistory.length,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      functionStats: new Map<string, { count: number; avgTime: number; successRate: number }>()
    };

    let totalTime = 0;
    
    this.executionHistory.forEach(history => {
      if (history.result.success) {
        stats.successfulExecutions++;
      } else {
        stats.failedExecutions++;
      }
      
      totalTime += history.executionTime;

      // 함수별 통계
      const funcName = history.functionName;
      const funcStats = stats.functionStats.get(funcName) || { 
        count: 0, 
        avgTime: 0, 
        successRate: 0 
      };
      
      funcStats.count++;
      funcStats.avgTime = (funcStats.avgTime * (funcStats.count - 1) + history.executionTime) / funcStats.count;
      funcStats.successRate = history.result.success ? 
        (funcStats.successRate * (funcStats.count - 1) + 1) / funcStats.count :
        (funcStats.successRate * (funcStats.count - 1)) / funcStats.count;
      
      stats.functionStats.set(funcName, funcStats);
    });

    stats.averageExecutionTime = stats.totalExecutions > 0 ? totalTime / stats.totalExecutions : 0;

    return stats;
  }

  /**
   * ID 생성
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 레지스트리 초기화
   */
  clear(): void {
    this.tools.clear();
    this.executionHistory = [];
    this.securityPolicy = {};
  }
}

/**
 * 전역 도구 레지스트리
 */
export const globalToolRegistry = new ToolRegistry();