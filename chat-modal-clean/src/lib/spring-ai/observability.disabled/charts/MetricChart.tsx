/**
 * 메트릭 차트 컴포넌트
 * 
 * Recharts를 사용하여 실시간 메트릭 데이터를 시각화합니다.
 */

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardBody, CardHeader } from '@heroui/react';
import type { MetricAggregation, PerformanceData } from '../types';
import { CHART_COLORS, CHART_CONFIG } from '../constants';
import { formatMetricValue, formatTimestamp } from '../utils';

/**
 * 차트 타입
 */
export type ChartType = 'line' | 'area' | 'bar';

/**
 * 메트릭 차트 props
 */
export interface MetricChartProps {
  title: string;
  data: PerformanceData[] | MetricAggregation;
  type?: ChartType;
  height?: number;
  color?: string;
  unit?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  gradient?: boolean;
  className?: string;
}

/**
 * 커스텀 툴팁 Props
 */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    color: string;
  }>;
  label?: string;
  unit?: string;
}

/**
 * 커스텀 툴팁 컴포넌트
 */
const CustomTooltip: React.FC<CustomTooltipProps> = ({ 
  active, 
  payload, 
  label,
  unit,
}) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-background border border-divider rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-foreground mb-1">
        {formatTimestamp(parseInt(label))}
      </p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <p className="text-sm">
            <span className="text-foreground-500">{entry.name}:</span>{' '}
            <span className="font-medium">
              {formatMetricValue(entry.value as number, unit || '')}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
};

/**
 * 메트릭 차트 컴포넌트
 */
export const MetricChart: React.FC<MetricChartProps> = ({
  title,
  data,
  type = 'line',
  height = CHART_CONFIG.height,
  color = CHART_COLORS.primary,
  unit,
  showGrid = true,
  showLegend = false,
  animate = true,
  gradient = true,
  className,
}) => {
  // 차트 데이터 준비
  const chartData = useMemo(() => {
    if ('dataPoints' in data) {
      // MetricAggregation 데이터
      return data.dataPoints.map(point => ({
        timestamp: point.timestamp,
        value: point.value,
      }));
    } else if (Array.isArray(data)) {
      // PerformanceData 배열
      return data.map(item => ({
        timestamp: item.timestamp,
        value: item.value,
      }));
    }
    return [];
  }, [data]);

  // 최신 값
  const latestValue = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData[chartData.length - 1].value;
  }, [chartData]);

  // 통계 정보
  const stats = useMemo(() => {
    if ('statistics' in data && data.statistics) {
      return data.statistics;
    }
    
    if (chartData.length === 0) return null;
    
    const values = chartData.map(d => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { count: values.length, sum, avg, min, max };
  }, [data, chartData]);

  // 그라디언트 ID
  const gradientId = `gradient-${title.replace(/\s+/g, '-')}`;

  // 차트 렌더링
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: CHART_CONFIG.margin,
    };

    const lineProps = {
      type: 'monotone' as const,
      dataKey: 'value',
      stroke: color,
      strokeWidth: CHART_CONFIG.strokeWidth,
      dot: false,
      animationDuration: animate ? CHART_CONFIG.animationDuration : 0,
    };

    const areaProps = {
      ...lineProps,
      fill: gradient ? `url(#${gradientId})` : color,
      fillOpacity: gradient ? 1 : 0.3,
    };

    switch (type) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            {gradient && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              </defs>
            )}
            {showGrid && (
              <CartesianGrid 
                strokeDasharray={CHART_CONFIG.gridStrokeDasharray}
                className="stroke-divider"
              />
            )}
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              className="text-xs"
            />
            <YAxis
              tickFormatter={(value) => formatMetricValue(value, unit || '')}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {showLegend && <Legend />}
            <Area {...areaProps} />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && (
              <CartesianGrid 
                strokeDasharray={CHART_CONFIG.gridStrokeDasharray}
                className="stroke-divider"
              />
            )}
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              className="text-xs"
            />
            <YAxis
              tickFormatter={(value) => formatMetricValue(value, unit || '')}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {showLegend && <Legend />}
            <Bar
              dataKey="value"
              fill={color}
              animationDuration={animate ? CHART_CONFIG.animationDuration : 0}
            />
          </BarChart>
        );

      default:
        return (
          <LineChart {...commonProps}>
            {showGrid && (
              <CartesianGrid 
                strokeDasharray={CHART_CONFIG.gridStrokeDasharray}
                className="stroke-divider"
              />
            )}
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString()}
              className="text-xs"
            />
            <YAxis
              tickFormatter={(value) => formatMetricValue(value, unit || '')}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {showLegend && <Legend />}
            <Line {...lineProps} />
          </LineChart>
        );
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {stats && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-foreground-500">
                평균: {formatMetricValue(stats.avg, unit || '')}
              </span>
              <span className="text-xs text-foreground-500">
                최소: {formatMetricValue(stats.min, unit || '')}
              </span>
              <span className="text-xs text-foreground-500">
                최대: {formatMetricValue(stats.max, unit || '')}
              </span>
            </div>
          )}
        </div>
        {latestValue !== null && (
          <div className="text-right">
            <p className="text-2xl font-bold">
              {formatMetricValue(latestValue, unit || '')}
            </p>
            <p className="text-xs text-foreground-500">현재</p>
          </div>
        )}
      </CardHeader>
      <CardBody className="p-0">
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
};