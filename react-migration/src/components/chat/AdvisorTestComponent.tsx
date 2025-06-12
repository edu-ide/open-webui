import { useState, useEffect } from 'react';
import { 
  Button, 
  Card, 
  CardBody, 
  CardHeader, 
  Switch, 
  Textarea, 
  Select, 
  SelectItem,
  Chip,
  Progress
} from '@heroui/react';
import { 
  AdvisorPresets, 
  AdvisorFactory, 
  AdvisorManager,
  type AdvisorChain,
  type MemoryAdvisor
} from '../../lib/spring-ai/advisors';
import type { ChatRequest } from '../../lib/spring-ai/types';

/**
 * Advisor 시스템 테스트 컴포넌트
 */
export function AdvisorTestComponent() {
  const [selectedPreset, setSelectedPreset] = useState<string>('basic');
  const [currentChain, setCurrentChain] = useState<AdvisorChain | null>(null);
  const [testInput, setTestInput] = useState('안녕하세요! Spring AI Advisor 시스템을 테스트합니다.');
  const [testResults, setTestResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chainInfo, setChainInfo] = useState<any>(null);
  
  // Advisor 설정
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [safeguardEnabled, setSafeguardEnabled] = useState(true);
  const [enhancerEnabled, setEnhancerEnabled] = useState(true);
  
  const presets = [
    { key: 'basic', label: '기본 (메모리 + 안전가드)' },
    { key: 'enhanced', label: '강화됨 (전체 기능)' },
    { key: 'developer', label: '개발자용' },
    { key: 'secure', label: '보안 중심' },
    { key: 'creative', label: '창작용' },
    { key: 'custom', label: '커스텀' }
  ];

  useEffect(() => {
    initializeChain();
  }, [selectedPreset, memoryEnabled, safeguardEnabled, enhancerEnabled]);

  const initializeChain = () => {
    let chain: AdvisorChain;

    if (selectedPreset === 'custom') {
      chain = AdvisorFactory.createCustomChain();
      
      if (memoryEnabled) {
        chain.add(AdvisorFactory.createMemoryAdvisor({
          maxMessages: 20,
          maxTokens: 3000,
          preserveSystemMessage: true
        }));
      }
      
      if (safeguardEnabled) {
        chain.add(AdvisorFactory.createSafeguardAdvisor({
          enableContentFiltering: true,
          enablePrivacyMasking: true,
          enableSpamPrevention: true
        }));
      }
      
      if (enhancerEnabled) {
        chain.add(AdvisorFactory.createPromptEnhancerAdvisor({
          enableAutoContext: true,
          enableClarityEnhancement: true,
          enableStructuredOutput: true
        }));
      }
    } else {
      switch (selectedPreset) {
        case 'basic':
          chain = AdvisorPresets.basic();
          break;
        case 'enhanced':
          chain = AdvisorPresets.enhanced();
          break;
        case 'developer':
          chain = AdvisorPresets.developer();
          break;
        case 'secure':
          chain = AdvisorPresets.secure();
          break;
        case 'creative':
          chain = AdvisorPresets.creative();
          break;
        default:
          chain = AdvisorPresets.basic();
      }
    }

    setCurrentChain(chain);
    setChainInfo(AdvisorManager.summarizeChain(chain));
  };

  const handleBasicTest = async () => {
    if (!currentChain) return;
    
    setIsLoading(true);
    setTestResults(null);

    try {
      const request: ChatRequest = {
        messages: [
          { role: 'user', content: testInput }
        ],
        options: {
          model: 'gpt-3.5-turbo',
          temperature: 0.7
        }
      };

      const startTime = Date.now();
      const processedRequest = await currentChain.executeRequestAdvisors(request);
      const requestProcessingTime = Date.now() - startTime;

      // 모의 응답 생성
      const mockResponse = {
        id: 'test-response',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: `Advisor 처리된 응답: "${processedRequest.messages[processedRequest.messages.length - 1]?.content}"`
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150
        }
      };

      const responseStartTime = Date.now();
      const processedResponse = await currentChain.executeResponseAdvisors(mockResponse, processedRequest);
      const responseProcessingTime = Date.now() - responseStartTime;

      setTestResults({
        original: request,
        processedRequest,
        processedResponse,
        timing: {
          requestProcessing: requestProcessingTime,
          responseProcessing: responseProcessingTime,
          total: requestProcessingTime + responseProcessingTime
        },
        changes: {
          requestChanged: JSON.stringify(request) !== JSON.stringify(processedRequest),
          responseChanged: JSON.stringify(mockResponse) !== JSON.stringify(processedResponse)
        }
      });

    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePerformanceTest = async () => {
    if (!currentChain) return;
    
    setIsLoading(true);

    try {
      const testRequests: ChatRequest[] = [
        { messages: [{ role: 'user', content: '간단한 질문입니다.' }], options: {} },
        { messages: [{ role: 'user', content: 'password: secret123' }], options: {} },
        { messages: [{ role: 'user', content: 'JavaScript 코드를 작성해주세요.' }], options: {} },
        { messages: [{ role: 'user', content: '뭐' }], options: {} },
        { messages: [{ role: 'user', content: '창의적인 이야기를 써주세요.' }], options: {} }
      ];

      const performance = await AdvisorManager.analyzeChainPerformance(currentChain, testRequests);
      
      setTestResults({
        performance,
        chainInfo: currentChain.getChainInfo()
      });

    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : 'Performance test failed'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMemoryTest = async () => {
    if (!currentChain) return;
    
    setIsLoading(true);

    try {
      // 메모리 advisor 찾기
      const memoryAdvisor = currentChain.getActiveAdvisors()
        .find(advisor => advisor.name === 'MemoryAdvisor') as MemoryAdvisor;

      if (!memoryAdvisor) {
        throw new Error('Memory Advisor not found in current chain');
      }

      // 여러 메시지로 메모리 테스트
      const messages = [
        ' 중요: 내 이름은 홍길동입니다.',
        '오늘 날씨가 어떤가요?',
        '제 이름을 기억하고 있나요?',
        '앞서 말한 중요한 정보가 뭐였죠?'
      ];

      const results = [];
      for (let i = 0; i < messages.length; i++) {
        const request: ChatRequest = {
          messages: [{ role: 'user', content: messages[i] }],
          options: {}
        };

        const processed = await currentChain.executeRequestAdvisors(request);
        results.push({
          step: i + 1,
          input: messages[i],
          processedMessages: processed.messages,
          messageCount: processed.messages.length
        });
      }

      const memoryStats = memoryAdvisor.getMemoryStats();
      const sessionInfo = memoryAdvisor.getSessionInfo();

      setTestResults({
        memoryTest: {
          results,
          stats: memoryStats,
          sessionInfo
        }
      });

    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : 'Memory test failed'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSafeguardTest = async () => {
    if (!currentChain) return;
    
    setIsLoading(true);

    try {
      const testCases = [
        '안전한 일반 메시지입니다.',
        'password: mySecret123',
        '4532-1234-5678-9012 신용카드 번호입니다.',
        'API_KEY=abc123def456ghi789',
        '<script>alert("xss")</script>',
        '반복 반복 반복 반복 반복', // 스팸 테스트
        'http://malicious-site.com/virus.exe'
      ];

      const results = [];
      for (const testCase of testCases) {
        try {
          const request: ChatRequest = {
            messages: [{ role: 'user', content: testCase }],
            options: {}
          };

          const processed = await currentChain.executeRequestAdvisors(request);
          results.push({
            input: testCase,
            output: processed.messages[processed.messages.length - 1]?.content,
            allowed: true,
            filtered: testCase !== processed.messages[processed.messages.length - 1]?.content
          });
        } catch (error) {
          results.push({
            input: testCase,
            output: null,
            allowed: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      setTestResults({ safeguardTest: { results } });

    } catch (error) {
      setTestResults({
        error: error instanceof Error ? error.message : 'Safeguard test failed'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Spring AI Advisors 패턴 테스트</h2>

      {/* 설정 섹션 */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="text-lg font-semibold">Advisor 체인 설정</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="프리셋 선택"
            selectedKeys={[selectedPreset]}
            onSelectionChange={(keys) => setSelectedPreset(Array.from(keys)[0] as string)}
          >
            {presets.map((preset) => (
              <SelectItem key={preset.key}>
                {preset.label}
              </SelectItem>
            ))}
          </Select>

          {selectedPreset === 'custom' && (
            <div className="grid grid-cols-3 gap-4">
              <Switch isSelected={memoryEnabled} onValueChange={setMemoryEnabled}>
                Memory Advisor
              </Switch>
              <Switch isSelected={safeguardEnabled} onValueChange={setSafeguardEnabled}>
                Safeguard Advisor
              </Switch>
              <Switch isSelected={enhancerEnabled} onValueChange={setEnhancerEnabled}>
                Prompt Enhancer
              </Switch>
            </div>
          )}

          <Textarea
            label="테스트 입력"
            value={testInput}
            onValueChange={setTestInput}
            placeholder="Advisor 시스템을 테스트할 메시지를 입력하세요..."
            minRows={2}
          />
        </CardBody>
      </Card>

      {/* 체인 정보 */}
      {chainInfo && (
        <Card className="mb-6">
          <CardHeader>
            <h3 className="text-lg font-semibold">현재 체인 정보</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              <p className="text-sm"><strong>요약:</strong> {chainInfo.summary}</p>
              <div>
                <strong>실행 순서:</strong>
                <div className="flex gap-2 mt-2">
                  {chainInfo.executionOrder.map((name: string, index: number) => (
                    <Chip key={name} color="primary" size="sm">
                      {index + 1}. {name}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 테스트 버튼들 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Button
          onClick={handleBasicTest}
          disabled={isLoading || !currentChain}
          color="primary"
        >
          기본 테스트
        </Button>
        
        <Button
          onClick={handlePerformanceTest}
          disabled={isLoading || !currentChain}
          color="secondary"
        >
          성능 테스트
        </Button>
        
        <Button
          onClick={handleMemoryTest}
          disabled={isLoading || !currentChain}
          color="success"
        >
          메모리 테스트
        </Button>
        
        <Button
          onClick={handleSafeguardTest}
          disabled={isLoading || !currentChain}
          color="warning"
        >
          안전가드 테스트
        </Button>
      </div>

      {/* 로딩 표시 */}
      {isLoading && (
        <Progress
          size="sm"
          isIndeterminate
          aria-label="Testing..."
          className="mb-4"
        />
      )}

      {/* 결과 표시 */}
      {testResults && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">테스트 결과</h3>
          </CardHeader>
          <CardBody>
            <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(testResults, null, 2)}
            </pre>
          </CardBody>
        </Card>
      )}

      {/* 사용법 가이드 */}
      <Card className="mt-6">
        <CardHeader>
          <h3 className="text-lg font-semibold">Advisor 사용법</h3>
        </CardHeader>
        <CardBody>
          <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto">
{`// 기본 사용법
import { useChatClient } from '@/lib/spring-ai';
import { AdvisorPresets, AdvisorFactory } from '@/lib/spring-ai/advisors';

const client = useChatClient();

// 프리셋 사용
const enhancedChain = AdvisorPresets.enhanced();

// 커스텀 Advisor 생성
const memoryAdvisor = AdvisorFactory.createMemoryAdvisor({
  maxMessages: 30,
  maxTokens: 4000
});

// ChatClient에 Advisor 추가
const response = await client
  .prompt("메시지")
  .advisors(memoryAdvisor)
  .call();`}
          </pre>
        </CardBody>
      </Card>
    </div>
  );
}

export default AdvisorTestComponent;