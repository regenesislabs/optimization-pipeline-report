import { IPostgresComponent, HistoryEntry, UpdateHistoryRequest } from '../types'

export async function getHistory(postgres: IPostgresComponent): Promise<{ entries: HistoryEntry[]; message?: string }> {
  // Check if the table exists
  const tableCheck = await postgres.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'optimization_history'
    )
  `)

  if (!tableCheck.rows[0].exists) {
    return {
      entries: [],
      message: 'History table will be created on first report generation.'
    }
  }

  // Get last 30 days of history
  const result = await postgres.query(`
    SELECT
      timestamp,
      total_lands,
      occupied_lands,
      total_scenes,
      scenes_with_optimized,
      scenes_without_optimized,
      optimization_percentage,
      scenes_with_reports,
      successful_optimizations,
      failed_optimizations
    FROM optimization_history
    WHERE timestamp > NOW() - INTERVAL '30 days'
    ORDER BY timestamp DESC
    LIMIT 60
  `)

  const entries: HistoryEntry[] = result.rows.map(row => ({
    timestamp: row.timestamp,
    summary: {
      totalLands: row.total_lands,
      occupiedLands: row.occupied_lands,
      totalScenes: row.total_scenes,
      scenesWithOptimizedAssets: row.scenes_with_optimized,
      scenesWithoutOptimizedAssets: row.scenes_without_optimized,
      optimizationPercentage: parseFloat(row.optimization_percentage),
      scenesWithReports: row.scenes_with_reports,
      successfulOptimizations: row.successful_optimizations,
      failedOptimizations: row.failed_optimizations
    }
  }))

  return { entries }
}

export async function updateHistory(
  postgres: IPostgresComponent,
  data: UpdateHistoryRequest
): Promise<{ success: boolean; message: string }> {
  const { timestamp, stats } = data

  // Create table if it doesn't exist
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS optimization_history (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP NOT NULL,
      total_lands INTEGER NOT NULL,
      occupied_lands INTEGER NOT NULL,
      total_scenes INTEGER NOT NULL,
      scenes_with_optimized INTEGER NOT NULL,
      scenes_without_optimized INTEGER NOT NULL,
      optimization_percentage DECIMAL(5,2) NOT NULL,
      scenes_with_reports INTEGER NOT NULL,
      successful_optimizations INTEGER NOT NULL,
      failed_optimizations INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Insert new history entry
  await postgres.query(`
    INSERT INTO optimization_history (
      timestamp,
      total_lands,
      occupied_lands,
      total_scenes,
      scenes_with_optimized,
      scenes_without_optimized,
      optimization_percentage,
      scenes_with_reports,
      successful_optimizations,
      failed_optimizations
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    timestamp,
    stats.totalLands,
    stats.occupiedLands,
    stats.totalScenes,
    stats.scenesWithOptimizedAssets,
    stats.scenesWithoutOptimizedAssets,
    stats.optimizationPercentage,
    stats.scenesWithReports,
    stats.successfulOptimizations,
    stats.failedOptimizations
  ])

  // Clean up old entries (keep last 60 days)
  await postgres.query(`
    DELETE FROM optimization_history
    WHERE timestamp < NOW() - INTERVAL '60 days'
  `)

  return { success: true, message: 'History updated successfully' }
}
