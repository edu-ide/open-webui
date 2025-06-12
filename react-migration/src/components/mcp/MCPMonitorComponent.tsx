import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Chip,
  Divider,
  Input,
  Select,
  SelectItem,
  Tabs,
  Tab,
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Tooltip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  ScrollShadow,
  Code,
} from '@heroui/react';
import {
  ServerIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  WrenchIcon,
  ChatBubbleLeftIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  BugAntIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { useMCPClient, defaultMCPConfig } from '../../lib/spring-ai/mcp/useMCPClient';
import type { MCPResource, MCPTool, MCPPrompt } from '../../lib/spring-ai/mcp/types';

/**
 * MCP 서버 상태 모니터링 컴포넌트
 */
export const MCPMonitorComponent: React.FC = () => {
  const [config, setConfig] = useState(defaultMCPConfig);
  const [selectedTab, setSelectedTab] = useState<string>('status');
  const [selectedResource, setSelectedResource] = useState<MCPResource | null>(null);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [toolArgs, setToolArgs] = useState<string>('{}');
  const [selectedPrompt, setSelectedPrompt] = useState<MCPPrompt | null>(null);
  const [promptArgs, setPromptArgs] = useState<string>('{}');
  const [logFilter, setLogFilter] = useState<string>('all');

  const {
    state,
    connect,
    disconnect,
    listResources,
    readResource,
    listTools,
    callTool,
    listPrompts,
    getPrompt,
    setLogLevel,
    clearLogs,
  } = useMCPClient(config);

  const { isOpen: isResourceModalOpen, onOpen: onResourceModalOpen, onOpenChange: onResourceModalOpenChange } = useDisclosure();
  const { isOpen: isToolModalOpen, onOpen: onToolModalOpen, onOpenChange: onToolModalOpenChange } = useDisclosure();
  const { isOpen: isPromptModalOpen, onOpen: onPromptModalOpen, onOpenChange: onPromptModalOpenChange } = useDisclosure();

  // 연결 상태에 따른 색상
  const getConnectionColor = () => {
    switch (state.connectionState) {
      case 'connected': return 'success';
      case 'connecting': return 'warning';
      case 'handshaking': return 'warning';
      case 'error': return 'danger';
      case 'reconnecting': return 'warning';
      default: return 'default';
    }
  };

  // 연결 상태 아이콘
  const getConnectionIcon = () => {
    switch (state.connectionState) {
      case 'connected': return <CheckCircleIcon className="w-3 h-3 text-success animate-pulse" />;
      case 'connecting':
      case 'handshaking':
      case 'reconnecting':
        return <ArrowPathIcon className="w-3 h-3 text-warning animate-spin" />;
      case 'error': return <ExclamationTriangleIcon className="w-3 h-3 text-danger" />;
      default: return <div className="w-3 h-3 rounded-full bg-default-400" />;
    }
  };

  // 로그 레벨 색상
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'debug': return 'default';
      case 'info': return 'primary';
      case 'notice': return 'secondary';
      case 'warning': return 'warning';
      case 'error': return 'danger';
      case 'critical':
      case 'alert':
      case 'emergency':
        return 'danger';
      default: return 'default';
    }
  };

  // 로그 필터링
  const filteredLogs = state.logs.filter(log => {
    if (logFilter === 'all') return true;
    return log.level === logFilter;
  });

  // 리소스 읽기 핸들러
  const handleReadResource = async (resource: MCPResource) => {
    try {
      const content = await readResource(resource.uri);
      setSelectedResource({ ...resource, content } as any);
      onResourceModalOpen();
    } catch (error) {
      console.error('Failed to read resource:', error);
    }
  };

  // 도구 실행 핸들러
  const handleExecuteTool = async () => {
    if (!selectedTool) return;

    try {
      const args = JSON.parse(toolArgs);
      const result = await callTool(selectedTool.name, args);
      console.log('Tool execution result:', result);
      // 결과를 모달에 표시하거나 별도 처리
    } catch (error) {
      console.error('Failed to execute tool:', error);
    }
  };

  // 프롬프트 가져오기 핸들러
  const handleGetPrompt = async () => {
    if (!selectedPrompt) return;

    try {
      const args = JSON.parse(promptArgs);
      const result = await getPrompt(selectedPrompt.name, args);
      console.log('Prompt result:', result);
      // 결과를 모달에 표시하거나 별도 처리
    } catch (error) {
      console.error('Failed to get prompt:', error);
    }
  };

  return (
    <div className="w-full p-4 space-y-4">
      {/* 헤더 */}
      <Card>
        <CardHeader className="flex gap-3">
          <ServerIcon className="w-8 h-8 text-primary" />
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">MCP 서버 모니터</p>
            <p className="text-small text-default-500">Model Context Protocol 실시간 모니터링</p>
          </div>
          <div className="flex items-center gap-2">
            {getConnectionIcon()}
            <Chip color={getConnectionColor()} variant="flat" size="sm">
              {state.connectionState}
            </Chip>
          </div>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="flex flex-col gap-4">
            {/* 서버 설정 */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="서버 URL"
                value={config.serverUrl}
                onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                isDisabled={state.connectionState !== 'disconnected'}
              />
              <Input
                label="프로토콜 버전"
                value={config.protocolVersion}
                onChange={(e) => setConfig({ ...config, protocolVersion: e.target.value })}
                isDisabled={state.connectionState !== 'disconnected'}
              />
            </div>

            {/* 연결 제어 */}
            <div className="flex gap-2">
              <Button
                color="primary"
                startContent={<PlayIcon className="w-4 h-4" />}
                onPress={connect}
                isDisabled={state.connectionState !== 'disconnected'}
                isLoading={state.connectionState === 'connecting' || state.connectionState === 'handshaking'}
              >
                연결
              </Button>
              <Button
                color="danger"
                variant="flat"
                startContent={<StopIcon className="w-4 h-4" />}
                onPress={disconnect}
                isDisabled={state.connectionState === 'disconnected'}
              >
                연결 해제
              </Button>
              <Button
                color="default"
                variant="flat"
                startContent={<ArrowPathIcon className="w-4 h-4" />}
                onPress={() => {
                  disconnect().then(() => connect());
                }}
                isDisabled={state.connectionState === 'disconnected'}
              >
                재연결
              </Button>
            </div>

            {/* 에러 표시 */}
            {state.error && (
              <div className="p-3 bg-danger-50 dark:bg-danger-900/20 rounded-lg">
                <p className="text-sm text-danger">{state.error.message}</p>
              </div>
            )}

            {/* 서버 Capabilities */}
            {state.serverCapabilities && (
              <div className="p-3 bg-default-100 dark:bg-default-50/10 rounded-lg">
                <p className="text-sm font-semibold mb-2">서버 Capabilities:</p>
                <div className="grid grid-cols-3 gap-2">
                  {state.serverCapabilities.resources && (
                    <Badge content="✓" color="success" size="sm">
                      <Chip size="sm" variant="flat">리소스</Chip>
                    </Badge>
                  )}
                  {state.serverCapabilities.tools && (
                    <Badge content="✓" color="success" size="sm">
                      <Chip size="sm" variant="flat">도구</Chip>
                    </Badge>
                  )}
                  {state.serverCapabilities.prompts && (
                    <Badge content="✓" color="success" size="sm">
                      <Chip size="sm" variant="flat">프롬프트</Chip>
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 탭 컨텐츠 */}
      <Card>
        <CardBody>
          <Tabs
            selectedKey={selectedTab}
            onSelectionChange={(key) => setSelectedTab(key as string)}
          >
            {/* 상태 탭 */}
            <Tab
              key="status"
              title={
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="w-4 h-4" />
                  <span>상태</span>
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-default-100 dark:bg-default-50/10 rounded-lg">
                    <p className="text-sm text-default-500">연결 상태</p>
                    <p className="text-lg font-semibold">{state.connectionState}</p>
                  </div>
                  <div className="p-4 bg-default-100 dark:bg-default-50/10 rounded-lg">
                    <p className="text-sm text-default-500">리소스 수</p>
                    <p className="text-lg font-semibold">{state.resources.length}</p>
                  </div>
                  <div className="p-4 bg-default-100 dark:bg-default-50/10 rounded-lg">
                    <p className="text-sm text-default-500">도구 수</p>
                    <p className="text-lg font-semibold">{state.tools.length}</p>
                  </div>
                  <div className="p-4 bg-default-100 dark:bg-default-50/10 rounded-lg">
                    <p className="text-sm text-default-500">프롬프트 수</p>
                    <p className="text-lg font-semibold">{state.prompts.length}</p>
                  </div>
                </div>
              </div>
            </Tab>

            {/* 리소스 탭 */}
            <Tab
              key="resources"
              title={
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4" />
                  <span>리소스 ({state.resources.length})</span>
                </div>
              }
            >
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<ArrowPathIcon className="w-4 h-4" />}
                  onPress={() => listResources()}
                  className="mb-4"
                >
                  새로고침
                </Button>

                <Table aria-label="Resources table">
                  <TableHeader>
                    <TableColumn>URI</TableColumn>
                    <TableColumn>이름</TableColumn>
                    <TableColumn>설명</TableColumn>
                    <TableColumn>MIME 타입</TableColumn>
                    <TableColumn>작업</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {state.resources.map((resource) => (
                      <TableRow key={resource.uri}>
                        <TableCell>
                          <Code size="sm">{resource.uri}</Code>
                        </TableCell>
                        <TableCell>{resource.name}</TableCell>
                        <TableCell>{resource.description || '-'}</TableCell>
                        <TableCell>{resource.mimeType || '-'}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => handleReadResource(resource)}
                          >
                            읽기
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Tab>

            {/* 도구 탭 */}
            <Tab
              key="tools"
              title={
                <div className="flex items-center gap-2">
                  <WrenchIcon className="w-4 h-4" />
                  <span>도구 ({state.tools.length})</span>
                </div>
              }
            >
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<ArrowPathIcon className="w-4 h-4" />}
                  onPress={() => listTools()}
                  className="mb-4"
                >
                  새로고침
                </Button>

                <Table aria-label="Tools table">
                  <TableHeader>
                    <TableColumn>이름</TableColumn>
                    <TableColumn>설명</TableColumn>
                    <TableColumn>파라미터</TableColumn>
                    <TableColumn>작업</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {state.tools.map((tool) => (
                      <TableRow key={tool.name}>
                        <TableCell>
                          <Code size="sm">{tool.name}</Code>
                        </TableCell>
                        <TableCell>{tool.description || '-'}</TableCell>
                        <TableCell>
                          <Tooltip content={JSON.stringify(tool.inputSchema, null, 2)}>
                            <Badge content={Object.keys(tool.inputSchema.properties || {}).length} size="sm">
                              <Chip size="sm" variant="flat">파라미터</Chip>
                            </Badge>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => {
                              setSelectedTool(tool);
                              setToolArgs(JSON.stringify(tool.inputSchema.properties || {}, null, 2));
                              onToolModalOpen();
                            }}
                          >
                            실행
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Tab>

            {/* 프롬프트 탭 */}
            <Tab
              key="prompts"
              title={
                <div className="flex items-center gap-2">
                  <ChatBubbleLeftIcon className="w-4 h-4" />
                  <span>프롬프트 ({state.prompts.length})</span>
                </div>
              }
            >
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<ArrowPathIcon className="w-4 h-4" />}
                  onPress={() => listPrompts()}
                  className="mb-4"
                >
                  새로고침
                </Button>

                <Table aria-label="Prompts table">
                  <TableHeader>
                    <TableColumn>이름</TableColumn>
                    <TableColumn>설명</TableColumn>
                    <TableColumn>인자</TableColumn>
                    <TableColumn>작업</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {state.prompts.map((prompt) => (
                      <TableRow key={prompt.name}>
                        <TableCell>
                          <Code size="sm">{prompt.name}</Code>
                        </TableCell>
                        <TableCell>{prompt.description || '-'}</TableCell>
                        <TableCell>
                          {prompt.arguments?.length || 0} 개
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => {
                              setSelectedPrompt(prompt);
                              const args: Record<string, any> = {};
                              prompt.arguments?.forEach(arg => {
                                args[arg.name] = '';
                              });
                              setPromptArgs(JSON.stringify(args, null, 2));
                              onPromptModalOpen();
                            }}
                          >
                            가져오기
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Tab>

            {/* 로그 탭 */}
            <Tab
              key="logs"
              title={
                <div className="flex items-center gap-2">
                  <BugAntIcon className="w-4 h-4" />
                  <span>로그 ({state.logs.length})</span>
                </div>
              }
            >
              <div className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <Select
                    label="로그 레벨"
                    selectedKeys={[logFilter]}
                    onSelectionChange={(keys) => setLogFilter(Array.from(keys)[0] as string)}
                    className="max-w-xs"
                  >
                    <SelectItem key="all">전체</SelectItem>
                    <SelectItem key="debug">Debug</SelectItem>
                    <SelectItem key="info">Info</SelectItem>
                    <SelectItem key="warning">Warning</SelectItem>
                    <SelectItem key="error">Error</SelectItem>
                  </Select>

                  <div className="flex gap-2">
                    <Select
                      label="로그 레벨 설정"
                      onSelectionChange={(keys) => {
                        const level = Array.from(keys)[0] as 'debug' | 'info' | 'warning' | 'error';
                        if (level) setLogLevel(level);
                      }}
                      className="max-w-xs"
                    >
                      <SelectItem key="debug">Debug</SelectItem>
                      <SelectItem key="info">Info</SelectItem>
                      <SelectItem key="warning">Warning</SelectItem>
                      <SelectItem key="error">Error</SelectItem>
                    </Select>

                    <Button
                      size="sm"
                      color="danger"
                      variant="flat"
                      startContent={<TrashIcon className="w-4 h-4" />}
                      onPress={clearLogs}
                    >
                      로그 지우기
                    </Button>
                  </div>
                </div>

                <ScrollShadow className="h-[400px]">
                  <div className="space-y-2">
                    {filteredLogs.map((log, index) => (
                      <div
                        key={index}
                        className="p-3 bg-default-100 dark:bg-default-50/10 rounded-lg"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Chip size="sm" color={getLogLevelColor(log.level)} variant="flat">
                            {log.level}
                          </Chip>
                          <span className="text-xs text-default-500">
                            {log.timestamp.toLocaleTimeString()}
                          </span>
                          {log.logger && (
                            <span className="text-xs text-default-500">
                              [{log.logger}]
                            </span>
                          )}
                        </div>
                        <Code className="text-xs block">
                          {JSON.stringify(log.data, null, 2)}
                        </Code>
                      </div>
                    ))}
                  </div>
                </ScrollShadow>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>

      {/* 리소스 모달 */}
      <Modal 
        isOpen={isResourceModalOpen} 
        onOpenChange={onResourceModalOpenChange}
        size="2xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                리소스 내용
              </ModalHeader>
              <ModalBody>
                {selectedResource && (
                  <div className="space-y-2">
                    <p><strong>URI:</strong> {selectedResource.uri}</p>
                    <p><strong>이름:</strong> {selectedResource.name}</p>
                    {selectedResource.description && (
                      <p><strong>설명:</strong> {selectedResource.description}</p>
                    )}
                    {(selectedResource as any).content && (
                      <div>
                        <p><strong>내용:</strong></p>
                        <ScrollShadow className="h-[300px] mt-2">
                          <Code className="block">
                            {JSON.stringify((selectedResource as any).content, null, 2)}
                          </Code>
                        </ScrollShadow>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  닫기
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 도구 실행 모달 */}
      <Modal 
        isOpen={isToolModalOpen} 
        onOpenChange={onToolModalOpenChange}
        size="xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                도구 실행: {selectedTool?.name}
              </ModalHeader>
              <ModalBody>
                {selectedTool && (
                  <div className="space-y-4">
                    {selectedTool.description && (
                      <p className="text-sm text-default-500">{selectedTool.description}</p>
                    )}
                    <div>
                      <p className="text-sm font-semibold mb-2">파라미터 (JSON):</p>
                      <textarea
                        className="w-full h-[200px] p-2 rounded-lg bg-default-100 dark:bg-default-50/10 font-mono text-sm"
                        value={toolArgs}
                        onChange={(e) => setToolArgs(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  취소
                </Button>
                <Button color="primary" onPress={() => {
                  handleExecuteTool();
                  onClose();
                }}>
                  실행
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 프롬프트 모달 */}
      <Modal 
        isOpen={isPromptModalOpen} 
        onOpenChange={onPromptModalOpenChange}
        size="xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                프롬프트: {selectedPrompt?.name}
              </ModalHeader>
              <ModalBody>
                {selectedPrompt && (
                  <div className="space-y-4">
                    {selectedPrompt.description && (
                      <p className="text-sm text-default-500">{selectedPrompt.description}</p>
                    )}
                    {selectedPrompt.arguments && selectedPrompt.arguments.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">인자 목록:</p>
                        <div className="space-y-2">
                          {selectedPrompt.arguments.map((arg) => (
                            <div key={arg.name} className="p-2 bg-default-100 dark:bg-default-50/10 rounded">
                              <p className="text-sm font-medium">{arg.name} {arg.required && <span className="text-danger">*</span>}</p>
                              {arg.description && (
                                <p className="text-xs text-default-500">{arg.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold mb-2">인자 값 (JSON):</p>
                      <textarea
                        className="w-full h-[150px] p-2 rounded-lg bg-default-100 dark:bg-default-50/10 font-mono text-sm"
                        value={promptArgs}
                        onChange={(e) => setPromptArgs(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  취소
                </Button>
                <Button color="primary" onPress={() => {
                  handleGetPrompt();
                  onClose();
                }}>
                  가져오기
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};