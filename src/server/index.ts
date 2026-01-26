import { Lifecycle } from '@well-known-components/interfaces'
import { initComponents } from './components'
import { main } from './service'

// Bootstrap the server
Lifecycle.run({ main, initComponents })
