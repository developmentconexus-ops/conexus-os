import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Textarea } from '@mastra/playground-ui/components/Textarea'
import { Link } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { useStartProject } from '../start-project'
import { creatingLabel, useElapsedSeconds, useOpenStartedProject } from './prompt-box'

// Novo Projeto: the same creation as the home's prompt, reached directly, with the description
// optional. With one, Construir opens with it already sent.
export function ProjectCreateForm({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const nameId = useId()
  const descriptionId = useId()
  const nameInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const { start, mutation } = useStartProject(workspaceId)
  const openStarted = useOpenStartedProject()
  const seconds = useElapsedSeconds(mutation.isPending)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    if (!name) {
      setMessage('Dê um nome ao Projeto.')
      nameInput.current?.focus()
      return
    }
    setMessage('')
    start({ name, description, modelId: undefined, reasoning: undefined }, { onStarted: openStarted, onRefused: setMessage })
  }

  return (
    <form className="cx-form" onSubmit={submit} noValidate>
      <div className="cx-field">
        <Label htmlFor={nameId}>Nome do Projeto</Label>
        <Input id={nameId} name="name" size="lg" required ref={nameInput} autoFocus disabled={mutation.isPending} />
      </div>
      <div className="cx-field">
        <Label htmlFor={descriptionId}>O que ele deve fazer (opcional)</Label>
        <Textarea id={descriptionId} name="description" rows={4} disabled={mutation.isPending} placeholder="Ex.: Um formulário para a equipe pedir férias e o gestor aprovar ou recusar." />
        <p className="cx-field-hint">Com uma descrição, o Conexus começa a construir assim que o Projeto é criado.</p>
      </div>
      <div className="cx-form-actions">
        <Button type="submit" variant="primary" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? <><ConexusMark size={16} working /> {creatingLabel(seconds)}</> : 'Criar Projeto'}
        </Button>
        <Button as={Link} to={`/workspaces/${workspaceId}/projects`} variant="ghost" size="lg">Cancelar</Button>
      </div>
      <p className="cx-form-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">{message}</p>
    </form>
  )
}
