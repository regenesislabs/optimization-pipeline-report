import type { ILoggerComponent, IConfigComponent, IBaseComponent } from '@well-known-components/interfaces'
import { runReportGeneration } from '../../report-runner'
import type { IReportScheduler, IReportStorage } from '../types'

interface ReportSchedulerComponents {
  logs: ILoggerComponent
  config: IConfigComponent
  reportStorage: IReportStorage
}

export function createReportScheduler(
  components: ReportSchedulerComponents
): IReportScheduler {
  const { logs, config, reportStorage } = components
  const logger = logs.getLogger('report-scheduler')

  let scheduleInterval: NodeJS.Timeout | undefined
  let isRunning = false
  let currentReportPromise: Promise<void> | undefined

  async function runReport(): Promise<void> {
    if (isRunning) {
      logger.info('Report generation already in progress, skipping')
      return
    }

    isRunning = true
    logger.info('Starting scheduled report generation')
    reportStorage.setGenerating(true)

    try {
      // Skip R2 upload - we store locally instead
      const result = await runReportGeneration({
        skipR2Upload: true,
        onProgress: (percent, message) => {
          reportStorage.setProgress(percent)
          reportStorage.setProgressMessage(message)
        }
      })

      if (result.success && result.stats) {
        // Store report data in local storage
        if (result.reportData) {
          reportStorage.setReport(result.reportData)
          logger.info('Report data stored in local storage')
        }

        logger.info('Report generation completed successfully', {
          totalLands: result.stats.totalLands,
          totalScenes: result.stats.totalScenes,
          optimizationPercentage: result.stats.optimizationPercentage
        })
      } else if (!result.success) {
        logger.error('Report generation failed', { error: result.error || 'Unknown error' })
      }
    } catch (error) {
      logger.error('Report generation threw an exception', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      isRunning = false
      reportStorage.setGenerating(false)
    }
  }

  async function start(_: IBaseComponent.ComponentStartOptions): Promise<void> {
    const enabled = await config.getString('REPORT_SCHEDULE_ENABLED')
    if (enabled !== 'true') {
      logger.info('Report scheduler disabled (REPORT_SCHEDULE_ENABLED != true)')
      return
    }

    const intervalHoursStr = await config.getString('REPORT_SCHEDULE_INTERVAL_HOURS')
    const intervalHours = intervalHoursStr ? parseInt(intervalHoursStr, 10) : 3
    const intervalMs = intervalHours * 60 * 60 * 1000

    logger.info('Report scheduler starting', {
      intervalHours,
      intervalMs
    })

    // Check if we should run on startup
    const runOnStartup = await config.getString('REPORT_RUN_ON_STARTUP')
    if (runOnStartup === 'true') {
      logger.info('Running initial report on startup')
      // Run in background, don't block startup
      currentReportPromise = runReport()
    }

    // Schedule regular reports
    scheduleInterval = setInterval(() => {
      currentReportPromise = runReport()
    }, intervalMs)

    logger.info('Report scheduler started', {
      nextRunInHours: intervalHours
    })
  }

  async function stop(): Promise<void> {
    logger.info('Report scheduler stopping')

    if (scheduleInterval) {
      clearInterval(scheduleInterval)
      scheduleInterval = undefined
    }

    // Wait for current report to finish if running
    if (currentReportPromise) {
      logger.info('Waiting for current report to complete')
      await currentReportPromise
    }

    logger.info('Report scheduler stopped')
  }

  async function triggerReport(): Promise<void> {
    logger.info('Manual report trigger requested')
    await runReport()
  }

  return {
    start,
    stop,
    triggerReport
  }
}
