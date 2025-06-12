// Spring AI 라이브러리 메인 export

export { ChatClient, ChatClientRequest, useChatClient } from './ChatClient';
export type {
  ChatOptions,
  ChatMessage,
  ChatResponse,
  ChatStreamChunk,
  ChatRequest,
  FunctionDefinition,
  ToolCall,
  OutputParser,
  VectorStoreDocument,
  SimilaritySearchResult,
  ModelProvider,
  MetricEvent,
  ChatMetrics
} from './types';

// 사용 예제들을 위한 유틸리티
export const SpringAIExamples = {
  /**
   * 기본 채팅 예제
   */
  basicChat: `
    import { useChatClient } from '@/lib/spring-ai';
    
    const client = useChatClient();
    
    const response = await client
      .prompt("안녕하세요!")
      .model("gpt-4")
      .temperature(0.7)
      .call();
  `,

  /**
   * Advisor 사용 예제
   */
  withAdvisors: `
    import { useChatClient } from '@/lib/spring-ai';
    import { MemoryAdvisor, SafeguardAdvisor } from '@/lib/spring-ai/advisors';
    
    const client = useChatClient();
    const memoryAdvisor = new MemoryAdvisor();
    const safeguardAdvisor = new SafeguardAdvisor();
    
    const response = await client
      .prompt("이전 대화를 기억하고 있나요?")
      .advisors(memoryAdvisor, safeguardAdvisor)
      .call();
  `,

  /**
   * 구조화된 출력 예제
   */
  structuredOutput: `
    import { useChatClient } from '@/lib/spring-ai';
    import { z } from 'zod';
    import { ZodOutputParser } from '@/lib/spring-ai/structured';
    
    const client = useChatClient();
    
    const schema = z.object({
      summary: z.string(),
      keywords: z.array(z.string()),
      sentiment: z.enum(['positive', 'negative', 'neutral'])
    });
    
    const parser = new ZodOutputParser(schema);
    
    const result = await client
      .prompt("다음 텍스트를 분석해주세요: ...")
      .outputParser(parser)
      .call();
    
    // result는 타입 안전한 객체
    console.log(result.summary, result.keywords, result.sentiment);
  `,

  /**
   * 함수 호출 예제
   */
  functionCalling: `
    import { useChatClient } from '@/lib/spring-ai';
    
    const client = useChatClient();
    
    const weatherFunction = {
      name: "get_weather",
      description: "현재 날씨 정보를 가져옵니다",
      parameters: {
        type: "object" as const,
        properties: {
          location: { type: "string", description: "도시 이름" }
        },
        required: ["location"]
      }
    };
    
    const response = await client
      .prompt("서울의 날씨를 알려주세요")
      .functions(weatherFunction)
      .call();
  `,

  /**
   * 스트리밍 예제
   */
  streaming: `
    import { useChatClient } from '@/lib/spring-ai';
    
    const client = useChatClient();
    
    for await (const chunk of client
      .prompt("긴 이야기를 들려주세요")
      .stream(true)
      .callStream()) {
      console.log(chunk.choices[0]?.delta?.content || '');
    }
  `
};

// Spring AI 버전 정보
export const SPRING_AI_VERSION = '1.0.0';
export const SPRING_AI_COMPATIBLE_VERSION = '1.0.0-M1';