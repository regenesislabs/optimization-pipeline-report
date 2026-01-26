import type { ILoggerComponent, IBaseComponent } from '@well-known-components/interfaces'

export interface IReportStorage extends IBaseComponent {
  getReport(): ReportData | null
  setReport(data: ReportData): void
  getLastUpdated(): Date | null
  isGenerating(): boolean
  setGenerating(generating: boolean): void
  getProgress(): number
  setProgress(percent: number): void
  getProgressMessage(): string
  setProgressMessage(message: string): void
}

export interface ReportData {
  l: any[]  // lands (only occupied)
  s: any    // stats
  c: Record<string, number>  // color indices for scenes
  g: number  // generated timestamp
  w?: any[]  // worlds array
  ws?: any   // worlds stats
}

interface ReportStorageComponents {
  logs: ILoggerComponent
}

export function createReportStorage(
  components: ReportStorageComponents
): IReportStorage {
  const { logs } = components
  const logger = logs.getLogger('report-storage')

  let currentReport: ReportData | null = null
  let lastUpdated: Date | null = null
  let generating = false
  let progress = 0
  let progressMessage = ''

  function getReport(): ReportData | null {
    return currentReport
  }

  function isGenerating(): boolean {
    return generating
  }

  function setGenerating(value: boolean): void {
    generating = value
    if (value) {
      progress = 0
      progressMessage = 'Starting report generation...'
      logger.info('Report generation started')
    } else {
      progress = 100
    }
  }

  function getProgress(): number {
    return progress
  }

  function setProgress(percent: number): void {
    progress = percent
  }

  function getProgressMessage(): string {
    return progressMessage
  }

  function setProgressMessage(message: string): void {
    progressMessage = message
  }

  function setReport(data: ReportData): void {
    currentReport = data
    lastUpdated = new Date()
    logger.info('Report data updated', {
      landsCount: data.l?.length || 0,
      worldsCount: data.w?.length || 0,
      timestamp: lastUpdated.toISOString()
    })
  }

  function getLastUpdated(): Date | null {
    return lastUpdated
  }

  async function start(): Promise<void> {
    logger.info('Report storage initialized')
  }

  async function stop(): Promise<void> {
    logger.info('Report storage stopped')
  }

  return {
    start,
    stop,
    getReport,
    setReport,
    getLastUpdated,
    isGenerating,
    setGenerating,
    getProgress,
    setProgress,
    getProgressMessage,
    setProgressMessage
  }
}
