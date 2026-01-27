import { useState } from 'react';
import type { ProcessingHistoryEntry } from '../../types';
import { ReportModal } from '../ReportModal';
import { EntityInfo, getEntityTypeInfo } from '../shared/EntityInfo';

interface ProcessingHistoryProps {
  history: ProcessingHistoryEntry[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (min < 60) return `${min}m ${remainingSec}s`;
  const hour = Math.floor(min / 60);
  const remainingMin = min % 60;
  return `${hour}h ${remainingMin}m`;
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

interface HistoryCardProps {
  entry: ProcessingHistoryEntry;
  onViewReport: () => void;
}

function HistoryCard({ entry, onViewReport }: HistoryCardProps) {
  const isScene = !entry.entityType || entry.entityType === 'scene';
  const entityInfo = getEntityTypeInfo(entry.entityType);

  return (
    <div className={`history-card ${entry.status}`}>
      <div className="history-card-header">
        <span className={`history-status ${entry.status}`}>
          {entry.status === 'success' ? '✓ Success' : '✗ Failed'}
        </span>
        {!isScene && (
          <span className={`history-entity-badge entity-${entry.entityType}`}>
            {entityInfo.icon} {entityInfo.label}
          </span>
        )}
        <span className="history-time">{formatTimeAgo(entry.completedAt)}</span>
      </div>

      <div className="history-scene-info">
        <EntityInfo
          entityId={entry.sceneId}
          entityType={entry.entityType}
          showThumbnail={true}
        />
      </div>

      <div className="history-scene-id">
        <code>{entry.sceneId}</code>
      </div>

      <div className="history-card-footer">
        <span className="history-duration">Duration: {formatDuration(entry.durationMs)}</span>
        <button className="history-view-report-btn" onClick={onViewReport}>
          View Report
        </button>
      </div>
    </div>
  );
}

export function ProcessingHistory({ history }: ProcessingHistoryProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Limit to 20 entries
  const limitedHistory = history.slice(0, 20);

  if (history.length === 0) {
    return (
      <div className="processing-history">
        <h3>Recent Processing History</h3>
        <div className="no-history">No processing history available</div>
      </div>
    );
  }

  return (
    <div className="processing-history">
      <h3>Recent Processing History ({limitedHistory.length})</h3>
      <div className="history-grid">
        {limitedHistory.map((entry, index) => (
          <HistoryCard
            key={`${entry.sceneId}-${entry.completedAt}-${index}`}
            entry={entry}
            onViewReport={() => setSelectedSceneId(entry.sceneId)}
          />
        ))}
      </div>

      {selectedSceneId && (
        <ReportModal
          sceneId={selectedSceneId}
          onClose={() => setSelectedSceneId(null)}
        />
      )}
    </div>
  );
}
