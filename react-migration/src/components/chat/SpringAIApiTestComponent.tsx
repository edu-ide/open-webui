import { useState } from 'react';
import { Button, Card, CardBody, CardHeader, Select, SelectItem, Textarea, Progress } from '@heroui/react';
import { springAIApi, healthCheck } from '../../api/spring-ai';
import type { ChatRequest } from '../../lib/spring-ai/types';
import type { EmbeddingResponse } from '../../api/spring-ai/embeddings';

/**
 * Spring AI API 통신 레이어 테스트 컴포넌트
 */
export function SpringAIApiTestComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [inputText, setInputText] = useState('Spring AI API 테스트입니다. 연결이 잘 되나요?');
  const [streamingText, setStreamingText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
  const [availableFeatures, setAvailableFeatures] = useState<string[]>([]);

  const models = [
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-3-sonnet',
    'claude-3-haiku',
    'gemini-pro'
  ];

  const handleConnectionTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const isConnected = await healthCheck.checkConnection();
      setConnectionStatus(isConnected);
      
      if (isConnected) {
        const features = await healthCheck.getAvailableFeatures();
        setAvailableFeatures(features);
        
        const version = await healthCheck.getVersion();
        setResults({ connectionStatus: 'connected', features, version });
      } else {
        setResults({ connectionStatus: 'disconnected', message: 'Backend not available, using mock responses' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
      setConnectionStatus(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const request: ChatRequest = {
        messages: [
          { role: 'user', content: inputText }
        ],
        options: {
          model: selectedModel,
          temperature: 0.7,
          maxTokens: 150
        }
      };

      const response = await springAIApi.chat.complete(request);
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStreamingTest = async () => {
    setIsLoading(true);
    setError(null);
    setStreamingText('');
    
    try {
      const request: ChatRequest = {
        messages: [
          { role: 'user', content: inputText + ' (스트리밍 테스트)' }
        ],
        options: {
          model: selectedModel,
          temperature: 0.8,
          maxTokens: 200,
          stream: true
        }
      };

      const streamGenerator = await springAIApi.chat.stream(request);
      let fullResponse = '';

      for await (const chunk of streamGenerator) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        setStreamingText(fullResponse);
        
        // UI 업데이트를 위한 짧은 지연
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      setResults({ message: 'Streaming completed', fullResponse });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Streaming test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmbeddingTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response: EmbeddingResponse = await springAIApi.embeddings.create({
        input: inputText,
        model: 'text-embedding-ada-002'
      });

      // 임베딩 벡터의 첫 10개 값만 표시
      const preview = response.data[0].embedding.slice(0, 10);
      
      setResults({
        ...response,
        data: response.data.map(item => ({
          ...item,
          embedding: `[${preview.map(n => n.toFixed(4)).join(', ')}...] (${item.embedding.length} dimensions)`
        }))
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Embedding test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelsTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [chatModels, embeddingModels] = await Promise.all([
        springAIApi.chat.getModels(),
        springAIApi.embeddings.getModels()
      ]);

      setResults({
        chatModels,
        embeddingModels
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Models test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimilarityTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const texts = [
        inputText,
        'This is a different text about technology',
        'Completely unrelated content about cooking'
      ];

      const embeddings = await Promise.all(
        texts.map(text => springAIApi.embeddings.create({ input: text }))
      );

      const vectors = embeddings.map(emb => emb.data[0].embedding);
      
      // 첫 번째 텍스트와 나머지 텍스트들 간의 유사도 계산
      const similarities = [];
      for (let i = 1; i < vectors.length; i++) {
        const similarity = await springAIApi.embeddings.calculateSimilarity(vectors[0], vectors[i]);
        similarities.push({
          text: texts[i],
          similarity: similarity.toFixed(4)
        });
      }

      setResults({
        baseText: texts[0],
        comparisons: similarities
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Similarity test failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Spring AI API 통신 레이어 테스트</h2>
      
      {/* 연결 상태 */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="text-lg font-semibold">연결 상태</h3>
        </CardHeader>
        <CardBody>
          <div className="flex items-center gap-4 mb-4">
            <Button
              onClick={handleConnectionTest}
              disabled={isLoading}
              color={connectionStatus === true ? 'success' : connectionStatus === false ? 'danger' : 'primary'}
            >
              연결 테스트
            </Button>
            
            {connectionStatus !== null && (
              <div className={`text-sm ${connectionStatus ? 'text-success' : 'text-warning'}`}>
                {connectionStatus ? '✅ Backend 연결됨' : '⚠️ Mock 모드 (Backend 미연결)'}
              </div>
            )}
          </div>
          
          {availableFeatures.length > 0 && (
            <div className="text-sm text-default-600">
              사용 가능한 기능: {availableFeatures.join(', ')}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 테스트 입력 */}
      <Card className="mb-6">
        <CardHeader>
          <h3 className="text-lg font-semibold">테스트 설정</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="모델 선택"
            selectedKeys={[selectedModel]}
            onSelectionChange={(keys) => setSelectedModel(Array.from(keys)[0] as string)}
          >
            {models.map((model) => (
              <SelectItem key={model}>
                {model}
              </SelectItem>
            ))}
          </Select>
          
          <Textarea
            label="테스트 입력"
            value={inputText}
            onValueChange={setInputText}
            placeholder="테스트할 텍스트를 입력하세요..."
            minRows={2}
          />
        </CardBody>
      </Card>

      {/* 테스트 버튼들 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Button
          onClick={handleChatTest}
          disabled={isLoading}
          color="primary"
          variant="flat"
        >
          채팅 완성 테스트
        </Button>
        
        <Button
          onClick={handleStreamingTest}
          disabled={isLoading}
          color="secondary"
          variant="flat"
        >
          스트리밍 테스트
        </Button>
        
        <Button
          onClick={handleEmbeddingTest}
          disabled={isLoading}
          color="success"
          variant="flat"
        >
          임베딩 테스트
        </Button>
        
        <Button
          onClick={handleModelsTest}
          disabled={isLoading}
          color="warning"
          variant="flat"
        >
          모델 목록 테스트
        </Button>
        
        <Button
          onClick={handleSimilarityTest}
          disabled={isLoading}
          color="danger"
          variant="flat"
        >
          유사도 테스트
        </Button>
      </div>

      {/* 로딩 표시 */}
      {isLoading && (
        <Progress
          size="sm"
          isIndeterminate
          aria-label="Loading..."
          className="mb-4"
        />
      )}

      {/* 스트리밍 결과 실시간 표시 */}
      {streamingText && (
        <Card className="mb-6">
          <CardHeader>
            <h3 className="text-lg font-semibold">실시간 스트리밍 출력</h3>
          </CardHeader>
          <CardBody>
            <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
              {streamingText}
              <span className="animate-pulse">|</span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 에러 표시 */}
      {error && (
        <Card className="mb-6">
          <CardBody>
            <div className="text-red-600 bg-red-50 p-4 rounded">
              ❌ 오류: {error}
            </div>
          </CardBody>
        </Card>
      )}

      {/* 결과 표시 */}
      {results && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">API 응답 결과</h3>
          </CardHeader>
          <CardBody>
            <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(results, null, 2)}
            </pre>
          </CardBody>
        </Card>
      )}

      {/* API 사용 예제 */}
      <Card className="mt-6">
        <CardHeader>
          <h3 className="text-lg font-semibold">API 사용 예제</h3>
        </CardHeader>
        <CardBody>
          <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto">
{`// 채팅 완성
import { springAIApi } from '@/api/spring-ai';

const response = await springAIApi.chat.complete({
  messages: [{ role: 'user', content: 'Hello!' }],
  options: { model: 'gpt-4', temperature: 0.7 }
});

// 스트리밍
for await (const chunk of springAIApi.chat.stream(request)) {
  console.log(chunk.choices[0]?.delta?.content);
}

// 임베딩
const embedding = await springAIApi.embeddings.create({
  input: 'Text to embed',
  model: 'text-embedding-ada-002'
});

// 연결 상태 확인
import { healthCheck } from '@/api/spring-ai';
const isConnected = await healthCheck.checkConnection();`}
          </pre>
        </CardBody>
      </Card>
    </div>
  );
}

export default SpringAIApiTestComponent;