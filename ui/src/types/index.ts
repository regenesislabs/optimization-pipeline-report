export interface OptimizationReport {
  sceneId: string;
  success: boolean;
  fatalError?: boolean;
  timestamp?: string;
  error?: string;
  details?: {
    originalSize?: number;
    optimizedSize?: number;
    compressionRatio?: number;
    processingTime?: number;
    [key: string]: unknown;
  };
}

export interface LandData {
  x: number;
  y: number;
  sceneId: string | null;
  hasOptimizedAssets: boolean;
  optimizationReport?: {
    success: boolean;
    error?: string;
    details?: {
      originalSize?: number;
      optimizedSize?: number;
      compressionRatio?: number;
    };
  };
}

export interface Stats {
  totalLands: number;
  occupiedLands: number;
  emptyLands: number;
  totalScenes: number;
  averageLandsPerScene: number;
  scenesWithOptimizedAssets: number;
  scenesWithoutOptimizedAssets: number;
  scenesWithReports: number;
  successfulOptimizations: number;
  failedOptimizations: number;
  optimizationPercentage: number;
}

// Compressed format from R2: [x, y, sceneId, hasOptimized, reportSuccess?]
export type CompressedLand = [number, number, string, number, number?];

// Compressed world format: [name, sceneId, title, thumbnail, parcels, hasOptimized, hasFailed?]
export type CompressedWorld = [string, string, string, string, number, number, number?];

export interface WorldsStats {
  totalWorlds: number;
  optimizedWorlds: number;
  notOptimizedWorlds: number;
  failedWorlds: number;
  optimizationPercentage: number;
}

export interface CompressedReportData {
  l: CompressedLand[]; // lands (only occupied)
  s: Stats; // stats
  c: Record<string, number>; // color indices for scenes
  g: number; // generated timestamp
  w?: CompressedWorld[]; // worlds array
  ws?: WorldsStats | null; // worlds stats
}

export interface HistoryEntry {
  id: number;
  created_at: string;
  total_lands: number;
  occupied_lands: number;
  empty_lands: number;
  total_scenes: number;
  scenes_with_optimized: number;
  scenes_without_optimized: number;
  optimization_percentage: number;
  scenes_with_reports: number;
  successful_optimizations: number;
  failed_optimizations: number;
}

export type MapView = 'optimization' | 'scenes';
export type TabName = 'overview' | 'worlds' | 'pipeline' | 'ranking' | 'failing' | 'history';

export interface RankingEntry {
  rank: number;
  consumerId: string;
  sceneId: string;
  processMethod: string;
  status: string;
  durationMs: number;
  completedAt: string;
  entityType?: EntityType;
}

// World types
export interface WorldWithOptimization {
  name: string;
  sceneId: string;
  title: string;
  thumbnail?: string;
  parcels: number;
  hasOptimizedAssets: boolean;
  hasFailed?: boolean;
  optimizationReport?: OptimizationReport;
}

// Pipeline Monitoring types
export type EntityType = 'scene' | 'wearable' | 'emote';

export interface QueueMetrics {
  queueDepth: number;
  lastUpdated: string;
  entityType?: EntityType;
}

export interface QueueHistoryPoint {
  queueDepth: number;
  timestamp: string;
  entityType?: EntityType;
}

export type ConsumerStatus = 'idle' | 'processing' | 'offline';

export interface Consumer {
  id: string;
  processMethod: string;
  status: ConsumerStatus;
  currentSceneId?: string;
  currentStep?: string;
  progressPercent?: number;
  startedAt?: string;
  lastHeartbeat: string;
  jobsCompleted: number;
  jobsFailed: number;
  avgProcessingTimeMs: number;
  isPriority?: boolean;
  lastJobStatus?: 'success' | 'failed';
  entityType?: EntityType;
}

export interface ProcessingHistoryEntry {
  consumerId: string;
  sceneId: string;
  processMethod: string;
  status: 'success' | 'failed';
  durationMs: number;
  completedAt: string;
  entityType?: EntityType;
}

export interface MonitoringData {
  queue: QueueMetrics | null;  // Legacy, use queues instead
  queues?: Record<EntityType, QueueMetrics | null>;
  queueHistory: QueueHistoryPoint[];  // Legacy, use queueHistoryByType instead
  queueHistoryByType?: Record<EntityType, QueueHistoryPoint[]>;
  consumers: Consumer[];
  recentHistory: ProcessingHistoryEntry[];
  processedLastHour: number;
}

// Failed jobs from database history
export interface FailedJobEntry {
  sceneId: string;
  processMethod: string;
  completedAt: string;
  errorMessage: string | null;
  entityType: EntityType;
}

// Generating status from report hook
export interface GeneratingStatus {
  generating: boolean;
  progress: number;
  progressMessage: string;
}
