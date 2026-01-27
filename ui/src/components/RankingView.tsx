import { useState, useEffect } from 'react';
import type { RankingEntry } from '../types';
import { ReportModal } from './ReportModal';
import { API_BASE_URL } from '../config';
import { EntityInfo, getEntityTypeInfo } from './shared/EntityInfo';

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

interface RankingCardProps {
  entry: RankingEntry;
  onViewReport: () => void;
}

function RankingCard({ entry, onViewReport }: RankingCardProps) {
  const isScene = !entry.entityType || entry.entityType === 'scene';
  const entityInfo = getEntityTypeInfo(entry.entityType);

  return (
    <div className="history-card ranking">
      <div className="history-card-header">
        <span className="ranking-badge">#{entry.rank}</span>
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
        <span className="history-duration ranking-duration">{formatDuration(entry.durationMs)}</span>
        <button className="history-view-report-btn" onClick={onViewReport}>
          View Report
        </button>
      </div>
    </div>
  );
}

export function RankingView() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRanking() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/monitoring/ranking`);
        if (!response.ok) {
          throw new Error('Failed to fetch ranking');
        }
        const data = await response.json();
        setRanking(data.ranking || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchRanking();
  }, []);

  if (loading) {
    return (
      <div className="ranking-view">
        <h3>Slowest Processing (Top 20)</h3>
        <div className="ranking-loading">Loading ranking data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ranking-view">
        <h3>Slowest Processing (Top 20)</h3>
        <div className="ranking-error">Error: {error}</div>
      </div>
    );
  }

  if (ranking.length === 0) {
    return (
      <div className="ranking-view">
        <h3>Slowest Processing (Top 20)</h3>
        <div className="no-ranking">No ranking data available</div>
      </div>
    );
  }

  return (
    <div className="ranking-view">
      <h3>Slowest Processing (Top 20)</h3>
      <div className="history-grid">
        {ranking.map((entry) => (
          <RankingCard
            key={`${entry.sceneId}-${entry.completedAt}`}
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
