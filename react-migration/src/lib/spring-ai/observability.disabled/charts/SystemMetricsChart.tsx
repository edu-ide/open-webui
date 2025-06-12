/**
 * 시스템 메트릭 차트 컴포넌트
 * 
 * CPU, 메모리, 네트워크 등 시스템 메트릭을 실시간으로 표시합니다.
 */

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { 
  Card, 
  CardBody, 
  CardHeader, 
  Progress, 
  Chip,
  Tabs,
  Tab,
} from '@heroui/react';
import {
  CpuChipIcon,
  ServerIcon,
  CircleStackIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import type { SystemMetrics } from '../types';
import { CHART_COLORS } from '../constants';
import { 
  formatBytes, 
  formatDuration,
  getCPUUsageCategory,
  getMemoryUsageCategory,
  calculatePercentage,
} from '../utils';

/**
 * 시스템 메트릭 차트 props
 */
export interface SystemMetricsChartProps {
  metrics: SystemMetrics | null;
  history?: SystemMetrics[];
  className?: string;
}

/**
 * 메트릭 카드 컴포넌트
 */
const MetricCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subValue?: string;
  progress?: number;
  color?: 'success' | 'warning' | 'danger' | 'primary';
}> = ({ icon, title, value, subValue, progress, color = 'primary' }) => {
  return (
    <Card className="h-full">
      <CardBody className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`text-${color}`}>{icon}</div>
            <p className="text-sm font-medium text-foreground-500">{title}</p>
          </div>
          <Chip size="sm" color={color} variant="flat">
            {value}
          </Chip>
        </div>
        {subValue && (
          <p className="text-xs text-foreground-400 mb-2">{subValue}</p>
        )}
        {progress !== undefined && (
          <Progress
            value={progress}
            color={color}
            size="sm"
            className="mt-2"
          />
        )}
      </CardBody>
    </Card>
  );
};

/**
 * 시스템 메트릭 차트 컴포넌트
 */
export const SystemMetricsChart: React.FC<SystemMetricsChartProps> = ({
  metrics,
  history = [],
  className,
}) => {
  const [selectedTab, setSelectedTab] = useState<string>('overview');

  // CPU 사용률 카테고리
  const cpuCategory = useMemo(() => {
    if (!metrics) return null;
    return getCPUUsageCategory(metrics.cpu.usage);
  }, [metrics]);

  // 메모리 사용률 카테고리
  const memoryCategory = useMemo(() => {
    if (!metrics) return null;
    return getMemoryUsageCategory(metrics.memory.percentage);
  }, [metrics]);

  // 히스토리 차트 데이터
  const historyData = useMemo(() => {
    return history.map(m => ({
      timestamp: m.timestamp,
      cpu: m.cpu.usage,
      memory: m.memory.percentage,
      network: m.network.requestsPerSecond,
    }));
  }, [history]);

  // 메모리 파이 차트 데이터
  const memoryPieData = useMemo(() => {
    if (!metrics) return [];
    return [
      { 
        name: '사용중', 
        value: metrics.memory.used,
        percentage: metrics.memory.percentage,
      },
      { 
        name: '여유', 
        value: metrics.memory.total - metrics.memory.used,
        percentage: 100 - metrics.memory.percentage,
      },
    ];
  }, [metrics]);

  // 스레드 데이터
  const threadData = useMemo(() => {
    if (!metrics?.threads) return [];
    return [
      { name: '활성', value: metrics.threads.active, fill: CHART_COLORS.success },
      { name: '차단', value: metrics.threads.blocked, fill: CHART_COLORS.danger },
      { name: '대기', value: metrics.threads.waiting, fill: CHART_COLORS.warning },
      { 
        name: '유휴', 
        value: metrics.threads.total - metrics.threads.active - metrics.threads.blocked - metrics.threads.waiting,
        fill: CHART_COLORS.info,
      },
    ];
  }, [metrics]);

  if (!metrics) {
    return (
      <Card className={className}>
        <CardBody className="flex items-center justify-center h-64">
          <p className="text-foreground-500">시스템 메트릭 데이터가 없습니다.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        className="mb-4"
      >
        <Tab
          key="overview"
          title={
            <div className="flex items-center gap-2">
              <ServerIcon className="w-4 h-4" />
              <span>개요</span>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU 카드 */}
            <MetricCard
              icon={<CpuChipIcon className="w-5 h-5" />}
              title="CPU 사용률"
              value={`${metrics.cpu.usage.toFixed(1)}%`}
              subValue={`${metrics.cpu.cores} 코어`}
              progress={metrics.cpu.usage}
              color={cpuCategory?.color as any}
            />

            {/* 메모리 카드 */}
            <MetricCard
              icon={<CircleStackIcon className="w-5 h-5" />}
              title="메모리 사용률"
              value={`${metrics.memory.percentage.toFixed(1)}%`}
              subValue={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
              progress={metrics.memory.percentage}
              color={memoryCategory?.color as any}
            />

            {/* 네트워크 카드 */}
            <MetricCard
              icon={<SignalIcon className="w-5 h-5" />}
              title="네트워크"
              value={`${metrics.network.requestsPerSecond.toFixed(1)} req/s`}
              subValue={`활성 연결: ${metrics.network.activeConnections}`}
            />

            {/* 스레드 카드 */}
            {metrics.threads && (
              <MetricCard
                icon={<ServerIcon className="w-5 h-5" />}
                title="스레드"
                value={`${metrics.threads.active} / ${metrics.threads.total}`}
                subValue={`차단: ${metrics.threads.blocked}, 대기: ${metrics.threads.waiting}`}
                progress={calculatePercentage(metrics.threads.active, metrics.threads.total)}
              />
            )}
          </div>

          {/* 히스토리 차트 */}
          {historyData.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <h4 className="text-md font-semibold">시스템 메트릭 추이</h4>
              </CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-divider" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value as number).toLocaleString()}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cpu"
                      stroke={CHART_COLORS.primary}
                      name="CPU (%)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="memory"
                      stroke={CHART_COLORS.success}
                      name="메모리 (%)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="network"
                      stroke={CHART_COLORS.warning}
                      name="네트워크 (req/s)"
                      strokeWidth={2}
                      yAxisId="right"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}
        </Tab>

        <Tab
          key="memory"
          title={
            <div className="flex items-center gap-2">
              <CircleStackIcon className="w-4 h-4" />
              <span>메모리</span>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 메모리 파이 차트 */}
            <Card>
              <CardHeader>
                <h4 className="text-md font-semibold">메모리 사용 현황</h4>
              </CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={memoryPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill={CHART_COLORS.danger} />
                      <Cell fill={CHART_COLORS.success} />
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatBytes(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-danger" />
                    <span className="text-sm">사용중</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-success" />
                    <span className="text-sm">여유</span>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* 힙 메모리 정보 */}
            {metrics.memory.heap && (
              <Card>
                <CardHeader>
                  <h4 className="text-md font-semibold">힙 메모리</h4>
                </CardHeader>
                <CardBody>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">사용중</span>
                        <span className="text-sm font-medium">
                          {formatBytes(metrics.memory.heap.used)}
                        </span>
                      </div>
                      <Progress
                        value={calculatePercentage(
                          metrics.memory.heap.used,
                          metrics.memory.heap.total
                        )}
                        color="primary"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">전체</span>
                        <span className="text-sm font-medium">
                          {formatBytes(metrics.memory.heap.total)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">제한</span>
                        <span className="text-sm font-medium">
                          {formatBytes(metrics.memory.heap.limit)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </Tab>

        <Tab
          key="threads"
          title={
            <div className="flex items-center gap-2">
              <ServerIcon className="w-4 h-4" />
              <span>스레드</span>
            </div>
          }
        >
          {metrics.threads && (
            <Card>
              <CardHeader>
                <h4 className="text-md font-semibold">스레드 상태</h4>
              </CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={threadData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                    >
                      {threadData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}
        </Tab>

        {metrics.gc && (
          <Tab
            key="gc"
            title={
              <div className="flex items-center gap-2">
                <CircleStackIcon className="w-4 h-4" />
                <span>GC</span>
              </div>
            }
          >
            <Card>
              <CardHeader>
                <h4 className="text-md font-semibold">가비지 컬렉션</h4>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{metrics.gc.count}</p>
                    <p className="text-sm text-foreground-500">총 실행 횟수</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {formatDuration(metrics.gc.totalTime)}
                    </p>
                    <p className="text-sm text-foreground-500">총 소요 시간</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">
                      {formatDuration(Date.now() - metrics.gc.lastGcTime)}
                    </p>
                    <p className="text-sm text-foreground-500">마지막 GC 이후</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </Tab>
        )}
      </Tabs>
    </div>
  );
};