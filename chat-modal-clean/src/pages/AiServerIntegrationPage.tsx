import React, { useState } from 'react';
import AiServerChatComponent from '../components/chat/AiServerChatComponent';
import AiServerRagComponent from '../components/rag/AiServerRagComponent';

type TabType = 'chat' | 'rag' | 'functions' | 'media';

interface TabInfo {
  id: TabType;
  label: string;
  description: string;
  icon: string;
}

const tabs: TabInfo[] = [
  {
    id: 'chat',
    label: '채팅',
    description: 'Spring AI ChatClient를 사용한 기본 채팅 및 스트리밍',
    icon: '💬'
  },
  {
    id: 'rag',
    label: 'RAG',
    description: '문서 기반 검색 증강 생성 (Retrieval Augmented Generation)',
    icon: '📚'
  },
  {
    id: 'functions',
    label: '함수 호출',
    description: 'AI 모델의 Function Calling 기능 테스트',
    icon: '⚡'
  },
  {
    id: 'media',
    label: '미디어',
    description: '이미지 생성, 음성 전사, TTS 기능',
    icon: '🎨'
  }
];

const AiServerIntegrationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <AiServerChatComponent
            className="h-full"
            placeholder="Spring AI를 사용한 채팅을 시작해보세요..."
            autoFocus={true}
            enableFunctions={true}
          />
        );
      
      case 'rag':
        return (
          <AiServerRagComponent
            className="h-full overflow-y-auto"
            defaultModel="openai"
          />
        );
      
      case 'functions':
        return (
          <div className="p-6 h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Function Calling 테스트</h2>
              
              <div className="space-y-6">
                {/* Function Calling 전용 채팅 */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Function Calling 채팅
                  </h3>
                  <p className="text-gray-600 mb-4">
                    함수 호출이 활성화된 채팅입니다. 다음과 같은 요청을 시도해보세요:
                  </p>
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">시도해볼 수 있는 요청:</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• "서울의 날씨를 알려주세요"</li>
                      <li>• "지금 몇 시인가요?"</li>
                      <li>• "2 더하기 3은 얼마인가요?"</li>
                      <li>• "할 일 목록을 보여주세요"</li>
                      <li>• "Spring AI 공부하기를 할 일에 추가해주세요"</li>
                    </ul>
                  </div>
                  
                  <div className="h-96">
                    <AiServerChatComponent
                      className="h-full border border-gray-300 rounded-lg"
                      placeholder="함수 호출 기능을 사용해보세요... (예: 서울 날씨 알려줘)"
                      enableFunctions={true}
                    />
                  </div>
                </div>

                {/* 함수 목록 및 예시 */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    사용 가능한 함수
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <h4 className="font-medium text-blue-900">날씨 조회</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        특정 도시의 현재 날씨 정보를 조회합니다.
                      </p>
                      <code className="text-xs bg-blue-100 px-2 py-1 rounded mt-2 block">
                        getCurrentWeather(city: string)
                      </code>
                    </div>
                    
                    <div className="p-4 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-green-900">시간 조회</h4>
                      <p className="text-sm text-green-700 mt-1">
                        지정된 타임존의 현재 시간을 조회합니다.
                      </p>
                      <code className="text-xs bg-green-100 px-2 py-1 rounded mt-2 block">
                        getCurrentTime(timezone?: string)
                      </code>
                    </div>
                    
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <h4 className="font-medium text-purple-900">계산기</h4>
                      <p className="text-sm text-purple-700 mt-1">
                        수학 표현식을 계산합니다.
                      </p>
                      <code className="text-xs bg-purple-100 px-2 py-1 rounded mt-2 block">
                        calculate(expression: string)
                      </code>
                    </div>
                    
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <h4 className="font-medium text-orange-900">할 일 관리</h4>
                      <p className="text-sm text-orange-700 mt-1">
                        할 일을 추가, 조회, 완료 처리합니다.
                      </p>
                      <code className="text-xs bg-orange-100 px-2 py-1 rounded mt-2 block">
                        manageTodo(action, task?, taskId?)
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'media':
        return (
          <div className="p-6 h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">미디어 AI 기능</h2>
              
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    이미지 생성
                  </h3>
                  <p className="text-gray-600 mb-4">
                    OpenAI DALL-E를 사용한 이미지 생성 기능입니다.
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      🚧 이 기능은 현재 개발 중입니다. OpenAI API 키와 이미지 생성 모델 설정이 필요합니다.
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    음성 전사 (Speech-to-Text)
                  </h3>
                  <p className="text-gray-600 mb-4">
                    OpenAI Whisper를 사용한 음성 전사 기능입니다.
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      🚧 이 기능은 현재 개발 중입니다. 음성 파일 업로드 UI가 필요합니다.
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    텍스트 음성 변환 (Text-to-Speech)
                  </h3>
                  <p className="text-gray-600 mb-4">
                    OpenAI TTS를 사용한 텍스트 음성 변환 기능입니다.
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      🚧 이 기능은 현재 개발 중입니다. 음성 재생 UI가 필요합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return <div>잘못된 탭입니다.</div>;
    }
  };

  return (
    <div className="ai-server-integration h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">AI Server 통합 테스트</h1>
          <p className="text-gray-600 mt-1">
            Spring AI 기반의 aiserver와 react-migration 연동 데모
          </p>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 탭 설명 */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <p className="text-sm text-blue-800">
            {tabs.find(tab => tab.id === activeTab)?.description}
          </p>
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>

      {/* 푸터 */}
      <div className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-sm text-gray-500">
          <div>
            Spring AI v0.8.1 | OpenAPI 3.0 | TypeScript Client
          </div>
          <div>
            API 서버: {process.env.VITE_AISERVER_URL || 'http://localhost:8080'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiServerIntegrationPage;