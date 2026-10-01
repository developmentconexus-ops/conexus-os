import './construir.css'
import { Button } from '@mastra/playground-ui/components/Button'
import { TaskListPt } from './task-list-pt'
import { ChatShell } from '@mastra/playground-ui/components/ChatShell'
import { Combobox } from '@mastra/playground-ui/components/Combobox'
import { MessageScrollerItem } from '@mastra/playground-ui/components/MessageScroller'
import { PanelGroup } from '@mastra/playground-ui/resize/panel-group'
import { PanelSeparator } from '@mastra/playground-ui/resize/separator'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppWindow, MessageSquare, SquarePen } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Panel, useDefaultLayout } from 'react-resizable-panels'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { BuilderRequestError, type BuilderRun, cancelBuilderRun, compareProjectSource, sendBuilderMessage } from '../api'
import { useBuilderSession } from '../builder-session'
import { BuilderConversation, type PersistedRequest } from '../components/builder-conversation'
import { BuilderComposer, type ComposerMode } from '../composer/composer'
import { failureReason } from '../failure-reasons'
import {
  answerPendingCall, type Conversation, type PromptEntry, useBuilderConversation, useBuilderModels, useConversationActions, useConversationStreamOpen,
  useProjectConversations, useSessionModel,
} from '../mastra-session'
import { localMessageId, type TaskSnapshot } from '../transcript.ts'
import { LensCode } from './lens-code'
import { changeBasisOf, LensDiff } from './lens-diff'
import { LensDetails } from './lens-details'
import { LensPreview } from './lens-preview'
import { PendingCard } from './pending-card'
import { previewWait } from './preview-wait'
import { ResultCard, showsResultCard } from './result-card'
import { clockLabel, isActive, statusLine, viewRun } from './run-state'
import { usePreview } from './use-preview'
import { WorkingState } from './working-state'

export const lenses = ['preview', 'code', 'diff', 'details'] as const
export type Lens = typeof lenses[number]

const lensTabs: readonly Readonly<{ lens: Lens; label: string }>[] = [
  { lens: 'preview', label: 'Prévia' },
  { lens: 'code', label: 'Código' },
  { lens: 'diff', label: 'Alterações' },
  { lens: 'details', label: 'Sobre' },
]

const conversationTitle = (conversation: Conversation): string => conversation.title?.trim() || 'Conversa sem título'

// runHistory arrives newest first; the conversation reads oldest first, and latestBuilderRun is the
// fresher copy of whichever run it repeats.
const persistedRequestsOf = (history: readonly BuilderRun[], latest: BuilderRun | null): readonly PersistedRequest[] => {
  const byId = new Map<string, BuilderRun>()
  for (const entry of [...history].reverse()) byId.set(entry.builderRunId, entry)
  if (latest) byId.set(latest.builderRunId, latest)
  return [...byId.values()].flatMap((entry) => !entry.requestText ? [] : [{
    runId: entry.builderRunId,
    text: entry.requestText,
    createdAt: entry.createdAt,
    reason: entry.state === 'FAILED' || entry.state === 'INTERRUPTED' ? failureReason(entry) : null,
  }])
}

// "Tarefas" alone while the agent has not written a count yet (TaskList's own default title),
// "n de m" once it has: the same counter Claude Code and Codex show above their own composer.
const taskListTitle = (tasks: readonly TaskSnapshot[]): string => {
  if (!tasks.length) return 'Tarefas'
  const completed = tasks.filter((task) => task.status === 'completed').length
  return `Tarefas · ${completed} de ${tasks.length}`
}

// Browser storage can be absent or refuse writes (private windows, blocked site data); the layout
// then simply starts from its defaults.
const guardedStorage = {
  getItem: (key: string): string | null => { try { return window.localStorage.getItem(key) } catch { return null } },
  setItem: (key: string, value: string): void => { try { window.localStorage.setItem(key, value) } catch { /* the default layout stays */ } },
}

const narrowQuery = '(max-width: 767px)'
const useNarrow = (): boolean => useSyncExternalStore(
  (notify) => {
    const query = window.matchMedia(narrowQuery)
    query.addEventListener('change', notify)
    return () => query.removeEventListener('change', notify)
  },
  () => window.matchMedia(narrowQuery).matches,
)

const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export function Construir({ projectId, conversationId, accountId, lens, onLensChange, onConversationChange }: Readonly<{
  projectId: string
  conversationId: string
  accountId: string
  lens: Lens
  onLensChange: (lens: Lens) => void
  onConversationChange: (conversationId: string) => void
}>) {
  const queryClient = useQueryClient()
  const narrow = useNarrow()
  const [pane, setPane] = useState<'stage' | 'chat'>('chat')
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  // The message this page sent for the run it started, until the thread shows it back.
  const [localSend, setLocalSend] = useState<Readonly<{ runId: string; localId: string }> | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const layout = useDefaultLayout({ id: `conexus-construir:${accountId}`, storage: guardedStorage, onlySaveAfterUserInteractions: true })

  const session = useBuilderSession(queryClient, projectId, conversationId, useConversationStreamOpen(projectId, conversationId))
  const latestRun = session.data?.latestBuilderRun
  const conversations = useProjectConversations(projectId, latestRun?.conversationId === conversationId && isActive(latestRun) ? conversationId : null)
  const conversationActions = useConversationActions(projectId)
  const conversation = conversations.data?.find((entry) => entry.id === conversationId) ?? null
  const models = useBuilderModels()
  const sessionModel = useSessionModel(projectId, conversationId)
  // A model without a key on the controller would fail the run, so it is never offered, and a
  // selection that lost its key counts as no selection rather than as a model the person can use.
  const offeredModels = (models.data?.models ?? []).filter((model) => model.hasApiKey)
  const modelReady = offeredModels.some((model) => model.id === sessionModel.modelId)

  const run = session.data?.latestBuilderRun ?? null
  const view = viewRun(run)
  const runHere = run && run.conversationId === conversationId ? run : null
  const runsById = new Map<string, BuilderRun>()
  for (const entry of session.data?.runHistory ?? []) runsById.set(entry.builderRunId, entry)
  if (run) runsById.set(run.builderRunId, run)
  const runs = [...runsById.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const selectedRun = (selectedRunId && runsById.get(selectedRunId)) || run
  const diffRun = selectedRunId ? runsById.get(selectedRunId) ?? null : runs.find((entry) => entry.resultSourceRevision) ?? null
  const diffBasis = changeBasisOf(diffRun)
  // Same query key as the Diff lens's own comparison fetch, so the tab's count and the lens itself
  // share one cache entry instead of asking the Hub twice.
  const diffCount = useQuery({
    queryKey: ['builder-source-compare', projectId, diffBasis?.baseSourceRevision, diffBasis?.resultSourceRevision],
    queryFn: () => compareProjectSource(projectId, diffBasis?.baseSourceRevision ?? '', diffBasis?.resultSourceRevision ?? ''),
    enabled: Boolean(diffBasis),
  })

  const thread = useBuilderConversation(projectId, conversationId, session.dataUpdatedAt)
  const { history, transcript, runtime } = thread
  // The run's own memory while it works here; the conversation's, as the Hub stored it, otherwise.
  const shownMemory = runHere && isActive(runHere) && runtime.memory ? runtime.memory : sessionModel.memory
  // A call stays parked on the person only while the run that parked it is still going.
  const pending = runHere && isActive(runHere) ? transcript.entries.filter((entry): entry is PromptEntry => entry.kind === 'prompt') : []

  // The message this page sent waits for the thread to show it back. Once its run settled and the
  // thread was read again, one never shown belongs to a run that stopped before its agent, and the
  // run's own request row says so instead.
  const localRun = localSend ? runsById.get(localSend.runId) : undefined
  const localSettled = Boolean(localRun && !isActive(localRun))
  const { refetch: refetchHistory } = history
  const { dispatch } = thread
  useEffect(() => {
    if (!localSend || !localSettled) return
    void refetchHistory().finally(() => {
      dispatch({ type: 'dropLocalUser', id: localSend.localId })
      setLocalSend(null)
    })
  }, [dispatch, localSend, localSettled, refetchHistory])

  // A send whose outcome is unknown keeps its key, so an identical retry lands on the run the first
  // attempt may have created; a clean refusal took no effect and its key is dropped.
  const retainedKey = useRef<Readonly<{ key: string; content: string }> | null>(null)
  // The message of the last send that failed, shown unsent until the person sends again.
  const unsent = useRef<string | null>(null)
  const send = useMutation({
    mutationFn: ({ content, key }: Readonly<{ content: string; key: string }>) => sendBuilderMessage(projectId, conversationId, content, key),
    onSuccess: async (accepted, { key }) => {
      retainedKey.current = null
      unsent.current = null
      setSendError(null)
      setLocalSend({ runId: accepted.builderRun.builderRunId, localId: localMessageId(key) })
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error, { content, key }) => {
      dispatch({ type: 'failLocalUser', id: localMessageId(key) })
      unsent.current = localMessageId(key)
      // The words go back to the composer, so sending again is one click.
      setDraft((current) => current === '' ? content : current)
      if (!(error instanceof BuilderRequestError && error.status === null)) retainedKey.current = null
      if (error instanceof BuilderRequestError && error.status === 409) setSendError('O Project está ocupado ou recebeu outra alteração. Aguarde e envie de novo.')
      else if (error instanceof BuilderRequestError && error.status === 403) setSendError('Você não tem permissão para construir neste Project.')
      else setSendError('Não foi possível enviar o pedido. Tente de novo.')
    },
  })
  // The message joins the thread the moment it is sent; the thread confirms it once the Hub has it.
  const sendMessage = (content: string): void => {
    const key = retainedKey.current?.content === content ? retainedKey.current.key : crypto.randomUUID()
    retainedKey.current = { key, content }
    if (unsent.current && unsent.current !== localMessageId(key)) dispatch({ type: 'dropLocalUser', id: unsent.current })
    unsent.current = null
    dispatch({ type: 'localUser', id: localMessageId(key), text: content })
    setDraft((current) => current === content ? '' : current)
    send.mutate({ content, key })
  }
  const cancel = useMutation({
    mutationFn: () => runHere ? cancelBuilderRun(projectId, runHere.builderRunId) : Promise.reject(new Error('BUILDER_RUN_NOT_READY')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] }),
    onError: () => setSendError('Não foi possível parar a execução. Tente de novo.'),
  })

  const preview = usePreview(projectId, session.data?.preview)
  const working = view.kind === 'ACTIVE'
  const now = useNow(working)
  // The Hub starts a new conversation from the person's defaults, else the installation's, and a
  // model chosen in one conversation stays with that conversation.
  const newConversation = () => conversationActions.create.mutate(undefined, { onSuccess: (created) => onConversationChange(created.id) })
  const switchConversation = (id: string) => { if (id !== conversationId) onConversationChange(id) }

  if (session.isError) {
    const denied = session.error instanceof BuilderRequestError && session.error.status === 403
    return <section className="cx-unavailable" role="alert">
      <ConexusMark size={32} />
      <h2>{denied ? 'Você não pode construir neste Project' : 'Não foi possível abrir o Construir'}</h2>
      <p>{denied ? 'Sua conta vê este Project, mas não tem permissão para construir nele. Peça acesso a um owner.' : 'O Conexus não conseguiu ler o estado deste Project agora.'}</p>
      {!denied && <Button onClick={() => void session.refetch()}>Tentar novamente</Button>}
    </section>
  }

  const composerMode: ComposerMode = runHere && isActive(runHere)
    ? { kind: 'RUNNING', stopping: cancel.isPending || runHere.cancellationRequested === true }
    : isActive(run) ? { kind: 'BUSY_ELSEWHERE' }
      : send.isPending ? { kind: 'SENDING' }
        : modelReady ? { kind: 'READY' } : { kind: 'NO_MODEL' }
  const hereView = viewRun(runHere)
  const headerLine = working
    ? `${runHere ? statusLine(view) : `${statusLine(view)} em outra conversa`}${pending.length ? ' · Aguardando você' : ''}`
    : statusLine(hereView)
  const settledHere = hereView.kind === 'SETTLED' ? hereView : null
  const persisted = persistedRequestsOf((session.data?.runHistory ?? []).filter((entry) => entry.conversationId === conversationId), runHere)
  const preview_ = session.data?.preview
  const sourceAhead = Boolean(preview_?.lastGoodSourceRevision && preview_.workingSourceRevision && preview_.workingSourceRevision !== preview_.lastGoodSourceRevision)
  // "Versão N" counts the Project's own code-changing runs, oldest first, regardless of which
  // conversation ran them: the version belongs to the app, not to the chat that produced it.
  const codeChangingRunsAsc = [...runs].filter(showsResultCard).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const resultVersion = runHere ? codeChangingRunsAsc.findIndex((entry) => entry.builderRunId === runHere.builderRunId) + 1 : 0
  const diffVersion = diffRun ? codeChangingRunsAsc.findIndex((entry) => entry.builderRunId === diffRun.builderRunId) + 1 : 0
  const resultCardShown = Boolean(settledHere && runHere && showsResultCard(runHere))

  const wait = view.kind === 'ACTIVE'
    ? previewWait(view, runHere ? { waiting: pending.length > 0, tasks: transcript.tasks } : { waiting: false, tasks: [] }, now)
    : null

  const stage = <section className="cx-stage" aria-label="Palco">
    <div className="cx-stagebar">
      <div className="cx-lenses" role="tablist" aria-label="Visões">
        {lensTabs.map((tab) => <button
          key={tab.lens}
          type="button"
          role="tab"
          id={`cx-lens-${tab.lens}`}
          aria-selected={lens === tab.lens}
          aria-controls="cx-lens-panel"
          tabIndex={lens === tab.lens ? 0 : -1}
          className="cx-lens"
          onClick={() => onLensChange(tab.lens)}
          onKeyDown={(event) => {
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
            if (!step) return
            const next = lensTabs[(lensTabs.findIndex((entry) => entry.lens === lens) + step + lensTabs.length) % lensTabs.length]
            if (!next) return
            onLensChange(next.lens)
            document.getElementById(`cx-lens-${next.lens}`)?.focus()
          }}
        >
          <span>{tab.label}</span>
          {tab.lens === 'diff' && Boolean(diffCount.data?.files.length) && <span className="cx-lens-count">+{diffCount.data?.files.length}</span>}
        </button>)}
      </div>
    </div>
    <div className="cx-lens-panel" id="cx-lens-panel" role="tabpanel" aria-labelledby={`cx-lens-${lens}`}>
      {session.isPending ? <div className="cx-preview-empty"><ConexusMark size={40} working /><p>Abrindo o Project…</p></div> : <>
        {/* The Preview stays mounted under the other lenses so its frame never reloads on a lens switch. */}
        <div className="cx-lens-layer" hidden={lens !== 'preview'}>
          <LensPreview preview={preview} view={view} wait={wait} history={runs} lastGoodSourceRevision={preview_?.lastGoodSourceRevision ?? null} sourceAhead={sourceAhead} />
        </div>
        {lens === 'code' && <LensCode projectId={projectId} sourceRevision={preview_?.workingSourceRevision ?? null} />}
        {lens === 'diff' && <LensDiff projectId={projectId} basis={diffBasis} requestText={diffRun?.requestText ?? null} requestTime={diffRun ? clockLabel(diffRun.createdAt) : null} version={diffVersion} />}
        {lens === 'details' && <LensDetails projectId={projectId} runs={runs} selected={selectedRun} onSelect={setSelectedRunId} preview={{ workingSourceRevision: preview_?.workingSourceRevision ?? null, lastGoodSourceRevision: preview_?.lastGoodSourceRevision ?? null }} onRetry={setDraft} />}
      </>}
    </div>
  </section>

  const chat = <ChatShell className="cx-chat" aria-label="Conversa" scroller={{ autoScroll: true, defaultScrollPosition: 'end' }}>
    <ChatShell.Bar className="cx-chat-head">
      <Combobox
        aria-label="Conversa"
        variant="ghost"
        size="sm"
        className="cx-conversation-switch"
        options={(conversations.data ?? []).map((entry) => ({ value: entry.id, label: conversationTitle(entry) }))}
        value={conversationId}
        onValueChange={switchConversation}
        placeholder={conversation ? conversationTitle(conversation) : 'Conversa'}
        searchPlaceholder="Buscar conversa"
        emptyText="Nenhuma conversa com esse nome"
      />
      <Button variant="ghost" size="icon-sm" tooltip="Nova conversa" aria-label="Nova conversa" disabled={conversationActions.create.isPending} onClick={newConversation}>
        <SquarePen size={16} aria-hidden="true" />
      </Button>
    </ChatShell.Bar>
    <ChatShell.Stage>
      <ChatShell.Viewport>
        <ChatShell.Content>
          <ChatShell.Column className="cx-messages">
            <MessageScrollerItem messageId="conversation">
              {history.isPending ? <p className="cx-lens-empty">Carregando a conversa…</p>
                : history.isError ? <div className="cx-note" role="alert"><p>Não foi possível ler esta conversa.</p><Button size="sm" onClick={() => void history.refetch()}>Tentar novamente</Button></div>
                  : <BuilderConversation
                    entries={transcript.entries}
                    persistedRequests={persisted}
                    failure={runHere ?? null}
                    working={Boolean(runHere && isActive(runHere) && runHere.phase === 'AGENT')}
                    model={offeredModels.find((entry) => entry.id === sessionModel.modelId) ?? null}
                    {...(runHere && isActive(runHere) ? {
                      renderPrompt: (entry: PromptEntry) => <PendingCard
                        key={entry.toolCallId}
                        pending={entry}
                        onAnswer={async (answer) => {
                          await answerPendingCall(projectId, runHere.conversationId, entry, answer)
                          dispatch({ type: 'resolvePrompt', toolCallId: entry.toolCallId })
                        }}
                      />,
                    } : {})}
                  />}
              {resultCardShown && runHere && <ResultCard
                projectId={projectId}
                run={runHere}
                versionNumber={resultVersion}
                onOpenPreview={() => onLensChange('preview')}
                onOpenDiff={() => onLensChange('diff')}
              />}
              {settledHere?.outcome === 'BASE_MOVED' && runHere?.requestText && <div className="cx-note">
                <p>Outra conversa mudou o app antes. Nada foi sobrescrito.</p>
                <Button size="sm" onClick={() => setDraft(runHere.requestText ?? '')}>Enviar de novo sobre a versão atual</Button>
              </div>}
              {(settledHere?.outcome === 'STOPPED' || settledHere?.outcome === 'DISCARDED') && <p className="cx-note-line">As alterações desta execução não foram aplicadas, mas os arquivos ficaram guardados nesta conversa e seguem no próximo pedido.</p>}
            </MessageScrollerItem>
          </ChatShell.Column>
        </ChatShell.Content>
        <ChatShell.Dock className="cx-dock">
      <ChatShell.ScrollButton aria-label="Ir para o fim da conversa" />
      <ChatShell.Column>
        {sendError && <p className="cx-composer-note" role="alert">{sendError}</p>}
        {/* Pinned above the working-state line, the Claude Code/Codex pattern: the agent's own
            task_write/task_update/task_check/task_complete calls, never the settled result of a
            run that has ended (hideWhenComplete, the primitive's own default) or a run with no
            list yet (hideWhenEmpty). */}
        {runHere && <TaskListPt className="cx-task-list" tasks={[...transcript.tasks]} title={taskListTitle(transcript.tasks)} />}
        {/* The result card already names a code-changing run's outcome; a settled working-state row
            underneath would just repeat "Alterou o app" a second time. */}
        {headerLine !== null && !resultCardShown && <WorkingState line={headerLine} working={working} elapsedMs={working && run ? now - new Date(run.createdAt).getTime() : null} />}
        <BuilderComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={sendMessage}
          onStop={() => { if (!cancel.isPending) cancel.mutate() }}
          onNewConversation={newConversation}
          mode={composerMode}
          working={working}
          models={offeredModels}
          modelsPending={models.isPending}
          modelId={modelReady ? sessionModel.modelId : ''}
          onModelChange={(modelId) => sessionModel.choose.mutate(modelId)}
          reasoning={sessionModel.reasoning ?? models.data?.defaultThinkingLevel ?? null}
          onReasoningChange={(level) => sessionModel.chooseReasoning.mutate(level)}
          memory={shownMemory}
          memoryFailed={runtime.memoryFailed}
        />
      </ChatShell.Column>
        </ChatShell.Dock>
      </ChatShell.Viewport>
    </ChatShell.Stage>
  </ChatShell>

  if (narrow) {
    return <div className="cx-construir" data-narrow>
      <nav className="cx-pane-switch" aria-label="Painel">
        <button type="button" aria-pressed={pane === 'stage'} onClick={() => setPane('stage')}><AppWindow size={15} aria-hidden="true" />App</button>
        <button type="button" aria-pressed={pane === 'chat'} onClick={() => setPane('chat')}>
          <MessageSquare size={15} aria-hidden="true" />Conversa{working && <><i className="cx-level-dot" aria-hidden="true" /><span className="cx-sr">, agente trabalhando</span></>}
        </button>
      </nav>
      {/* Both panes stay mounted, so the draft, the scroll position and the lens survive a switch. */}
      <div className="cx-pane" data-hidden={pane !== 'stage' || undefined} inert={pane !== 'stage'}>{stage}</div>
      <div className="cx-pane" data-hidden={pane !== 'chat' || undefined} inert={pane !== 'chat'}>{chat}</div>
    </div>
  }

  return <PanelGroup className="cx-construir" orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
    <Panel id="stage" minSize="360px" className="cx-split-panel">{stage}</Panel>
    <PanelSeparator />
    <Panel id="chat" defaultSize="380px" minSize="320px" maxSize="60%" groupResizeBehavior="preserve-pixel-size" className="cx-split-panel">{chat}</Panel>
  </PanelGroup>
}
