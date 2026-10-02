import { exitOnSignals, installFatalHandlers } from './platform/lifecycle.js'

// Installed before hub.js loads, so a throw while its modules (Mastra among them) load is fatal and logged.
installFatalHandlers()
const { startHub } = await import('./hub.js')
exitOnSignals((await startHub()).close)
