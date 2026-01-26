import { useState, useEffect } from 'react';
import type { CompressedReportData, LandData, Stats, WorldWithOptimization, WorldsStats } from '../types';
import { URLS } from '../config';

interface ReportData {
  lands: LandData[];
  stats: Stats;
  sceneColorIndices: Record<string, number>;
  generatedAt: number;
  worlds: WorldWithOptimization[];
  worldsStats: WorldsStats | null;
}

interface GeneratingStatus {
  generating: boolean;
  progress: number;
  progressMessage: string;
}

interface UseReportDataResult {
  data: ReportData | null;
  isLoading: boolean;
  error: string | null;
  generatingStatus: GeneratingStatus | null;
}

function decompressData(compressed: CompressedReportData): ReportData {
  const lands: LandData[] = compressed.l.map((land) => ({
    x: land[0],
    y: land[1],
    sceneId: land[2],
    hasOptimizedAssets: land[3] === 1,
    optimizationReport: land[4] !== undefined ? {
      success: land[4] === 1,
    } : undefined,
  }));

  // Decompress worlds data
  // Format: [name, sceneId, title, thumbnail, parcels, hasOptimized, hasFailed?]
  const worlds: WorldWithOptimization[] = (compressed.w || []).map((world) => ({
    name: world[0],
    sceneId: world[1],
    title: world[2],
    thumbnail: world[3] || undefined,
    parcels: world[4],
    hasOptimizedAssets: world[5] === 1,
    hasFailed: world[6] === 1,
  }));

  return {
    lands,
    stats: compressed.s,
    sceneColorIndices: compressed.c,
    generatedAt: compressed.g,
    worlds,
    worldsStats: compressed.ws || null,
  };
}

export function useReportData(): UseReportDataResult {
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingStatus, setGeneratingStatus] = useState<GeneratingStatus | null>(null);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function fetchData() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(URLS.reportData);

        if (response.status === 503) {
          // Report not ready yet - check if generating
          const statusData = await response.json();
          if (statusData.generating) {
            setGeneratingStatus({
              generating: true,
              progress: statusData.progress || 0,
              progressMessage: statusData.progressMessage || 'Generating report...',
            });
            setIsLoading(false);

            // Start polling for updates
            if (!pollInterval) {
              pollInterval = setInterval(fetchData, 3000);
            }
            return;
          } else {
            setGeneratingStatus({
              generating: false,
              progress: 0,
              progressMessage: statusData.progressMessage || 'Waiting for first report generation...',
            });
            setIsLoading(false);
            // Poll less frequently when waiting
            if (!pollInterval) {
              pollInterval = setInterval(fetchData, 10000);
            }
            return;
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Clear polling when we have data
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }

        const compressed: CompressedReportData = await response.json();
        const decompressed = decompressData(compressed);
        setData(decompressed);
        setGeneratingStatus(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  return { data, isLoading, error, generatingStatus };
}
