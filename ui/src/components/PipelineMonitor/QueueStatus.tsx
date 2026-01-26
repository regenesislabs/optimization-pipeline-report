import { useState } from 'react';
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

const ENTITY_LABELS: Record<EntityType, string> = {
  scene: 'Scenes',
  wearable: 'Wearables',
  emote: 'Emotes'
};

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

export function QueueStatus({
  queue,
  queues,
  queueHistory,
  queueHistoryByType,
  processedLastHour,
  timeRange,
  onTimeRangeChange
}: QueueStatusProps) {
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>('scene');

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

  // Use new format if available, otherwise fall back to legacy
  const currentQueue = queues ? queues[selectedEntityType] : queue;
  const currentHistory = queueHistoryByType ? queueHistoryByType[selectedEntityType] : queueHistory;

  // Calculate total queue depth across all entity types
  const totalQueueDepth = queues
    ? ENTITY_TYPES.reduce((sum, type) => sum + (queues[type]?.queueDepth || 0), 0)
    : (queue?.queueDepth || 0);

  return (
    <div className="queue-status">
      <h3>Queue Status</h3>

      {/* Entity Type Tabs */}
      {queues && (
        <div className="entity-type-tabs">
          {ENTITY_TYPES.map(type => {
            const typeQueue = queues[type];
            const depth = typeQueue?.queueDepth || 0;
            const isActive = selectedEntityType === type;

            return (
              <button
                key={type}
                className={`entity-tab ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedEntityType(type)}
                style={{
                  borderBottomColor: isActive ? ENTITY_COLORS[type] : 'transparent'
                }}
              >
                <span className="entity-label">{ENTITY_LABELS[type]}</span>
                <span
                  className="entity-count"
                  style={{ backgroundColor: ENTITY_COLORS[type] }}
                >
                  {depth.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="queue-stats">
        <div className="queue-stat">
          <div className="stat-value">{(currentQueue?.queueDepth || 0).toLocaleString()}</div>
          <div className="stat-label">{ENTITY_LABELS[selectedEntityType]} Queue</div>
        </div>
        {queues && (
          <div className="queue-stat">
            <div className="stat-value">{totalQueueDepth.toLocaleString()}</div>
            <div className="stat-label">Total Queue</div>
          </div>
        )}
        <div className="queue-stat">
          <div className="stat-value">{processedLastHour.toLocaleString()}</div>
          <div className="stat-label">Processed (1h)</div>
        </div>
        <div className="queue-stat">
          <div className="stat-value">
            {currentQueue ? formatTimeAgo(currentQueue.lastUpdated) : 'N/A'}
          </div>
          <div className="stat-label">Last Update</div>
        </div>
      </div>

      <QueueDepthChart
        history={currentHistory || []}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
        color={ENTITY_COLORS[selectedEntityType]}
        label={ENTITY_LABELS[selectedEntityType]}
      />
    </div>
  );
}
