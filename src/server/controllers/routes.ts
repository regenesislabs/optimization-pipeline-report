import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { getHistoryHandler, updateHistoryHandler } from './history'
import {
  statusHandler,
  heartbeatHandler,
  jobCompleteHandler,
  queueMetricsHandler,
  queueTriggerHandler,
  queueBulkHandler,
  rankingHandler,
  setupDbHandler
} from './monitoring'
import { reportDataHandler, reportStatusHandler } from './report'

export async function setupRoutes(globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  // Health check
  router.get('/health', async () => ({
    status: 200,
    body: { status: 'ok', timestamp: new Date().toISOString() }
  }))

  // History endpoints
  router.get('/api/get-history', getHistoryHandler)
  router.post('/api/update-history', updateHistoryHandler)

  // Monitoring endpoints
  router.get('/api/monitoring/status', statusHandler)
  router.post('/api/monitoring/heartbeat', heartbeatHandler)
  router.post('/api/monitoring/job-complete', jobCompleteHandler)
  router.post('/api/monitoring/queue-metrics', queueMetricsHandler)
  router.post('/api/monitoring/queue-trigger', queueTriggerHandler)
  router.post('/api/monitoring/queue-bulk', queueBulkHandler)
  router.get('/api/monitoring/ranking', rankingHandler)
  router.post('/api/monitoring/setup-db', setupDbHandler)

  // Report data endpoints (local storage)
  router.get('/api/report-data', reportDataHandler)
  router.get('/api/report-status', reportStatusHandler)

  return router
}
