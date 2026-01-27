import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent
} from '@well-known-components/interfaces'
import type { Pool, QueryResult, QueryResultRow } from 'pg'

// PostgreSQL Component Interface
export interface IPostgresComponent extends IBaseComponent {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>
  getPool(): Pool
}

// Report Scheduler Component Interface
export interface IReportScheduler extends IBaseComponent {
  triggerReport(): Promise<void>
}

// Report Storage Component Interface
export interface IReportStorage extends IBaseComponent {
  getReport(): any | null
  setReport(data: any): void
  getLastUpdated(): Date | null
  isGenerating(): boolean
  setGenerating(generating: boolean): void
  getProgress(): number
  setProgress(percent: number): void
  getProgressMessage(): string
  setProgressMessage(message: string): void
}

// Fetch Component Interface (simplified)
export interface IFetchComponent {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

// Application Components
export interface AppComponents {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  fetch: IFetchComponent
  postgres: IPostgresComponent
  reportScheduler: IReportScheduler
  reportStorage: IReportStorage
}

// Global Context for HTTP handlers
export interface GlobalContext {
  components: AppComponents
}

// Handler context type - combines GlobalContext with request/url from DefaultContext
export type HandlerContext = IHttpServerComponent.DefaultContext<GlobalContext> & {
  params: Record<string, string>
}

// Request/Response types for monitoring endpoints

export interface HeartbeatRequest {
  secret: string
  consumerId: string
  processMethod: string
  status: 'idle' | 'processing' | 'error'
  currentSceneId?: string
  currentStep?: string
  progressPercent?: number
  startedAt?: string
  isPriority?: boolean
  entityType?: EntityType
}

export interface JobCompleteRequest {
  secret: string
  consumerId: string
  sceneId: string
  processMethod: string
  status: 'success' | 'failed'
  startedAt: string
  completedAt: string
  durationMs: number
  errorMessage?: string
  isPriority?: boolean
  entityType?: EntityType
}

export type EntityType = 'scene' | 'wearable' | 'emote'

export interface QueueMetricsRequest {
  secret: string
  queueDepth: number
  entityType?: EntityType  // defaults to 'scene' for backwards compatibility
}

export interface QueueTriggerRequest {
  password: string
  entityId: string
  prioritize?: boolean
  contentServerUrls?: string[]
}

export interface QueueBulkRequest {
  password: string
  sceneIds: string[]
  contentServerUrls?: string[]
}

export interface UpdateHistoryRequest {
  secret: string
  timestamp: string
  stats: {
    totalLands: number
    occupiedLands: number
    totalScenes: number
    scenesWithOptimizedAssets: number
    scenesWithoutOptimizedAssets: number
    optimizationPercentage: number
    scenesWithReports: number
    successfulOptimizations: number
    failedOptimizations: number
  }
}

export interface SetupDbRequest {
  secret: string
}

// Response types

export interface Consumer {
  id: string
  processMethod: string
  status: string
  currentSceneId: string | null
  currentStep: string | null
  progressPercent: number
  startedAt: string | null
  lastHeartbeat: string
  jobsCompleted: number
  jobsFailed: number
  avgProcessingTimeMs: number
  isPriority: boolean
  lastJobStatus: string | null
  entityType: EntityType
}

export interface QueueStatus {
  queueDepth: number
  lastUpdated: string
  entityType: EntityType
}

export interface QueueHistoryEntry {
  queueDepth: number
  timestamp: string
  entityType: EntityType
}

export interface ProcessHistoryEntry {
  consumerId: string
  sceneId: string
  processMethod: string
  status: string
  durationMs: number
  completedAt: string
  entityType: EntityType
}

export interface MonitoringStatusResponse {
  queue: QueueStatus | null  // Deprecated: use queues instead
  queues: Record<EntityType, QueueStatus | null>
  queueHistory: QueueHistoryEntry[]  // Deprecated: use queueHistoryByType instead
  queueHistoryByType: Record<EntityType, QueueHistoryEntry[]>
  consumers: Consumer[]
  recentHistory: ProcessHistoryEntry[]
  processedLastHour: number
  message?: string
}

export interface RankingEntry {
  rank: number
  consumerId: string
  sceneId: string
  processMethod: string
  status: string
  durationMs: number
  completedAt: string
  entityType: EntityType
}

export interface HistoryEntry {
  timestamp: string
  summary: {
    totalLands: number
    occupiedLands: number
    totalScenes: number
    scenesWithOptimizedAssets: number
    scenesWithoutOptimizedAssets: number
    optimizationPercentage: number
    scenesWithReports: number
    successfulOptimizations: number
    failedOptimizations: number
  }
}
