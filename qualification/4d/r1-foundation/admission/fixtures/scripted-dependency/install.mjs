import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

writeFileSync(resolve(process.cwd(), 'install-script-fired'), 'fired\n', { flag: 'wx' })
