import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Select,
  SelectItem,
  Textarea,
  Tabs,
  Tab,
  Chip,
  Code,
  Divider
} from '@heroui/react';
import { 
  Play, 
  Copy, 
  Download, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  FileCode,
  Zap
} from 'lucide-react';

import { 
  OutputParserFactory,
  SchemaTemplates,
  type Schema,
  type ParseResult,
  type OutputFormat,
  type SchemaTemplate
} from '../../lib/spring-ai/output-parsers';

interface StructuredOutputComponentProps {
  onParsedResult?: (result: ParseResult) => void;
}

export function StructuredOutputComponent({ onParsedResult }: StructuredOutputComponentProps) {
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('json');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customSchema, setCustomSchema] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('parser');

  // 템플릿 목록
  const templates = SchemaTemplates.templates;

  // 현재 스키마 계산
  const getCurrentSchema = useCallback((): Schema | undefined => {
    if (selectedTemplate) {
      const template = SchemaTemplates.findTemplate(selectedTemplate);
      return template?.schema;
    }
    
    if (customSchema.trim()) {
      try {
        return JSON.parse(customSchema);
      } catch {
        return undefined;
      }
    }
    
    return undefined;
  }, [selectedTemplate, customSchema]);

  // 템플릿 선택 시 예시 데이터 설정
  useEffect(() => {
    if (selectedTemplate) {
      const template = SchemaTemplates.findTemplate(selectedTemplate);
      if (template) {
        setInputText(JSON.stringify(template.example, null, 2));
        setCustomSchema(JSON.stringify(template.schema, null, 2));
      }
    }
  }, [selectedTemplate]);

  // 파싱 실행
  const handleParse = async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    try {
      const currentSchema = getCurrentSchema();
      const parser = OutputParserFactory.create(selectedFormat, currentSchema);
      const result = await parser.parse(inputText);
      
      setParseResult(result);
      onParsedResult?.(result);
    } catch (error) {
      setParseResult({
        success: false,
        errors: [{
          path: '',
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'PARSE_ERROR'
        }],
        rawOutput: inputText,
        parsedAt: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 자동 형식 감지
  const handleAutoDetect = () => {
    const detectedFormat = OutputParserFactory.detectFormat(inputText);
    if (detectedFormat) {
      setSelectedFormat(detectedFormat);
    }
  };

  // 예시 생성
  const generateExample = () => {
    const currentSchema = getCurrentSchema();
    if (!currentSchema) return;

    // 간단한 예시 생성 (실제로는 AI 모델 호출)
    let example = '';
    switch (selectedFormat) {
      case 'json':
        example = JSON.stringify({ message: 'Example data according to schema' }, null, 2);
        break;
      case 'xml':
        example = '<root><message>Example data according to schema</message></root>';
        break;
      case 'yaml':
        example = 'message: Example data according to schema';
        break;
    }
    
    setInputText(example);
  };

  // 결과 복사
  const copyResult = () => {
    if (parseResult?.data) {
      navigator.clipboard.writeText(JSON.stringify(parseResult.data, null, 2));
    }
  };

  // 결과 다운로드
  const downloadResult = () => {
    if (!parseResult?.data) return;

    const dataStr = JSON.stringify(parseResult.data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parsed-output-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 파일 업로드
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setInputText(content);
      
      // 파일 확장자로 형식 추정
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'json') setSelectedFormat('json');
      else if (extension === 'xml') setSelectedFormat('xml');
      else if (extension === 'yaml' || extension === 'yml') setSelectedFormat('yaml');
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Structured Output 파싱</h1>
        <p className="text-gray-600">AI 출력을 구조화된 데이터로 파싱하고 검증합니다.</p>
      </div>

      <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as string)}>
        <Tab key="parser" title="파서">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 설정 패널 */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">파싱 설정</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                {/* 출력 형식 선택 */}
                <div>
                  <Select
                    label="출력 형식"
                    selectedKeys={[selectedFormat]}
                    onSelectionChange={(keys) => {
                      const format = Array.from(keys)[0] as OutputFormat;
                      setSelectedFormat(format);
                    }}
                  >
                    <SelectItem key="json">JSON</SelectItem>
                    <SelectItem key="xml">XML</SelectItem>
                    <SelectItem key="yaml">YAML</SelectItem>
                  </Select>
                </div>

                {/* 템플릿 선택 */}
                <div>
                  <Select
                    label="스키마 템플릿"
                    placeholder="템플릿을 선택하세요"
                    selectedKeys={selectedTemplate ? [selectedTemplate] : []}
                    onSelectionChange={(keys) => {
                      const template = Array.from(keys)[0] as string;
                      setSelectedTemplate(template);
                    }}
                  >
                    {templates.map(template => (
                      <SelectItem key={template.name}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                {/* 사용자 정의 스키마 */}
                <div>
                  <Textarea
                    label="사용자 정의 스키마 (JSON)"
                    placeholder="JSON Schema를 입력하세요..."
                    value={customSchema}
                    onValueChange={setCustomSchema}
                    minRows={5}
                  />
                </div>

                {/* 액션 버튼들 */}
                <div className="flex gap-2">
                  <Button
                    color="secondary"
                    variant="flat"
                    onPress={handleAutoDetect}
                    startContent={<Zap size={16} />}
                  >
                    자동 감지
                  </Button>
                  <Button
                    color="primary"
                    variant="flat"
                    onPress={generateExample}
                    startContent={<FileCode size={16} />}
                  >
                    예시 생성
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* 입력 패널 */}
            <Card>
              <CardHeader className="flex justify-between">
                <h3 className="text-lg font-semibold">입력 데이터</h3>
                <div className="flex gap-2">
                  <input
                    type="file"
                    id="file-upload"
                    accept=".json,.xml,.yaml,.yml,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onPress={() => document.getElementById('file-upload')?.click()}
                  >
                    <Upload size={16} />
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <Textarea
                  placeholder={`${selectedFormat.toUpperCase()} 형식의 데이터를 입력하세요...`}
                  value={inputText}
                  onValueChange={setInputText}
                  minRows={12}
                  classNames={{
                    input: "font-mono text-sm"
                  }}
                />
                
                <div className="flex justify-between items-center mt-4">
                  <div className="text-sm text-gray-500">
                    {inputText.length} 문자
                  </div>
                  <Button
                    color="primary"
                    onPress={handleParse}
                    isLoading={isLoading}
                    startContent={<Play size={16} />}
                    isDisabled={!inputText.trim()}
                  >
                    파싱 실행
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* 결과 패널 */}
          {parseResult && (
            <Card className="mt-6">
              <CardHeader className="flex justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">파싱 결과</h3>
                  {parseResult.success ? (
                    <Chip color="success" startContent={<CheckCircle size={14} />}>
                      성공
                    </Chip>
                  ) : (
                    <Chip color="danger" startContent={<XCircle size={14} />}>
                      실패
                    </Chip>
                  )}
                </div>
                
                {parseResult.success && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={copyResult}
                    >
                      <Copy size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={downloadResult}
                    >
                      <Download size={16} />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardBody>
                {parseResult.success ? (
                  <Code className="whitespace-pre-wrap">
                    {JSON.stringify(parseResult.data, null, 2)}
                  </Code>
                ) : (
                  <div className="space-y-3">
                    {parseResult.errors?.map((error, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                        <AlertTriangle size={16} className="text-red-500 mt-0.5" />
                        <div>
                          <div className="font-medium text-red-700">
                            {error.path ? `Path: ${error.path}` : 'General Error'}
                          </div>
                          <div className="text-red-600">{error.message}</div>
                          <div className="text-sm text-red-500">Code: {error.code}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <Divider className="my-4" />
                
                <div className="text-sm text-gray-500">
                  파싱 시간: {parseResult.parsedAt.toLocaleString()}
                </div>
              </CardBody>
            </Card>
          )}
        </Tab>

        <Tab key="schema-editor" title="스키마 에디터">
          <SchemaEditorPanel 
            schema={getCurrentSchema()}
            onSchemaChange={(newSchema) => {
              setCustomSchema(JSON.stringify(newSchema, null, 2));
              setSelectedTemplate('');
            }}
          />
        </Tab>

        <Tab key="templates" title="템플릿">
          <TemplateGallery 
            templates={templates}
            onSelectTemplate={(template) => {
              setSelectedTemplate(template.name);
              setActiveTab('parser');
            }}
          />
        </Tab>
      </Tabs>
    </div>
  );
}

/**
 * 스키마 에디터 패널
 */
interface SchemaEditorPanelProps {
  schema?: Schema;
  onSchemaChange: (schema: Schema) => void;
}

function SchemaEditorPanel({ schema, onSchemaChange }: SchemaEditorPanelProps) {
  const [schemaText, setSchemaText] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (schema) {
      setSchemaText(JSON.stringify(schema, null, 2));
    }
  }, [schema]);

  const handleSchemaChange = (value: string) => {
    setSchemaText(value);
    
    try {
      const parsed = JSON.parse(value);
      setIsValid(true);
      setError('');
      onSchemaChange(parsed);
    } catch (err) {
      setIsValid(false);
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">JSON Schema 에디터</h3>
        </CardHeader>
        <CardBody>
          <Textarea
            value={schemaText}
            onValueChange={handleSchemaChange}
            placeholder="JSON Schema를 입력하세요..."
            minRows={15}
            isInvalid={!isValid}
            errorMessage={error}
            classNames={{
              input: "font-mono text-sm"
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * 템플릿 갤러리
 */
interface TemplateGalleryProps {
  templates: SchemaTemplate[];
  onSelectTemplate: (template: SchemaTemplate) => void;
}

function TemplateGallery({ templates, onSelectTemplate }: TemplateGalleryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map(template => (
        <Card 
          key={template.name}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          isPressable
          onPress={() => onSelectTemplate(template)}
        >
          <CardHeader>
            <div>
              <h4 className="font-semibold">{template.name}</h4>
              <p className="text-sm text-gray-600">{template.description}</p>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <Code className="text-xs">
              {JSON.stringify(template.example, null, 2).substring(0, 100)}...
            </Code>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export default StructuredOutputComponent;