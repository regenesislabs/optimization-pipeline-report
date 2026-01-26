import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createServerComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createPostgresComponent } from './adapters/postgres'
import { createReportScheduler } from './adapters/report-scheduler'
import { createReportStorage } from './adapters/report-storage'
import { AppComponents, GlobalContext, IFetchComponent } from './types'

// Initialize all components for the application
export async function initComponents(): Promise<AppComponents> {
  // Configuration component - loads from .env files
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })

  // Logger component
  const logs = await createLogComponent({})

  // HTTP server component with CORS enabled
  const server = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }
    }
  )

  // Fetch component for making HTTP requests
  const fetch: IFetchComponent = {
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init)
  }

  // PostgreSQL component
  const postgres = await createPostgresComponent({ logs, config })

  // Report storage component (stores report data in memory)
  const reportStorage = createReportStorage({ logs })

  // Report scheduler component
  const reportScheduler = createReportScheduler({ logs, config, reportStorage })

  return {
    config,
    logs,
    server,
    fetch,
    postgres,
    reportScheduler,
    reportStorage
  }
}
