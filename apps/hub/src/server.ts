import { startHub } from './hub.js'
import { exitOnSignals, installFatalHandlers } from './platform/lifecycle.js'

installFatalHandlers()
exitOnSignals((await startHub()).close)
