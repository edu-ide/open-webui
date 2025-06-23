import { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  SelectItem,
  Textarea,
  Chip,
  Divider,
  Code,
  Badge,
  Tabs,
  Tab,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure
} from '@heroui/react';
import { 
  ToolSystem,
  BUILTIN_TOOLS_METADATA,
  TOOL_CATEGORIES,
  type FunctionCallResult
} from '../../lib/spring-ai/tools';

interface FunctionCallingComponentProps {
  onResult?: (result: FunctionCallResult) => void;
}

export function FunctionCallingComponent({ onResult }: FunctionCallingComponentProps) {
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<FunctionCallResult | null>(null);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [modalContent, setModalContent] = useState<any>(null);

  useEffect(() => {
    // 도구 시스템 초기화
    ToolSystem.initialize({
      weatherApiKey: process.env.REACT_APP_WEATHER_API_KEY
    });
    
    loadAvailableTools();
    loadExecutionHistory();
    loadStats();
  }, []);

  const loadAvailableTools = () => {
    const tools = ToolSystem.getAvailableTools();
    setAvailableTools(tools);
  };

  const loadExecutionHistory = () => {
    const history = ToolSystem.getExecutionHistory(10);
    setExecutionHistory(history);
  };

  const loadStats = () => {
    const statistics = ToolSystem.getExecutionStats();
    setStats(statistics);
  };

  const handleToolSelect = (toolName: string) => {
    setSelectedTool(toolName);
    setParameters({});
    setExecutionResult(null);
  };

  const handleParameterChange = (paramName: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const executeTool = async () => {
    if (!selectedTool) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const result = await ToolSystem.executeTool(selectedTool, parameters);
      setExecutionResult(result);
      
      if (onResult) {
        onResult(result);
      }

      // 통계 및 이력 새로고침
      loadExecutionHistory();
      loadStats();

    } catch (error) {
      setExecutionResult({
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : '알 수 없는 오류'
        },
        timestamp: new Date()
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const getSelectedToolInfo = () => {
    return availableTools.find(tool => tool.name === selectedTool);
  };

  const getFilteredTools = () => {
    if (selectedCategory === 'all') {
      return availableTools;
    }
    return availableTools.filter(tool => tool.category === selectedCategory);
  };

  const showDetailModal = (content: any, title: string) => {
    setModalContent({ content, title });
    onOpen();
  };

  const renderParameterInput = (param: any) => {
    const value = parameters[param.name] || '';

    switch (param.type) {
      case 'boolean':
        return (
          <Select
            label={param.name}
            description={param.description}
            selectedKeys={value ? ['true'] : ['false']}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string;
              handleParameterChange(param.name, selected === 'true');
            }}
          >
            <SelectItem key="true">True</SelectItem>
            <SelectItem key="false">False</SelectItem>
          </Select>
        );

      case 'number':
        return (
          <Input
            type="number"
            label={param.name}
            description={param.description}
            value={value.toString()}
            onChange={(e) => handleParameterChange(param.name, parseFloat(e.target.value) || 0)}
            min={param.minimum}
            max={param.maximum}
          />
        );

      default:
        if (param.enum) {
          return (
            <Select
              label={param.name}
              description={param.description}
              selectedKeys={value ? [value] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                handleParameterChange(param.name, selected);
              }}
            >
              {param.enum.map((option: any) => (
                <SelectItem key={option}>
                  {option}
                </SelectItem>
              ))}
            </Select>
          );
        }

        if (param.maxLength && param.maxLength > 100) {
          return (
            <Textarea
              label={param.name}
              description={param.description}
              value={value}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
              maxLength={param.maxLength}
              minLength={param.minLength}
            />
          );
        }

        return (
          <Input
            label={param.name}
            description={param.description}
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            maxLength={param.maxLength}
            minLength={param.minLength}
          />
        );
    }
  };

  const renderExecutionResult = () => {
    if (!executionResult) return null;

    return (
      <Card className="mt-4">
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <h4 className="text-lg font-semibold">실행 결과</h4>
            <Chip
              color={executionResult.success ? 'success' : 'danger'}
              variant="flat"
            >
              {executionResult.success ? '성공' : '실패'}
            </Chip>
          </div>
        </CardHeader>
        <CardBody>
          {executionResult.success ? (
            <div className="space-y-3">
              <div>
                <h5 className="font-medium mb-2">결과 데이터:</h5>
                <Code className="w-full p-3 max-h-96 overflow-auto">
                  {JSON.stringify(executionResult.result, null, 2)}
                </Code>
              </div>
              {executionResult.executionTime && (
                <div className="text-sm text-gray-600">
                  실행 시간: {executionResult.executionTime}ms
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <h5 className="font-medium mb-2 text-red-600">오류:</h5>
                <div className="text-red-500">
                  <strong>{executionResult.error?.code}</strong>: {executionResult.error?.message}
                </div>
              </div>
              {executionResult.error?.details && (
                <div>
                  <h5 className="font-medium mb-2">상세 정보:</h5>
                  <Code className="w-full p-3 max-h-48 overflow-auto">
                    {JSON.stringify(executionResult.error.details, null, 2)}
                  </Code>
                </div>
              )}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-3">
            {executionResult.timestamp.toLocaleString()}
          </div>
        </CardBody>
      </Card>
    );
  };

  const toolInfo = getSelectedToolInfo();

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Function Calling / Tools</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            onClick={() => showDetailModal(stats, '실행 통계')}
          >
            통계 보기
          </Button>
          <Button
            size="sm"
            variant="flat"
            onClick={() => showDetailModal(executionHistory, '실행 이력')}
          >
            이력 보기
          </Button>
        </div>
      </div>

      <Tabs
        selectedKey={selectedCategory}
        onSelectionChange={(key) => setSelectedCategory(key as string)}
      >
        <Tab key="all" title="전체">
          <div className="mt-4 space-y-4">
            <Select
              label="사용할 도구 선택"
              placeholder="도구를 선택하세요"
              selectedKeys={selectedTool ? [selectedTool] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) handleToolSelect(selected);
              }}
            >
              {getFilteredTools().map((tool) => (
                <SelectItem key={tool.name}>
                  {BUILTIN_TOOLS_METADATA[tool.name as keyof typeof BUILTIN_TOOLS_METADATA]?.displayName || tool.name}
                </SelectItem>
              ))}
            </Select>
          </div>
        </Tab>

        {Object.entries(TOOL_CATEGORIES).map(([key, label]) => (
          <Tab key={key} title={label}>
            <div className="mt-4 space-y-4">
              <Select
                label={`${label} 도구 선택`}
                placeholder="도구를 선택하세요"
                selectedKeys={selectedTool ? [selectedTool] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  if (selected) handleToolSelect(selected);
                }}
              >
                {getFilteredTools().map((tool) => (
                  <SelectItem key={tool.name}>
                    {BUILTIN_TOOLS_METADATA[tool.name as keyof typeof BUILTIN_TOOLS_METADATA]?.displayName || tool.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </Tab>
        ))}
      </Tabs>

      {toolInfo && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start w-full">
              <div>
                <h3 className="text-lg font-semibold">{toolInfo.name}</h3>
                <p className="text-gray-600">{toolInfo.description}</p>
              </div>
              <Chip size="sm" variant="flat">
                {TOOL_CATEGORIES[toolInfo.category as keyof typeof TOOL_CATEGORIES] || toolInfo.category}
              </Chip>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <h4 className="font-medium">매개변수:</h4>
              {toolInfo.parameters.map((param: any) => (
                <div key={param.name} className="space-y-2">
                  {renderParameterInput(param)}
                  {param.required && (
                    <Badge color="danger" size="sm">필수</Badge>
                  )}
                </div>
              ))}

              <Divider />

              {toolInfo.examples && toolInfo.examples.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">사용 예시:</h4>
                  <div className="space-y-2">
                    {toolInfo.examples.map((example: any, index: number) => (
                      <Card key={index} className="p-3 bg-gray-50">
                        <p className="text-sm font-medium">{example.description}</p>
                        <Code className="text-xs mt-1">
                          {JSON.stringify(example.parameters, null, 2)}
                        </Code>
                        {example.expectedResult && (
                          <Button
                            size="sm"
                            variant="flat"
                            onClick={() => setParameters(example.parameters)}
                            className="mt-2"
                          >
                            이 예시 사용
                          </Button>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <Divider />

              <Button
                color="primary"
                onClick={executeTool}
                isLoading={isExecuting}
                isDisabled={!selectedTool}
                className="w-full"
              >
                {isExecuting ? '실행 중...' : '도구 실행'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {renderExecutionResult()}

      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader>{modalContent?.title}</ModalHeader>
          <ModalBody>
            <Code className="w-full max-h-96 overflow-auto">
              {JSON.stringify(modalContent?.content, null, 2)}
            </Code>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>
              닫기
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}