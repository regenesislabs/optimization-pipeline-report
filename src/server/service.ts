import { Lifecycle } from '@well-known-components/interfaces'
import { setupRoutes } from './controllers/routes'
import { AppComponents, GlobalContext } from './types'
import * as fs from 'fs'
import * as path from 'path'

// Main service function
export async function main(program: Lifecycle.EntryPointParameters<AppComponents>): Promise<void> {
  const { components, startComponents } = program
  const { server, logs } = components
  const logger = logs.getLogger('service')

  // Set up global context
  const globalContext: GlobalContext = { components }

  // Middleware to inject components into request context
  server.use(async (context, next) => {
    (context as any).components = components
    return next()
  })

  // Set up routes - use router.middleware() to get the request handler
  const router = await setupRoutes(globalContext)
  server.use(router.middleware())
  server.use(router.allowedMethods())

  // Serve static files if public directory exists
  const publicPath = path.resolve(process.cwd(), 'public')
  if (fs.existsSync(publicPath)) {
    logger.info('Serving static files from', { path: publicPath })

    // Serve static files
    server.use(async (context, next) => {
      const { url } = context
      const pathname = url.pathname

      // Skip API routes
      if (pathname.startsWith('/api/') || pathname === '/health') {
        return next()
      }

      // Try to serve static file
      const filePath = path.join(publicPath, pathname === '/' ? 'index.html' : pathname)

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase()
        const contentType = getContentType(ext)
        const content = fs.readFileSync(filePath)

        return {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
          },
          body: content
        }
      }

      // SPA fallback - serve index.html for non-file routes
      const indexPath = path.join(publicPath, 'index.html')
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath)
        return {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache'
          },
          body: content
        }
      }

      return next()
    })
  }

  // Start all components
  await startComponents()

  logger.info('Server started successfully')
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  }
  return types[ext] || 'application/octet-stream'
}
