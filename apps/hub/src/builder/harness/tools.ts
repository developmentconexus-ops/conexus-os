import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { checkReportSchema, type CheckReport } from '../application-check.js'
import { operationRunReportSchema, type RunOperation } from '../run-operation.js'

export const CHECK_TOOL = 'conexus_check'

const CHECK_DESCRIPTION = [
  "Runs Conexus's own check on the app in the checkout: it generates the client from the manifest, type checks `app/` and `conexus/`, builds the app, builds the server half and opens the app in a browser.",
  'Takes no input and returns one report: `ok`, each step as passed, failed (with its problems: file, line, message) or skipped, and counts.',
  'Run it at the end of each step of the work, and fix what a failed step lists before the next one.',
  'A passing report proves the app type checks, builds and opens. It does not prove that an operation returns the right data, that a screen shows the right values or that anything saves: prove those another way.',
].join(' ')

/** `conexus_check`: the run's check, run as the agent's user through the run's sandbox. */
export const createCheckTool = (runCheck: () => Promise<CheckReport>) => createTool({
  id: CHECK_TOOL,
  description: CHECK_DESCRIPTION,
  outputSchema: checkReportSchema,
  execute: async () => runCheck(),
})

export const RUN_OPERATION_TOOL = 'conexus_run_operation'

const RUN_OPERATION_DESCRIPTION = [
  'Runs one operation of the app you are building as the Prévia would, before Conexus saves the version: it builds the server half from the checkout and calls `operation` with `input` in the Prévia\'s runner, through this Project\'s Conexões, spending this run\'s Conexão calls. The caller is this run\'s account, with no email.',
  'Returns the shape of the answer, never its values: `lists` gives the number of items at each list path, and `fields` gives, for each field the output declares, how many values came back (`values`), how many are filled (`filled`: not null, absent or empty text) and how many are zero (`zeros`). `*` in a path stands for every item of a list.',
  'A refused call returns `code` and, when Conexus can show it, `detail`, such as the JSON pointer where the output broke its schema. A handler\'s own thrown message is never shown, because it can carry company data; a database error shows its SQLSTATE.',
  'Call read operations only: the Prévia\'s saved data is real, and an operation that saves writes into it. Migrations this run added are applied only when Conexus saves the version, so an operation that needs a new table fails here with SQLSTATE 42P01, and one that queries the database answers DATABASE_UNAVAILABLE while the Project has never had a Prévia with a server half.',
].join(' ')

/** `conexus_run_operation`: one operation of the candidate, run in the Prévia's runner and reported as a shape. */
export const createRunOperationTool = (runOperation: RunOperation) => createTool({
  id: RUN_OPERATION_TOOL,
  description: RUN_OPERATION_DESCRIPTION,
  inputSchema: z.strictObject({
    operation: z.string().regex(/^[a-z][A-Za-z0-9]{0,63}$/),
    input: z.record(z.string(), z.unknown()),
  }),
  outputSchema: operationRunReportSchema,
  execute: async (request) => runOperation(request),
})
