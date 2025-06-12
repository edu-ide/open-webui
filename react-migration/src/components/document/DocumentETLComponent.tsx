import { useState, useRef, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Select,
  SelectItem,
  Switch,
  Progress,
  Chip,
  Code,
  Tabs,
  Tab,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input,
  Textarea
} from '@heroui/react';
import { 
  Upload, 
  FileText, 
  Settings, 
  Play, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Clock,
  BarChart3,
  Layers,
  Zap
} from 'lucide-react';

import { DocumentProcessor } from '../../lib/spring-ai/document-etl/DocumentProcessor';
import type { 
  ETLPipelineConfig, 
  ETLJob, 
  ETLEvent,
  ChunkingStrategy,
  PreprocessingConfig
} from '../../lib/spring-ai/document-etl/types';
import { 
  SUPPORTED_DOCUMENT_TYPES,
  DEFAULT_CHUNKING_STRATEGIES 
} from '../../lib/spring-ai/document-etl/types';

export function DocumentETLComponent() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [config, setConfig] = useState<ETLPipelineConfig>({
    chunkingStrategy: { ...DEFAULT_CHUNKING_STRATEGIES.medium },
    embeddingModel: 'text-embedding-ada-002',
    vectorStore: 'local',
    preprocessing: {
      removeHeaders: true,
      removeFooters: true,
      normalizeWhitespace: true,
      removeEmptyLines: true,
      convertToLowercase: false,
      removeSpecialCharacters: false
    }
  });
  const [currentJobs, setCurrentJobs] = useState<ETLJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<ETLJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('upload');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentProcessor = useRef(new DocumentProcessor()).current;

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [modalContent, setModalContent] = useState<any>(null);

  // 파일 선택 핸들러
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files).filter(file => 
        Object.keys(SUPPORTED_DOCUMENT_TYPES).includes(file.type)
      );
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  // 파일 제거
  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 드래그 앤 드롭 핸들러
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files) {
      const newFiles = Array.from(files).filter(file => 
        Object.keys(SUPPORTED_DOCUMENT_TYPES).includes(file.type)
      );
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  // ETL 처리 시작
  const startETLProcess = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setIsProcessing(true);
    setActiveTab('progress');

    const jobs: ETLJob[] = selectedFiles.map(file => ({
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      config: { ...config },
      progress: {
        stage: 'upload',
        currentStep: '처리 대기 중...',
        progress: 0,
        totalSteps: 6,
        currentStepIndex: 0,
        startTime: new Date()
      },
      createdAt: new Date()
    }));

    setCurrentJobs(jobs);

    // ETL 이벤트 리스너 등록
    const handleETLEvent = (event: ETLEvent) => {
      setCurrentJobs(prevJobs => 
        prevJobs.map(job => {
          if (event.jobId === job.id) {
            return {
              ...job,
              progress: {
                ...job.progress,
                ...event.data
              }
            };
          }
          return job;
        })
      );
    };

    documentProcessor.addEventListener(handleETLEvent);

    try {
      // 파일들을 순차적으로 처리
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const job = jobs[i];

        try {
          const result = await documentProcessor.processDocument(file, config);
          
          // 완료된 작업 처리
          const completedJob = {
            ...job,
            result,
            completedAt: new Date(),
            progress: {
              ...job.progress,
              stage: result.success ? 'completed' as const : 'error' as const,
              progress: 100
            }
          };

          setCurrentJobs(prev => prev.filter(j => j.id !== job.id));
          setCompletedJobs(prev => [...prev, completedJob]);

        } catch (error) {
          const errorJob = {
            ...job,
            completedAt: new Date(),
            progress: {
              ...job.progress,
              stage: 'error' as const,
              progress: 0,
              error: error instanceof Error ? error.message : '알 수 없는 오류'
            }
          };

          setCurrentJobs(prev => prev.filter(j => j.id !== job.id));
          setCompletedJobs(prev => [...prev, errorJob]);
        }
      }

    } finally {
      documentProcessor.removeEventListener(handleETLEvent);
      setIsProcessing(false);
      setSelectedFiles([]);
      setActiveTab('results');
    }
  }, [selectedFiles, config, documentProcessor]);

  // 설정 업데이트 핸들러들
  const updateChunkingStrategy = useCallback((field: keyof ChunkingStrategy, value: any) => {
    setConfig(prev => ({
      ...prev,
      chunkingStrategy: {
        ...prev.chunkingStrategy,
        [field]: value
      }
    }));
  }, []);

  const updatePreprocessingConfig = useCallback((field: keyof PreprocessingConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      preprocessing: {
        ...prev.preprocessing,
        [field]: value
      }
    }));
  }, []);

  // 모달 표시
  const showModal = useCallback((title: string, content: any) => {
    setModalContent({ title, content });
    onOpen();
  }, [onOpen]);

  // 파일 정보 렌더링
  const renderFileInfo = (file: File) => {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const fileType = SUPPORTED_DOCUMENT_TYPES[file.type as keyof typeof SUPPORTED_DOCUMENT_TYPES];
    
    return (
      <Card key={file.name} className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-blue-500" />
            <div>
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-gray-500">
                {fileType?.name} • {sizeInMB} MB
              </p>
            </div>
          </div>
          <Button 
            size="sm" 
            variant="light" 
            color="danger"
            onClick={() => removeFile(selectedFiles.indexOf(file))}
          >
            제거
          </Button>
        </div>
      </Card>
    );
  };

  // 진행 상황 렌더링
  const renderJobProgress = (job: ETLJob) => {
    const { progress } = job;
    const isCompleted = progress.stage === 'completed';
    const hasError = progress.stage === 'error';

    return (
      <Card key={job.id} className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} />
              <div>
                <p className="font-medium">{job.fileName}</p>
                <p className="text-sm text-gray-500">
                  {(job.fileSize / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <Chip
              color={isCompleted ? 'success' : hasError ? 'danger' : 'primary'}
              variant="flat"
              startContent={
                isCompleted ? <CheckCircle size={16} /> :
                hasError ? <XCircle size={16} /> :
                <Clock size={16} />
              }
            >
              {progress.stage === 'upload' && '업로드'}
              {progress.stage === 'parsing' && '파싱'}
              {progress.stage === 'preprocessing' && '전처리'}
              {progress.stage === 'chunking' && '청킹'}
              {progress.stage === 'embedding' && '임베딩'}
              {progress.stage === 'storing' && '저장'}
              {progress.stage === 'completed' && '완료'}
              {progress.stage === 'error' && '오류'}
            </Chip>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{progress.currentStep}</span>
              <span>{progress.currentStepIndex}/{progress.totalSteps}</span>
            </div>
            
            <Progress 
              value={progress.progress} 
              color={hasError ? 'danger' : isCompleted ? 'success' : 'primary'}
              className="w-full"
            />
          </div>

          {hasError && progress.error && (
            <div className="text-red-500 text-sm">
              오류: {progress.error}
            </div>
          )}
        </div>
      </Card>
    );
  };

  // 결과 렌더링
  const renderResults = () => {
    return (
      <div className="space-y-4">
        {completedJobs.map(job => (
          <Card key={job.id} className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={20} />
                  <div>
                    <p className="font-medium">{job.fileName}</p>
                    <p className="text-sm text-gray-500">
                      처리 시간: {job.result?.processingTime ? `${(job.result.processingTime / 1000).toFixed(1)}초` : 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {job.result?.success && (
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={<Eye size={16} />}
                      onClick={() => showModal('처리 결과', job.result)}
                    >
                      결과 보기
                    </Button>
                  )}
                  
                  <Chip
                    color={job.result?.success ? 'success' : 'danger'}
                    variant="flat"
                  >
                    {job.result?.success ? '성공' : '실패'}
                  </Chip>
                </div>
              </div>

              {job.result?.success && (
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <p className="font-medium">{job.result.totalChunks}</p>
                    <p className="text-gray-500">생성된 청크</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">
                      {job.result.metadata?.embeddingDimensions || 'N/A'}
                    </p>
                    <p className="text-gray-500">임베딩 차원</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">
                      {job.result.metadata?.processedSize ? 
                        `${(job.result.metadata.processedSize / 1024).toFixed(1)}KB` : 'N/A'}
                    </p>
                    <p className="text-gray-500">처리된 크기</p>
                  </div>
                </div>
              )}

              {!job.result?.success && job.result?.error && (
                <div className="text-red-500 text-sm">
                  오류: {job.result.error}
                </div>
              )}
            </div>
          </Card>
        ))}

        {completedJobs.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            아직 완료된 작업이 없습니다.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Document ETL Pipeline</h2>
        <div className="flex gap-2">
          <Button
            color="primary"
            startContent={<Play size={16} />}
            onClick={startETLProcess}
            isDisabled={selectedFiles.length === 0 || isProcessing}
            isLoading={isProcessing}
          >
            {isProcessing ? '처리 중...' : 'ETL 시작'}
          </Button>
        </div>
      </div>

      <Tabs 
        selectedKey={activeTab} 
        onSelectionChange={(key) => setActiveTab(key as string)}
      >
        <Tab key="upload" title={
          <div className="flex items-center gap-2">
            <Upload size={16} />
            <span>파일 업로드</span>
          </div>
        }>
          <div className="space-y-6 mt-4">
            {/* 파일 업로드 영역 */}
            <Card>
              <CardBody>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={48} className="mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">파일을 드래그하거나 클릭하여 업로드</p>
                  <p className="text-gray-500">
                    지원 형식: PDF, DOC, DOCX, TXT, MD, HTML, JSON, CSV
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.html,.htm,.json,.csv"
                    className="hidden"
                  />
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h3 className="font-medium">선택된 파일 ({selectedFiles.length}개)</h3>
                    {selectedFiles.map(renderFileInfo)}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab key="config" title={
          <div className="flex items-center gap-2">
            <Settings size={16} />
            <span>설정</span>
          </div>
        }>
          <div className="space-y-6 mt-4">
            {/* 청킹 전략 설정 */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Layers size={20} />
                  청킹 전략
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <Select
                  label="청킹 타입"
                  selectedKeys={[config.chunkingStrategy.type]}
                  onSelectionChange={(keys) => {
                    const type = Array.from(keys)[0] as string;
                    updateChunkingStrategy('type', type);
                  }}
                >
                  <SelectItem key="token">토큰 기반</SelectItem>
                  <SelectItem key="sentence">문장 기반</SelectItem>
                  <SelectItem key="paragraph">단락 기반</SelectItem>
                  <SelectItem key="semantic">의미론적</SelectItem>
                  <SelectItem key="sliding_window">슬라이딩 윈도우</SelectItem>
                </Select>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="number"
                    label="최대 청크 크기"
                    value={config.chunkingStrategy.maxChunkSize.toString()}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 256;
                      updateChunkingStrategy('maxChunkSize', Math.max(256, Math.min(4096, val)));
                    }}
                    min={256}
                    max={4096}
                    step={128}
                    description="256 ~ 4096 범위"
                  />

                  <Input
                    type="number"
                    label="오버랩 크기"
                    value={(config.chunkingStrategy.overlapSize || 0).toString()}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateChunkingStrategy('overlapSize', Math.max(0, Math.min(512, val)));
                    }}
                    min={0}
                    max={512}
                    step={32}
                    description="0 ~ 512 범위"
                  />
                </div>

                {(config.chunkingStrategy.type === 'sentence' || config.chunkingStrategy.type === 'paragraph') && (
                  <Textarea
                    label="구분자 (쉼표로 구분)"
                    value={config.chunkingStrategy.separators?.join(', ') || ''}
                    onChange={(e) => {
                      const separators = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                      updateChunkingStrategy('separators', separators);
                    }}
                    placeholder="., !, ?"
                  />
                )}
              </CardBody>
            </Card>

            {/* 전처리 설정 */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Zap size={20} />
                  전처리 옵션
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Switch
                    isSelected={config.preprocessing.removeHeaders}
                    onValueChange={(value) => updatePreprocessingConfig('removeHeaders', value)}
                  >
                    헤더 제거
                  </Switch>

                  <Switch
                    isSelected={config.preprocessing.removeFooters}
                    onValueChange={(value) => updatePreprocessingConfig('removeFooters', value)}
                  >
                    푸터 제거
                  </Switch>

                  <Switch
                    isSelected={config.preprocessing.normalizeWhitespace}
                    onValueChange={(value) => updatePreprocessingConfig('normalizeWhitespace', value)}
                  >
                    공백 정규화
                  </Switch>

                  <Switch
                    isSelected={config.preprocessing.removeEmptyLines}
                    onValueChange={(value) => updatePreprocessingConfig('removeEmptyLines', value)}
                  >
                    빈 줄 제거
                  </Switch>

                  <Switch
                    isSelected={config.preprocessing.convertToLowercase}
                    onValueChange={(value) => updatePreprocessingConfig('convertToLowercase', value)}
                  >
                    소문자 변환
                  </Switch>

                  <Switch
                    isSelected={config.preprocessing.removeSpecialCharacters}
                    onValueChange={(value) => updatePreprocessingConfig('removeSpecialCharacters', value)}
                  >
                    특수문자 제거
                  </Switch>
                </div>
              </CardBody>
            </Card>

            {/* 모델 및 저장소 설정 */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">모델 및 저장소</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <Select
                  label="임베딩 모델"
                  selectedKeys={[config.embeddingModel]}
                  onSelectionChange={(keys) => {
                    const model = Array.from(keys)[0] as string;
                    setConfig(prev => ({ ...prev, embeddingModel: model }));
                  }}
                >
                  <SelectItem key="text-embedding-ada-002">OpenAI Ada-002</SelectItem>
                  <SelectItem key="text-embedding-3-small">OpenAI Text-3-Small</SelectItem>
                  <SelectItem key="text-embedding-3-large">OpenAI Text-3-Large</SelectItem>
                </Select>

                <Select
                  label="벡터 저장소"
                  selectedKeys={[config.vectorStore]}
                  onSelectionChange={(keys) => {
                    const store = Array.from(keys)[0] as string;
                    setConfig(prev => ({ ...prev, vectorStore: store }));
                  }}
                >
                  <SelectItem key="local">Local Storage (데모)</SelectItem>
                  <SelectItem key="pinecone">Pinecone</SelectItem>
                  <SelectItem key="weaviate">Weaviate</SelectItem>
                  <SelectItem key="chromadb">ChromaDB</SelectItem>
                </Select>
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab key="progress" title={
          <div className="flex items-center gap-2">
            <BarChart3 size={16} />
            <span>진행 상황</span>
          </div>
        }>
          <div className="space-y-4 mt-4">
            {currentJobs.length > 0 ? (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">처리 중인 작업</h3>
                  <Chip variant="flat" color="primary">
                    {currentJobs.length}개 처리 중
                  </Chip>
                </div>
                {currentJobs.map(renderJobProgress)}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                현재 처리 중인 작업이 없습니다.
              </div>
            )}
          </div>
        </Tab>

        <Tab key="results" title={
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            <span>결과</span>
          </div>
        }>
          <div className="mt-4">
            {renderResults()}
          </div>
        </Tab>
      </Tabs>

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