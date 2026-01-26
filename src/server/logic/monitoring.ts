import {
  IPostgresComponent,
  HeartbeatRequest,
  JobCompleteRequest,
  QueueMetricsRequest,
  MonitoringStatusResponse,
  Consumer,
  QueueStatus,
  QueueHistoryEntry,
  ProcessHistoryEntry,
  RankingEntry,
  EntityType
} from '../types'

const ENTITY_TYPES: EntityType[] = ['scene', 'wearable', 'emote']

// Constants
const OFFLINE_THRESHOLD_MS = 30 * 1000 // 30 seconds
const CLEANUP_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

// Get sampling configuration based on time range
function getSamplingConfig(range: string): { intervalSql: string; samplingMinutes: number } {
  switch (range) {
    case '1h':
      return { intervalSql: '1 hour', samplingMinutes: 5 }
    case '3h':
      return { intervalSql: '3 hours', samplingMinutes: 5 }
    case '6h':
      return { intervalSql: '6 hours', samplingMinutes: 5 }
    case '12h':
      return { intervalSql: '12 hours', samplingMinutes: 10 }
    case '24h':
      return { intervalSql: '24 hours', samplingMinutes: 20 }
    case '3d':
      return { intervalSql: '3 days', samplingMinutes: 60 }
    case '7d':
    default:
      return { intervalSql: '7 days', samplingMinutes: 120 }
  }
}

export async function getMonitoringStatus(
  postgres: IPostgresComponent,
  range: string = '24h'
): Promise<MonitoringStatusResponse> {
  let queue: QueueStatus | null = null
  let queueHistory: QueueHistoryEntry[] = []
  const queues: Record<EntityType, QueueStatus | null> = {
    scene: null,
    wearable: null,
    emote: null
  }
  const queueHistoryByType: Record<EntityType, QueueHistoryEntry[]> = {
    scene: [],
    wearable: [],
    emote: []
  }
  let consumers: Consumer[] = []
  let recentHistory: ProcessHistoryEntry[] = []
  let processedLastHour = 0

  // Get latest queue metrics per entity type
  try {
    // Get latest queue status per entity type
    for (const entityType of ENTITY_TYPES) {
      const queueResult = await postgres.query(`
        SELECT queue_depth, timestamp, entity_type
        FROM pipeline_queue_metrics
        WHERE entity_type = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `, [entityType])

      if (queueResult.rows.length > 0) {
        const row = queueResult.rows[0]
        queues[entityType] = {
          queueDepth: row.queue_depth,
          lastUpdated: row.timestamp,
          entityType: row.entity_type || 'scene'
        }
      }
    }

    // Set legacy queue field (use scene as default)
    queue = queues.scene

    // Get queue depth history with sampling per entity type
    const { intervalSql, samplingMinutes } = getSamplingConfig(range)
    const samplingSeconds = samplingMinutes * 60

    for (const entityType of ENTITY_TYPES) {
      const historyResult = await postgres.query(`
        WITH ranked AS (
          SELECT
            queue_depth,
            timestamp,
            entity_type,
            ROW_NUMBER() OVER (
              PARTITION BY FLOOR(EXTRACT(EPOCH FROM timestamp) / $1)
              ORDER BY timestamp DESC
            ) as rn
          FROM pipeline_queue_metrics
          WHERE timestamp > NOW() - INTERVAL '${intervalSql}'
            AND entity_type = $2
        )
        SELECT queue_depth, timestamp, entity_type
        FROM ranked
        WHERE rn = 1
        ORDER BY timestamp ASC
      `, [samplingSeconds, entityType])

      queueHistoryByType[entityType] = historyResult.rows.map(row => ({
        queueDepth: row.queue_depth,
        timestamp: row.timestamp,
        entityType: row.entity_type || 'scene'
      }))
    }

    // Set legacy queueHistory field (combine all for backwards compatibility)
    queueHistory = queueHistoryByType.scene
  } catch (e) {
    // Table might not exist yet or doesn't have entity_type column
    // Try legacy query without entity_type
    try {
      const queueResult = await postgres.query(`
        SELECT queue_depth, timestamp
        FROM pipeline_queue_metrics
        ORDER BY timestamp DESC
        LIMIT 1
      `)

      if (queueResult.rows.length > 0) {
        const row = queueResult.rows[0]
        queue = {
          queueDepth: row.queue_depth,
          lastUpdated: row.timestamp,
          entityType: 'scene'
        }
        queues.scene = queue
      }

      const { intervalSql, samplingMinutes } = getSamplingConfig(range)
      const samplingSeconds = samplingMinutes * 60

      const historyResult = await postgres.query(`
        WITH ranked AS (
          SELECT
            queue_depth,
            timestamp,
            ROW_NUMBER() OVER (
              PARTITION BY FLOOR(EXTRACT(EPOCH FROM timestamp) / $1)
              ORDER BY timestamp DESC
            ) as rn
          FROM pipeline_queue_metrics
          WHERE timestamp > NOW() - INTERVAL '${intervalSql}'
        )
        SELECT queue_depth, timestamp
        FROM ranked
        WHERE rn = 1
        ORDER BY timestamp ASC
      `, [samplingSeconds])

      queueHistory = historyResult.rows.map(row => ({
        queueDepth: row.queue_depth,
        timestamp: row.timestamp,
        entityType: 'scene' as EntityType
      }))
      queueHistoryByType.scene = queueHistory
    } catch (e2) {
      // Still failing, table doesn't exist
    }
  }

  // Get all consumers and determine online/offline status
  try {
    const consumersResult = await postgres.query(`
      SELECT
        id,
        process_method,
        status,
        current_scene_id,
        current_step,
        progress_percent,
        started_at,
        last_heartbeat,
        jobs_completed,
        jobs_failed,
        avg_processing_time_ms,
        is_priority,
        last_job_status
      FROM pipeline_consumers
      ORDER BY last_heartbeat DESC
    `)

    const now = new Date()

    consumers = consumersResult.rows
      .filter(row => {
        // Remove consumers that haven't been seen in 5 minutes
        const lastHeartbeat = new Date(row.last_heartbeat)
        return (now.getTime() - lastHeartbeat.getTime()) < CLEANUP_THRESHOLD_MS
      })
      .map(row => {
        const lastHeartbeat = new Date(row.last_heartbeat)
        const isOffline = (now.getTime() - lastHeartbeat.getTime()) > OFFLINE_THRESHOLD_MS

        return {
          id: row.id,
          processMethod: row.process_method,
          status: isOffline ? 'offline' : row.status,
          currentSceneId: row.current_scene_id,
          currentStep: row.current_step,
          progressPercent: row.progress_percent,
          startedAt: row.started_at,
          lastHeartbeat: row.last_heartbeat,
          jobsCompleted: row.jobs_completed,
          jobsFailed: row.jobs_failed,
          avgProcessingTimeMs: row.avg_processing_time_ms,
          isPriority: row.is_priority || false,
          lastJobStatus: row.last_job_status
        }
      })

    // Cleanup old consumers from database
    await postgres.query(`
      DELETE FROM pipeline_consumers
      WHERE last_heartbeat < NOW() - INTERVAL '5 minutes'
    `)
  } catch (e) {
    // Table might not exist yet
  }

  // Get recent processing history and count processed in last hour
  try {
    const historyResult = await postgres.query(`
      SELECT
        consumer_id,
        scene_id,
        process_method,
        status,
        duration_ms,
        completed_at
      FROM pipeline_process_history
      ORDER BY completed_at DESC
      LIMIT 20
    `)

    recentHistory = historyResult.rows.map(row => ({
      consumerId: row.consumer_id,
      sceneId: row.scene_id,
      processMethod: row.process_method,
      status: row.status,
      durationMs: row.duration_ms,
      completedAt: row.completed_at
    }))

    // Count scenes processed in last hour
    const countResult = await postgres.query(`
      SELECT COUNT(*) as count
      FROM pipeline_process_history
      WHERE completed_at > NOW() - INTERVAL '1 hour'
        AND status = 'success'
    `)
    processedLastHour = parseInt(countResult.rows[0]?.count || '0', 10)

    // Cleanup old history entries (older than 24 hours)
    await postgres.query(`
      DELETE FROM pipeline_process_history
      WHERE created_at < NOW() - INTERVAL '24 hours'
    `)
  } catch (e) {
    // Table might not exist yet
  }

  return {
    queue,
    queues,
    queueHistory,
    queueHistoryByType,
    consumers,
    recentHistory,
    processedLastHour
  }
}

export async function recordHeartbeat(
  postgres: IPostgresComponent,
  data: HeartbeatRequest
): Promise<{ success: boolean }> {
  const {
    consumerId,
    processMethod,
    status,
    currentSceneId,
    currentStep,
    progressPercent,
    startedAt,
    isPriority
  } = data

  // Create table if it doesn't exist
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS pipeline_consumers (
      id VARCHAR(36) PRIMARY KEY,
      process_method VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      current_scene_id VARCHAR(255),
      current_step VARCHAR(100),
      progress_percent INTEGER DEFAULT 0,
      started_at TIMESTAMP,
      last_heartbeat TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      jobs_completed INTEGER DEFAULT 0,
      jobs_failed INTEGER DEFAULT 0,
      avg_processing_time_ms INTEGER DEFAULT 0,
      is_priority BOOLEAN DEFAULT FALSE,
      last_job_status VARCHAR(20)
    )
  `)

  // Try to add is_priority and last_job_status columns if they don't exist
  try {
    await postgres.query(`ALTER TABLE pipeline_consumers ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE`)
    await postgres.query(`ALTER TABLE pipeline_consumers ADD COLUMN IF NOT EXISTS last_job_status VARCHAR(20)`)
  } catch (e) {
    // Columns might already exist
  }

  // Upsert consumer record
  await postgres.query(`
    INSERT INTO pipeline_consumers (
      id,
      process_method,
      status,
      current_scene_id,
      current_step,
      progress_percent,
      started_at,
      last_heartbeat,
      is_priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    ON CONFLICT (id) DO UPDATE SET
      process_method = $2,
      status = $3,
      current_scene_id = $4,
      current_step = $5,
      progress_percent = $6,
      started_at = $7,
      last_heartbeat = NOW(),
      is_priority = $8
  `, [
    consumerId,
    processMethod,
    status,
    currentSceneId || null,
    currentStep || null,
    progressPercent || 0,
    startedAt ? new Date(startedAt) : null,
    isPriority || false
  ])

  return { success: true }
}

export async function recordJobComplete(
  postgres: IPostgresComponent,
  data: JobCompleteRequest
): Promise<{ success: boolean }> {
  const {
    consumerId,
    sceneId,
    processMethod,
    status,
    startedAt,
    completedAt,
    durationMs,
    errorMessage,
    isPriority
  } = data

  // Create history table if it doesn't exist
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS pipeline_process_history (
      id SERIAL PRIMARY KEY,
      consumer_id VARCHAR(36) NOT NULL,
      scene_id VARCHAR(255) NOT NULL,
      process_method VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      is_priority BOOLEAN DEFAULT FALSE
    )
  `)

  // Create indexes if not exist
  try {
    await postgres.query(`CREATE INDEX IF NOT EXISTS idx_history_consumer ON pipeline_process_history(consumer_id)`)
    await postgres.query(`CREATE INDEX IF NOT EXISTS idx_history_created ON pipeline_process_history(created_at DESC)`)
    await postgres.query(`ALTER TABLE pipeline_process_history ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE`)
  } catch (e) {
    // Ignore errors
  }

  // Insert history entry
  await postgres.query(`
    INSERT INTO pipeline_process_history (
      consumer_id,
      scene_id,
      process_method,
      status,
      started_at,
      completed_at,
      duration_ms,
      error_message,
      is_priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    consumerId,
    sceneId,
    processMethod,
    status,
    new Date(startedAt),
    new Date(completedAt),
    durationMs,
    errorMessage || null,
    isPriority || false
  ])

  // Update consumer stats
  const isSuccess = status === 'success'

  // Get current consumer stats
  const consumerResult = await postgres.query(`
    SELECT jobs_completed, jobs_failed, avg_processing_time_ms
    FROM pipeline_consumers
    WHERE id = $1
  `, [consumerId])

  if (consumerResult.rows.length > 0) {
    const consumer = consumerResult.rows[0]
    const totalJobs = consumer.jobs_completed + consumer.jobs_failed
    const newAvg = totalJobs > 0
      ? Math.round((consumer.avg_processing_time_ms * totalJobs + durationMs) / (totalJobs + 1))
      : durationMs

    await postgres.query(`
      UPDATE pipeline_consumers SET
        jobs_completed = jobs_completed + $1,
        jobs_failed = jobs_failed + $2,
        avg_processing_time_ms = $3,
        status = 'idle',
        current_scene_id = NULL,
        current_step = NULL,
        progress_percent = 0,
        started_at = NULL,
        is_priority = FALSE,
        last_job_status = $4
      WHERE id = $5
    `, [
      isSuccess ? 1 : 0,
      isSuccess ? 0 : 1,
      newAvg,
      status,
      consumerId
    ])
  }

  return { success: true }
}

export async function recordQueueMetrics(
  postgres: IPostgresComponent,
  data: QueueMetricsRequest
): Promise<{ success: boolean }> {
  const { queueDepth, entityType = 'scene' } = data

  // Create table if it doesn't exist (with entity_type column)
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS pipeline_queue_metrics (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT NOW(),
      queue_depth INTEGER DEFAULT 0,
      entity_type VARCHAR(20) DEFAULT 'scene'
    )
  `)

  // Try to add entity_type column if it doesn't exist
  try {
    await postgres.query(`ALTER TABLE pipeline_queue_metrics ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20) DEFAULT 'scene'`)
  } catch (e) {
    // Column might already exist
  }

  // Insert new metrics entry
  await postgres.query(`
    INSERT INTO pipeline_queue_metrics (queue_depth, entity_type) VALUES ($1, $2)
  `, [queueDepth, entityType])

  // Keep only the last 15000 entries per entity type (~10 days of data at 1 report/minute)
  await postgres.query(`
    DELETE FROM pipeline_queue_metrics
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY entity_type ORDER BY timestamp DESC) as rn
        FROM pipeline_queue_metrics
      ) ranked
      WHERE rn <= 15000
    )
  `)

  return { success: true }
}

export async function getRanking(postgres: IPostgresComponent): Promise<{ ranking: RankingEntry[] }> {
  try {
    const result = await postgres.query(`
      SELECT
        consumer_id,
        scene_id,
        process_method,
        status,
        duration_ms,
        completed_at
      FROM pipeline_process_history
      WHERE status = 'success'
      ORDER BY duration_ms DESC
      LIMIT 20
    `)

    const ranking: RankingEntry[] = result.rows.map((row, index) => ({
      rank: index + 1,
      consumerId: row.consumer_id,
      sceneId: row.scene_id,
      processMethod: row.process_method,
      status: row.status,
      durationMs: row.duration_ms,
      completedAt: row.completed_at
    }))

    return { ranking }
  } catch (e) {
    return { ranking: [] }
  }
}

export async function setupDatabase(postgres: IPostgresComponent): Promise<{ success: boolean; message: string }> {
  // Create pipeline_consumers table
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS pipeline_consumers (
      id VARCHAR(36) PRIMARY KEY,
      process_method VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      current_scene_id VARCHAR(255),
      current_step VARCHAR(100),
      progress_percent INTEGER DEFAULT 0,
      started_at TIMESTAMP,
      last_heartbeat TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      jobs_completed INTEGER DEFAULT 0,
      jobs_failed INTEGER DEFAULT 0,
      avg_processing_time_ms INTEGER DEFAULT 0,
      is_priority BOOLEAN DEFAULT FALSE,
      last_job_status VARCHAR(20)
    )
  `)

  // Drop old queue metrics table and recreate with new schema
  await postgres.query(`DROP TABLE IF EXISTS pipeline_queue_metrics`)

  // Create pipeline_queue_metrics table with entity_type
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS pipeline_queue_metrics (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT NOW(),
      queue_depth INTEGER DEFAULT 0,
      entity_type VARCHAR(20) DEFAULT 'scene'
    )
  `)

  // Create index for entity_type
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_queue_metrics_entity_type ON pipeline_queue_metrics(entity_type, timestamp DESC)
  `)

  // Create pipeline_process_history table
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS pipeline_process_history (
      id SERIAL PRIMARY KEY,
      consumer_id VARCHAR(36) NOT NULL,
      scene_id VARCHAR(255) NOT NULL,
      process_method VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      is_priority BOOLEAN DEFAULT FALSE
    )
  `)

  // Create indexes
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_history_consumer ON pipeline_process_history(consumer_id)
  `)

  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_history_created ON pipeline_process_history(created_at DESC)
  `)

  return { success: true, message: 'Database tables created successfully' }
}
