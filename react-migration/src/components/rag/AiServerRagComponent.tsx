import React, { useState, useEffect } from 'react';
import { aiServerApi, AiServerUtils } from '../../api/aiserver-client';
import type { Document, DocumentAddRequest, DocumentSearchRequest, RagAskRequest } from '../../api/aiserver-client';

interface RagDocument extends Document {
  id?: string;
  uploadTime?: Date;
}

interface AiServerRagComponentProps {
  className?: string;
  defaultModel?: string;
}

export const AiServerRagComponent: React.FC<AiServerRagComponentProps> = ({
  className = '',
  defaultModel = 'openai'
}) => {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  
  // 문서 추가 폼
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocMetadata, setNewDocMetadata] = useState('{}');
  
  // 검색 폼
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTopK, setSearchTopK] = useState(5);
  const [searchResults, setSearchResults] = useState<Document[]>([]);
  
  // RAG 질답 폼
  const [ragQuestion, setRagQuestion] = useState('');
  const [ragTopK, setRagTopK] = useState(5);
  const [ragAnswer, setRagAnswer] = useState('');
  
  // Vector Store 상태
  const [vectorStoreStatus, setVectorStoreStatus] = useState<any>(null);

  useEffect(() => {
    loadVectorStoreStatus();
  }, []);

  const loadVectorStoreStatus = async () => {
    try {
      const response = await aiServerApi.getRagStatus();
      if (AiServerUtils.isSuccessResponse(response)) {
        setVectorStoreStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to load vector store status:', error);
    }
  };

  const handleAddDocument = async () => {
    if (!newDocContent.trim()) {
      setError('문서 내용을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let metadata = {};
      try {
        metadata = JSON.parse(newDocMetadata);
      } catch {
        metadata = { source: 'manual_input' };
      }

      const request: DocumentAddRequest = {
        content: newDocContent,
        metadata: {
          ...metadata,
          uploadTime: new Date().toISOString(),
          contentLength: newDocContent.length,
        },
      };

      const response = await aiServerApi.addDocument(request);
      
      if (AiServerUtils.isSuccessResponse(response) || response.success) {
        setNewDocContent('');
        setNewDocMetadata('{}');
        
        // 로컬 상태에 문서 추가 (실제 ID는 서버에서 관리)
        const newDoc: RagDocument = {
          content: newDocContent,
          metadata: request.metadata,
          id: Date.now().toString(),
          uploadTime: new Date(),
        };
        setDocuments(prev => [...prev, newDoc]);
        
        await loadVectorStoreStatus(); // 상태 업데이트
      } else {
        setError(AiServerUtils.isErrorResponse(response) ? response.error : '문서 추가에 실패했습니다.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '문서 추가 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchDocuments = async () => {
    if (!searchQuery.trim()) {
      setError('검색어를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const request: DocumentSearchRequest = {
        query: searchQuery,
        topK: searchTopK,
      };

      const response = await aiServerApi.searchDocuments(request);
      
      if (AiServerUtils.isSuccessResponse(response)) {
        setSearchResults(response.data || []);
      } else if (response.success && response.documents) {
        setSearchResults(response.documents);
      } else {
        setError(AiServerUtils.isErrorResponse(response) ? response.error : '문서 검색에 실패했습니다.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '문서 검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRagQuestion = async () => {
    if (!ragQuestion.trim()) {
      setError('질문을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const request: RagAskRequest = {
        question: ragQuestion,
        topK: ragTopK,
        model: selectedModel,
      };

      const response = await aiServerApi.askWithRag(request);
      
      if (AiServerUtils.isSuccessResponse(response)) {
        setRagAnswer(response.data || '');
      } else if (response.success && response.answer) {
        setRagAnswer(response.answer);
      } else {
        setError(AiServerUtils.isErrorResponse(response) ? response.error : 'RAG 질답에 실패했습니다.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'RAG 질답 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearDocuments = async () => {
    if (!window.confirm('모든 문서를 삭제하시겠습니까?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await aiServerApi.clearDocuments();
      
      if (AiServerUtils.isSuccessResponse(response) || response.success) {
        setDocuments([]);
        setSearchResults([]);
        setRagAnswer('');
        await loadVectorStoreStatus();
      } else {
        setError(AiServerUtils.isErrorResponse(response) ? response.error : '문서 삭제에 실패했습니다.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '문서 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSummarizeDocuments = async () => {
    if (!searchQuery.trim()) {
      setError('요약할 문서를 검색하기 위한 키워드를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await aiServerApi.summarizeDocuments(searchQuery, selectedModel);
      
      if (AiServerUtils.isSuccessResponse(response)) {
        setRagAnswer(response.data || '');
      } else if (response.success && response.summary) {
        setRagAnswer(response.summary);
      } else {
        setError(AiServerUtils.isErrorResponse(response) ? response.error : '문서 요약에 실패했습니다.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '문서 요약 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`ai-server-rag p-6 max-w-4xl mx-auto ${className}`}>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-bold text-gray-900">RAG (Retrieval Augmented Generation)</h2>
          <p className="text-gray-600 mt-2">
            문서를 추가하고 검색하여 AI가 더 정확한 답변을 할 수 있도록 도와줍니다.
          </p>
          
          {/* 모델 선택 */}
          <div className="mt-4 flex items-center space-x-4">
            <label className="flex items-center">
              <span className="text-sm font-medium text-gray-700 mr-2">모델:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
              </select>
            </label>
            
            {/* Vector Store 상태 */}
            {vectorStoreStatus && (
              <div className="text-sm text-gray-600">
                Vector Store: {vectorStoreStatus.status || 'active'} 
                {vectorStoreStatus.documentCount && ` • ${vectorStoreStatus.documentCount}개 문서`}
              </div>
            )}
          </div>
        </div>

        {/* 오류 표시 */}
        {error && (
          <div className="p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* 문서 추가 섹션 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">문서 추가</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                문서 내용
              </label>
              <textarea
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="추가할 문서의 내용을 입력하세요..."
                rows={6}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                메타데이터 (JSON 형식)
              </label>
              <textarea
                value={newDocMetadata}
                onChange={(e) => setNewDocMetadata(e.target.value)}
                placeholder='{"source": "manual", "category": "docs"}'
                rows={2}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            
            <button
              onClick={handleAddDocument}
              disabled={isLoading || !newDocContent.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? '추가 중...' : '문서 추가'}
            </button>
          </div>
        </div>

        {/* 문서 검색 섹션 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">문서 검색</h3>
          
          <div className="space-y-4">
            <div className="flex space-x-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색어를 입력하세요..."
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                value={searchTopK}
                onChange={(e) => setSearchTopK(parseInt(e.target.value) || 5)}
                min="1"
                max="20"
                className="w-20 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="검색 결과 개수"
              />
              <button
                onClick={handleSearchDocuments}
                disabled={isLoading || !searchQuery.trim()}
                className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                검색
              </button>
            </div>
            
            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-900 mb-2">검색 결과 ({searchResults.length}개)</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((doc, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded border">
                      <div className="text-sm text-gray-800">{doc.content.substring(0, 200)}...</div>
                      {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {JSON.stringify(doc.metadata)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RAG 질답 섹션 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">RAG 기반 질답</h3>
          
          <div className="space-y-4">
            <div className="flex space-x-4">
              <input
                type="text"
                value={ragQuestion}
                onChange={(e) => setRagQuestion(e.target.value)}
                placeholder="질문을 입력하세요..."
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                value={ragTopK}
                onChange={(e) => setRagTopK(parseInt(e.target.value) || 5)}
                min="1"
                max="20"
                className="w-20 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="참고할 문서 개수"
              />
              <button
                onClick={handleRagQuestion}
                disabled={isLoading || !ragQuestion.trim()}
                className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                질문
              </button>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={handleSummarizeDocuments}
                disabled={isLoading || !searchQuery.trim()}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm"
              >
                문서 요약
              </button>
            </div>
            
            {/* RAG 답변 */}
            {ragAnswer && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-900 mb-2">AI 답변</h4>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-gray-800 whitespace-pre-wrap">{ragAnswer}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 관리 섹션 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Vector Store 관리</h3>
          
          <div className="flex space-x-4">
            <button
              onClick={loadVectorStoreStatus}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              상태 새로고침
            </button>
            
            <button
              onClick={handleClearDocuments}
              disabled={isLoading}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              모든 문서 삭제
            </button>
          </div>
          
          {/* Vector Store 상태 상세 정보 */}
          {vectorStoreStatus && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Vector Store 상태</h4>
              <pre className="text-sm text-gray-700 overflow-x-auto">
                {JSON.stringify(vectorStoreStatus, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* 로컬 문서 목록 */}
        {documents.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              추가된 문서 ({documents.length}개)
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {documents.map((doc) => (
                <div key={doc.id} className="p-3 bg-gray-50 rounded border">
                  <div className="text-sm text-gray-800">
                    {doc.content.substring(0, 100)}...
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {doc.uploadTime?.toLocaleString()} | 길이: {doc.content.length}자
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiServerRagComponent;