import type { 
  ModelProvider as IModelProvider,
  ModelInfo,
  ProviderConfig,
  ProviderStatus,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk
} from '../types';

/**
 * 기본 ModelProvider 추상 클래스
 */
export abstract class BaseModelProvider implements IModelProvider {
  protected config: ProviderConfig = {};
  protected status: ProviderStatus;
  protected usageStats = {
    requests: 0,
    tokens: 0,
    cost: 0
  };

  public readonly name: string;
  public readonly displayName: string;
  public readonly description: string;
  public readonly models: ModelInfo[];
  public readonly defaultModel: string;
  public readonly iconUrl?: string;
  public readonly website?: string;

  constructor(
    name: string,
    displayName: string,
    description: string,
    models: ModelInfo[],
    defaultModel: string,
    iconUrl?: string,
    website?: string
  ) {
    this.name = name;
    this.displayName = displayName;
    this.description = description;
    this.models = models;
    this.defaultModel = defaultModel;
    this.iconUrl = iconUrl;
    this.website = website;
    this.status = {
      name: this.name,
      isAvailable: false,
      lastChecked: new Date()
    };
  }

  // Abstract methods - 각 프로바이더에서 구현
  abstract isAvailable(): Promise<boolean>;
  abstract complete(request: ChatRequest): Promise<ChatResponse>;
  abstract stream(request: ChatRequest): AsyncIterableIterator<ChatStreamChunk>;
  abstract validateConfiguration(): Promise<boolean>;

  // Configuration 관리
  getConfiguration(): ProviderConfig {
    return { ...this.config };
  }

  setConfiguration(config: ProviderConfig): void {
    this.config = { ...this.config, ...config };
  }

  // 모델 관리
  getModel(modelId: string): ModelInfo | null {
    return this.models.find(model => model.id === modelId) || null;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const isAvailable = await this.isAvailable();
    return isAvailable ? this.models : [];
  }

  // 비용 추정
  estimateCost(request: ChatRequest, modelId: string): number {
    const model = this.getModel(modelId);
    if (!model) return 0;

    const inputTokens = this.estimateTokens(request.messages.map(m => m.content).join(' '));
    const outputTokens = request.options.maxTokens || model.maxOutputTokens / 4; // 추정치

    const inputCost = (inputTokens / 1000) * model.inputPricing;
    const outputCost = (outputTokens / 1000) * model.outputPricing;

    return inputCost + outputCost;
  }

  // 상태 모니터링
  async getStatus(): Promise<ProviderStatus> {
    const startTime = Date.now();
    const isAvailable = await this.isAvailable();
    const latency = Date.now() - startTime;

    this.status = {
      ...this.status,
      isAvailable,
      lastChecked: new Date(),
      latency,
      usage: { ...this.usageStats }
    };

    return this.status;
  }

  async getUsage(): Promise<ProviderStatus['usage']> {
    return { ...this.usageStats };
  }

  // 유틸리티 메서드
  protected estimateTokens(text: string): number {
    // 간단한 토큰 추정 (실제로는 더 정교한 계산 필요)
    return Math.ceil(text.length / 4);
  }

  protected updateUsage(requestTokens: number, responseTokens: number, cost: number): void {
    this.usageStats.requests += 1;
    this.usageStats.tokens += requestTokens + responseTokens;
    this.usageStats.cost += cost;
  }

  protected handleApiError(error: any): Error {
    console.error(`${this.name} API Error:`, error);
    
    // 공통 에러 처리
    if (error.code === 'insufficient_quota') {
      return new Error(`${this.displayName}: API 할당량이 부족합니다.`);
    } else if (error.code === 'invalid_api_key') {
      return new Error(`${this.displayName}: API 키가 유효하지 않습니다.`);
    } else if (error.code === 'rate_limit_exceeded') {
      return new Error(`${this.displayName}: 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.`);
    } else if (error.code === 'model_not_found') {
      return new Error(`${this.displayName}: 요청한 모델을 찾을 수 없습니다.`);
    }
    
    return new Error(`${this.displayName}: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
  }

  // 설정 검증 헬퍼
  protected validateApiKey(apiKey?: string): boolean {
    return !!(apiKey && apiKey.trim().length > 0);
  }

  protected validateUrl(url?: string): boolean {
    if (!url) return true; // URL은 선택사항
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * ModelProvider 팩토리
 */
export class ModelProviderFactory {
  private static providers: Map<string, () => IModelProvider> = new Map();

  /**
   * 프로바이더 등록
   */
  static register(name: string, factory: () => IModelProvider): void {
    this.providers.set(name, factory);
  }

  /**
   * 프로바이더 생성
   */
  static create(name: string): IModelProvider | null {
    const factory = this.providers.get(name);
    return factory ? factory() : null;
  }

  /**
   * 등록된 프로바이더 목록
   */
  static getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 모든 프로바이더 인스턴스 생성
   */
  static createAll(): IModelProvider[] {
    return Array.from(this.providers.values()).map(factory => factory());
  }
}

/**
 * ModelProvider 매니저
 */
export class ModelProviderManager {
  private providers: Map<string, IModelProvider> = new Map();
  private activeProvider: string | null = null;

  constructor() {
    this.initializeProviders();
  }

  /**
   * 프로바이더 초기화
   */
  private initializeProviders(): void {
    const allProviders = ModelProviderFactory.createAll();
    allProviders.forEach(provider => {
      this.providers.set(provider.name, provider);
    });
  }

  /**
   * 활성 프로바이더 설정
   */
  setActiveProvider(name: string): boolean {
    if (this.providers.has(name)) {
      this.activeProvider = name;
      return true;
    }
    return false;
  }

  /**
   * 활성 프로바이더 가져오기
   */
  getActiveProvider(): IModelProvider | null {
    if (!this.activeProvider) return null;
    return this.providers.get(this.activeProvider) || null;
  }

  /**
   * 프로바이더 가져오기
   */
  getProvider(name: string): IModelProvider | null {
    return this.providers.get(name) || null;
  }

  /**
   * 모든 프로바이더 가져오기
   */
  getAllProviders(): IModelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 사용 가능한 프로바이더 가져오기
   */
  async getAvailableProviders(): Promise<IModelProvider[]> {
    const providers = this.getAllProviders();
    const availabilityChecks = await Promise.allSettled(
      providers.map(async provider => ({
        provider,
        isAvailable: await provider.isAvailable()
      }))
    );

    return availabilityChecks
      .filter((result): result is PromiseFulfilledResult<{provider: IModelProvider, isAvailable: boolean}> => 
        result.status === 'fulfilled' && result.value.isAvailable
      )
      .map(result => result.value.provider);
  }

  /**
   * 프로바이더 상태 요약
   */
  async getProvidersStatus(): Promise<ProviderStatus[]> {
    const providers = this.getAllProviders();
    const statusChecks = await Promise.allSettled(
      providers.map(provider => provider.getStatus())
    );

    return statusChecks
      .filter((result): result is PromiseFulfilledResult<ProviderStatus> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  /**
   * 최적 프로바이더 자동 선택
   */
  async selectBestProvider(): Promise<IModelProvider | null> {
    const availableProviders = await this.getAvailableProviders();
    
    if (availableProviders.length === 0) {
      return null;
    }

    // 가장 낮은 레이턴시를 가진 프로바이더 선택
    const statusList = await Promise.all(
      availableProviders.map(provider => provider.getStatus())
    );

    const bestProvider = statusList.reduce((best, current) => {
      if (!best.latency) return current;
      if (!current.latency) return best;
      return current.latency < best.latency ? current : best;
    });

    const provider = this.getProvider(bestProvider.name);
    if (provider) {
      this.setActiveProvider(provider.name);
    }

    return provider;
  }
}

export default BaseModelProvider;