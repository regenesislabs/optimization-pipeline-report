import { IHttpServerComponent } from '@well-known-components/interfaces'
import {
  HandlerContext,
  HeartbeatRequest,
  JobCompleteRequest,
  QueueMetricsRequest,
  QueueTriggerRequest,
  QueueBulkRequest,
  SetupDbRequest
} from '../types'
import {
  getMonitoringStatus,
  recordHeartbeat,
  recordJobComplete,
  recordQueueMetrics,
  getRanking,
  getFailedJobs,
  setupDatabase,
  getOptimizationResults,
  getOptimizationResultByEntityId
} from '../logic/monitoring'
import { EntityType } from '../types'

// Rate limiting map for queue trigger
const rateLimitMap = new Map<string, number>()
const RATE_LIMIT_MS = 1000 // 1 second

// Clean up old rate limit entries periodically
function cleanupRateLimitMap() {
  const now = Date.now()
  for (const [ip, timestamp] of rateLimitMap.entries()) {
    if (now - timestamp > 60000) {
      rateLimitMap.delete(ip)
    }
  }
}

export async function statusHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, url } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const range = url.searchParams.get('range') || '24h'
    const result = await getMonitoringStatus(components.postgres, range)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error fetching monitoring status', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch status: ' + error.message }
    }
  }
}

export async function heartbeatHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const body = await request.json() as HeartbeatRequest

    // Verify secret
    const expectedSecret = await components.config.getString('MONITORING_SECRET')
    if (!expectedSecret || body.secret !== expectedSecret) {
      return {
        status: 401,
        body: { error: 'Unauthorized' }
      }
    }

    // Validate required fields
    if (!body.consumerId || !body.processMethod || !body.status) {
      return {
        status: 400,
        body: { error: 'Missing required fields: consumerId, processMethod, status' }
      }
    }

    const result = await recordHeartbeat(components.postgres, body)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error updating heartbeat', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to update heartbeat: ' + error.message }
    }
  }
}

export async function jobCompleteHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const body = await request.json() as JobCompleteRequest

    // Verify secret
    const expectedSecret = await components.config.getString('MONITORING_SECRET')
    if (!expectedSecret || body.secret !== expectedSecret) {
      return {
        status: 401,
        body: { error: 'Unauthorized' }
      }
    }

    // Validate required fields
    if (!body.consumerId || !body.sceneId || !body.processMethod || !body.status || !body.durationMs) {
      return {
        status: 400,
        body: { error: 'Missing required fields' }
      }
    }

    const result = await recordJobComplete(components.postgres, body)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error recording job completion', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to record job completion: ' + error.message }
    }
  }
}

export async function queueMetricsHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const body = await request.json() as QueueMetricsRequest

    // Verify secret
    const expectedSecret = await components.config.getString('MONITORING_SECRET')
    if (!expectedSecret || body.secret !== expectedSecret) {
      return {
        status: 401,
        body: { error: 'Unauthorized' }
      }
    }

    // Validate required fields
    if (body.queueDepth === undefined) {
      return {
        status: 400,
        body: { error: 'Missing required field: queueDepth' }
      }
    }

    const result = await recordQueueMetrics(components.postgres, body)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error updating queue metrics', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to update queue metrics: ' + error.message }
    }
  }
}

export async function queueTriggerHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const body = await request.json() as QueueTriggerRequest

    // Verify password
    const expectedPassword = (await components.config.getString('QUEUE_TRIGGER_PASSWORD')) || '#Decentraland2025'
    if (body.password !== expectedPassword) {
      return {
        status: 401,
        body: { error: 'Invalid password' }
      }
    }

    // Validate entityId
    if (!body.entityId || typeof body.entityId !== 'string' || body.entityId.trim() === '') {
      return {
        status: 400,
        body: { error: 'Missing or invalid entityId' }
      }
    }

    // Rate limiting by IP
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const lastRequest = rateLimitMap.get(clientIp)

    if (lastRequest && (now - lastRequest) < RATE_LIMIT_MS) {
      const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastRequest)) / 1000)
      return {
        status: 429,
        body: {
          error: 'Rate limited. Please wait 1 second between requests.',
          retryAfter: waitTime
        }
      }
    }
    rateLimitMap.set(clientIp, now)
    cleanupRateLimitMap()

    // Get producer configuration
    const producerUrl = await components.config.getString('PRODUCER_URL')
    const tmpSecret = await components.config.getString('PRODUCER_TMP_SECRET')

    if (!producerUrl || !tmpSecret) {
      return {
        status: 500,
        body: {
          error: 'Producer not configured. Set PRODUCER_URL and PRODUCER_TMP_SECRET environment variables.'
        }
      }
    }

    // Forward request to entity-queue-producer
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await components.fetch.fetch(`${producerUrl}/queue-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tmpSecret
        },
        body: JSON.stringify({
          entity: {
            entityId: body.entityId.trim(),
            entityType: body.entityType || 'scene',
            authChain: []
          },
          contentServerUrls: body.contentServerUrls || ['https://peer.decentraland.org/content'],
          prioritize: !!body.prioritize
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Producer error', { status: response.status, error: errorText })
        return {
          status: response.status,
          body: { error: `Producer returned error: ${errorText}` }
        }
      }

      const result = await response.text()

      return {
        status: 200,
        body: {
          success: true,
          message: `Entity ${body.entityId} queued successfully`,
          prioritized: !!body.prioritize,
          result
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        return {
          status: 504,
          body: { error: 'Request to producer timed out' }
        }
      }
      throw error
    }
  } catch (error: any) {
    logger.error('Error triggering queue', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to trigger queue: ' + error.message }
    }
  }
}

export async function queueBulkHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const body = await request.json() as QueueBulkRequest

    // Verify password
    const expectedPassword = (await components.config.getString('QUEUE_TRIGGER_PASSWORD')) || '#Decentraland2025'
    if (body.password !== expectedPassword) {
      return {
        status: 401,
        body: { error: 'Invalid password' }
      }
    }

    // Validate sceneIds
    if (!body.sceneIds || !Array.isArray(body.sceneIds) || body.sceneIds.length === 0) {
      return {
        status: 400,
        body: { error: 'Missing or invalid sceneIds array' }
      }
    }

    // Get producer configuration
    const producerUrl = await components.config.getString('PRODUCER_URL')
    const tmpSecret = await components.config.getString('PRODUCER_TMP_SECRET')

    if (!producerUrl || !tmpSecret) {
      return {
        status: 500,
        body: {
          error: 'Producer not configured. Set PRODUCER_URL and PRODUCER_TMP_SECRET environment variables.'
        }
      }
    }

    // Filter valid sceneIds
    const validSceneIds = body.sceneIds.filter(id => id && typeof id === 'string' && id.trim() !== '')
    const invalidCount = body.sceneIds.length - validSceneIds.length

    // Build entities array for bulk endpoint
    const entityType = body.entityType || 'scene'
    const entities = validSceneIds.map(sceneId => ({
      entity: {
        entityId: sceneId.trim(),
        entityType,
        authChain: []
      },
      contentServerUrls: body.contentServerUrls || ['https://peer.decentraland.org/content']
    }))

    // Use the bulk endpoint
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)

    try {
      const response = await components.fetch.fetch(`${producerUrl}/queue-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tmpSecret
        },
        body: JSON.stringify({
          entities,
          prioritize: true
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        return {
          status: response.status,
          body: { error: `Producer returned error: ${errorText}` }
        }
      }

      const result = await response.json() as any

      // Add invalid sceneIds to failed count
      if (invalidCount > 0) {
        result.failed = (result.failed || 0) + invalidCount
        result.results = result.results || { success: [], failed: [] }
        for (let i = 0; i < invalidCount; i++) {
          result.results.failed.push({ entityId: 'invalid', error: 'Invalid sceneId' })
        }
      }

      return {
        status: 200,
        body: {
          success: true,
          total: body.sceneIds.length,
          queued: result.queued || 0,
          failed: result.failed || 0,
          results: result.results || { success: [], failed: [] }
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        return {
          status: 504,
          body: { error: 'Request to producer timed out' }
        }
      }
      throw error
    }
  } catch (error: any) {
    logger.error('Error calling bulk queue endpoint', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to queue scenes: ' + error.message }
    }
  }
}

export async function rankingHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const result = await getRanking(components.postgres)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error fetching ranking', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch ranking: ' + error.message }
    }
  }
}

export async function failedJobsHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const result = await getFailedJobs(components.postgres)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error fetching failed jobs', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch failed jobs: ' + error.message }
    }
  }
}

export async function setupDbHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const body = await request.json() as SetupDbRequest

    // Verify secret
    const expectedSecret = await components.config.getString('MONITORING_SECRET')
    if (!expectedSecret || body.secret !== expectedSecret) {
      return {
        status: 401,
        body: { error: 'Unauthorized' }
      }
    }

    const result = await setupDatabase(components.postgres)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error setting up database', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to setup database: ' + error.message }
    }
  }
}

export async function optimizationResultsHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, url } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 100)
    const status = url.searchParams.get('status') as 'success' | 'failed' | null
    const entityType = url.searchParams.get('entityType') as EntityType | null

    const result = await getOptimizationResults(components.postgres, {
      page,
      pageSize,
      status: status || undefined,
      entityType: entityType || undefined
    })

    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error fetching optimization results', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch optimization results: ' + error.message }
    }
  }
}

export async function optimizationResultByIdHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, params } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const entityId = params.entityId

    if (!entityId) {
      return {
        status: 400,
        body: { error: 'Missing entityId parameter' }
      }
    }

    const result = await getOptimizationResultByEntityId(components.postgres, entityId)

    if (!result) {
      return {
        status: 404,
        body: { error: 'Optimization result not found' }
      }
    }

    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error fetching optimization result', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch optimization result: ' + error.message }
    }
  }
}

// Handler to serve just the report JSON (for direct report access without CDN cache issues)
export async function reportJsonHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, params } = context
  const logger = components.logs.getLogger('monitoring')

  try {
    const entityId = params.entityId

    if (!entityId) {
      return {
        status: 400,
        body: { error: 'Missing entityId parameter' }
      }
    }

    const result = await getOptimizationResultByEntityId(components.postgres, entityId)

    if (!result) {
      return {
        status: 404,
        body: { error: 'Report not found' }
      }
    }

    if (!result.reportJson) {
      return {
        status: 404,
        body: { error: 'Report JSON not available for this entity' }
      }
    }

    return {
      status: 200,
      body: result.reportJson
    }
  } catch (error: any) {
    logger.error('Error fetching report JSON', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch report: ' + error.message }
    }
  }
}
