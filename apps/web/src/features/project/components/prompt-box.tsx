import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { toast } from '@mastra/playground-ui/components/Toaster'
import { useNavigate } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { BuilderComposer, type ComposerMode } from '../../builder/composer/composer'
import { type ReasoningLevel, useBuilderModels } from '../../builder/mastra-session'
import { suggestProjectName } from '../project-name'
import { useStartProject } from '../start-project'
import type { StartedProject } from '../start-project'

export const EXAMPLE_IDEAS = [
  'Controle de pedidos de férias',
  'Checklist de abertura de loja com fotos',
  'Cadastro de visitas a clientes',
  'Simulador de orçamento',
] as const

export function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) {
      setSeconds(0)
      return undefined
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1_000)
    return () => window.clearInterval(timer)
  }, [running])
  return seconds
}

export function useOpenStartedProject() {
  const navigate = useNavigate()
  return ({ project, firstRequest }: StartedProject) => {
    if (firstRequest === 'REFUSED') {
      toast.warning('O Projeto foi criado, mas o primeiro pedido não foi enviado. Escreva de novo no Construir.')
    }
    void navigate({ to: '/projects/$projectId', params: { projectId: project.projectId } })
  }
}

export function creatingLabel(seconds: number): string {
  return seconds < 8 ? 'Criando o Projeto…' : `Criando o repositório no GitHub… ${seconds}s`
}

// The home's prompt: describe the app, confirm the suggested name, and land in Construir with the
// description already sent as the first request. The composer is the same component Construir
// uses, so the model picker, mic and glow behave identically on both surfaces.
export function PromptBox({ workspaceId, workspaceName, returning }: Readonly<{ workspaceId: string; workspaceName: string; returning: boolean }>) {
  const promptId = useId()
  const nameId = useId()
  const [description, setDescription] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [modelId, setModelId] = useState('')
  const [reasoning, setReasoning] = useState<ReasoningLevel | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const { start, mutation } = useStartProject(workspaceId)
  const openStarted = useOpenStartedProject()
  const seconds = useElapsedSeconds(mutation.isPending)
  const confirming = name !== null
  const models = useBuilderModels()
  const offeredModels = (models.data ?? []).filter((model) => model.hasApiKey)
  const modelReady = offeredModels.some((model) => model.id === modelId)
  // Construir reads its default from the conversation the server already gave one; there is no
  // conversation yet here, so the first model this account can actually use stands in for it.
  const firstOfferedModelId = offeredModels[0]?.id
  useEffect(() => {
    if (!modelId && firstOfferedModelId) setModelId(firstOfferedModelId)
  }, [modelId, firstOfferedModelId])

  useEffect(() => {
    if (confirming) nameInput.current?.select()
  }, [confirming])

  const onSend = (text: string) => {
    setMessage('')
    setName(suggestProjectName(text))
  }

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const projectName = (name ?? '').trim()
    if (!projectName) {
      setMessage('Dê um nome ao Projeto.')
      nameInput.current?.focus()
      return
    }
    setMessage('')
    start({ name: projectName, description: description.trim(), modelId: modelReady ? modelId : undefined, reasoning },
      { onStarted: openStarted, onRefused: setMessage })
  }

  const pickExample = (idea: string) => setDescription(idea)

  // Confirming the name pauses the composer without a mode of its own for "paused": BLOCKED reuses
  // the same disabled, non-empty-draft state a blocked repository would show, which this never is.
  const mode: ComposerMode = mutation.isPending ? { kind: 'SENDING' }
    : confirming ? { kind: 'BLOCKED' }
      : modelReady ? { kind: 'READY' } : { kind: 'NO_MODEL' }

  return <section className="cx-prompt" aria-labelledby={`${promptId}-title`}>
    <p className="cx-prompt-note">Workspace {workspaceName}{returning ? ' · você voltou para onde parou' : ''}</p>
    <h1 id={`${promptId}-title`} className="cx-prompt-title">O que vamos construir?</h1>
    <BuilderComposer
      draft={description}
      onDraftChange={(value) => { setDescription(value); if (message) setMessage('') }}
      onSend={onSend}
      onStop={() => {}}
      onNewConversation={() => { setDescription(''); setName(null) }}
      mode={mode}
      working={mutation.isPending}
      models={offeredModels}
      modelsPending={models.isPending}
      modelId={modelReady ? modelId : ''}
      onModelChange={setModelId}
      reasoning={reasoning}
      onReasoningChange={setReasoning}
    />

    {confirming && (
      <form className="cx-prompt-confirm" onSubmit={confirm} noValidate>
        <div className="cx-field">
          <Label htmlFor={nameId}>Nome do Projeto</Label>
          <Input id={nameId} ref={nameInput} size="lg" value={name ?? ''} onChange={(event) => setName(event.target.value)} disabled={mutation.isPending} />
        </div>
        <div className="cx-form-actions">
          <Button type="submit" variant="primary" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? <><ConexusMark size={16} working /> {creatingLabel(seconds)}</> : 'Criar e começar'}
          </Button>
          <Button type="button" variant="ghost" size="lg" disabled={mutation.isPending} onClick={() => { setName(null); setMessage('') }}>
            Voltar
          </Button>
        </div>
      </form>
    )}
    <p className="cx-form-status cx-prompt-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">{message}</p>

    {!confirming && (
      <div className="cx-prompt-examples">
        <ul>
          {EXAMPLE_IDEAS.map((idea) => (
            <li key={idea}><button type="button" onClick={() => pickExample(idea)}>{idea}</button></li>
          ))}
        </ul>
      </div>
    )}
  </section>
}
