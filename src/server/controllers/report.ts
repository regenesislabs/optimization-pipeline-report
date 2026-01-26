import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContext } from '../types'

export async function reportDataHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components } = context

  try {
    const reportData = components.reportStorage.getReport()
    const lastUpdated = components.reportStorage.getLastUpdated()

    if (!reportData) {
      const isGenerating = components.reportStorage.isGenerating()
      const progress = components.reportStorage.getProgress()
      const progressMessage = components.reportStorage.getProgressMessage()

      return {
        status: 503,
        body: {
          error: 'Report data not available yet.',
          generating: isGenerating,
          progress: isGenerating ? progress : 0,
          progressMessage: isGenerating ? progressMessage : 'Waiting for first report generation...',
          lastUpdated: null
        }
      }
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      },
      body: reportData
    }
  } catch (error: any) {
    components.logs.getLogger('report').error('Error fetching report data', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch report data' }
    }
  }
}

export async function reportStatusHandler(context: HandlerContext): Promise<IHttpServerComponent.IResponse> {
  const { components } = context

  try {
    const reportData = components.reportStorage.getReport()
    const lastUpdated = components.reportStorage.getLastUpdated()

    return {
      status: 200,
      body: {
        available: reportData !== null,
        lastUpdated: lastUpdated?.toISOString() || null,
        generated: reportData?.g ? new Date(reportData.g).toISOString() : null
      }
    }
  } catch (error: any) {
    components.logs.getLogger('report').error('Error fetching report status', { error: error.message })
    return {
      status: 500,
      body: { error: 'Failed to fetch report status' }
    }
  }
}
