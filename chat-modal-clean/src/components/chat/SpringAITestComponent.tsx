import { useState } from 'react';
import { useChatClient } from '../../lib/spring-ai';
import type { ChatResponse } from '../../lib/spring-ai/types';

/**
 * Spring AI ChatClient 테스트 컴포넌트
 */
export function SpringAITestComponent() {
  const chatClient = useChatClient();
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBasicTest = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await chatClient
        .prompt("안녕하세요! Spring AI ChatClient 테스트입니다.")
        .model("gpt-3.5-turbo")
        .temperature(0.7)
        .maxTokens(100)
        .call();
      
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleChainTest = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await chatClient
        .create()
        .system("당신은 도움이 되는 AI 어시스턴트입니다.")
        .user("TypeScript에 대해 간단히 설명해주세요.")
        .options({
          temperature: 0.5,
          maxTokens: 150
        })
        .call();
      
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionsTest = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await chatClient
        .prompt("창의적인 이야기를 짧게 만들어주세요.")
        .temperature(0.9) // 높은 창의성
        .maxTokens(200)
        .model("gpt-4")
        .call();
      
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Spring AI ChatClient 테스트</h2>
      
      <div className="space-y-4 mb-6">
        <button
          onClick={handleBasicTest}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          기본 프롬프트 테스트
        </button>
        
        <button
          onClick={handleChainTest}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 ml-2"
        >
          메서드 체이닝 테스트
        </button>
        
        <button
          onClick={handleOptionsTest}
          disabled={loading}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 ml-2"
        >
          옵션 설정 테스트
        </button>
      </div>

      {loading && (
        <div className="text-blue-600">
          요청 처리 중...
        </div>
      )}

      {error && (
        <div className="text-red-600 bg-red-50 p-4 rounded mb-4">
          오류: {error}
        </div>
      )}

      {response && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold mb-2">응답 결과:</h3>
          
          <div className="space-y-2">
            <div>
              <strong>모델:</strong> {response.model}
            </div>
            
            <div>
              <strong>생성 시간:</strong> {new Date(response.created * 1000).toLocaleString()}
            </div>
            
            <div>
              <strong>토큰 사용량:</strong>
              <ul className="ml-4 list-disc">
                <li>프롬프트: {response.usage.promptTokens}</li>
                <li>완성: {response.usage.completionTokens}</li>
                <li>총합: {response.usage.totalTokens}</li>
              </ul>
            </div>
            
            <div>
              <strong>응답 내용:</strong>
              <div className="mt-2 p-3 bg-white border rounded">
                {response.choices[0]?.message?.content}
              </div>
            </div>
            
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold">전체 응답 데이터</summary>
              <pre className="mt-2 p-3 bg-gray-100 text-sm overflow-auto rounded">
                {JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded">
        <h4 className="font-semibold mb-2">사용 예제:</h4>
        <pre className="text-sm bg-white p-3 rounded overflow-auto">
{`// 기본 사용법
const client = useChatClient();

const response = await client
  .prompt("안녕하세요!")
  .model("gpt-4")
  .temperature(0.7)
  .call();

// 메서드 체이닝
const response = await client
  .create()
  .system("당신은 도움이 되는 AI입니다.")
  .user("질문입니다.")
  .options({ temperature: 0.5 })
  .call();`}
        </pre>
      </div>
    </div>
  );
}

export default SpringAITestComponent;