/**
 * Observability 대시보드 컴포넌트
 * 
 * 시스템 메트릭, API 성능, 로그 등을 통합하여 표시하는 메인 대시보드입니다.
 */

import React, { useState, useMemo } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Tabs,
  Tab,
  Chip,
  Badge,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Divider,
  Progress,
} from '@heroui/react';
import {
  ComputerDesktopIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ServerStackIcon,
  CpuChipIcon,
  CircleStackIcon,
  SignalIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type {
  SystemMetrics,
  APIMetrics,
  LogEntry,
  LogStatistics,
  ObservabilityConfig,
  PerformanceData,
} from '../types';
import { MetricChart } from '../charts/MetricChart';
import { SystemMetricsChart } from '../charts/SystemMetricsChart';
import { APIMetricsChart } from '../charts/APIMetricsChart';
import { LogViewer } from './LogViewer';
import { TIME_RANGE_PRESETS, CHART_COLORS, PERFORMANCE_THRESHOLDS } from '../constants';
import { 
  formatBytes, 
  formatDuration, 
  getCPUUsageCategory, 
  getMemoryUsageCategory,
  getResponseTimeCategory,
  calculatePercentage,
} from '../utils';

/**
 * 대시보드 props
 */
export interface ObservabilityDashboardProps {
  config: ObservabilityConfig;
  systemMetrics?: SystemMetrics | null;
  systemMetricsHistory?: SystemMetrics[];
  apiMetrics?: APIMetrics[];
  logs?: LogEntry[];
  loggers?: string[];
  tags?: string[];
  logStatistics?: LogStatistics;
  performanceData?: PerformanceData[];
  onConfigChange?: (config: Partial<ObservabilityConfig>) => void;
  onLogSearch?: (options: any) => void;
  onLogClear?: () => void;
  onRefresh?: () => void;
  className?: string;
}

/**
 * 요약 카드 컴포넌트
 */
const SummaryCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'stable';
  color?: 'success' | 'warning' | 'danger' | 'primary';
  onClick?: () => void;
}> = ({ icon, title, value, subValue, trend, color = 'primary', onClick }) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      default: return '➡️';
    }
  };

  return (
    <Card 
      className={`cursor-pointer hover:shadow-lg transition-shadow ${onClick ? 'hover:scale-105 transition-transform' : ''}`}
      onClick={onClick}
    >
      <CardBody className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={`text-${color}`}>{icon}</div>
          {trend && (
            <span className="text-xs">{getTrendIcon()}</span>
          )}
        </div>
        <div>
          <p className="text-sm text-foreground-500 mb-1">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subValue && (
            <p className="text-xs text-foreground-400">{subValue}</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

/**
 * Observability 대시보드 컴포넌트
 */
export const ObservabilityDashboard: React.FC<ObservabilityDashboardProps> = ({
  config,
  systemMetrics,
  systemMetricsHistory = [],
  apiMetrics = [],
  logs = [],
  loggers = [],
  tags = [],
  logStatistics,
  performanceData = [],
  onConfigChange,
  onLogSearch,
  onLogClear,
  onRefresh,
  className,
}) => {
  const [selectedTab, setSelectedTab] = useState<string>('overview');
  const [timeRange, setTimeRange] = useState<string>('LAST_1_HOUR');

  // 현재 시간 범위
  const currentTimeRange = useMemo(() => {
    const preset = TIME_RANGE_PRESETS[timeRange as keyof typeof TIME_RANGE_PRESETS];
    return preset ? {
      start: Date.now() - preset.value,
      end: Date.now(),
    } : null;
  }, [timeRange]);

  // 필터된 API 메트릭
  const filteredApiMetrics = useMemo(() => {
    if (!currentTimeRange) return apiMetrics;
    return apiMetrics.filter(m => 
      m.startTime >= currentTimeRange.start && m.startTime <= currentTimeRange.end
    );
  }, [apiMetrics, currentTimeRange]);

  // 필터된 로그
  const filteredLogs = useMemo(() => {
    if (!currentTimeRange) return logs;
    return logs.filter(l => 
      l.timestamp >= currentTimeRange.start && l.timestamp <= currentTimeRange.end
    );
  }, [logs, currentTimeRange]);

  // API 요약 통계
  const apiSummary = useMemo(() => {
    if (filteredApiMetrics.length === 0) return null;

    const durations = filteredApiMetrics.map(m => m.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const errorCount = filteredApiMetrics.filter(m => m.statusCode >= 400).length;
    const errorRate = (errorCount / filteredApiMetrics.length) * 100;

    return {
      totalRequests: filteredApiMetrics.length,
      avgDuration,
      errorRate,
      errorCount,
    };
  }, [filteredApiMetrics]);

  // 로그 요약 통계
  const logSummary = useMemo(() => {
    if (filteredLogs.length === 0) return null;

    const errorCount = filteredLogs.filter(l => l.level === 'error' || l.level === 'fatal').length;
    const warnCount = filteredLogs.filter(l => l.level === 'warn').length;

    return {
      total: filteredLogs.length,
      errorCount,
      warnCount,
    };
  }, [filteredLogs]);

  // 시스템 상태 요약
  const systemSummary = useMemo(() => {
    if (!systemMetrics) return null;

    const cpuCategory = getCPUUsageCategory(systemMetrics.cpu.usage);
    const memoryCategory = getMemoryUsageCategory(systemMetrics.memory.percentage);

    return {
      cpu: {
        value: systemMetrics.cpu.usage,
        category: cpuCategory,
      },
      memory: {
        value: systemMetrics.memory.percentage,
        category: memoryCategory,
      },
      network: systemMetrics.network.requestsPerSecond,
    };
  }, [systemMetrics]);

  return (
    <div className={className}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Observability 대시보드</h1>
          <p className="text-foreground-500">시스템 메트릭, API 성능, 로그를 실시간으로 모니터링하세요</p>
        </div>

        <div className="flex items-center gap-2">
          <Dropdown>
            <DropdownTrigger>
              <Button variant="flat" endContent={<ClockIcon className="w-4 h-4" />}>
                {TIME_RANGE_PRESETS[timeRange as keyof typeof TIME_RANGE_PRESETS]?.label || '시간 범위'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              selectedKeys={[timeRange]}
              onSelectionChange={(keys) => setTimeRange(Array.from(keys)[0] as string)}
            >
              {Object.entries(TIME_RANGE_PRESETS).map(([key, preset]) => (
                <DropdownItem key={key}>{preset.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          {onRefresh && (
            <Button
              variant="flat"
              startContent={<ArrowPathIcon className="w-4 h-4" />}
              onPress={onRefresh}
            >
              새로고침
            </Button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* 시스템 CPU */}
        {systemSummary && (
          <SummaryCard
            icon={<CpuChipIcon className="w-6 h-6" />}
            title="CPU 사용률"
            value={`${systemSummary.cpu.value.toFixed(1)}%`}
            color={systemSummary.cpu.category.color as any}
            onClick={() => setSelectedTab('system')}
          />
        )}

        {/* 시스템 메모리 */}
        {systemSummary && (
          <SummaryCard
            icon={<CircleStackIcon className="w-6 h-6" />}
            title="메모리 사용률"
            value={`${systemSummary.memory.value.toFixed(1)}%`}
            color={systemSummary.memory.category.color as any}
            onClick={() => setSelectedTab('system')}
          />
        )}

        {/* API 요청 */}
        {apiSummary && (
          <SummaryCard
            icon={<ServerStackIcon className="w-6 h-6" />}
            title="API 요청"
            value={apiSummary.totalRequests}
            subValue={`평균 ${formatDuration(apiSummary.avgDuration)}`}
            color={getResponseTimeCategory(apiSummary.avgDuration).color as any}
            onClick={() => setSelectedTab('api')}
          />
        )}

        {/* 로그 에러 */}
        {logSummary && (
          <SummaryCard
            icon={<ExclamationTriangleIcon className="w-6 h-6" />}
            title="로그 에러"
            value={logSummary.errorCount}
            subValue={`총 ${logSummary.total} 로그`}
            color={logSummary.errorCount > 0 ? 'danger' : 'success'}
            onClick={() => setSelectedTab('logs')}
          />
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        className="mt-4"
      >
        <Tab
          key="overview"
          title={
            <div className="flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4" />
              <span>개요</span>
            </div>
          }
        >
          <div className="space-y-6">
            {/* 시스템 메트릭 요약 */}
            {systemMetrics && (
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold">시스템 상태</h3>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">CPU 사용률</span>
                        <span className="text-sm font-medium">
                          {systemMetrics.cpu.usage.toFixed(1)}%
                        </span>
                      </div>
                      <Progress
                        value={systemMetrics.cpu.usage}
                        color={getCPUUsageCategory(systemMetrics.cpu.usage).color as any}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">메모리 사용률</span>
                        <span className="text-sm font-medium">
                          {systemMetrics.memory.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <Progress
                        value={systemMetrics.memory.percentage}
                        color={getMemoryUsageCategory(systemMetrics.memory.percentage).color as any}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">네트워크</span>
                        <span className="text-sm font-medium">
                          {systemMetrics.network.requestsPerSecond.toFixed(1)} req/s
                        </span>
                      </div>
                      <div className="text-xs text-foreground-500">
                        활성 연결: {systemMetrics.network.activeConnections}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* API 성능 차트 */}
            {performanceData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricChart
                  title="API 응답 시간"
                  data={performanceData.filter(d => d.name.includes('api_'))}
                  type="line"
                  color={CHART_COLORS.primary}
                  unit="ms"
                />
                
                <MetricChart
                  title="시스템 CPU 사용률"
                  data={performanceData.filter(d => d.name === 'cpu_usage')}
                  type="area"
                  color={CHART_COLORS.warning}
                  unit="%"
                />
              </div>
            )}

            {/* 최근 알림 */}
            {logSummary && logSummary.errorCount > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">최근 알림</h3>
                    <Badge color="danger" variant="flat">
                      {logSummary.errorCount} 에러
                    </Badge>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="space-y-2">
                    {filteredLogs
                      .filter(l => l.level === 'error' || l.level === 'fatal')
                      .slice(0, 5)
                      .map(log => (
                        <div key={log.id} className="flex items-start gap-2 p-2 bg-danger-50 dark:bg-danger-900/20 rounded">
                          <ExclamationTriangleIcon className="w-4 h-4 text-danger mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{log.message}</p>
                            <p className="text-xs text-foreground-500">
                              {log.logger} • {formatDuration(Date.now() - log.timestamp)} 전
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </Tab>

        <Tab
          key="system"
          title={
            <div className="flex items-center gap-2">
              <ComputerDesktopIcon className="w-4 h-4" />
              <span>시스템</span>
            </div>
          }
        >
          <SystemMetricsChart
            metrics={systemMetrics}
            history={systemMetricsHistory}
          />
        </Tab>

        <Tab
          key="api"
          title={
            <div className="flex items-center gap-2">
              <ServerStackIcon className="w-4 h-4" />
              <span>API</span>
            </div>
          }
        >
          <APIMetricsChart metrics={filteredApiMetrics} />
        </Tab>

        <Tab
          key="logs"
          title={
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4" />
              <span>로그</span>
              {logSummary && logSummary.errorCount > 0 && (
                <Badge size="sm" color="danger" variant="flat">
                  {logSummary.errorCount}
                </Badge>
              )}
            </div>
          }
        >
          <LogViewer
            logs={filteredLogs}
            loggers={loggers}
            tags={tags}
            statistics={logStatistics}
            onSearch={onLogSearch}
            onClear={onLogClear}
          />
        </Tab>

        <Tab
          key="settings"
          title={
            <div className="flex items-center gap-2">
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
              <span>설정</span>
            </div>
          }
        >
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Observability 설정</h3>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">메트릭 수집</label>
                    <div className="flex items-center gap-2">
                      <Chip
                        color={config.metricsEnabled ? 'success' : 'default'}
                        variant="flat"
                      >
                        {config.metricsEnabled ? '활성화' : '비활성화'}
                      </Chip>
                      {config.metricsEnabled && (
                        <span className="text-xs text-foreground-500">
                          {config.metricsInterval}ms 간격
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">로그 수집</label>
                    <div className="flex items-center gap-2">
                      <Chip
                        color={config.loggingEnabled ? 'success' : 'default'}
                        variant="flat"
                      >
                        {config.loggingEnabled ? '활성화' : '비활성화'}
                      </Chip>
                      {config.loggingEnabled && (
                        <span className="text-xs text-foreground-500">
                          최소 레벨: {config.minLogLevel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">트레이싱</label>
                    <div className="flex items-center gap-2">
                      <Chip
                        color={config.tracingEnabled ? 'success' : 'default'}
                        variant="flat"
                      >
                        {config.tracingEnabled ? '활성화' : '비활성화'}
                      </Chip>
                      {config.tracingEnabled && (
                        <span className="text-xs text-foreground-500">
                          샘플링: {(config.samplingRate * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">알림</label>
                    <Chip
                      color={config.alertingEnabled ? 'success' : 'default'}
                      variant="flat"
                    >
                      {config.alertingEnabled ? '활성화' : '비활성화'}
                    </Chip>
                  </div>
                </div>

                <Divider />

                <div className="space-y-2">
                  <label className="text-sm font-medium">데이터 보관 기간</label>
                  <p className="text-sm text-foreground-500">
                    {config.retentionDays}일간 데이터를 보관합니다.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Tab>
      </Tabs>
    </div>
  );
};