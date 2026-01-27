import type { QueueMetrics, QueueHistoryPoint, EntityType } from '../../types';
import { QueueDepthChart, type TimeRange } from './QueueDepthChart';

interface QueueStatusProps {
  queue: QueueMetrics | null;
  queues?: Record<EntityType, QueueMetrics | null>;
  queueHistory: QueueHistoryPoint[];
  queueHistoryByType?: Record<EntityType, QueueHistoryPoint[]>;
  processedLastHour: number;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

const ENTITY_TYPES: EntityType[] = ['scene', 'wearable', 'emote'];

const ENTITY_COLORS: Record<EntityType, string> = {
  scene: '#667eea',
  wearable: '#28a745',
  emote: '#ff6b6b'
};

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${diffHour}h ago`;
}

function getLatestUpdate(queues: Record<EntityType, QueueMetrics | null> | undefined, queue: QueueMetrics | null): string {
  if (queues) {
    const timestamps = ENTITY_TYPES
      .map(type => queues[type]?.lastUpdated)
      .filter(Boolean)
      .map(ts => new Date(ts!).getTime());

    if (timestamps.length > 0) {
      const latest = new Date(Math.max(...timestamps)).toISOString();
      return formatTimeAgo(latest);
    }
  }

  if (queue?.lastUpdated) {
    return formatTimeAgo(queue.lastUpdated);
  }

  return 'N/A';
}

export function QueueStatus({
  queue,
  queues,
  queueHistory,
  queueHistoryByType,
  processedLastHour,
  timeRange,
  onTimeRangeChange
}: QueueStatusProps) {
  // Check if we have any queue data
  const hasQueueData = queues
    ? Object.values(queues).some(q => q !== null)
    : queue !== null;

  if (!hasQueueData) {
    return (
      <div className="queue-status">
        <h3>Queue Status</h3>
        <div className="queue-unavailable">
          No queue data available. Producer may not be reporting metrics.
        </div>
      </div>
    );
  }

  // Get queue depths for each type
  const sceneQueue = queues?.scene?.queueDepth ?? queue?.queueDepth ?? 0;
  const wearableQueue = queues?.wearable?.queueDepth ?? 0;
  const emoteQueue = queues?.emote?.queueDepth ?? 0;
  const totalQueue = sceneQueue + wearableQueue + emoteQueue;

  // Get history for each type
  const sceneHistory = queueHistoryByType?.scene ?? queueHistory ?? [];
  const wearableHistory = queueHistoryByType?.wearable ?? [];
  const emoteHistory = queueHistoryByType?.emote ?? [];

  return (
    <div className="queue-status">
      <h3>Queue Status</h3>

      <div className="queue-stats-grid">
        <div className="queue-stat" style={{ borderLeftColor: ENTITY_COLORS.scene }}>
          <div className="stat-value">{sceneQueue.toLocaleString()}</div>
          <div className="stat-label">Scene Queue</div>
        </div>
        <div className="queue-stat" style={{ borderLeftColor: ENTITY_COLORS.wearable }}>
          <div className="stat-value">{wearableQueue.toLocaleString()}</div>
          <div className="stat-label">Wearable Queue</div>
        </div>
        <div className="queue-stat" style={{ borderLeftColor: ENTITY_COLORS.emote }}>
          <div className="stat-value">{emoteQueue.toLocaleString()}</div>
          <div className="stat-label">Emote Queue</div>
        </div>
        <div className="queue-stat total">
          <div className="stat-value">{totalQueue.toLocaleString()}</div>
          <div className="stat-label">Total Queue</div>
        </div>
        <div className="queue-stat">
          <div className="stat-value">{processedLastHour.toLocaleString()}</div>
          <div className="stat-label">Processed (1h)</div>
        </div>
        <div className="queue-stat">
          <div className="stat-value">{getLatestUpdate(queues, queue)}</div>
          <div className="stat-label">Last Update</div>
        </div>
      </div>

      <div className="queue-charts-grid">
        <QueueDepthChart
          history={sceneHistory}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          color={ENTITY_COLORS.scene}
          label="Scenes"
          showTimeSelector={true}
        />
        <QueueDepthChart
          history={wearableHistory}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          color={ENTITY_COLORS.wearable}
          label="Wearables"
          showTimeSelector={false}
        />
        <QueueDepthChart
          history={emoteHistory}
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          color={ENTITY_COLORS.emote}
          label="Emotes"
          showTimeSelector={false}
        />
      </div>
    </div>
  );
}
