import { springAIClient } from './client';
import type { 
  ChatRequest, 
  ChatResponse, 
  ChatStreamChunk
} from '../../lib/spring-ai/types';

/**
 * Spring AI 채팅 API 엔드포인트
 */
export const chatEndpoints = {
  /**
   * 채팅 완성 요청 (non-streaming)
   */
  async complete(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Spring AI 백엔드가 준비되기 전까지 모의 응답
      return await mockChatComplete(request);
      
      // 실제 구현 (백엔드 준비 시 활성화)
      // return await springAIClient.post<ChatResponse>('/chat/completions', {
      //   model: request.options.model || 'gpt-3.5-turbo',
      //   messages: request.messages,
      //   temperature: request.options.temperature,
      //   max_tokens: request.options.maxTokens,
      //   top_p: request.options.topP,
      //   frequency_penalty: request.options.frequencyPenalty,
      //   presence_penalty: request.options.presencePenalty,
      //   stop: request.options.stop,
      //   stream: false
      // });
    } catch (error) {
      console.error('Chat completion failed:', error);
      throw error;
    }
  },

  /**
   * 스트리밍 채팅 완성 요청
   */
  async *stream(request: ChatRequest): AsyncIterableIterator<ChatStreamChunk> {
    try {
      // Spring AI 백엔드가 준비되기 전까지 모의 스트리밍
      yield* mockChatStream(request);
      return;
      
      // 실제 구현 (백엔드 준비 시 활성화)
      // yield* springAIClient.stream<ChatStreamChunk>('/chat/completions', {
      //   model: request.options.model || 'gpt-3.5-turbo',
      //   messages: request.messages,
      //   temperature: request.options.temperature,
      //   max_tokens: request.options.maxTokens,
      //   top_p: request.options.topP,
      //   frequency_penalty: request.options.frequencyPenalty,
      //   presence_penalty: request.options.presencePenalty,
      //   stop: request.options.stop,
      //   stream: true
      // });
    } catch (error) {
      console.error('Chat streaming failed:', error);
      throw error;
    }
  },

  /**
   * 채팅 요청 중단
   */
  async stop(requestId: string): Promise<void> {
    try {
      await springAIClient.post(`/chat/stop/${requestId}`);
    } catch (error) {
      console.error('Chat stop failed:', error);
      throw error;
    }
  },

  /**
   * 모델 목록 조회
   */
  async getModels(): Promise<string[]> {
    try {
      // 모의 데이터
      return [
        'gpt-4',
        'gpt-3.5-turbo', 
        'claude-3-sonnet',
        'claude-3-haiku',
        'gemini-pro',
        'ollama/llama2',
        'ollama/mistral'
      ];
      
      // 실제 구현
      // const response = await springAIClient.get<{ models: string[] }>('/models');
      // return response.models;
    } catch (error) {
      console.error('Get models failed:', error);
      throw error;
    }
  },

  /**
   * 모델 정보 조회
   */
  async getModelInfo(modelId: string): Promise<any> {
    try {
      return await springAIClient.get(`/models/${encodeURIComponent(modelId)}`);
    } catch (error) {
      console.error('Get model info failed:', error);
      throw error;
    }
  }
};

/**
 * 모의 채팅 완성 응답 (백엔드 준비 전까지 사용)
 */
async function mockChatComplete(request: ChatRequest): Promise<ChatResponse> {
  // 지연 시뮬레이션
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));

  const lastUserMessage = request.messages.filter(msg => msg.role === 'user').pop();
  const prompt = lastUserMessage?.content || 'No user message found';
  const model = request.options.model || 'gpt-3.5-turbo';

  // 프롬프트에 따른 다양한 응답 생성
  let responseContent: string;
  
  if (prompt.toLowerCase().includes('error') || prompt.toLowerCase().includes('에러')) {
    responseContent = `❌ **에러 처리 예제**\n\n요청하신 "${prompt}"에 대해 에러 상황을 시뮬레이션합니다.\n\n**해결 방법:**\n1. 입력값 검증\n2. 예외 처리 추가\n3. 로그 확인\n\n*이것은 Spring AI ChatClient를 통한 모의 응답입니다.*`;
  } else if (prompt.toLowerCase().includes('code') || prompt.toLowerCase().includes('코드')) {
    responseContent = `💻 **코딩 예제**\n\n\`\`\`typescript\n// Spring AI 사용 예제\nconst client = useChatClient();\n\nconst response = await client\n  .prompt("${prompt}")\n  .model("${model}")\n  .temperature(0.7)\n  .call();\n\nconsole.log(response);\n\`\`\`\n\n*이것은 Spring AI ChatClient를 통한 모의 응답입니다.*`;
  } else if (prompt.toLowerCase().includes('explain') || prompt.toLowerCase().includes('설명')) {
    responseContent = `📚 **상세 설명**\n\n"${prompt}"에 대한 설명입니다:\n\n## 주요 내용\n- **개념**: Spring AI는 AI 애플리케이션 개발을 위한 프레임워크입니다\n- **특징**: 다양한 AI 모델 지원, 타입 안전성, 확장성\n- **활용**: 챗봇, 문서 검색, 자동 요약 등\n\n## 장점\n✅ 일관된 API 인터페이스\n✅ 여러 AI 제공업체 지원\n✅ 스트리밍 응답 지원\n\n*모델: ${model} | 모의 응답*`;
  } else {
    responseContent = `🤖 **Spring AI 응답**\n\n"${prompt}"에 대한 답변입니다.\n\n이것은 **Spring AI ChatClient**를 통해 생성된 모의 응답입니다. 실제 AI 백엔드가 연결되면 실제 AI 모델의 응답으로 대체됩니다.\n\n**현재 설정:**\n- 모델: ${model}\n- 온도: ${request.options.temperature || 0.7}\n- 최대 토큰: ${request.options.maxTokens || 'auto'}\n\n*더 자세한 테스트를 위해 'error', 'code', 'explain' 등의 키워드를 포함해보세요.*`;
  }

  return {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: responseContent
      },
      finishReason: 'stop'
    }],
    usage: {
      promptTokens: Math.floor(prompt.length / 4) + Math.floor(Math.random() * 50),
      completionTokens: Math.floor(responseContent.length / 4) + Math.floor(Math.random() * 50),
      totalTokens: 0 // 위에서 계산된 값들의 합
    }
  };
}

/**
 * 모의 스트리밍 응답 (백엔드 준비 전까지 사용)
 */
async function* mockChatStream(request: ChatRequest): AsyncIterableIterator<ChatStreamChunk> {
  const lastUserMessage = request.messages.filter(msg => msg.role === 'user').pop();
  const prompt = lastUserMessage?.content || 'No user message found';
  const model = request.options.model || 'gpt-3.5-turbo';
  
  const fullResponse = `🌊 **스트리밍 응답**

"${prompt}"에 대한 실시간 스트리밍 응답입니다.

이것은 Spring AI ChatClient의 스트리밍 기능을 시연하는 모의 응답입니다. 실제 AI 백엔드가 연결되면 실제 토큰별로 스트리밍됩니다.

**스트리밍 장점:**
✨ 실시간 응답 표시
🚀 더 나은 사용자 경험  
⚡ 빠른 첫 토큰 응답

모델: ${model} | 스트리밍 모드`;

  const words = fullResponse.split(' ');
  const requestId = `chatcmpl-${Date.now()}-stream`;

  for (let i = 0; i < words.length; i++) {
    // 단어별로 스트리밍 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    
    const chunk: ChatStreamChunk = {
      id: requestId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        delta: {
          content: (i === 0 ? words[i] : ' ' + words[i])
        },
        finishReason: i === words.length - 1 ? 'stop' : undefined
      }]
    };

    yield chunk;
  }
}

export default chatEndpoints;