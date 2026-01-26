import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContext, UpdateHistoryRequest } from '../types'
import { getHistory, updateHistory } from '../logic/history'

export async function getHistoryHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components } = context

  try {
    const result = await getHistory(components.postgres)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    components.logs.getLogger('history').error('Error fetching history', { error: error.message })
    return {
      status: 200,
      body: {
        entries: [],
        message: 'Unable to fetch history. Database may not be configured.'
      }
    }
  }
}

export async function updateHistoryHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components, request } = context
  const logger = components.logs.getLogger('history')

  try {
    const body = await request.json() as UpdateHistoryRequest

    // Verify secret
    const expectedSecret = await components.config.getString('UPLOAD_SECRET')
    if (!expectedSecret || body.secret !== expectedSecret) {
      return {
        status: 401,
        body: { error: 'Unauthorized' }
      }
    }

    const result = await updateHistory(components.postgres, body)
    return {
      status: 200,
      body: result
    }
  } catch (error: any) {
    logger.error('Error updating history', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to update history: ' + error.message }
    }
  }
}
