import { useState, useCallback, useEffect } from 'react';
import type { TabName, MapView, LandData } from '../types';
import { useReportData } from '../hooks/useReportData';
import { Header } from './Header';
import { TabNavigation } from './TabNavigation';
import { StatsGrid } from './StatsGrid';
import { ProgressBar } from './ProgressBar';
import { WorldMap } from './WorldMap/WorldMap';
import { ViewToggle } from './ViewToggle';
import { Legend } from './Legend';
import { Tooltip } from './Tooltip';
import { ReportModal } from './ReportModal';
import { HistoryView } from './HistoryView';
import { WorldsList } from './WorldsList';
import { PipelineMonitor } from './PipelineMonitor';
import { RankingView } from './RankingView';
import { FailingView } from './FailingView';

const TAB_HASH_MAP: Record<string, TabName> = {
  '#overview': 'overview',
  '#worlds': 'worlds',
  '#pipeline': 'pipeline',
  '#ranking': 'ranking',
  '#failing': 'failing',
  '#history': 'history',
};

const VALID_TABS: TabName[] = ['overview', 'worlds', 'pipeline', 'ranking', 'failing', 'history'];

function getTabFromHash(): TabName {
  const hash = window.location.hash;
  return TAB_HASH_MAP[hash] || 'overview';
}

export default function App() {
  const { data, isLoading, error, generatingStatus } = useReportData();
  const [activeTab, setActiveTab] = useState<TabName>(getTabFromHash);
  const [mapView, setMapView] = useState<MapView>('optimization');
  const [hoveredLand, setHoveredLand] = useState<{ land: LandData; x: number; y: number } | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Update URL hash when tab changes
  const handleTabChange = useCallback((tab: TabName) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const newTab = getTabFromHash();
      if (VALID_TABS.includes(newTab)) {
        setActiveTab(newTab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLandClick = useCallback((land: LandData) => {
    if (land.sceneId) {
      setSelectedSceneId(land.sceneId);
    }
  }, []);

  const handleLandHover = useCallback((land: LandData | null, x: number, y: number) => {
    if (land) {
      setHoveredLand({ land, x, y });
    } else {
      setHoveredLand(null);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedSceneId(null);
  }, []);

  // Check if report data is ready
  const reportNotReady = !data && (isLoading || generatingStatus || error);

  // Render generating/loading status for tabs that need report data
  const renderReportLoadingStatus = () => {
    if (isLoading && !generatingStatus) {
      return <div className="loading">Loading report data...</div>;
    }

    if (generatingStatus) {
      return (
        <div className="generating-status">
          <h2>{generatingStatus.generating ? 'Generating Report...' : 'Waiting for Report'}</h2>
          <p className="generating-message">{generatingStatus.progressMessage}</p>
          {generatingStatus.generating && (
            <div className="generating-progress">
              <div className="generating-progress-bar">
                <div
                  className="generating-progress-fill"
                  style={{ width: `${generatingStatus.progress}%` }}
                />
              </div>
              <span className="generating-progress-text">{generatingStatus.progress.toFixed(1)}%</span>
            </div>
          )}
        </div>
      );
    }

    if (error) {
      return (
        <div className="error-message">
          Failed to load report: {error}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="container">
      <Header generatedAt={data?.generatedAt || null} />
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === 'overview' && (
        <div className="tab-content active">
          {reportNotReady ? (
            renderReportLoadingStatus()
          ) : data && (
            <>
              <ProgressBar percentage={data.stats.optimizationPercentage} />
              <StatsGrid stats={data.stats} />

              <div className="map-section">
                <h2 className="map-title">Interactive World Map</h2>
                <ViewToggle currentView={mapView} onViewChange={setMapView} />
                <WorldMap
                  lands={data.lands}
                  sceneColorIndices={data.sceneColorIndices}
                  view={mapView}
                  onLandClick={handleLandClick}
                  onLandHover={handleLandHover}
                />
                <Legend view={mapView} />
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'worlds' && (
        <div className="tab-content active">
          {reportNotReady ? (
            renderReportLoadingStatus()
          ) : data && (
            <WorldsList worlds={data.worlds} stats={data.worldsStats} />
          )}
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="tab-content active">
          <PipelineMonitor />
        </div>
      )}

      {activeTab === 'ranking' && (
        <div className="tab-content active">
          <RankingView />
        </div>
      )}

      {activeTab === 'failing' && (
        <div className="tab-content active">
          <FailingView
            worlds={data?.worlds || []}
            lands={data?.lands || []}
            generatingStatus={generatingStatus}
          />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="tab-content active">
          <HistoryView />
        </div>
      )}

      {hoveredLand && (
        <Tooltip land={hoveredLand.land} x={hoveredLand.x} y={hoveredLand.y} />
      )}

      <ReportModal sceneId={selectedSceneId} onClose={handleCloseModal} />
    </div>
  );
}
