import { useState, useEffect } from 'react';
import type { WorldWithOptimization, LandData, FailedJobEntry, GeneratingStatus } from '../types';
import { ReportModal } from './ReportModal';
import { API_BASE_URL } from '../config';
import { EntityInfo, getCachedMetadata, getEntityTypeInfo } from './shared/EntityInfo';

interface FailingViewProps {
  worlds: WorldWithOptimization[];
  lands: LandData[];
  generatingStatus?: GeneratingStatus | null;
}

type DataSource = 'database' | 'report';

// Get unique failed scenes from lands (report mode)
function getFailedScenes(lands: LandData[]): { sceneId: string; positions: string[] }[] {
  const sceneMap = new Map<string, string[]>();

  for (const land of lands) {
    if (!land.sceneId) continue;
    // Check if the scene has a failed optimization report
    if (land.optimizationReport && !land.optimizationReport.success) {
      const positions = sceneMap.get(land.sceneId) || [];
      positions.push(`${land.x},${land.y}`);
      sceneMap.set(land.sceneId, positions);
    }
  }

  return Array.from(sceneMap.entries()).map(([sceneId, positions]) => ({
    sceneId,
    positions,
  }));
}

interface FailedSceneCardProps {
  sceneId: string;
  positions: string[];
  onViewReport: () => void;
}

function FailedSceneCard({ sceneId, positions, onViewReport }: FailedSceneCardProps) {
  return (
    <div className="history-card failed">
      <div className="history-card-header">
        <span className="failed-badge">FAILED</span>
        <span className="history-method">Scene</span>
      </div>

      <div className="history-scene-info">
        <EntityInfo
          entityId={sceneId}
          entityType="scene"
          showThumbnail={true}
        />
      </div>

      {positions.length > 0 && (
        <div className="failing-positions">
          {positions.slice(0, 3).join(', ')}
          {positions.length > 3 && ` +${positions.length - 3} more`}
        </div>
      )}

      <div className="history-scene-id">
        <code>{sceneId}</code>
      </div>

      <div className="history-card-footer">
        <button className="history-view-report-btn" onClick={onViewReport}>
          View Report
        </button>
      </div>
    </div>
  );
}

interface FailedWorldCardProps {
  world: WorldWithOptimization;
  onViewReport: () => void;
}

function FailedWorldCard({ world, onViewReport }: FailedWorldCardProps) {
  return (
    <div className="history-card failed">
      <div className="history-card-header">
        <span className="failed-badge">FAILED</span>
        <span className="history-method">World</span>
      </div>

      <div className="history-scene-info">
        {world.thumbnail ? (
          <img
            src={world.thumbnail}
            alt={world.name}
            className="history-thumbnail"
          />
        ) : (
          <div className="history-thumbnail-placeholder" />
        )}
        <div className="history-scene-details">
          <div className="history-scene-name" title={world.name}>
            {world.name}
          </div>
          {world.title && world.title !== 'Untitled' && (
            <div className="history-world-name">{world.title}</div>
          )}
          <div className="history-position">
            {world.parcels} parcel{world.parcels !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="history-scene-id">
        <code>{world.sceneId}</code>
      </div>

      <div className="history-card-footer">
        <button className="history-view-report-btn" onClick={onViewReport}>
          View Report
        </button>
      </div>
    </div>
  );
}

interface FailedJobCardProps {
  job: FailedJobEntry;
  onViewReport: () => void;
}

function FailedJobCard({ job, onViewReport }: FailedJobCardProps) {
  const isScene = !job.entityType || job.entityType === 'scene';
  const entityInfo = getEntityTypeInfo(job.entityType);

  return (
    <div className="history-card failed">
      <div className="history-card-header">
        <span className="failed-badge">FAILED</span>
        {!isScene && (
          <span className={`history-entity-badge entity-${job.entityType}`}>
            {entityInfo.icon} {entityInfo.label}
          </span>
        )}
        <span className="history-time">{formatTimeAgo(job.completedAt)}</span>
      </div>

      <div className="history-scene-info">
        <EntityInfo
          entityId={job.sceneId}
          entityType={job.entityType}
          showThumbnail={true}
        />
      </div>

      <div className="history-scene-id">
        <code>{job.sceneId}</code>
      </div>

      {job.errorMessage && (
        <div className="failing-error">
          {job.errorMessage.length > 100
            ? job.errorMessage.substring(0, 100) + '...'
            : job.errorMessage}
        </div>
      )}

      <div className="history-card-footer">
        <button className="history-view-report-btn" onClick={onViewReport}>
          View Report
        </button>
      </div>
    </div>
  );
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

interface BulkQueueResult {
  success: boolean;
  total: number;
  queued: number;
  failed: number;
  results: {
    success: string[];
    failed: { sceneId: string; error: string }[];
  };
}

type EntityType = 'scene' | 'wearable' | 'emote';

interface SelectedEntity {
  sceneId: string;
  entityType: EntityType;
}

export function FailingView({ worlds, lands, generatingStatus }: FailingViewProps) {
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [filter, setFilter] = useState<'all' | 'scenes' | 'worlds' | 'wearables' | 'emotes'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [isQueuing, setIsQueuing] = useState(false);
  const [queueResult, setQueueResult] = useState<BulkQueueResult | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Data source toggle state
  const [dataSource, setDataSource] = useState<DataSource>('database');
  const [failedJobs, setFailedJobs] = useState<FailedJobEntry[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // Disable report mode when generating
  const isReportDisabled = generatingStatus?.generating || false;

  // Auto-switch to database if report is generating
  useEffect(() => {
    if (isReportDisabled && dataSource === 'report') {
      setDataSource('database');
    }
  }, [isReportDisabled, dataSource]);

  // Fetch failed jobs from database when in database mode
  useEffect(() => {
    if (dataSource === 'database') {
      fetchFailedJobs();
    }
  }, [dataSource]);

  async function fetchFailedJobs() {
    setIsLoadingJobs(true);
    setJobsError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/monitoring/failed-jobs`);
      if (!response.ok) {
        throw new Error('Failed to fetch failed jobs');
      }
      const data = await response.json();
      setFailedJobs(data.failed || []);
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoadingJobs(false);
    }
  }

  // Report mode data
  const failedWorlds = worlds.filter(w => w.hasFailed);
  const failedScenes = getFailedScenes(lands);
  const reportTotalFailed = failedWorlds.length + failedScenes.length;

  // Database mode data - group by entity type
  const dbScenes = failedJobs.filter(j => !j.entityType || j.entityType === 'scene');
  const dbWearables = failedJobs.filter(j => j.entityType === 'wearable');
  const dbEmotes = failedJobs.filter(j => j.entityType === 'emote');

  // Filter based on search query
  const filteredScenes = failedScenes.filter(scene => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (scene.positions.some(pos => pos.includes(query))) return true;
    if (scene.sceneId.toLowerCase().includes(query)) return true;
    const metadata = getCachedMetadata(scene.sceneId);
    if (metadata?.name?.toLowerCase().includes(query)) return true;
    return false;
  });

  const filteredWorlds = failedWorlds.filter(world => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (world.name.toLowerCase().includes(query)) return true;
    if (world.title?.toLowerCase().includes(query)) return true;
    if (world.sceneId.toLowerCase().includes(query)) return true;
    return false;
  });

  const filteredDbJobs = failedJobs.filter(job => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (job.sceneId.toLowerCase().includes(query)) return true;
    return false;
  });

  const filteredDbScenes = filteredDbJobs.filter(j => !j.entityType || j.entityType === 'scene');
  const filteredDbWearables = filteredDbJobs.filter(j => j.entityType === 'wearable');
  const filteredDbEmotes = filteredDbJobs.filter(j => j.entityType === 'emote');

  // Get entities with their types based on current filter and data source
  interface EntityToQueue {
    sceneId: string;
    entityType: EntityType;
  }

  const getEntitiesToQueue = (): EntityToQueue[] => {
    const entities: EntityToQueue[] = [];

    if (dataSource === 'report') {
      if (filter === 'all' || filter === 'scenes') {
        entities.push(...filteredScenes.map(s => ({ sceneId: s.sceneId, entityType: 'scene' as EntityType })));
      }
      if (filter === 'all' || filter === 'worlds') {
        entities.push(...filteredWorlds.map(w => ({ sceneId: w.sceneId, entityType: 'scene' as EntityType })));
      }
    } else {
      if (filter === 'all') {
        entities.push(...filteredDbJobs.map(j => ({
          sceneId: j.sceneId,
          entityType: (j.entityType || 'scene') as EntityType
        })));
      } else if (filter === 'scenes') {
        entities.push(...filteredDbScenes.map(j => ({ sceneId: j.sceneId, entityType: 'scene' as EntityType })));
      } else if (filter === 'wearables') {
        entities.push(...filteredDbWearables.map(j => ({ sceneId: j.sceneId, entityType: 'wearable' as EntityType })));
      } else if (filter === 'emotes') {
        entities.push(...filteredDbEmotes.map(j => ({ sceneId: j.sceneId, entityType: 'emote' as EntityType })));
      }
    }

    return entities;
  };

  // For backwards compatibility - just get the IDs
  const getSceneIdsToQueue = (): string[] => {
    return getEntitiesToQueue().map(e => e.sceneId);
  };

  const handleCopySceneIds = async () => {
    const sceneIds = getSceneIdsToQueue();
    if (sceneIds.length === 0) return;

    try {
      await navigator.clipboard.writeText(sceneIds.join('\n'));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAddToPriority = () => {
    setShowPasswordModal(true);
    setPassword('');
    setQueueResult(null);
    setQueueError(null);
  };

  const handleSubmitQueue = async () => {
    const entities = getEntitiesToQueue();
    if (entities.length === 0) return;

    setIsQueuing(true);
    setQueueError(null);
    setQueueResult(null);

    try {
      // Group entities by type
      const groupedByType: Record<EntityType, string[]> = {
        scene: [],
        wearable: [],
        emote: [],
      };
      entities.forEach(e => {
        groupedByType[e.entityType].push(e.sceneId);
      });

      // Make separate API calls for each entity type
      const results: BulkQueueResult = {
        success: true,
        total: entities.length,
        queued: 0,
        failed: 0,
        results: { success: [], failed: [] },
      };

      for (const [entityType, sceneIds] of Object.entries(groupedByType)) {
        if (sceneIds.length === 0) continue;

        const response = await fetch(`${API_BASE_URL}/api/monitoring/queue-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password,
            sceneIds,
            entityType,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setQueueError(data.error || 'Failed to queue items');
          return;
        }

        // Aggregate results
        results.queued += data.queued || 0;
        results.failed += data.failed || 0;
        if (data.results?.success) {
          results.results.success.push(...data.results.success);
        }
        if (data.results?.failed) {
          results.results.failed.push(...data.results.failed);
        }
      }

      setQueueResult(results);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsQueuing(false);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setQueueResult(null);
    setQueueError(null);
  };

  // Calculate totals based on data source
  const totalFailed = dataSource === 'report' ? reportTotalFailed : failedJobs.length;

  // Render content based on data source
  const renderContent = () => {
    if (dataSource === 'database') {
      if (isLoadingJobs) {
        return <div className="loading">Loading failed jobs from database...</div>;
      }
      if (jobsError) {
        return <div className="error-message">Error: {jobsError}</div>;
      }
      if (failedJobs.length === 0) {
        return (
          <div className="no-failing">
            No failed jobs found in the database history.
          </div>
        );
      }

      // Filter by entity type
      let jobsToShow = filteredDbJobs;
      if (filter === 'scenes') jobsToShow = filteredDbScenes;
      else if (filter === 'wearables') jobsToShow = filteredDbWearables;
      else if (filter === 'emotes') jobsToShow = filteredDbEmotes;

      return (
        <div className="history-grid">
          {jobsToShow.map((job) => (
            <FailedJobCard
              key={`${job.sceneId}-${job.completedAt}`}
              job={job}
              onViewReport={() => setSelectedEntity({ sceneId: job.sceneId, entityType: job.entityType as EntityType })}
            />
          ))}
        </div>
      );
    }

    // Report mode
    if (reportTotalFailed === 0) {
      return (
        <div className="no-failing">
          No failing scenes or worlds found in the report.
        </div>
      );
    }

    const showScenes = filter === 'all' || filter === 'scenes';
    const showWorlds = filter === 'all' || filter === 'worlds';

    return (
      <div className="history-grid">
        {showWorlds && filteredWorlds.map((world) => (
          <FailedWorldCard
            key={world.sceneId}
            world={world}
            onViewReport={() => setSelectedEntity({ sceneId: world.sceneId, entityType: 'scene' })}
          />
        ))}
        {showScenes && filteredScenes.map((scene) => (
          <FailedSceneCard
            key={scene.sceneId}
            sceneId={scene.sceneId}
            positions={scene.positions}
            onViewReport={() => setSelectedEntity({ sceneId: scene.sceneId, entityType: 'scene' })}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="failing-view">
      <h3>Failing Scenes & Entities</h3>

      {/* Data source toggle */}
      <div className="data-source-toggle">
        <button
          className={`toggle-btn ${dataSource === 'database' ? 'active' : ''}`}
          onClick={() => setDataSource('database')}
        >
          Database History
        </button>
        <button
          className={`toggle-btn ${dataSource === 'report' ? 'active' : ''}`}
          onClick={() => !isReportDisabled && setDataSource('report')}
          disabled={isReportDisabled}
          title={isReportDisabled ? 'Report is being generated...' : undefined}
        >
          Report Data
          {isReportDisabled && <span className="generating-indicator"> (generating...)</span>}
        </button>
      </div>

      <div className="failing-stats">
        <div className="stat-card failed">
          <div className="stat-value">{totalFailed}</div>
          <div className="stat-label">Total Failed</div>
        </div>
        {dataSource === 'report' ? (
          <>
            <div className="stat-card">
              <div className="stat-value">{failedScenes.length}</div>
              <div className="stat-label">Failed Scenes</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{failedWorlds.length}</div>
              <div className="stat-label">Failed Worlds</div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-value">{dbScenes.length}</div>
              <div className="stat-label">Failed Scenes</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{dbWearables.length}</div>
              <div className="stat-label">Failed Wearables</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{dbEmotes.length}</div>
              <div className="stat-label">Failed Emotes</div>
            </div>
          </>
        )}
      </div>

      <div className="failing-controls">
        <div className="failing-controls-row">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by name, position, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="filter-buttons">
            <button
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All ({totalFailed})
            </button>
            <button
              className={filter === 'scenes' ? 'active' : ''}
              onClick={() => setFilter('scenes')}
            >
              Scenes ({dataSource === 'report' ? failedScenes.length : dbScenes.length})
            </button>
            {dataSource === 'report' ? (
              <button
                className={filter === 'worlds' ? 'active' : ''}
                onClick={() => setFilter('worlds')}
              >
                Worlds ({failedWorlds.length})
              </button>
            ) : (
              <>
                <button
                  className={filter === 'wearables' ? 'active' : ''}
                  onClick={() => setFilter('wearables')}
                >
                  Wearables ({dbWearables.length})
                </button>
                <button
                  className={filter === 'emotes' ? 'active' : ''}
                  onClick={() => setFilter('emotes')}
                >
                  Emotes ({dbEmotes.length})
                </button>
              </>
            )}
          </div>
        </div>
        <div className="failing-actions">
          <button
            className="copy-ids-btn"
            onClick={handleCopySceneIds}
            disabled={getSceneIdsToQueue().length === 0}
          >
            {copySuccess ? 'Copied!' : `Copy IDs (${getSceneIdsToQueue().length})`}
          </button>
          <button
            className="add-to-priority-btn"
            onClick={handleAddToPriority}
            disabled={getSceneIdsToQueue().length === 0}
          >
            Add to Priority ({getSceneIdsToQueue().length})
          </button>
          {dataSource === 'database' && (
            <button
              className="refresh-btn"
              onClick={fetchFailedJobs}
              disabled={isLoadingJobs}
            >
              {isLoadingJobs ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {searchQuery && (
        <div className="failing-filter-info">
          Showing {dataSource === 'report'
            ? filteredScenes.length + filteredWorlds.length
            : filteredDbJobs.length
          } of {totalFailed} failed items
        </div>
      )}

      {renderContent()}

      {selectedEntity && (
        <ReportModal
          sceneId={selectedEntity.sceneId}
          entityType={selectedEntity.entityType}
          onClose={() => setSelectedEntity(null)}
        />
      )}

      {showPasswordModal && (
        <div className="modal-overlay" onClick={closePasswordModal}>
          <div className="modal-content priority-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closePasswordModal}>&times;</button>
            <h3>Add to Priority Queue</h3>

            {!queueResult && !isQueuing && (
              <>
                <p className="modal-description">
                  This will add {getSceneIdsToQueue().length} item(s) to the priority queue for re-processing.
                </p>
                <div className="modal-form">
                  <label>
                    Password:
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && password && handleSubmitQueue()}
                    />
                  </label>
                </div>
                {queueError && (
                  <div className="modal-error">{queueError}</div>
                )}
                <div className="modal-actions">
                  <button onClick={closePasswordModal} className="modal-btn cancel">
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitQueue}
                    className="modal-btn submit"
                    disabled={!password}
                  >
                    Add to Queue
                  </button>
                </div>
              </>
            )}

            {isQueuing && (
              <div className="modal-loading">
                <div className="spinner" />
                <p>Adding to priority queue...</p>
              </div>
            )}

            {queueResult && (
              <div className="modal-result">
                <div className={`result-summary ${queueResult.failed > 0 ? 'partial' : 'success'}`}>
                  <div className="result-icon">
                    {queueResult.failed === 0 ? '✓' : '⚠'}
                  </div>
                  <div className="result-text">
                    <strong>{queueResult.queued}</strong> of <strong>{queueResult.total}</strong> items queued
                  </div>
                </div>
                {queueResult.failed > 0 && (
                  <div className="result-failures">
                    <p>{queueResult.failed} item(s) failed to queue:</p>
                    <ul>
                      {queueResult.results.failed.slice(0, 5).map((f, i) => (
                        <li key={i}>
                          <code>{f.sceneId.slice(0, 20)}...</code>: {f.error}
                        </li>
                      ))}
                      {queueResult.results.failed.length > 5 && (
                        <li>...and {queueResult.results.failed.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="modal-actions">
                  <button onClick={closePasswordModal} className="modal-btn submit">
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
