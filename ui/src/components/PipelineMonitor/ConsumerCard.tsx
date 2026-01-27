import { useState } from 'react';
import type { Consumer } from '../../types';
import { EntityInfo, getEntityTypeInfo } from '../shared/EntityInfo';

interface ConsumerCardProps {
  consumer: Consumer;
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
  return `${diffHour}h ago`;
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'processing': return 'status-processing';
    case 'idle': return 'status-idle';
    case 'offline': return 'status-offline';
    default: return '';
  }
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

export function ConsumerCard({ consumer }: ConsumerCardProps) {
  const [copied, setCopied] = useState(false);

  const elapsedTime = consumer.startedAt
    ? Date.now() - new Date(consumer.startedAt).getTime()
    : 0;

  const isScene = !consumer.entityType || consumer.entityType === 'scene';
  const entityInfo = getEntityTypeInfo(consumer.entityType);

  const copySceneId = () => {
    if (consumer.currentSceneId) {
      navigator.clipboard.writeText(consumer.currentSceneId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`consumer-card ${getStatusClass(consumer.status)}`}>
      <div className="consumer-header">
        <span className="consumer-id" title={consumer.id}>
          {truncateId(consumer.id)}
        </span>
        <div className="consumer-badges">
          {consumer.isPriority && consumer.status === 'processing' && (
            <span className="priority-badge" title="Processing priority job">
              ⚡ PRIORITY
            </span>
          )}
          {!isScene && consumer.status === 'processing' && (
            <span className={`entity-type-badge ${entityInfo.className}`} title={`Processing ${consumer.entityType}`}>
              {entityInfo.icon} {entityInfo.label}
            </span>
          )}
          <span className={`consumer-status ${getStatusClass(consumer.status)}`}>
            {consumer.status}
          </span>
        </div>
      </div>

      {consumer.status === 'processing' && consumer.currentSceneId && (
        <div className="consumer-current">
          {/* Entity Info Section */}
          <div className="scene-info">
            <EntityInfo
              entityId={consumer.currentSceneId}
              entityType={consumer.entityType}
              showThumbnail={true}
            />
          </div>

          {/* Scene ID with copy */}
          <div className="scene-id-container">
            <code className="scene-id-full">{consumer.currentSceneId}</code>
            <button
              className="copy-btn"
              onClick={copySceneId}
              title="Copy scene ID"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>

          {consumer.currentStep && (
            <div className="current-step">{consumer.currentStep}</div>
          )}
          {consumer.progressPercent !== undefined && consumer.progressPercent > 0 && (
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${consumer.progressPercent}%` }}
              />
              <span className="progress-text">{consumer.progressPercent}%</span>
            </div>
          )}
          {elapsedTime > 0 && (
            <div className="elapsed-time">
              Running for {formatDuration(elapsedTime)}
            </div>
          )}
        </div>
      )}

      <div className="consumer-stats-grid">
        <div className="stat-item">
          <span className="stat-label">Completed</span>
          <span className="stat-value success">{consumer.jobsCompleted}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Failed</span>
          <span className="stat-value failed">{consumer.jobsFailed}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Avg Time</span>
          <span className="stat-value">
            {consumer.avgProcessingTimeMs > 0
              ? formatDuration(consumer.avgProcessingTimeMs)
              : '-'}
          </span>
        </div>
      </div>

      <div className="consumer-footer">
        <span className="last-heartbeat">
          Last seen: {formatTimeAgo(consumer.lastHeartbeat)}
        </span>
        {consumer.lastJobStatus && (
          <span className={`last-job-status ${consumer.lastJobStatus === 'success' ? 'success' : 'failed'}`}>
            Last: {consumer.lastJobStatus === 'success' ? '✓' : '✗'}
          </span>
        )}
      </div>
    </div>
  );
}
