import { useState, useEffect, useCallback, useMemo } from 'react';
import { URLS } from '../config';
import { useQueueTrigger } from '../hooks/useQueueTrigger';

type EntityType = 'scene' | 'wearable' | 'emote';

interface ReportModalProps {
  sceneId: string | null;
  onClose: () => void;
  title?: string;
  entityType?: EntityType;
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
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state: queueState, triggerQueue } = useQueueTrigger();

  const handleAddToQueue = useCallback(() => {
    if (sceneId) {
      triggerQueue(sceneId, true, entityType);
    }
  }, [sceneId, triggerQueue, entityType]);

  // CDN URL (may be cached)
  const reportUrlCdn = useMemo(() => {
    if (!sceneId) return '';
    return URLS.getSceneReport(sceneId);
  }, [sceneId]);

  // API URL (from database - always fresh)
  const reportUrlApi = useMemo(() => {
    if (!sceneId) return '';
    return URLS.getSceneReportApi(sceneId);
  }, [sceneId]);

  // API URL with full base URL (for display)
  const reportUrlApiDisplay = useMemo(() => {
    if (!sceneId) return '';
    return URLS.getSceneReportApiFullUrl(sceneId);
  }, [sceneId]);

  useEffect(() => {
    if (!sceneId) return;

    async function fetchReport() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch from API (database - always fresh)
        const response = await fetch(reportUrlApi);

        if (response.ok) {
          const data = await response.json();
          const formatted = JSON.stringify(data, null, 2);
          setContent(syntaxHighlight(formatted));
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
          <div className="modal-title">{title || `Report: ${sceneId}`}</div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-url">
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: '#888', fontSize: '11px' }}>CDN (may be cached): </span>
            <a href={reportUrlCdn} target="_blank" rel="noopener noreferrer">
              {reportUrlCdn}
            </a>
          </div>
          <div>
            <span style={{ color: '#888', fontSize: '11px' }}>API (fresh): </span>
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
          {!isLoading && !error && (
            <div
              className="json-viewer"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
