import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Slider,
  Switch,
  Chip,
  Progress,
  Pagination,
  Tooltip,
  Badge
} from '@heroui/react';
import { 
  MagnifyingGlassIcon as SearchIcon,
  AdjustmentsHorizontalIcon as FilterIcon,
  ClockIcon as HistoryIcon
} from '@heroicons/react/24/outline';
import type { 
  VectorStore, 
  SearchResult, 
  SearchFilters, 
  VectorStoreStats 
} from '../../lib/spring-ai/vector-store';
import { VectorStoreFactory } from '../../lib/spring-ai/vector-store';

/**
 * Vector Search 컴포넌트 Props
 */
export interface VectorSearchComponentProps {
  vectorStore?: VectorStore;
  onSearchResults?: (results: SearchResult[], query: string) => void;
  onError?: (error: Error) => void;
  className?: string;
  maxResults?: number;
  enableRealTimeSearch?: boolean;
}

/**
 * 검색 히스토리 항목
 */
interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  resultCount: number;
  filters: SearchFilters;
}

/**
 * Vector Store 검색 UI 컴포넌트
 */
export function VectorSearchComponent({
  vectorStore: propVectorStore,
  onSearchResults,
  onError,
  className = '',
  maxResults = 20,
  enableRealTimeSearch = true
}: VectorSearchComponentProps) {
  // State 관리
  const [vectorStore, setVectorStore] = useState<VectorStore | null>(propVectorStore || null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<VectorStoreStats | null>(null);
  
  // 필터 관련 상태
  const [filters, setFilters] = useState<SearchFilters>({
    scoreThreshold: 0.1,
    maxResults: maxResults,
    includeMetadata: true
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;
  
  // 검색 히스토리
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // 카테고리 옵션
  const categories = [
    { key: 'all', label: '전체' },
    { key: 'framework', label: '프레임워크' },
    { key: 'frontend', label: '프론트엔드' },
    { key: 'backend', label: '백엔드' },
    { key: 'language', label: '프로그래밍 언어' },
    { key: 'database', label: '데이터베이스' },
    { key: 'ai', label: 'AI/ML' }
  ];

  // Vector Store 초기화
  useEffect(() => {
    const initializeStore = async () => {
      if (!propVectorStore) {
        try {
          const store = await VectorStoreFactory.createWithSampleData();
          setVectorStore(store);
          
          // 통계 조회
          const storeStats = await store.getStats();
          setStats(storeStats);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Vector store initialization failed');
          setError(error.message);
          onError?.(error);
        }
      } else {
        try {
          const storeStats = await propVectorStore.getStats();
          setStats(storeStats);
        } catch (err) {
          console.warn('Failed to get vector store stats:', err);
        }
      }
    };

    initializeStore();
  }, [propVectorStore, onError]);

  // 실시간 검색 (디바운싱)
  useEffect(() => {
    if (!enableRealTimeSearch || !query.trim()) return;

    const timeoutId = setTimeout(() => {
      handleSearch();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query, enableRealTimeSearch]); // filters는 제외하여 실시간 검색시 필터 변경으로 인한 과도한 검색 방지

  /**
   * 검색 실행
   */
  const handleSearch = useCallback(async () => {
    if (!vectorStore || !query.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const searchResults = await vectorStore.searchByText(query, filters);
      setResults(searchResults);
      setCurrentPage(1);
      setTotalPages(Math.ceil(searchResults.length / itemsPerPage));

      // 검색 히스토리에 추가
      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query,
        timestamp: new Date(),
        resultCount: searchResults.length,
        filters: { ...filters }
      };
      setSearchHistory(prev => [historyItem, ...prev.slice(0, 9)]); // 최대 10개 유지

      // 콜백 호출
      onSearchResults?.(searchResults, query);

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Search failed');
      setError(error.message);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [vectorStore, query, filters, onSearchResults, onError]);

  /**
   * 필터 업데이트
   */
  const updateFilter = useCallback((key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  /**
   * 카테고리 필터 토글
   */
  const toggleCategory = useCallback((category: string) => {
    if (category === 'all') {
      updateFilter('categories', undefined);
    } else {
      const currentCategories = filters.categories || [];
      const newCategories = currentCategories.includes(category)
        ? currentCategories.filter(c => c !== category)
        : [...currentCategories, category];
      
      updateFilter('categories', newCategories.length > 0 ? newCategories : undefined);
    }
  }, [filters.categories, updateFilter]);

  /**
   * 검색 히스토리에서 검색
   */
  const searchFromHistory = useCallback((historyItem: SearchHistoryItem) => {
    setQuery(historyItem.query);
    setFilters(historyItem.filters);
    setShowHistory(false);
  }, []);

  /**
   * 결과 하이라이팅
   */
  const highlightText = useCallback((text: string, query: string): JSX.Element => {
    if (!query.trim()) return <span>{text}</span>;

    const words = query.toLowerCase().split(/\s+/);
    let highlightedText = text;

    words.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });

    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  }, []);

  /**
   * 현재 페이지 결과
   */
  const currentResults = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return results.slice(start, end);
  }, [results, currentPage]);

  /**
   * 점수를 백분율로 변환
   */
  const formatScore = useCallback((score: number): string => {
    return `${Math.round(score * 100)}%`;
  }, []);

  return (
    <div className={`vector-search-component ${className}`}>
      {/* 헤더 */}
      <Card className="mb-6">
        <CardHeader className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Vector Search</h2>
          {stats && (
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <Tooltip content="전체 문서 수">
                <Badge color="primary" variant="flat">
                  {stats.totalDocuments} docs
                </Badge>
              </Tooltip>
              <Tooltip content="인덱스 상태">
                <Badge 
                  color={stats.indexStatus === 'ready' ? 'success' : 'warning'} 
                  variant="flat"
                >
                  {stats.indexStatus}
                </Badge>
              </Tooltip>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* 검색 입력 */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex gap-2">
            <Input
              placeholder="검색어를 입력하세요..."
              value={query}
              onValueChange={setQuery}
              startContent={<SearchIcon className="w-4 h-4" />}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !enableRealTimeSearch) {
                  handleSearch();
                }
              }}
              className="flex-1"
            />
            
            <Button
              color="primary"
              onPress={handleSearch}
              isLoading={isLoading}
              isDisabled={!query.trim()}
            >
              검색
            </Button>

            <Button
              variant="flat"
              onPress={() => setShowFilters(!showFilters)}
              startContent={<FilterIcon className="w-4 h-4" />}
            >
              필터
            </Button>

            <Button
              variant="flat"
              onPress={() => setShowHistory(!showHistory)}
              startContent={<HistoryIcon className="w-4 h-4" />}
            >
              히스토리
            </Button>
          </div>

          {/* 실시간 검색 토글 */}
          <div className="flex items-center gap-2 mt-4">
            <Switch
              size="sm"
              isSelected={enableRealTimeSearch}
              onValueChange={() => {
                // enableRealTimeSearch는 props로 받으므로 여기서는 상태 변경 없음
                // 실제 구현에서는 상위 컴포넌트에서 관리하거나 내부 상태로 관리
              }}
            >
              실시간 검색
            </Switch>
            <span className="text-xs text-gray-500">
              입력 후 0.5초 뒤 자동 검색
            </span>
          </div>
        </CardBody>
      </Card>

      {/* 필터 패널 */}
      {showFilters && (
        <Card className="mb-6">
          <CardHeader>
            <h3 className="text-lg font-semibold">검색 필터</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* 유사도 점수 임계값 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                유사도 점수 임계값: {formatScore(filters.scoreThreshold || 0)}
              </label>
              <Slider
                size="sm"
                step={0.01}
                minValue={0}
                maxValue={1}
                value={filters.scoreThreshold || 0}
                onChange={(value) => updateFilter('scoreThreshold', Array.isArray(value) ? value[0] : value)}
                className="max-w-md"
              />
            </div>

            {/* 카테고리 */}
            <div>
              <label className="block text-sm font-medium mb-2">카테고리</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(category => (
                  <Chip
                    key={category.key}
                    variant={
                      category.key === 'all' 
                        ? (!filters.categories || filters.categories.length === 0 ? 'solid' : 'bordered')
                        : (filters.categories?.includes(category.key) ? 'solid' : 'bordered')
                    }
                    color="primary"
                    onClick={() => toggleCategory(category.key)}
                    className="cursor-pointer"
                  >
                    {category.label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* 최대 결과 수 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                최대 결과 수: {filters.maxResults || maxResults}
              </label>
              <Slider
                size="sm"
                step={5}
                minValue={5}
                maxValue={100}
                value={filters.maxResults || maxResults}
                onChange={(value) => updateFilter('maxResults', Array.isArray(value) ? value[0] : value)}
                className="max-w-md"
              />
            </div>

            {/* 메타데이터 포함 */}
            <Switch
              isSelected={filters.includeMetadata ?? true}
              onValueChange={(checked) => updateFilter('includeMetadata', checked)}
            >
              메타데이터 포함
            </Switch>
          </CardBody>
        </Card>
      )}

      {/* 검색 히스토리 */}
      {showHistory && (
        <Card className="mb-6">
          <CardHeader>
            <h3 className="text-lg font-semibold">검색 히스토리</h3>
          </CardHeader>
          <CardBody>
            {searchHistory.length === 0 ? (
              <p className="text-gray-500 text-center py-4">검색 히스토리가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {searchHistory.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded border hover:bg-gray-50 cursor-pointer"
                    onClick={() => searchFromHistory(item)}
                  >
                    <div>
                      <div className="font-medium">{item.query}</div>
                      <div className="text-xs text-gray-500">
                        {item.timestamp.toLocaleString()} • {item.resultCount}개 결과
                      </div>
                    </div>
                    <Button size="sm" variant="light">
                      재검색
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* 로딩 표시 */}
      {isLoading && (
        <Progress
          size="sm"
          isIndeterminate
          aria-label="검색 중..."
          className="mb-4"
        />
      )}

      {/* 에러 표시 */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardBody>
            <p className="text-red-600">❌ {error}</p>
          </CardBody>
        </Card>
      )}

      {/* 검색 결과 */}
      {results.length > 0 && (
        <>
          {/* 결과 요약 */}
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-600">
              총 <strong>{results.length}</strong>개 결과 • 
              평균 유사도: <strong>{formatScore(results.reduce((sum, r) => sum + r.score, 0) / results.length)}</strong>
            </div>
            
            {totalPages > 1 && (
              <Pagination
                total={totalPages}
                page={currentPage}
                onChange={setCurrentPage}
                size="sm"
              />
            )}
          </div>

          {/* 결과 목록 */}
          <div className="space-y-4">
            {currentResults.map((result) => (
              <Card key={result.document.id} className="hover:shadow-md transition-shadow">
                <CardBody>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">
                        {highlightText(result.document.content.substring(0, 100) + '...', query)}
                      </h3>
                      
                      {/* 하이라이트 */}
                      {result.highlights && result.highlights.length > 0 && (
                        <div className="mb-2">
                          <p className="text-sm text-gray-600 mb-1">관련 내용:</p>
                          {result.highlights.map((highlight, i) => (
                            <div key={i} className="text-sm bg-yellow-50 p-2 rounded mb-1">
                              {highlightText(highlight, query)}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 메타데이터 */}
                      {filters.includeMetadata && result.document.metadata && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {Object.entries(result.document.metadata).map(([key, value]) => (
                            <Chip key={key} size="sm" variant="flat">
                              {key}: {String(value)}
                            </Chip>
                          ))}
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        생성일: {result.document.createdAt.toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex flex-col items-end ml-4">
                      <Badge
                        color={result.score > 0.8 ? 'success' : result.score > 0.5 ? 'warning' : 'default'}
                        variant="flat"
                      >
                        {formatScore(result.score)}
                      </Badge>
                      <div className="text-xs text-gray-500 mt-1">
                        유사도
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* 하단 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <Pagination
                total={totalPages}
                page={currentPage}
                onChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {/* 결과 없음 */}
      {!isLoading && query && results.length === 0 && (
        <Card className="text-center py-8">
          <CardBody>
            <p className="text-gray-500 mb-4">검색 결과가 없습니다.</p>
            <p className="text-sm text-gray-400">
              다른 키워드로 검색하거나 필터 조건을 조정해보세요.
            </p>
          </CardBody>
        </Card>
      )}

      {/* 초기 안내 */}
      {!query && results.length === 0 && (
        <Card className="text-center py-8">
          <CardBody>
            <SearchIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              Vector Search로 의미론적 검색을 시작하세요
            </h3>
            <p className="text-gray-500 mb-4">
              키워드가 아닌 의미 기반으로 더 정확한 검색 결과를 얻을 수 있습니다.
            </p>
            {stats && (
              <div className="text-sm text-gray-400">
                현재 {stats.totalDocuments}개의 문서가 인덱싱되어 있습니다.
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/**
 * Vector Search 테스트 컴포넌트
 */
export function VectorSearchTestComponent() {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const handleSearchResults = (results: SearchResult[], query: string) => {
    setSearchResults(results);
    console.log(`Search completed: "${query}" → ${results.length} results`);
  };

  const handleError = (error: Error) => {
    console.error('Vector search error:', error);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Vector Search 테스트</h1>
      
      <VectorSearchComponent
        onSearchResults={handleSearchResults}
        onError={handleError}
        maxResults={20}
        enableRealTimeSearch={true}
      />

      {/* 검색 결과 요약 */}
      {searchResults.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <h3 className="text-lg font-semibold">검색 결과 분석</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{searchResults.length}</div>
                <div className="text-sm text-gray-600">총 결과</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {Math.round((searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length) * 100)}%
                </div>
                <div className="text-sm text-gray-600">평균 유사도</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {searchResults.filter(r => r.score > 0.8).length}
                </div>
                <div className="text-sm text-gray-600">고유사도 (80%+)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {new Set(searchResults.map(r => r.document.metadata.category)).size}
                </div>
                <div className="text-sm text-gray-600">카테고리 수</div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default VectorSearchComponent;