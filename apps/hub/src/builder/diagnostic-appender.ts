import { createHash } from 'node:crypto'
import { FAILURE_TEXT } from '../platform/failure-text.generated.js'
import { projectResourceId } from './conversations.js'
import type { ControllerSession, RunNote, SettledNote } from './run/ports.js'
import type { BuilderRunId, ConversationId, ProjectId, SourceRevision } from '@conexus/contract'

// Deterministic on run+code so a retried call collapses onto the same message instead of
// appending a duplicate diagnostic.
const diagnosticMessageId = (builderRunId: BuilderRunId, key: string): string =>
  createHash('sha256').update(`builder-diagnostic:${builderRunId}:${key}`).digest('hex')

// The person reads a run by the first eight characters of its id; the failure code stays in the log.
const reference = (builderRunId: BuilderRunId): string => `Referência: ${builderRunId.slice(0, 8)}.`

// The next turn reads this thread, and an unadmitted run's tool calls in it describe edits that are
// in the conversation's files but not on `main`, so the note is written for the agent as much as for the person.
const kept = (sourceRevision: SourceRevision): string =>
  `Os arquivos desta execução ficaram guardados nesta conversa, e a próxima execução continua deles, junto com a versão atual da fonte; a versão aplicada continua na revisão ${sourceRevision}. Leia os arquivos antes de confiar neste histórico.`

// What the table says for the run's failure; a code the table keeps for the operator says nothing here.
const rowText = (code: string): string => Object.entries(FAILURE_TEXT).find(([row]) => row === code)?.[1] ?? ''

const NOTE_TEXT: Readonly<Record<SettledNote['outcome'], (note: SettledNote) => string>> = Object.freeze({
  SOURCE_BASE_MOVED: ({ builderRunId, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: a fonte do Project mudou enquanto ela trabalhava, e nada foi sobrescrito. ${kept(sourceRevision)} ${reference(builderRunId)} O próximo pedido junta os arquivos desta conversa com a versão atual da fonte.`,
  RUN_NOT_FINISHED: ({ builderRunId, sourceRevision }) =>
    `A execução ${builderRunId} não terminou e nada dela foi aplicado. ${kept(sourceRevision)} ${reference(builderRunId)}`,
  BUILD_FAILED: ({ builderRunId, code, detail }) =>
    `A execução ${builderRunId} preservou a fonte. ${rowText(code)} ${reference(builderRunId)}${detail ? ` Detalhe: ${detail}` : ''} Resolva isso na próxima execução.`,
  PLATFORM_FAILED: ({ builderRunId, code }) =>
    `A execução ${builderRunId} preservou a fonte. ${rowText(code)} ${reference(builderRunId)} A fonte não é a causa: não altere os arquivos por isso.`,
  CANDIDATE_REFUSED: ({ builderRunId, code, detail, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada. ${rowText(code)} ${kept(sourceRevision)} ${reference(builderRunId)}${detail ? ` Motivo: ${detail}` : ''} Resolva isso na próxima execução.`,
  BOOT_PROBLEMS: ({ builderRunId, detail }) =>
    `A execução ${builderRunId} foi aplicada e a Prévia está no ar, mas ao abrir o app o Conexus viu problemas.${detail ? ` Detalhe: ${detail}` : ''} Resolva isso na próxima execução.`,
  PREVIEW_DATA_RESET: ({ builderRunId }) =>
    `A execução ${builderRunId} mudou migrações que já tinham sido aplicadas, então os dados da Preview deste Project foram apagados e todas as migrações foram reaplicadas.`,
})

type NoteSession = Pick<ControllerSession, 'sendSignalToThread'>

/**
 * A `notification` signal is Mastra's system notice for a thread (`sendSignalToThread`, planned as
 * 6b in docs/reference/mastra/boundary.md): the next turn's model reads it as
 * `<notification source="conexus" ...>` context, and the thread stores it as a `signal` row the
 * browser renders as a notice, never as the Builder speaking. Its id is deterministic, so a retry
 * writes it once.
 */
const noteSignal = (note: RunNote) => ({
  id: diagnosticMessageId(note.builderRunId, note.outcome === 'CHECK_RED' ? `CHECK_RED:${note.redFinishes}` : note.code),
  type: 'notification' as const,
  // The check's feedback is already written for the person and the agent; the rest comes from the table.
  contents: note.outcome === 'CHECK_RED' ? note.feedback : NOTE_TEXT[note.outcome](note),
  attributes: { source: 'conexus', outcome: note.outcome, run: note.builderRunId },
})

export const createDiagnosticAppender = (openSession: (conversation: Readonly<{ projectId: ProjectId; conversationId: ConversationId }>) => Promise<NoteSession>) =>
  async (note: RunNote): Promise<void> => {
    const target = { resourceId: projectResourceId(note.projectId), threadId: note.conversationId }
    await (await openSession(note)).sendSignalToThread(noteSignal(note), target).accepted
  }
