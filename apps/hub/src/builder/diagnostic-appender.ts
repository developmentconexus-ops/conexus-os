import { createHash } from 'node:crypto'
import type { AgentController } from '@mastra/core/agent-controller'
import { projectResourceId } from './conversations.js'
import type { RunNote } from './service.js'

// Deterministic on run+code so a retried call collapses onto the same message instead of
// appending a duplicate diagnostic.
const diagnosticMessageId = (builderRunId: string, code: string): string =>
  createHash('sha256').update(`builder-diagnostic:${builderRunId}:${code}`).digest('hex')

// The person reads a run by the first eight characters of its id; the failure code stays in the log.
const reference = (builderRunId: string): string => `Referência: ${builderRunId.slice(0, 8)}.`

// The next turn reads this thread, and an unadmitted run's tool calls in it describe edits that are
// in the conversation's files but not on `main`, so the note is written for the agent as much as for the person.
const kept = (sourceRevision: string): string =>
  `Os arquivos desta execução ficaram guardados nesta conversa, e a próxima execução continua deles, junto com a versão atual da fonte; a versão aplicada continua na revisão ${sourceRevision}. Leia os arquivos antes de confiar neste histórico.`

const NOTE_TEXT: Readonly<Record<RunNote['outcome'], (note: RunNote) => string>> = Object.freeze({
  SOURCE_BASE_MOVED: ({ builderRunId, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: a fonte do Project mudou enquanto ela trabalhava, e nada foi sobrescrito. ${kept(sourceRevision)} ${reference(builderRunId)} O próximo pedido junta os arquivos desta conversa com a versão atual da fonte.`,
  RUN_NOT_FINISHED: ({ builderRunId, sourceRevision }) =>
    `A execução ${builderRunId} não terminou e nada dela foi aplicado. ${kept(sourceRevision)} ${reference(builderRunId)}`,
  BUILD_FAILED: ({ builderRunId, detail }) =>
    `A execução ${builderRunId} preservou a fonte, mas a compilação falhou. ${reference(builderRunId)}${detail ? ` Detalhe: ${detail}` : ''} Corrija isso na próxima execução.`,
  PLATFORM_FAILED: ({ builderRunId }) =>
    `A execução ${builderRunId} preservou a fonte, mas o Conexus não conseguiu gerar a prévia por uma falha da própria plataforma, não da fonte. ${reference(builderRunId)} Não altere os arquivos por causa desta falha.`,
  CANDIDATE_REFUSED: ({ builderRunId, detail, sourceRevision }) =>
    `A execução ${builderRunId} não foi aplicada: o Conexus recusou o resultado antes de aprová-lo. ${kept(sourceRevision)} ${reference(builderRunId)}${detail ? ` Motivo: ${detail}` : ''} Corrija isso na próxima execução.`,
  BOOT_PROBLEMS: ({ builderRunId, detail }) =>
    `A execução ${builderRunId} foi aplicada e a Prévia está no ar, mas ao abrir o app o Conexus viu problemas.${detail ? ` Detalhe: ${detail}` : ''} Corrija isso na próxima execução.`,
  PREVIEW_DATA_RESET: ({ builderRunId }) =>
    `A execução ${builderRunId} mudou migrações que já tinham sido aplicadas, então os dados da Preview deste Project foram apagados e todas as migrações rodaram de novo.`,
})

type NoteSession = Pick<Awaited<ReturnType<AgentController['createSession']>>, 'sendSignalToThread'>

/**
 * A `notification` signal is Mastra's system notice for a thread (`sendSignalToThread`, planned as
 * 6b in docs/reference/mastra-boundary.md): the next turn's model reads it as
 * `<notification source="conexus" ...>` context, and the thread stores it as a `signal` row the
 * browser renders as a notice, never as the Builder speaking. Its id is deterministic, so a retry
 * writes it once.
 */
const noteSignal = (note: RunNote) => ({
  id: diagnosticMessageId(note.builderRunId, note.code),
  type: 'notification' as const,
  contents: NOTE_TEXT[note.outcome](note),
  attributes: { source: 'conexus', outcome: note.outcome, run: note.builderRunId },
})

export const createDiagnosticAppender = (openSession: (target: Readonly<{ resourceId: string; threadId: string }>) => Promise<NoteSession>) =>
  async (note: RunNote): Promise<void> => {
    const target = { resourceId: projectResourceId(note.projectId), threadId: note.conversationId }
    await (await openSession(target)).sendSignalToThread(noteSignal(note), target).accepted
  }
