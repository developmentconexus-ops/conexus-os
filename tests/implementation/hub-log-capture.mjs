import { hubModuleUrl } from './hub-build.mjs'

const { logger } = await import(hubModuleUrl('platform/logger.js'))

const records = []
for (const level of ['info', 'warn', 'error']) {
  const write = logger[level].bind(logger)
  logger[level] = (fields, message) => {
    if (typeof message === 'string') records.push({ level, message, fields: fields ?? {} })
    return write(fields, message)
  }
}

/** The Hub logger's records since the last call: `{ level, message, fields }`, message being the code. */
export const takeHubLogs = () => records.splice(0)
