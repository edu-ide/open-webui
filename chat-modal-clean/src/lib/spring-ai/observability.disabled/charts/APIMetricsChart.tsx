/**
 * API 메트릭 차트 컴포넌트
 * 
 * API 응답 시간, 상태 코드 분포, 엔드포인트별 성능 등을 시각화합니다.
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
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
  Chip,
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Tabs,
  Tab,
  Badge,
  Tooltip as HeroTooltip,
} from '@heroui/react';
import {
  ChartBarIcon,
  ClockIcon,
  ServerStackIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { APIMetrics } from '../types';
import { 
  CHART_COLORS, 
  STATUS_CODE_RANGES,
} from '../constants';
import { 
  formatDuration,
  formatBytes,
  getStatusCodeCategory,
  getResponseTimeCategory,
  getRelativeTime,
} from '../utils';

/**
 * API 메트릭 차트 props
 */
export interface APIMetricsChartProps {
  metrics: APIMetrics[];
  className?: string;
}

/**
 * 엔드포인트 통계
 */
interface EndpointStats {
  endpoint: string;
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorRate: number;
  totalSize: number;
}

/**
 * 상태 코드 분포
 */
interface StatusCodeDistribution {
  category: string;
  count: number;
  percentage: number;
  color: string;
}

/**
 * API 메트릭 차트 컴포넌트
 */
export const APIMetricsChart: React.FC<APIMetricsChartProps> = ({
  metrics,
  className,
}) => {
  const [selectedTab, setSelectedTab] = useState<string>('overview');
  const [_selectedEndpoint, __setSelectedEndpoint] = useState<string | null>(null);

  // 엔드포인트별 통계
  const endpointStats = useMemo(() => {
    const statsMap = new Map<string, EndpointStats>();

    metrics.forEach(metric => {
      const stats = statsMap.get(metric.endpoint) || {
        endpoint: metric.endpoint,
        count: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errorRate: 0,
        totalSize: 0,
      };

      stats.count++;
      stats.avgDuration = (stats.avgDuration * (stats.count - 1) + metric.duration) / stats.count;
      stats.minDuration = Math.min(stats.minDuration, metric.duration);
      stats.maxDuration = Math.max(stats.maxDuration, metric.duration);
      if (metric.statusCode >= 400) {
        stats.errorRate = ((stats.errorRate * (stats.count - 1)) + 1) / stats.count;
      }
      stats.totalSize += (metric.responseSize || 0);

      statsMap.set(metric.endpoint, stats);
    });

    return Array.from(statsMap.values()).sort((a, b) => b.count - a.count);
  }, [metrics]);

  // 상태 코드 분포
  const statusCodeDistribution = useMemo(() => {
    const distribution = new Map<string, StatusCodeDistribution>();

    Object.entries(STATUS_CODE_RANGES).forEach(([key, range]) => {
      distribution.set(key, {
        category: range.label,
        count: 0,
        percentage: 0,
        color: CHART_COLORS[range.color as keyof typeof CHART_COLORS] || CHART_COLORS.primary,
      });
    });

    metrics.forEach(metric => {
      const category = getStatusCodeCategory(metric.statusCode);
      const dist = distribution.get(category.key);
      if (dist) {
        dist.count++;
      }
    });

    const total = metrics.length;
    distribution.forEach(dist => {
      dist.percentage = total > 0 ? (dist.count / total) * 100 : 0;
    });

    return Array.from(distribution.values()).filter(d => d.count > 0);
  }, [metrics]);

  // 시간대별 응답 시간
  const responseTimeByHour = useMemo(() => {
    const hourlyData = new Map<number, { hour: number; avgDuration: number; count: number }>();

    metrics.forEach(metric => {
      const hour = new Date(metric.startTime).getHours();
      const data = hourlyData.get(hour) || { hour, avgDuration: 0, count: 0 };
      
      data.avgDuration = (data.avgDuration * data.count + metric.duration) / (data.count + 1);
      data.count++;
      
      hourlyData.set(hour, data);
    });

    return Array.from(hourlyData.values()).sort((a, b) => a.hour - b.hour);
  }, [metrics]);

  // 응답 시간 분포 (산점도용)
  const responseTimeScatter = useMemo(() => {
    return metrics.map((metric) => ({
      x: metric.startTime,
      y: metric.duration,
      size: metric.responseSize || 100,
      error: metric.statusCode >= 400,
    }));
  }, [metrics]);


  // 전체 통계
  const overallStats = useMemo(() => {
    if (metrics.length === 0) return null;

    const durations = metrics.map(m => m.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const errorCount = metrics.filter(m => m.statusCode >= 400).length;
    const errorRate = (errorCount / metrics.length) * 100;

    return {
      totalRequests: metrics.length,
      avgDuration,
      errorRate,
      totalDataTransferred: metrics.reduce((sum, m) => sum + (m.responseSize || 0), 0),
    };
  }, [metrics]);

  if (metrics.length === 0) {
    return (
      <Card className={className}>
        <CardBody className="flex items-center justify-center h-64">
          <p className="text-foreground-500">API 메트릭 데이터가 없습니다.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className={className}>
      {/* 전체 통계 카드 */}
      {overallStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <Card>
            <CardBody className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ServerStackIcon className="w-5 h-5 text-primary" />
                <p className="text-sm font-medium">총 요청</p>
              </div>
              <p className="text-2xl font-bold">{overallStats.totalRequests}</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClockIcon className="w-5 h-5 text-success" />
                <p className="text-sm font-medium">평균 응답 시간</p>
              </div>
              <p className="text-2xl font-bold">{formatDuration(overallStats.avgDuration)}</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-danger" />
                <p className="text-sm font-medium">오류율</p>
              </div>
              <p className="text-2xl font-bold">{overallStats.errorRate.toFixed(1)}%</p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ChartBarIcon className="w-5 h-5 text-warning" />
                <p className="text-sm font-medium">데이터 전송량</p>
              </div>
              <p className="text-2xl font-bold">{formatBytes(overallStats.totalDataTransferred)}</p>
            </CardBody>
          </Card>
        </div>
      )}

      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 상태 코드 분포 */}
            <Card>
              <CardHeader>
                <h4 className="text-md font-semibold">상태 코드 분포</h4>
              </CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusCodeDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="count"
                      label={({ percentage }) => `${percentage.toFixed(1)}%`}
                    >
                      {statusCodeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            {/* 시간대별 응답 시간 */}
            <Card>
              <CardHeader>
                <h4 className="text-md font-semibold">시간대별 평균 응답 시간</h4>
              </CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={responseTimeByHour}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-divider" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(hour) => `${hour}시`}
                    />
                    <YAxis
                      tickFormatter={(value) => formatDuration(value)}
                    />
                    <Tooltip
                      formatter={(value: number) => formatDuration(value)}
                    />
                    <Bar
                      dataKey="avgDuration"
                      fill={CHART_COLORS.primary}
                      name="평균 응답 시간"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </div>

          {/* 응답 시간 산점도 */}
          <Card className="mt-4">
            <CardHeader>
              <h4 className="text-md font-semibold">응답 시간 분포</h4>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-divider" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                  />
                  <YAxis
                    dataKey="y"
                    tickFormatter={(value) => formatDuration(value)}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === 'y') return formatDuration(value);
                      if (name === 'x') return new Date(value).toLocaleString();
                      return value;
                    }}
                  />
                  <Scatter
                    name="정상 요청"
                    data={responseTimeScatter.filter(d => !d.error)}
                    fill={CHART_COLORS.success}
                  />
                  <Scatter
                    name="오류 요청"
                    data={responseTimeScatter.filter(d => d.error)}
                    fill={CHART_COLORS.danger}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </Tab>

        <Tab
          key="endpoints"
          title={
            <div className="flex items-center gap-2">
              <ServerStackIcon className="w-4 h-4" />
              <span>엔드포인트</span>
            </div>
          }
        >
          <Card>
            <CardBody>
              <Table
                aria-label="엔드포인트 통계"
                onRowAction={(key) => _setSelectedEndpoint(key as string)}
              >
                <TableHeader>
                  <TableColumn>엔드포인트</TableColumn>
                  <TableColumn>요청 수</TableColumn>
                  <TableColumn>평균 응답 시간</TableColumn>
                  <TableColumn>최소/최대</TableColumn>
                  <TableColumn>오류율</TableColumn>
                  <TableColumn>총 크기</TableColumn>
                </TableHeader>
                <TableBody>
                  {endpointStats.map(stat => (
                    <TableRow key={stat.endpoint}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Chip
                            size="sm"
                            variant="flat"
                            color={stat.errorRate > 0.1 ? 'danger' : 'success'}
                          >
                            {stat.endpoint}
                          </Chip>
                        </div>
                      </TableCell>
                      <TableCell>{stat.count}</TableCell>
                      <TableCell>
                        <Chip
                          size="sm"
                          color={getResponseTimeCategory(stat.avgDuration).color as any}
                          variant="flat"
                        >
                          {formatDuration(stat.avgDuration)}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">
                          {formatDuration(stat.minDuration)} / {formatDuration(stat.maxDuration)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          content={`${(stat.errorRate * 100).toFixed(1)}%`}
                          color={stat.errorRate > 0.1 ? 'danger' : 'success'}
                          variant="flat"
                        >
                          <div className="w-2 h-2" />
                        </Badge>
                      </TableCell>
                      <TableCell>{formatBytes(stat.totalSize)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </Tab>

        <Tab
          key="errors"
          title={
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span>오류</span>
            </div>
          }
        >
          <Card>
            <CardBody>
              <Table aria-label="오류 요청">
                <TableHeader>
                  <TableColumn>시간</TableColumn>
                  <TableColumn>엔드포인트</TableColumn>
                  <TableColumn>메서드</TableColumn>
                  <TableColumn>상태 코드</TableColumn>
                  <TableColumn>오류 메시지</TableColumn>
                  <TableColumn>응답 시간</TableColumn>
                </TableHeader>
                <TableBody>
                  {metrics
                    .filter(m => m.statusCode >= 400 || m.error)
                    .slice(-50)
                    .reverse()
                    .map((metric, index) => (
                      <TableRow key={`error-${index}`}>
                        <TableCell>
                          <HeroTooltip content={new Date(metric.startTime).toLocaleString()}>
                            <span className="text-xs">
                              {getRelativeTime(metric.startTime)}
                            </span>
                          </HeroTooltip>
                        </TableCell>
                        <TableCell>{metric.endpoint}</TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat">
                            {metric.method}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="sm"
                            color={getStatusCodeCategory(metric.statusCode).color as any}
                            variant="flat"
                          >
                            {metric.statusCode}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-danger">
                            {metric.error?.message || '-'}
                          </span>
                        </TableCell>
                        <TableCell>{formatDuration(metric.duration)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </Tab>
      </Tabs>
    </div>
  );
};