import { useEffect, useRef, useState } from 'react'
import { observeChange, type ObservationPart } from '../observation'

const activities = { READ_FILES: 'Ler arquivos', EDIT_FILES: 'Editar arquivos', RUN_COMMAND: 'Executar comando', WORKSPACE: 'Trabalhar no projeto' }
const states = { started: 'em andamento', succeeded: 'concluído', failed: 'falhou', interrupted: 'interrompido' }
const phases = { CODING: 'Construindo o aplicativo…', PREPARING: 'Preparando o aplicativo…', VERIFYING: 'Verificando o resultado…', CORRECTING: 'Corrigindo o resultado…' }

export function BuilderConversation({ projectId, changeId, intent, summary }: { projectId: string; changeId: string; intent: string | undefined; summary?: string | null | undefined }) {
  const viewport = useRef<HTMLElement>(null)
  const follow = useRef(true)
  const [parts, setParts] = useState<readonly ObservationPart[]>([])
  const [status, setStatus] = useState<'connecting' | 'observing' | 'ended' | 'unavailable'>('connecting')
  useEffect(() => {
    const controller = new AbortController()
    void observeChange(projectId, changeId, controller.signal, (next) => {
      setParts(next)
      setStatus('observing')
    }).then(() => {
      if (!controller.signal.aborted) setStatus('ended')
    }, () => {
      if (!controller.signal.aborted) setStatus('unavailable')
    })
    return () => controller.abort()
  }, [projectId, changeId])
  useEffect(() => {
    if (parts.length && follow.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [parts])
  return <section ref={viewport} className="builder-conversation" aria-label="Acompanhamento do Builder" onScroll={(event) => {
    const element = event.currentTarget
    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64
  }}>
    {intent && <p className="builder-request"><strong>Você</strong><br />{intent}</p>}
    {parts.map((part) => part.kind === 'text'
      ? <p key={`text-${part.id}`} className="builder-message">{part.text}</p>
      : part.kind === 'activity'
        ? <p key={`activity-${part.id}`} className="builder-activity" data-activity-id={part.id} data-state={part.state}>{activities[part.label]} — {states[part.state]}</p>
        : <p key={part.id} className="builder-phase">{phases[part.phase]}</p>)}
    {summary && !parts.some((part) => part.kind === 'text') && <p className="builder-message">{summary}</p>}
    {!summary && status === 'connecting' && <p role="status">Conectando ao acompanhamento…</p>}
    {!summary && status === 'unavailable' && <p role="status">Acompanhamento ao vivo indisponível. O resultado continua sendo consultado; isso não interrompe o Builder.</p>}
  </section>
}
