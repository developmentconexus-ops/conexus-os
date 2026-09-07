import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  connectionQueryKey,
  connectionsQueryKey,
  getConnection,
  listConnections,
} from '../../connections/api'
import type { ConnectionSummary } from '../../connections/api'
import { ConnectionsSurface } from '../../connections/components/connections-surface'
import { R2RequestError } from '../../r2-response'
import {
  listProjectConnectionBindings,
  projectConnectionBindingsQueryKey,
  removeProjectConnectionBinding,
  setProjectConnectionBinding,
} from '../api'
import type { ProjectConnectionBinding } from '../api'

type Choice = Readonly<{
  connection: ConnectionSummary
  environment: string
}>

function mutationFailure(error: unknown, action: 'use' | 'remove') {
  if (!(error instanceof R2RequestError)) return 'A resposta do servidor não foi confirmada. Consulte novamente o uso atual.'
  if (error.status === 403) return action === 'use'
    ? 'A autoridade atual não permite usar esta Connection no Project.'
    : 'A autoridade atual não permite remover este uso do Project.'
  if (error.status === 404) return 'O servidor não divulgou o Project, a Connection ou o uso solicitado.'
  if (error.status === 409 || error.status === 412) return 'O uso mudou desde a leitura. Atualize o estado antes de tentar novamente.'
  if (error.status === 422) return 'A revisão ou o ambiente da Connection não foi aceito para este Project.'
  return 'A alteração não foi confirmada. Consulte novamente o uso atual antes de repetir.'
}

function admittedChoices(connections: readonly ConnectionSummary[]): Choice[] {
  return connections.flatMap((connection) => {
    const environment = connection.connectionTest.environment
    return connection.connectionTest.state === 'PASSED' && environment
      ? [{ connection, environment }]
      : []
  })
}

export function ProjectIntegrations({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const queryClient = useQueryClient()
  const choiceTrigger = useRef<HTMLButtonElement>(null)
  const choicePanel = useRef<HTMLElement>(null)
  const detailPanel = useRef<HTMLElement>(null)
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const restoreChoiceFocus = useRef(false)
  const restoreDetailFocus = useRef(false)
  const [choiceOpen, setChoiceOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const bindings = useQuery({
    queryKey: projectConnectionBindingsQueryKey(projectId),
    queryFn: () => listProjectConnectionBindings(projectId),
  })
  const workspaceChoices = useQuery({
    queryKey: connectionsQueryKey('WORKSPACE', workspaceId, projectId),
    queryFn: () => listConnections('WORKSPACE', workspaceId, projectId),
    enabled: choiceOpen,
  })
  const projectChoices = useQuery({
    queryKey: connectionsQueryKey('PROJECT', projectId, projectId),
    queryFn: () => listConnections('PROJECT', projectId, projectId),
    enabled: choiceOpen,
  })
  const selectedConnection = useQuery({
    queryKey: connectionQueryKey(selectedConnectionId ?? ''),
    queryFn: () => getConnection(selectedConnectionId ?? ''),
    enabled: selectedConnectionId !== null,
  })
  const confirmedBindings = bindings.isSuccess ? bindings.data.data : undefined

  useEffect(() => {
    if (choiceOpen) choicePanel.current?.focus()
  }, [choiceOpen])

  useEffect(() => {
    if (selectedConnectionId) detailPanel.current?.focus()
  }, [selectedConnectionId])
  useEffect(() => {
    if (!choiceOpen && restoreChoiceFocus.current) {
      restoreChoiceFocus.current = false
      queueMicrotask(() => choiceTrigger.current?.focus())
    }
  }, [choiceOpen])
  useEffect(() => {
    if (selectedConnectionId === null && restoreDetailFocus.current) {
      restoreDetailFocus.current = false
      queueMicrotask(() => detailTrigger.current?.focus())
    }
  }, [selectedConnectionId])

  const closeChoice = () => {
    restoreChoiceFocus.current = true
    setChoiceOpen(false)
  }

  const closeDetail = () => {
    restoreDetailFocus.current = true
    setSelectedConnectionId(null)
  }

  const refreshUse = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectConnectionBindingsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey('WORKSPACE', workspaceId, projectId) }),
      queryClient.invalidateQueries({ queryKey: connectionsQueryKey('PROJECT', projectId, projectId) }),
    ])
  }

  const adopt = useMutation({
    mutationFn: ({ connection, environment }: Choice) => {
      const current = confirmedBindings?.find((binding) => binding.connectionId === connection.connectionId)
      return setProjectConnectionBinding(projectId, {
        connectionId: connection.connectionId,
        connectionRevisionId: connection.currentRevisionId,
        environment,
        expectedCurrent: current
          ? {
              state: 'PRESENT',
              connectionRevisionId: current.connectionRevisionId,
              environment: current.environment,
            }
          : { state: 'ABSENT' },
      })
    },
    onSuccess: async () => {
      setNotice('O uso da revisão e do ambiente exatos foi confirmado pelo servidor.')
      closeChoice()
      await refreshUse()
    },
    onError: (error) => setNotice(mutationFailure(error, 'use')),
  })

  const remove = useMutation({
    mutationFn: (binding: ProjectConnectionBinding) => removeProjectConnectionBinding(projectId, {
      connectionId: binding.connectionId,
      expectedConnectionRevisionId: binding.connectionRevisionId,
      expectedEnvironment: binding.environment,
    }),
    onSuccess: async () => {
      setNotice('A remoção do uso foi confirmada; a Connection permanece inalterada.')
      closeDetail()
      await refreshUse()
    },
    onError: (error) => setNotice(mutationFailure(error, 'remove')),
  })

  const choices = [
    ...(workspaceChoices.isSuccess ? admittedChoices(workspaceChoices.data.data) : []),
    ...(projectChoices.isSuccess ? admittedChoices(projectChoices.data.data) : []),
  ]
  const choiceDisclosureFailed = workspaceChoices.isError || projectChoices.isError
  const detailUndisclosed = selectedConnection.isError
    && selectedConnection.error instanceof R2RequestError
    && [403, 404].includes(selectedConnection.error.status ?? 0)

  return (
    <div>
      <section aria-labelledby="project-integrations-heading">
        <p className="eyebrow">Integrations / uso atual</p>
        <h1 id="project-integrations-heading">Sistemas usados por este Project</h1>
        <p>O uso pertence ao Project. Configurar ou testar uma Connection não a adota automaticamente.</p>
        <button ref={choiceTrigger} className="primary" type="button" onClick={() => {
          setSelectedConnectionId(null)
          setChoiceOpen(true)
        }}>
          Usar Connection
        </button>
        {bindings.isPending && <p role="status">Consultando os usos atuais…</p>}
        {bindings.isError && (
          <div className="empty">
            <h2>Os usos atuais não foram divulgados</h2>
            <p>Isso não confirma que o Project não use Connections.</p>
            <button type="button" onClick={() => void bindings.refetch()}>Tentar novamente</button>
          </div>
        )}
        {confirmedBindings && confirmedBindings.length === 0 && (
          <div className="empty">
            <h2>Nenhum uso atual</h2>
            <p>O servidor confirmou que este Project não possui Connection vinculada.</p>
          </div>
        )}
        {confirmedBindings && confirmedBindings.length > 0 && (
          <ul className="project-grid">
            {confirmedBindings.map((binding) => (
              <li className="project-card" key={binding.connectionId}>
                <h2>{binding.connectionName}</h2>
                <p>Ambiente: {binding.environment}</p>
                <details>
                  <summary>Identidade técnica do uso</summary>
                  <code>{binding.connectionId}</code>
                  <code>{binding.connectionRevisionId}</code>
                </details>
                <div>
                  <button type="button" onClick={(event) => {
                    detailTrigger.current = event.currentTarget
                    setChoiceOpen(false)
                    setSelectedConnectionId(binding.connectionId)
                  }}>
                    Consultar detalhes da Connection
                  </button>
                  <button
                    type="button"
                    disabled={adopt.isPending || remove.isPending}
                    onClick={() => remove.mutate(binding)}
                  >
                    {remove.isPending && remove.variables?.connectionId === binding.connectionId ? 'Removendo uso…' : 'Remover uso do Project'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p role="status" aria-live="polite">{notice}</p>

        {selectedConnectionId && (
          <div className="surface-overlay connection-overlay" role="presentation">
            <aside
              className="connection-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="connection-detail-heading"
              tabIndex={-1}
              ref={detailPanel}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeDetail()
              }}
            >
            <h2 id="connection-detail-heading">Detalhes da Connection</h2>
            <button type="button" onClick={closeDetail}>Fechar detalhes</button>
            {selectedConnection.isPending && <p role="status">Consultando detalhes…</p>}
            {detailUndisclosed && <p>A configuração e as evidências de teste não foram divulgadas. Isso não indica que a Connection esteja ausente.</p>}
            {selectedConnection.isError && !detailUndisclosed && <p>Os detalhes estão indisponíveis; o uso do Project permanece uma verdade separada.</p>}
            {selectedConnection.isSuccess && (
              <dl>
                <div><dt>Nome</dt><dd>{selectedConnection.data.data.name}</dd></div>
                <div><dt>Escopo proprietário</dt><dd>{selectedConnection.data.data.ownerScopeKind}</dd></div>
                <div><dt>Revisão atual da Connection</dt><dd><code>{selectedConnection.data.data.currentRevisionId}</code></dd></div>
                <div><dt>Credencial configurada</dt><dd>{selectedConnection.data.data.credentialConfigured ? 'Sim' : 'Não'}</dd></div>
                <div><dt>Teste da revisão atual</dt><dd>{selectedConnection.data.data.connectionTest.state}</dd></div>
              </dl>
            )}
            </aside>
          </div>
        )}
      </section>

      {choiceOpen && <div className="surface-overlay connection-overlay" role="presentation"><aside
          className="connection-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="available-connections-heading"
          tabIndex={-1}
          ref={choicePanel}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeChoice()
          }}
        >
        <div className="panel-heading">
          <div>
        <p className="eyebrow">Adoção explícita</p>
        <h2 id="available-connections-heading">Connections elegíveis</h2>
          </div>
          <button type="button" onClick={closeChoice}>Fechar</button>
        </div>
        <p>Somente a ação abaixo altera o uso do Project; revisão nova ou teste aprovado continuam não adotados até essa confirmação.</p>
        {(workspaceChoices.isPending || projectChoices.isPending) && <p role="status">Consultando alternativas permitidas…</p>}
        {choiceDisclosureFailed && (
          <div className="empty">
            <p>Uma ou mais fontes de alternativas não foram divulgadas. Isso não confirma que não existam Connections elegíveis.</p>
            <button type="button" onClick={() => { void workspaceChoices.refetch(); void projectChoices.refetch() }}>Tentar novamente</button>
          </div>
        )}
        {!choiceDisclosureFailed && workspaceChoices.data && projectChoices.data && choices.length === 0 && (
          <p className="empty">O servidor confirmou que não há Connections aprovadas com ambiente divulgado para este Project.</p>
        )}
        {choices.length > 0 && (
          <ul className="project-grid">
            {choices.map((choice) => {
              const current = confirmedBindings?.find((binding) => binding.connectionId === choice.connection.connectionId)
              const alreadyCurrent = current?.connectionRevisionId === choice.connection.currentRevisionId
                && current.environment === choice.environment
              return (
                <li className="project-card" key={`${choice.connection.ownerScopeKind}-${choice.connection.connectionId}`}>
                  <h3>{choice.connection.name}</h3>
                  <p>{choice.connection.ownerScopeKind === 'WORKSPACE' ? 'Disponível pelo Workspace' : 'Privada deste Project'}</p>
                  <p>Revisão <code>{choice.connection.currentRevisionId}</code> / {choice.environment}</p>
                  <button
                    className="primary"
                    type="button"
                    disabled={alreadyCurrent || adopt.isPending || remove.isPending || !confirmedBindings}
                    onClick={() => adopt.mutate(choice)}
                  >
                    {alreadyCurrent ? 'Já usada nesta revisão' : adopt.isPending && adopt.variables.connection.connectionId === choice.connection.connectionId ? 'Confirmando uso…' : current ? 'Adotar revisão atual' : 'Usar no Project'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        </aside></div>}

      <ConnectionsSurface ownerScopeKind="PROJECT" ownerId={projectId} heading="Connections privadas deste Project" />
    </div>
  )
}
