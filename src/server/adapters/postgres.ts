import { Pool, QueryResult, QueryResultRow } from 'pg'
import type { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import type { IPostgresComponent } from '../types'

export async function createPostgresComponent(
  components: { logs: ILoggerComponent; config: IConfigComponent }
): Promise<IPostgresComponent> {
  const { logs, config } = components
  const logger = logs.getLogger('postgres')

  const host = (await config.getString('POSTGRES_HOST')) || 'localhost'
  const port = parseInt((await config.getString('POSTGRES_PORT')) || '5432', 10)
  const user = (await config.getString('POSTGRES_USER')) || 'pipeline'
  const password = (await config.getString('POSTGRES_PASSWORD')) || ''
  const database = (await config.getString('POSTGRES_DB')) || 'pipeline_report'

  const pool = new Pool({
    host,
    port,
    user,
    password,
    database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  })

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client', { error: err.message })
  })

  return {
    async start() {
      logger.info('Connecting to PostgreSQL', { host, database })
      try {
        const client = await pool.connect()
        client.release()
        logger.info('PostgreSQL connected successfully')
      } catch (error: any) {
        logger.error('Failed to connect to PostgreSQL', { error: error.message })
        throw error
      }
    },

    async stop() {
      logger.info('Closing PostgreSQL pool')
      await pool.end()
    },

    async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
      const start = Date.now()
      try {
        const result = await pool.query<T>(text, params)
        const duration = Date.now() - start
        logger.debug('Executed query', {
          text: text.substring(0, 100),
          duration,
          rows: result.rowCount ?? 0
        })
        return result
      } catch (error: any) {
        logger.error('Query error', {
          text: text.substring(0, 100),
          error: error.message
        })
        throw error
      }
    },

    getPool(): Pool {
      return pool
    }
  }
}
