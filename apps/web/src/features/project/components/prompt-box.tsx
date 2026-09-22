import { Button } from '@mastra/playground-ui/components/Button'
import { Composer, ComposerActions, ComposerBox, ComposerInput, ComposerRing } from '@mastra/playground-ui/components/Composer'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { toast } from '@mastra/playground-ui/components/Toaster'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUp } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { suggestProjectName, useStartProject } from '../start-project'
import type { StartedProject } from '../start-project'

export const EXAMPLE_IDEAS = [
  'Controle de pedidos de férias',
  'Cadastro de visitas a clientes',
  'Checklist de abertura da loja',
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
// description already sent as the first request.
export function PromptBox({ workspaceId, showExamples }: Readonly<{ workspaceId: string; showExamples: boolean }>) {
  const promptId = useId()
  const nameId = useId()
  const [description, setDescription] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const { start, mutation } = useStartProject(workspaceId)
  const openStarted = useOpenStartedProject()
  const seconds = useElapsedSeconds(mutation.isPending)
  const confirming = name !== null

  useEffect(() => {
    if (confirming) nameInput.current?.select()
  }, [confirming])

  const askForName = () => {
    const text = description.trim()
    if (!text) {
      setMessage('Descreva o aplicativo que você quer construir.')
      promptInput.current?.focus()
      return
    }
    setMessage('')
    setName(suggestProjectName(text))
  }

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    askForName()
  }

  const onPromptKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      askForName()
    }
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
    start({ name: projectName, description: description.trim() }, { onStarted: openStarted, onRefused: setMessage })
  }

  const pickExample = (idea: string) => {
    setDescription(idea)
    setName(null)
    promptInput.current?.focus()
  }

  return <section className="cx-prompt" aria-labelledby={`${promptId}-title`}>
    <h1 id={`${promptId}-title`} className="cx-prompt-title">O que vamos construir?</h1>
    <Composer className="cx-prompt-composer" onSubmit={submitPrompt} aria-labelledby={`${promptId}-title`}>
      <ComposerRing busy={mutation.isPending} className="cx-prompt-ring">
        <ComposerBox>
          <label htmlFor={promptId} className="sr-only">Descreva o aplicativo</label>
          <ComposerInput
            id={promptId}
            ref={promptInput}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              if (message) setMessage('')
            }}
            onKeyDown={onPromptKey}
            placeholder="Descreva o aplicativo: para quem é e o que ele precisa fazer…"
            disabled={mutation.isPending}
            rows={2}
          />
          <ComposerActions>
            <span className="cx-prompt-hint">Enter continua · Shift+Enter quebra linha</span>
            <button type="submit" className="cx-send" aria-label="Continuar" disabled={mutation.isPending || confirming}>
              <ArrowUp size={16} aria-hidden />
            </button>
          </ComposerActions>
        </ComposerBox>
      </ComposerRing>
    </Composer>

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
          <Button type="button" variant="ghost" size="lg" disabled={mutation.isPending} onClick={() => { setName(null); setMessage(''); promptInput.current?.focus() }}>
            Voltar
          </Button>
        </div>
      </form>
    )}
    <p className="cx-form-status cx-prompt-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">{message}</p>

    {showExamples && !confirming && (
      <div className="cx-prompt-examples">
        <span>Para começar, experimente:</span>
        <ul>
          {EXAMPLE_IDEAS.map((idea) => (
            <li key={idea}><button type="button" onClick={() => pickExample(idea)}>{idea}</button></li>
          ))}
        </ul>
      </div>
    )}
  </section>
}
