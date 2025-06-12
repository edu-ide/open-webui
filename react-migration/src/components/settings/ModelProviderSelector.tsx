import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Select,
  SelectItem,
  Chip,
  Progress,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Tabs,
  Tab
} from '@heroui/react';
import { 
  Settings, 
  Zap, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Eye,
  EyeOff,
  RefreshCw,
  Save
} from 'lucide-react';
import type { 
  ModelProvider, 
  ModelInfo, 
  ProviderConfig, 
  ProviderStatus 
} from '../../lib/spring-ai/types';
import { ModelProviderManager } from '../../lib/spring-ai/providers/ModelProvider';
import { OpenAIProvider } from '../../lib/spring-ai/providers/OpenAIProvider';
import { AnthropicProvider } from '../../lib/spring-ai/providers/AnthropicProvider';

/**
 * 프로바이더 카드 컴포넌트
 */
interface ProviderCardProps {
  provider: ModelProvider;
  status?: ProviderStatus;
  isActive: boolean;
  onClick: () => void;
  onConfigure: () => void;
}

function ProviderCard({ provider, status, isActive, onClick, onConfigure }: ProviderCardProps) {
  const getStatusColor = (status?: ProviderStatus) => {
    if (!status) return 'default';
    return status.isAvailable ? 'success' : 'danger';
  };

  const getStatusIcon = (status?: ProviderStatus) => {
    if (!status) return <AlertTriangle size={16} />;
    return status.isAvailable ? <CheckCircle size={16} /> : <XCircle size={16} />;
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-lg ${
        isActive ? 'ring-2 ring-primary border-primary' : ''
      }`}
      isPressable
      onPress={onClick}
    >
      <CardHeader className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          {provider.iconUrl && (
            <img 
              src={provider.iconUrl} 
              alt={provider.displayName}
              className="w-8 h-8 rounded"
            />
          )}
          <div>
            <h3 className="font-semibold">{provider.displayName}</h3>
            <p className="text-sm text-gray-600">{provider.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
            getStatusColor(status) === 'success' 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            {getStatusIcon(status)}
            <span>{status?.isAvailable ? '사용 가능' : '사용 불가'}</span>
          </div>
          
          <Button
            size="sm"
            variant="light"
            isIconOnly
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
          >
            <Settings size={16} />
          </Button>
        </div>
      </CardHeader>

      <CardBody className="pt-0">
        <div className="space-y-3">
          {/* 모델 정보 */}
          <div>
            <p className="text-sm font-medium mb-2">사용 가능한 모델 ({provider.models.length}개)</p>
            <div className="flex flex-wrap gap-1">
              {provider.models.slice(0, 3).map(model => (
                <Chip key={model.id} size="sm" variant="flat">
                  {model.name}
                </Chip>
              ))}
              {provider.models.length > 3 && (
                <Chip size="sm" variant="flat" color="default">
                  +{provider.models.length - 3}개 더
                </Chip>
              )}
            </div>
          </div>

          {/* 성능 지표 */}
          {status && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <Clock size={12} className="mx-auto mb-1" />
                <div className="font-medium">{status.latency || '-'}ms</div>
                <div className="text-gray-500">지연시간</div>
              </div>
              <div className="text-center">
                <Zap size={12} className="mx-auto mb-1" />
                <div className="font-medium">{status.usage?.requests || 0}</div>
                <div className="text-gray-500">요청 수</div>
              </div>
              <div className="text-center">
                <DollarSign size={12} className="mx-auto mb-1" />
                <div className="font-medium">${(status.usage?.cost || 0).toFixed(4)}</div>
                <div className="text-gray-500">비용</div>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * 모델 상세 정보 컴포넌트
 */
interface ModelDetailProps {
  model: ModelInfo;
}

function ModelDetail({ model }: ModelDetailProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <h4 className="font-semibold">{model.name}</h4>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-600">{model.description}</p>
        
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">컨텍스트 길이:</span>
            <span className="ml-2">{model.contextLength.toLocaleString()} 토큰</span>
          </div>
          <div>
            <span className="font-medium">최대 출력:</span>
            <span className="ml-2">{model.maxOutputTokens.toLocaleString()} 토큰</span>
          </div>
          <div>
            <span className="font-medium">입력 가격:</span>
            <span className="ml-2">${model.inputPricing}/1K 토큰</span>
          </div>
          <div>
            <span className="font-medium">출력 가격:</span>
            <span className="ml-2">${model.outputPricing}/1K 토큰</span>
          </div>
        </div>

        {/* 기능 */}
        <div>
          <p className="font-medium mb-2">지원 기능:</p>
          <div className="flex flex-wrap gap-2">
            {model.capabilities.map(cap => (
              <Chip
                key={cap.type}
                size="sm"
                color={cap.supported ? 'success' : 'default'}
                variant={cap.supported ? 'solid' : 'bordered'}
              >
                {cap.type}
              </Chip>
            ))}
          </div>
        </div>

        {/* 매개변수 범위 */}
        {model.parameters && (
          <div>
            <p className="font-medium mb-2">매개변수 범위:</p>
            <div className="space-y-2 text-sm">
              {model.parameters.temperature && (
                <div>
                  Temperature: {model.parameters.temperature.min} - {model.parameters.temperature.max} 
                  (기본: {model.parameters.temperature.default})
                </div>
              )}
              {model.parameters.maxTokens && (
                <div>
                  Max Tokens: {model.parameters.maxTokens.min} - {model.parameters.maxTokens.max.toLocaleString()} 
                  (기본: {model.parameters.maxTokens.default})
                </div>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * 프로바이더 설정 모달
 */
interface ProviderConfigModalProps {
  provider: ModelProvider | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ProviderConfig) => void;
}

function ProviderConfigModal({ provider, isOpen, onClose, onSave }: ProviderConfigModalProps) {
  const [config, setConfig] = useState<ProviderConfig>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (provider) {
      setConfig(provider.getConfiguration());
    }
  }, [provider]);

  const handleValidate = async () => {
    if (!provider) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      provider.setConfiguration(config);
      const isValid = await provider.validateConfiguration();
      setValidationResult({
        success: isValid,
        message: isValid ? '설정이 유효합니다!' : '설정을 확인해주세요.'
      });
    } catch (error) {
      setValidationResult({
        success: false,
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  if (!provider) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl">
      <ModalContent>
        <ModalHeader>
          {provider.displayName} 설정
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {/* API 키 */}
            <div>
              <Input
                label="API 키"
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey || ''}
                onValueChange={(value) => setConfig({ ...config, apiKey: value })}
                endContent={
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                }
                description={`${provider.displayName} API 키를 입력하세요`}
              />
            </div>

            {/* Base URL (선택사항) */}
            <Input
              label="Base URL (선택사항)"
              value={config.baseUrl || ''}
              onValueChange={(value) => setConfig({ ...config, baseUrl: value })}
              description="커스텀 API 엔드포인트를 사용하는 경우에만 입력"
            />

            {/* 고급 설정 */}
            <div className="space-y-3">
              <h4 className="font-medium">고급 설정</h4>
              
              <Input
                label="타임아웃 (초)"
                type="number"
                value={config.timeout ? (config.timeout / 1000).toString() : '30'}
                onValueChange={(value) => setConfig({ 
                  ...config, 
                  timeout: parseInt(value) * 1000 
                })}
                min="5"
                max="300"
              />

              <Input
                label="재시도 횟수"
                type="number"
                value={config.retryCount?.toString() || '3'}
                onValueChange={(value) => setConfig({ 
                  ...config, 
                  retryCount: parseInt(value) 
                })}
                min="0"
                max="10"
              />

              <Input
                label="분당 요청 제한"
                type="number"
                value={config.rateLimitPerMinute?.toString() || '60'}
                onValueChange={(value) => setConfig({ 
                  ...config, 
                  rateLimitPerMinute: parseInt(value) 
                })}
                min="1"
                max="1000"
              />
            </div>

            {/* 조직 ID (OpenAI) */}
            {provider.name === 'openai' && (
              <Input
                label="조직 ID (선택사항)"
                value={config.organization || ''}
                onValueChange={(value) => setConfig({ ...config, organization: value })}
                description="OpenAI 조직을 사용하는 경우에만 입력"
              />
            )}

            {/* 검증 결과 */}
            {validationResult && (
              <div className={`p-3 rounded ${
                validationResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {validationResult.message}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            취소
          </Button>
          <Button
            color="secondary"
            onPress={handleValidate}
            isLoading={isValidating}
            startContent={<CheckCircle size={16} />}
          >
            검증
          </Button>
          <Button
            color="primary"
            onPress={handleSave}
            startContent={<Save size={16} />}
          >
            저장
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * 메인 ModelProviderSelector 컴포넌트
 */
export function ModelProviderSelector() {
  const [manager] = useState(() => new ModelProviderManager());
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [providersStatus, setProvidersStatus] = useState<Map<string, ProviderStatus>>(new Map());
  const [activeProvider, setActiveProvider] = useState<ModelProvider | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('providers');

  const { 
    isOpen: isConfigOpen, 
    onOpen: onConfigOpen, 
    onClose: onConfigClose 
  } = useDisclosure();
  const [configProvider, setConfigProvider] = useState<ModelProvider | null>(null);

  // 프로바이더 초기화
  useEffect(() => {
    initializeProviders();
  }, []);

  const initializeProviders = async () => {
    setIsLoading(true);
    
    try {
      // 프로바이더 등록 (실제로는 앱 시작시 한번만)
      const { ModelProviderFactory } = await import('../../lib/spring-ai/providers/ModelProvider');
      
      if (ModelProviderFactory.getRegisteredProviders().length === 0) {
        ModelProviderFactory.register('openai', () => new OpenAIProvider());
        ModelProviderFactory.register('anthropic', () => new AnthropicProvider());
      }

      const allProviders = manager.getAllProviders();
      setProviders(allProviders);

      // 상태 확인
      await refreshProvidersStatus();

      // 저장된 활성 프로바이더 복원
      const savedProvider = localStorage.getItem('activeProvider');
      if (savedProvider) {
        const provider = manager.getProvider(savedProvider);
        if (provider) {
          setActiveProvider(provider);
          manager.setActiveProvider(savedProvider);
        }
      }
      
    } catch (error) {
      console.error('프로바이더 초기화 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProvidersStatus = async () => {
    try {
      const statusList = await manager.getProvidersStatus();
      const statusMap = new Map();
      statusList.forEach(status => {
        statusMap.set(status.name, status);
      });
      setProvidersStatus(statusMap);
    } catch (error) {
      console.error('프로바이더 상태 조회 실패:', error);
    }
  };

  const handleProviderSelect = useCallback((provider: ModelProvider) => {
    setActiveProvider(provider);
    manager.setActiveProvider(provider.name);
    setSelectedModel(provider.defaultModel);
    
    // 설정 저장
    localStorage.setItem('activeProvider', provider.name);
    localStorage.setItem('selectedModel', provider.defaultModel);
  }, [manager]);

  const handleProviderConfigure = useCallback((provider: ModelProvider) => {
    setConfigProvider(provider);
    onConfigOpen();
  }, [onConfigOpen]);

  const handleConfigSave = useCallback((config: ProviderConfig) => {
    if (configProvider) {
      configProvider.setConfiguration(config);
      
      // 설정을 localStorage에 저장
      localStorage.setItem(`provider_config_${configProvider.name}`, JSON.stringify(config));
      
      // 상태 새로고침
      refreshProvidersStatus();
    }
  }, [configProvider]);

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem('selectedModel', modelId);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Progress size="sm" isIndeterminate aria-label="로딩 중..." />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">AI 모델 프로바이더</h1>
        <p className="text-gray-600">AI 모델 프로바이더를 선택하고 설정을 관리하세요.</p>
      </div>

      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as string)}>
        <Tab key="providers" title="프로바이더">
          <div className="space-y-6">
            {/* 새로고침 버튼 */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">사용 가능한 프로바이더</h2>
                <p className="text-sm text-gray-600">AI 모델을 제공하는 서비스를 선택하세요</p>
              </div>
              <Button
                variant="flat"
                startContent={<RefreshCw size={16} />}
                onClick={refreshProvidersStatus}
              >
                상태 새로고침
              </Button>
            </div>

            {/* 프로바이더 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map(provider => (
                <ProviderCard
                  key={provider.name}
                  provider={provider}
                  status={providersStatus.get(provider.name)}
                  isActive={activeProvider?.name === provider.name}
                  onClick={() => handleProviderSelect(provider)}
                  onConfigure={() => handleProviderConfigure(provider)}
                />
              ))}
            </div>
          </div>
        </Tab>

        <Tab key="models" title="모델">
          {activeProvider ? (
            <div className="space-y-6">
              {/* 모델 선택 */}
              <div>
                <h2 className="text-lg font-semibold mb-4">
                  {activeProvider.displayName} 모델 선택
                </h2>
                <Select
                  label="사용할 모델"
                  selectedKeys={selectedModel ? [selectedModel] : []}
                  onSelectionChange={(keys) => {
                    const modelId = Array.from(keys)[0] as string;
                    if (modelId) handleModelSelect(modelId);
                  }}
                  className="max-w-md"
                >
                  {activeProvider.models.map(model => (
                    <SelectItem key={model.id}>
                      {model.name} - ${model.inputPricing}/1K 토큰
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* 선택된 모델 상세 정보 */}
              {selectedModel && (
                <div>
                  <h3 className="text-md font-semibold mb-4">모델 상세 정보</h3>
                  {(() => {
                    const model = activeProvider.getModel(selectedModel);
                    return model ? <ModelDetail model={model} /> : null;
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">먼저 프로바이더를 선택해주세요.</p>
            </div>
          )}
        </Tab>

        <Tab key="usage" title="사용량">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">사용량 현황</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from(providersStatus.entries()).map(([name, status]) => (
                status.usage && (
                  <Card key={name}>
                    <CardBody>
                      <h4 className="font-semibold mb-2">
                        {providers.find(p => p.name === name)?.displayName}
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>요청 수:</span>
                          <span>{status.usage.requests}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>토큰 수:</span>
                          <span>{status.usage.tokens.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>비용:</span>
                          <span>${status.usage.cost.toFixed(4)}</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )
              ))}
            </div>
          </div>
        </Tab>
      </Tabs>

      {/* 설정 모달 */}
      <ProviderConfigModal
        provider={configProvider}
        isOpen={isConfigOpen}
        onClose={onConfigClose}
        onSave={handleConfigSave}
      />
    </div>
  );
}

export default ModelProviderSelector;