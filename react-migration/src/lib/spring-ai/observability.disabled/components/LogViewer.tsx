/**
 * 로그 뷰어 컴포넌트
 * 
 * 로그 검색, 필터링, 표시 기능을 제공합니다.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Button,
  Chip,
  Badge,
  ScrollShadow,
  Tooltip,
  Pagination,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Divider,
  Code,
} from '@heroui/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  TrashIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  BugAntIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import type { LogEntry, LogLevel } from '../types';
import type { LogSearchOptions, LogStatistics } from '../LogAggregator';
import { LogLevel as LogLevelConst } from '../types';
import { LOG_LEVEL_COLORS, LOG_FILTER_PRESETS } from '../constants';
import { formatTimestamp, getRelativeTime, getLogLevelColor } from '../utils';

/**
 * 로그 뷰어 props
 */
export interface LogViewerProps {
  logs: LogEntry[];
  loggers: string[];
  tags: string[];
  statistics?: LogStatistics;
  onSearch: (options: LogSearchOptions) => void;
  onClear?: () => void;
  onRefresh?: () => void;
  className?: string;
}

/**
 * 로그 엔트리 컴포넌트
 */
const LogEntryComponent: React.FC<{
  log: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}> = ({ log, expanded, onToggle }) => {
  const levelColor = getLogLevelColor(log.level);
  
  const getLevelIcon = () => {
    switch (log.level) {
      case LogLevelConst.ERROR:
      case LogLevelConst.FATAL:
        return <ExclamationTriangleIcon className="w-4 h-4" />;
      case LogLevelConst.WARN:
        return <ExclamationTriangleIcon className="w-4 h-4" />;
      case LogLevelConst.DEBUG:
      case LogLevelConst.TRACE:
        return <BugAntIcon className="w-4 h-4" />;
      default:
        return <InformationCircleIcon className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-3 bg-default-100 dark:bg-default-50/10 rounded-lg hover:bg-default-200 dark:hover:bg-default-50/20 transition-colors">
      <div 
        className="flex items-start gap-2 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-1 mt-0.5">
          {expanded ? (
            <ChevronDownIcon className="w-3 h-3 text-foreground-500" />
          ) : (
            <ChevronRightIcon className="w-3 h-3 text-foreground-500" />
          )}
          <div style={{ color: levelColor }}>
            {getLevelIcon()}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Chip
              size="sm"
              variant="flat"
              style={{ backgroundColor: `${levelColor}20`, color: levelColor }}
            >
              {log.level.toUpperCase()}
            </Chip>
            <span className="text-xs text-foreground-500">
              {log.logger}
            </span>
            <Tooltip content={formatTimestamp(log.timestamp)}>
              <span className="text-xs text-foreground-400">
                {getRelativeTime(log.timestamp)}
              </span>
            </Tooltip>
          </div>
          
          <p className="text-sm break-words">{log.message}</p>

          {log.tags && log.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              {log.tags.map(tag => (
                <Badge key={tag} size="sm" variant="flat">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-7 space-y-2">
          {/* 타임스탬프 */}
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-foreground-500" />
            <span className="text-xs text-foreground-500">
              {formatTimestamp(log.timestamp)}
            </span>
          </div>

          {/* 컨텍스트 */}
          {log.context && Object.keys(log.context).length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground-500 mb-1">컨텍스트:</p>
              <Code className="text-xs block p-2">
                {JSON.stringify(log.context, null, 2)}
              </Code>
            </div>
          )}

          {/* 에러 정보 */}
          {log.error && (
            <div>
              <p className="text-xs font-medium text-danger mb-1">에러:</p>
              <div className="p-2 bg-danger-50 dark:bg-danger-900/20 rounded">
                <p className="text-xs font-medium">{log.error.type}: {log.error.message}</p>
                {log.error.stack && (
                  <pre className="text-xs mt-1 whitespace-pre-wrap text-foreground-600">
                    {log.error.stack}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* 소스 정보 */}
          {log.source && (
            <div className="text-xs text-foreground-500">
              <span>{log.source.file}</span>
              {log.source.line && <span>:{log.source.line}</span>}
              {log.source.function && <span> ({log.source.function})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 로그 뷰어 컴포넌트
 */
export const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  loggers,
  tags,
  statistics,
  onSearch,
  onClear,
  onRefresh,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [selectedLoggers, setSelectedLoggers] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [filterPreset, setFilterPreset] = useState<string>('ALL');
  
  const { isOpen: isStatsOpen, onOpen: onStatsOpen, onOpenChange: onStatsOpenChange } = useDisclosure();

  const itemsPerPage = 50;

  // 필터 프리셋 적용
  useEffect(() => {
    const preset = LOG_FILTER_PRESETS[filterPreset as keyof typeof LOG_FILTER_PRESETS];
    if (preset) {
      setSelectedLevels(new Set(preset.levels));
    }
  }, [filterPreset]);

  // 검색 실행
  const handleSearch = useCallback(() => {
    const options: LogSearchOptions = {
      query: searchQuery || undefined,
      levels: selectedLevels.size > 0 ? Array.from(selectedLevels) as LogLevel[] : undefined,
      loggers: selectedLoggers.size > 0 ? Array.from(selectedLoggers) : undefined,
      tags: selectedTags.size > 0 ? Array.from(selectedTags) : undefined,
      limit: itemsPerPage,
      offset: (currentPage - 1) * itemsPerPage,
    };
    
    onSearch(options);
  }, [searchQuery, selectedLevels, selectedLoggers, selectedTags, currentPage, onSearch]);

  // 검색 트리거
  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  // 로그 확장/축소 토글
  const toggleLogExpansion = useCallback((logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }, []);

  // 전체 확장/축소
  const toggleAllExpansion = useCallback(() => {
    if (expandedLogs.size === logs.length) {
      setExpandedLogs(new Set());
    } else {
      setExpandedLogs(new Set(logs.map(log => log.id)));
    }
  }, [logs, expandedLogs]);

  // 총 페이지 수
  const totalPages = Math.ceil((statistics?.total || 0) / itemsPerPage);

  return (
    <div className={className}>
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-6 h-6 text-primary" />
              <div>
                <h3 className="text-lg font-semibold">로그 뷰어</h3>
                {statistics && (
                  <p className="text-sm text-foreground-500">
                    총 {statistics.total.toLocaleString()}개의 로그
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {statistics && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={onStatsOpen}
                  startContent={<ChartBarIcon className="w-4 h-4" />}
                >
                  통계
                </Button>
              )}
              {onRefresh && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={onRefresh}
                  startContent={<ArrowPathIcon className="w-4 h-4" />}
                >
                  새로고침
                </Button>
              )}
              {onClear && (
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onPress={onClear}
                  startContent={<TrashIcon className="w-4 h-4" />}
                >
                  지우기
                </Button>
              )}
            </div>
          </div>

          <Divider />

          {/* 검색 및 필터 */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="로그 검색..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                onClear={() => setSearchQuery('')}
                isClearable
                startContent={<MagnifyingGlassIcon className="w-4 h-4 text-foreground-400" />}
                className="flex-1"
              />
              
              <Select
                label="필터 프리셋"
                selectedKeys={[filterPreset]}
                onSelectionChange={(keys) => setFilterPreset(Array.from(keys)[0] as string)}
                className="w-48"
              >
                {Object.entries(LOG_FILTER_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    {preset.name}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              {/* 레벨 필터 */}
              <Dropdown>
                <DropdownTrigger>
                  <Button
                    size="sm"
                    variant="flat"
                    endContent={<FunnelIcon className="w-3 h-3" />}
                  >
                    레벨 ({selectedLevels.size})
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="로그 레벨 선택"
                  selectionMode="multiple"
                  selectedKeys={selectedLevels}
                  onSelectionChange={setSelectedLevels as any}
                >
                  {Object.values(LogLevelConst).map(level => (
                    <DropdownItem key={level}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getLogLevelColor(level) }}
                        />
                        {level.toUpperCase()}
                      </div>
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>

              {/* 로거 필터 */}
              {loggers.length > 0 && (
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      size="sm"
                      variant="flat"
                      endContent={<FunnelIcon className="w-3 h-3" />}
                    >
                      로거 ({selectedLoggers.size})
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="로거 선택"
                    selectionMode="multiple"
                    selectedKeys={selectedLoggers}
                    onSelectionChange={setSelectedLoggers as any}
                  >
                    {loggers.map(logger => (
                      <DropdownItem key={logger}>{logger}</DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              )}

              {/* 태그 필터 */}
              {tags.length > 0 && (
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      size="sm"
                      variant="flat"
                      endContent={<FunnelIcon className="w-3 h-3" />}
                    >
                      태그 ({selectedTags.size})
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="태그 선택"
                    selectionMode="multiple"
                    selectedKeys={selectedTags}
                    onSelectionChange={setSelectedTags as any}
                  >
                    {tags.map(tag => (
                      <DropdownItem key={tag}>{tag}</DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              )}

              <Button
                size="sm"
                variant="flat"
                onPress={toggleAllExpansion}
              >
                {expandedLogs.size === logs.length ? '모두 축소' : '모두 확장'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          <ScrollShadow className="h-[600px]">
            <div className="p-4 space-y-2">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-foreground-500">
                  로그가 없습니다.
                </div>
              ) : (
                logs.map(log => (
                  <LogEntryComponent
                    key={log.id}
                    log={log}
                    expanded={expandedLogs.has(log.id)}
                    onToggle={() => toggleLogExpansion(log.id)}
                  />
                ))
              )}
            </div>
          </ScrollShadow>

          {totalPages > 1 && (
            <div className="flex justify-center p-4 border-t border-divider">
              <Pagination
                total={totalPages}
                page={currentPage}
                onChange={setCurrentPage}
                showControls
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* 통계 모달 */}
      <Modal isOpen={isStatsOpen} onOpenChange={onStatsOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>로그 통계</ModalHeader>
              <ModalBody>
                {statistics && (
                  <div className="space-y-4">
                    {/* 레벨별 통계 */}
                    <div>
                      <h4 className="text-sm font-semibold mb-2">로그 레벨별 분포</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(statistics.byLevel).map(([level, count]) => (
                          <div key={level} className="flex items-center justify-between p-2 bg-default-100 rounded">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getLogLevelColor(level as LogLevel) }}
                              />
                              <span className="text-sm">{level.toUpperCase()}</span>
                            </div>
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 로거별 통계 */}
                    <div>
                      <h4 className="text-sm font-semibold mb-2">로거별 로그 수</h4>
                      <ScrollShadow className="h-48">
                        <div className="space-y-1">
                          {Object.entries(statistics.byLogger)
                            .sort(([, a], [, b]) => b - a)
                            .map(([logger, count]) => (
                              <div key={logger} className="flex items-center justify-between p-2 bg-default-100 rounded">
                                <span className="text-sm">{logger}</span>
                                <Badge size="sm">{count}</Badge>
                              </div>
                            ))}
                        </div>
                      </ScrollShadow>
                    </div>

                    {/* 최근 에러 */}
                    {statistics.recentErrors.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">최근 에러</h4>
                        <div className="space-y-2">
                          {statistics.recentErrors.map(error => (
                            <div key={error.id} className="p-2 bg-danger-50 dark:bg-danger-900/20 rounded">
                              <p className="text-xs text-foreground-500">{getRelativeTime(error.timestamp)}</p>
                              <p className="text-sm">{error.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={onClose}>
                  닫기
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};