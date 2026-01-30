import { useState, useEffect, useCallback, useMemo } from 'react';
import { URLS } from '../config';
import { useQueueTrigger } from '../hooks/useQueueTrigger';
import { EntityInfo } from './shared/EntityInfo';

type EntityType = 'scene' | 'wearable' | 'emote';

interface ReportModalProps {
  sceneId: string | null;
  onClose: () => void;
  title?: string;
  entityType?: EntityType;
}

interface ProcessReport {
  entityId: string;
  entityType: EntityType;
  contentServerUrl: string;
  startedAt: string;
  finishedAt: string | null;
  errors: string[];
  godotLogs: string[];
  godotProcessLogs?: string[];
  individualAssets: {
    total: number;
    successful: number;
    failed: number;
  };
  result: {
    success: boolean;
    batchId?: string;
    optimizedAssets?: number;
    metadataZipPath?: string;
    individualZips?: string[];
  } | null;
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return 'In progress...';
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function StatusBadge({ success }: { success: boolean }) {
  return (
    <span className={`report-badge ${success ? 'report-badge--success' : 'report-badge--failure'}`}>
      {success ? 'Success' : 'Failed'}
    </span>
  );
}

function CollapsibleSection({ title, defaultOpen = false, count, children }: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="report-section">
      <button className="report-section__header" onClick={() => setOpen(!open)}>
        <span className="report-section__arrow">{open ? '▼' : '▶'}</span>
        <span className="report-section__title">{title}</span>
        {count !== undefined && <span className="report-section__count">{count}</span>}
      </button>
      {open && <div className="report-section__body">{children}</div>}
    </div>
  );
}

function StructuredReport({ report, entityType }: { report: ProcessReport; entityType?: EntityType }) {
  const duration = formatDuration(report.startedAt, report.finishedAt);
  const resolvedEntityType = entityType || report.entityType || 'scene';

  return (
    <div className="structured-report">
      {/* Header: Entity info + status */}
      <div className="report-header-info">
        <div className="report-entity-card">
          <EntityInfo
            entityId={report.entityId}
            entityType={resolvedEntityType}
            showThumbnail={true}
            showEntityBadge={true}
            variant="default"
          />
        </div>
        <div className="report-status-block">
          {report.result && <StatusBadge success={report.result.success} />}
          <div className="report-meta">
            <div className="report-meta__row">
              <span className="report-meta__label">Duration</span>
              <span className="report-meta__value">{duration}</span>
            </div>
            <div className="report-meta__row">
              <span className="report-meta__label">Started</span>
              <span className="report-meta__value">{formatTimestamp(report.startedAt)}</span>
            </div>
            {report.finishedAt && (
              <div className="report-meta__row">
                <span className="report-meta__label">Finished</span>
                <span className="report-meta__value">{formatTimestamp(report.finishedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entity ID */}
      <div className="report-id-row">
        <span className="report-meta__label">Entity ID</span>
        <code className="report-id-value">{report.entityId}</code>
      </div>

      {/* Result summary */}
      {report.result && (
        <div className="report-result-grid">
          {report.result.optimizedAssets !== undefined && (
            <div className="report-stat">
              <div className="report-stat__value">{report.result.optimizedAssets}</div>
              <div className="report-stat__label">Optimized</div>
            </div>
          )}
          <div className="report-stat">
            <div className="report-stat__value">{report.individualAssets.total}</div>
            <div className="report-stat__label">Total Assets</div>
          </div>
          <div className="report-stat">
            <div className="report-stat__value report-stat__value--success">{report.individualAssets.successful}</div>
            <div className="report-stat__label">Successful</div>
          </div>
          <div className="report-stat">
            <div className={`report-stat__value ${report.individualAssets.failed > 0 ? 'report-stat__value--failure' : ''}`}>
              {report.individualAssets.failed}
            </div>
            <div className="report-stat__label">Failed</div>
          </div>
        </div>
      )}

      {/* Errors */}
      {report.errors.length > 0 && (
        <CollapsibleSection title="Errors" defaultOpen={true} count={report.errors.length}>
          <div className="report-log-list report-log-list--errors">
            {report.errors.map((err, i) => (
              <div key={i} className="report-log-line report-log-line--error">{err}</div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Job logs (asset-server API status) */}
      {report.godotLogs.length > 0 && (
        <CollapsibleSection title="Job Logs" defaultOpen={true} count={report.godotLogs.length}>
          <div className="report-log-list">
            {report.godotLogs.map((line, i) => (
              <div key={i} className={`report-log-line ${line.includes('failed') || line.includes('exception') ? 'report-log-line--error' : line.includes('completed') ? 'report-log-line--success' : ''}`}>
                {line}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Godot process stdout/stderr */}
      {report.godotProcessLogs && report.godotProcessLogs.length > 0 && (
        <CollapsibleSection title="Godot Process Output" defaultOpen={false} count={report.godotProcessLogs.length}>
          <div className="report-log-list report-log-list--process">
            {report.godotProcessLogs.map((line, i) => (
              <div key={i} className={`report-log-line ${line.startsWith('[stderr]') ? 'report-log-line--stderr' : ''}`}>
                {line}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Output ZIPs */}
      {report.result?.individualZips && report.result.individualZips.length > 0 && (
        <CollapsibleSection title="Output Files" defaultOpen={false} count={report.result.individualZips.length}>
          <div className="report-log-list">
            {report.result.individualZips.map((zip, i) => (
              <div key={i} className="report-log-line report-log-line--file">{zip}</div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function syntaxHighlight(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function ReportModal({ sceneId, onClose, title, entityType }: ReportModalProps) {
  const [parsedReport, setParsedReport] = useState<ProcessReport | null>(null);
  const [rawJson, setRawJson] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');
  const { state: queueState, triggerQueue } = useQueueTrigger();

  const handleAddToQueue = useCallback(() => {
    if (sceneId) {
      triggerQueue(sceneId, true, entityType);
    }
  }, [sceneId, triggerQueue, entityType]);

  const reportUrlCdn = useMemo(() => {
    if (!sceneId) return '';
    return URLS.getSceneReport(sceneId);
  }, [sceneId]);

  const reportUrlApi = useMemo(() => {
    if (!sceneId) return '';
    return URLS.getSceneReportApi(sceneId);
  }, [sceneId]);

  const reportUrlApiDisplay = useMemo(() => {
    if (!sceneId) return '';
    return URLS.getSceneReportApiFullUrl(sceneId);
  }, [sceneId]);

  useEffect(() => {
    if (!sceneId) return;

    async function fetchReport() {
      setIsLoading(true);
      setError(null);
      setParsedReport(null);
      setRawJson('');

      try {
        const response = await fetch(reportUrlApi);

        if (response.ok) {
          const data = await response.json();
          const formatted = JSON.stringify(data, null, 2);
          setRawJson(formatted);

          // Try to parse as ProcessReport
          if (data && data.entityId && data.startedAt) {
            setParsedReport(data as ProcessReport);
          }
        } else if (response.status === 404) {
          setError('No report found in database. Try reprocessing the entity.');
        } else {
          setError(`Error loading report: HTTP ${response.status}`);
        }
      } catch (err) {
        setError(`Failed to load report: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    }

    fetchReport();
  }, [sceneId, reportUrlApi]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!sceneId) return null;

  return (
    <div className="modal show" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">{title || `Report: ${sceneId.substring(0, 16)}...`}</div>
          <div className="modal-header-actions">
            {parsedReport && (
              <div className="report-view-toggle">
                <button
                  className={`report-view-toggle__btn ${viewMode === 'structured' ? 'report-view-toggle__btn--active' : ''}`}
                  onClick={() => setViewMode('structured')}
                >
                  Structured
                </button>
                <button
                  className={`report-view-toggle__btn ${viewMode === 'raw' ? 'report-view-toggle__btn--active' : ''}`}
                  onClick={() => setViewMode('raw')}
                >
                  Raw JSON
                </button>
              </div>
            )}
            <button className="modal-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>
        <div className="modal-url">
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: '#888', fontSize: '11px' }}>CDN: </span>
            <a href={reportUrlCdn} target="_blank" rel="noopener noreferrer">
              {reportUrlCdn}
            </a>
          </div>
          <div>
            <span style={{ color: '#888', fontSize: '11px' }}>API: </span>
            <a href={reportUrlApiDisplay} target="_blank" rel="noopener noreferrer">
              {reportUrlApiDisplay}
            </a>
          </div>
        </div>
        <div className="modal-actions">
          <button
            className="add-to-queue-btn"
            onClick={handleAddToQueue}
            disabled={queueState.isLoading}
          >
            {queueState.isLoading ? 'Adding...' : 'Add to Priority Queue'}
          </button>
          {queueState.success && queueState.lastTriggeredId === sceneId && (
            <span className="queue-success">Added to queue!</span>
          )}
          {queueState.error && queueState.lastTriggeredId === sceneId && (
            <span className="queue-error">{queueState.error}</span>
          )}
        </div>
        <div className="modal-body">
          {isLoading && <div className="loading">Loading report...</div>}
          {error && <div className="error-message">{error}</div>}
          {!isLoading && !error && viewMode === 'structured' && parsedReport && (
            <StructuredReport report={parsedReport} entityType={entityType} />
          )}
          {!isLoading && !error && (viewMode === 'raw' || !parsedReport) && rawJson && (
            <div
              className="json-viewer"
              dangerouslySetInnerHTML={{ __html: syntaxHighlight(rawJson) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
