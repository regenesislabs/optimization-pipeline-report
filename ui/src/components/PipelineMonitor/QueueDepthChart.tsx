import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { QueueHistoryPoint } from '../../types';

export type TimeRange = '7d' | '3d' | '24h' | '12h' | '6h' | '3h' | '1h';

interface QueueDepthChartProps {
  history: QueueHistoryPoint[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  color?: string;
  label?: string;
  showTimeSelector?: boolean;
}

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '1h': 1 * 60 * 60 * 1000,
};

// Number of ticks to show for each time range
const TICK_COUNT: Record<TimeRange, number> = {
  '7d': 7,
  '3d': 6,
  '24h': 8,
  '12h': 6,
  '6h': 6,
  '3h': 6,
  '1h': 6,
};

function formatAxisTime(timestamp: number, timeRange: TimeRange): string {
  const date = new Date(timestamp);
  if (timeRange === '7d' || timeRange === '3d') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function generateTicks(startTime: number, endTime: number, count: number): number[] {
  const ticks: number[] = [];
  const step = (endTime - startTime) / count;
  for (let i = 0; i <= count; i++) {
    ticks.push(startTime + step * i);
  }
  return ticks;
}

export function QueueDepthChart({ history, timeRange, onTimeRangeChange, color = '#667eea', label = 'Queue Depth', showTimeSelector = true }: QueueDepthChartProps) {
  const timeRangeOptions: TimeRange[] = ['7d', '3d', '24h', '12h', '6h', '3h', '1h'];

  const { filteredData, domain, ticks } = useMemo(() => {
    const now = Date.now();
    const rangeMs = TIME_RANGE_MS[timeRange];
    const startTime = now - rangeMs;

    const data = history
      .filter(h => new Date(h.timestamp).getTime() >= startTime)
      .map(h => ({
        ...h,
        time: new Date(h.timestamp).getTime(),
      }));

    const tickCount = TICK_COUNT[timeRange];
    const generatedTicks = generateTicks(startTime, now, tickCount);

    return {
      filteredData: data,
      domain: [startTime, now] as [number, number],
      ticks: generatedTicks,
    };
  }, [history, timeRange]);

  const renderHeader = () => (
    <div className="queue-chart-header">
      <h4>{label} Queue</h4>
      {showTimeSelector && (
        <div className="time-range-selector">
          {timeRangeOptions.map(range => (
            <button
              key={range}
              className={timeRange === range ? 'active' : ''}
              onClick={() => onTimeRangeChange(range)}
            >
              {range}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (filteredData.length < 2) {
    return (
      <div className="queue-chart">
        {renderHeader()}
        <div className="chart-empty">Not enough data to display chart for selected time range</div>
      </div>
    );
  }

  return (
    <div className="queue-chart">
      {renderHeader()}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={filteredData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`queueGradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={color} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={domain}
            ticks={ticks}
            tickFormatter={(value) => formatAxisTime(value, timeRange)}
            tick={{ fontSize: 11, fill: '#6c757d' }}
            tickLine={{ stroke: '#6c757d' }}
            axisLine={{ stroke: '#6c757d' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6c757d' }}
            tickLine={{ stroke: '#6c757d' }}
            axisLine={{ stroke: '#6c757d' }}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(0, 0, 0, 0.85)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
            }}
            labelStyle={{ color: 'white', opacity: 0.8, fontSize: '0.9em' }}
            itemStyle={{ color: 'white', fontWeight: 'bold' }}
            formatter={(value) => [`${(value ?? 0).toLocaleString()} items`, label]}
            labelFormatter={(value) => formatTooltipTime(value as number)}
          />
          <Area
            type="monotone"
            dataKey="queueDepth"
            stroke={color}
            strokeWidth={2}
            fill={`url(#queueGradient-${color.replace('#', '')})`}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
