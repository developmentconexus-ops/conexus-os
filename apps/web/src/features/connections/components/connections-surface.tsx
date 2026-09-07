import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { R2RequestError } from '../../r2-response'
import {
  connectionQualificationQueryKey,
  connectionQueryKey,
  connectionsQueryKey,
  connectorDefinitionQueryKey,
  connectorDefinitionsQueryKey,
  createConnection,
  getConnection,
  getConnectionQualification,
  getConnectorDefinition,
  listConnections,
  listConnectorDefinitions,
  qualifyConnection,
  reviseConnection,
  setConnectionCredential,
} from '../api'
import type {
  Connection,
  ConnectionOwnerScope,
  ConnectionSummary,
  ConnectorDefinition,
  CreateConnectionInput,
  QualifyConnectionInput,
} from '../api'

type CreateConnectionAttempt = Readonly<{
  fingerprint: string
  input: CreateConnectionInput
  idempotencyKey: string
}>

type QualificationAttempt = Readonly<{
  fingerprint: string
  input: QualifyConnectionInput
  idempotencyKey: string
}>

const testStateLabels = {
  NOT_TESTED: 'Não testada',
  NEEDS_RETEST: 'Precisa de novo teste',
  PASSED: 'Teste aprovado',
  FAILED: 'Teste falhou',
  INDETERMINATE: 'Teste inconclusivo',
} as const

const requestMessage = (error: Error, action: string) => {
  const status = error instanceof R2RequestError ? error.status : null
  if (status === 401) return 'Sua sessão não confirmou esta operação. Entre novamente.'
  if (status === 403) return `O servidor não autorizou ${action}.`
  if (status === 404) return 'O servidor não revelou o recurso solicitado.'
  if (status === 412) return 'A configuração mudou. Recarregue, revise a versão atual e tente novamente.'
  if (status === 409) return 'O estado atual conflita com esta operação. Recarregue antes de tentar novamente.'
  if (status === 422) return 'Os dados não foram aceitos. Revise os campos e tente novamente.'
  if (status === 503) return 'O teste não pôde ser executado agora. Isso não significa que a conexão falhou.'
  return `Não foi possível ${action}. Nenhuma confirmação local foi criada.`
}

const sankhyaConfiguration = (configuration: Record<string, unknown>) => {
  if (
    (configuration.environment !== 'SANDBOX' && configuration.environment !== 'PRODUCTION') ||
    !Number.isSafeInteger(configuration.companyCode) || Number(configuration.companyCode) < 1
  ) return null
  return { environment: configuration.environment, companyCode: Number(configuration.companyCode) } as const
}

const isCurrentSankhyaDefinition = (definition: Pick<ConnectorDefinition, 'connectorDefinitionId' | 'connectorVersion'>) => (
  definition.connectorDefinitionId === 'sankhya-om' && definition.connectorVersion === '1.0.0'
)

function TestState({ connection }: { connection: ConnectionSummary | Connection }) {
  return (
    <p className="connection-state" data-state={connection.connectionTest.state}>
      <strong>{testStateLabels[connection.connectionTest.state]}</strong>
      {connection.connectionTest.testedAt && <span>Testada em {new Date(connection.connectionTest.testedAt).toLocaleString()}</span>}
    </p>
  )
}

function CollectionFailure({ error, retry }: { error: Error; retry: () => void }) {
  const status = error instanceof R2RequestError ? error.status : null
  if (status === 403 || status === 404) {
    return <div className="empty"><h2>Connections não divulgadas</h2><p>Isso não confirma se existem Connections neste escopo.</p></div>
  }
  return (
    <div className="empty">
      <h2>Não foi possível consultar Connections</h2>
      <p>A falha não representa uma coleção vazia.</p>
      <button type="button" onClick={retry}>Tentar novamente</button>
    </div>
  )
}

function SankhyaConfigurationFields({
  definition,
  environment,
  companyCode,
  onEnvironment,
  onCompanyCode,
}: {
  definition: ConnectorDefinition
  environment: string
  companyCode: string
  onEnvironment: (value: string) => void
  onCompanyCode: (value: string) => void
}) {
  const environmentId = useId()
  const companyId = useId()
  return (
    <>
      <label htmlFor={environmentId}>Ambiente</label>
      <select id={environmentId} value={environment} onChange={(event) => onEnvironment(event.target.value)} required>
        {definition.environments.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <label htmlFor={companyId}>Código da empresa</label>
      <input id={companyId} inputMode="numeric" type="number" min="1" step="1" value={companyCode} onChange={(event) => onCompanyCode(event.target.value)} required />
    </>
  )
}

function CreateConnectionDialog({
  ownerScopeKind,
  ownerId,
  onClose,
  onCreated,
}: {
  ownerScopeKind: ConnectionOwnerScope
  ownerId: string
  onClose: () => void
  onCreated: (connectionId: string) => void
}) {
  const queryClient = useQueryClient()
  const dialog = useRef<HTMLDivElement>(null)
  const submitInFlight = useRef(false)
  const attempt = useRef<CreateConnectionAttempt | undefined>(undefined)
  const [name, setName] = useState('')
  const [definitionId, setDefinitionId] = useState('')
  const [environment, setEnvironment] = useState('')
  const [companyCode, setCompanyCode] = useState('1')
  const definitions = useQuery({ queryKey: connectorDefinitionsQueryKey, queryFn: listConnectorDefinitions })
  const definitionSummary = definitions.data?.data.find((item) => item.connectorDefinitionId === definitionId)
  const definition = useQuery({
    queryKey: connectorDefinitionQueryKey(definitionId),
    queryFn: () => getConnectorDefinition(definitionId),
    enabled: definitionId.length > 0,
  })
  const creation = useMutation({
    mutationFn: (current: CreateConnectionAttempt) => createConnection(
      ownerScopeKind,
      ownerId,
      current.input,
      current.idempotencyKey,
    ),
    onSuccess: async (result) => {
      attempt.current = undefined
      await queryClient.invalidateQueries({ queryKey: connectionsQueryKey(ownerScopeKind, ownerId) })
      onCreated(result.data.connectionId)
    },
    onSettled: () => {
      submitInFlight.current = false
    },
  })

  useEffect(() => dialog.current?.focus(), [])
  useEffect(() => {
    const first = definitions.data?.data[0]
    if (first && definitionId === '') setDefinitionId(first.connectorDefinitionId)
  }, [definitionId, definitions.data])
  useEffect(() => {
    const environments = definition.data?.data.environments
    const firstEnvironment = environments?.[0]
    if (firstEnvironment && !environments?.includes(environment)) setEnvironment(firstEnvironment)
  }, [definition.data, environment])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (submitInFlight.current) return
    if (!definitionSummary || !isCurrentSankhyaDefinition(definitionSummary)) return
    const input: CreateConnectionInput = {
      name: name.trim(),
      connectorDefinitionId: definitionSummary.connectorDefinitionId,
      connectorVersion: definitionSummary.connectorVersion,
      configuration: { environment, companyCode: Number(companyCode) },
    }
    const fingerprint = JSON.stringify(input)
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, input, idempotencyKey: crypto.randomUUID() }
    }
    submitInFlight.current = true
    creation.mutate(attempt.current)
  }

  return (
    <div className="surface-overlay" role="presentation">
      <div
        className="surface-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-connection-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
      >
        <div className="panel-heading">
          <div><p className="eyebrow">Nova Connection</p><h2 id="create-connection-title">Criar Connection</h2></div>
          <button type="button" onClick={onClose}>Cancelar</button>
        </div>
        {definitions.isPending ? <p role="status">Carregando conectores…</p> : definitions.isError ? (
          <p role="alert">{requestMessage(definitions.error, 'consultar os conectores')}</p>
        ) : definitions.data.data.length === 0 ? (
          <div className="empty"><h3>Nenhum conector divulgado</h3><p>Não há definição disponível para criar uma Connection.</p></div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="connection-name">Nome da Connection</label>
            <input id="connection-name" value={name} onChange={(event) => setName(event.target.value)} required />
            <label htmlFor="connector-definition">Conector</label>
            <select id="connector-definition" value={definitionId} onChange={(event) => setDefinitionId(event.target.value)} required>
              {definitions.data.data.map((item) => (
                <option key={`${item.connectorDefinitionId}@${item.connectorVersion}`} value={item.connectorDefinitionId}>{item.provider} · {item.connectorVersion}</option>
              ))}
            </select>
            {definition.isPending && <p role="status">Carregando configuração do conector…</p>}
            {definition.isError && <p role="alert">{requestMessage(definition.error, 'consultar a configuração do conector')}</p>}
            {definition.data && isCurrentSankhyaDefinition(definition.data.data) && (
              <SankhyaConfigurationFields
                definition={definition.data.data}
                environment={environment}
                companyCode={companyCode}
                onEnvironment={setEnvironment}
                onCompanyCode={setCompanyCode}
              />
            )}
            {definition.data && !isCurrentSankhyaDefinition(definition.data.data) && <p role="alert">Este conector não possui um formulário admitido nesta entrega.</p>}
            <button className="primary" type="submit" disabled={creation.isPending || !definition.data || !isCurrentSankhyaDefinition(definition.data.data) || !environment || !name.trim()}>
              {creation.isPending ? 'Criando…' : 'Criar Connection'}
            </button>
            {creation.isError && <p role="alert">{requestMessage(creation.error, 'criar a Connection')}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

function ConnectionPanel({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const panel = useRef<HTMLDivElement>(null)
  const reviseInFlight = useRef(false)
  const credentialInFlight = useRef(false)
  const qualifyInFlight = useRef(false)
  const credentialAttemptKey = useRef<string | undefined>(undefined)
  const qualificationAttempt = useRef<QualificationAttempt | undefined>(undefined)
  const [editingConfiguration, setEditingConfiguration] = useState(false)
  const [editingCredential, setEditingCredential] = useState(false)
  const [environment, setEnvironment] = useState('')
  const [companyCode, setCompanyCode] = useState('1')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [xToken, setXToken] = useState('')
  const [testEnvironment, setTestEnvironment] = useState('')
  const connection = useQuery({
    queryKey: connectionQueryKey(connectionId),
    queryFn: () => getConnection(connectionId),
  })
  const detail = connection.data?.data
  const definition = useQuery({
    queryKey: connectorDefinitionQueryKey(detail?.connectorDefinitionId ?? ''),
    queryFn: () => getConnectorDefinition(detail?.connectorDefinitionId ?? ''),
    enabled: detail !== undefined,
  })
  const resultId = connection.data?.data.connectionTest.qualificationId
  const persistedQualification = useQuery({
    queryKey: connectionQualificationQueryKey(connectionId, resultId ?? ''),
    queryFn: () => getConnectionQualification(connectionId, resultId ?? ''),
    enabled: resultId !== undefined,
  })
  const revision = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error('Connection não carregada')
      return reviseConnection(connectionId, {
        expectedCurrentRevisionId: detail.currentRevisionId,
        configuration: { environment, companyCode: Number(companyCode) },
      })
    },
    onSuccess: async () => {
      qualification.reset()
      setEditingConfiguration(false)
      await queryClient.invalidateQueries({ queryKey: connectionQueryKey(connectionId) })
      await queryClient.invalidateQueries({ queryKey: ['connections', 'scope'] })
    },
    onSettled: () => { reviseInFlight.current = false },
  })
  const credential = useMutation({
    mutationFn: () => {
      if (!credentialAttemptKey.current) credentialAttemptKey.current = crypto.randomUUID()
      return setConnectionCredential(connectionId, {
        credential: { clientId, clientSecret, xToken },
      }, credentialAttemptKey.current)
    },
    onSuccess: async () => {
      qualification.reset()
      credentialAttemptKey.current = undefined
      setEditingCredential(false)
      await queryClient.invalidateQueries({ queryKey: connectionQueryKey(connectionId) })
      await queryClient.invalidateQueries({ queryKey: ['connections', 'scope'] })
    },
    onSettled: () => {
      setClientId('')
      setClientSecret('')
      setXToken('')
      credentialInFlight.current = false
    },
  })
  const qualification = useMutation({
    mutationFn: (current: QualificationAttempt) => qualifyConnection(
      connectionId,
      current.input,
      current.idempotencyKey,
    ),
    onSuccess: async (result) => {
      qualificationAttempt.current = undefined
      queryClient.setQueryData(connectionQualificationQueryKey(connectionId, result.data.qualificationId), result)
      await queryClient.invalidateQueries({ queryKey: connectionQueryKey(connectionId) })
      await queryClient.invalidateQueries({ queryKey: ['connections', 'scope'] })
    },
    onSettled: () => { qualifyInFlight.current = false },
  })

  useEffect(() => panel.current?.focus(), [])
  useEffect(() => {
    if (!detail || editingConfiguration) return
    const current = sankhyaConfiguration(detail.configuration)
    if (!current) return
    setEnvironment(current.environment)
    setCompanyCode(String(current.companyCode))
  }, [detail, editingConfiguration])
  useEffect(() => {
    const options = definition.data?.data.environments
    const fallback = options?.[0]
    if (!options || !fallback) return
    const currentEnvironment = detail?.configuration.environment
    const next = typeof currentEnvironment === 'string' && options.includes(currentEnvironment) ? currentEnvironment : fallback
    if (!options.includes(testEnvironment)) setTestEnvironment(next)
  }, [definition.data, detail, testEnvironment])

  const qualificationCandidate = qualification.data ?? persistedQualification.data
  const qualificationIsCurrent = qualificationCandidate !== undefined
    && detail !== undefined
    && qualificationCandidate.data.connectionRevisionId === detail.currentRevisionId
    && qualificationCandidate.data.qualificationId === detail.connectionTest.qualificationId
    && ['PASSED', 'FAILED', 'INDETERMINATE'].includes(detail.connectionTest.state)
  const currentQualification = qualificationIsCurrent ? qualificationCandidate : undefined
  const currentConfiguration = detail ? sankhyaConfiguration(detail.configuration) : null

  return (
    <div className="surface-overlay connection-overlay" role="presentation">
      <aside
        className="connection-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-panel-title"
        tabIndex={-1}
        ref={panel}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
      >
        <div className="panel-heading">
          <div><p className="eyebrow">Connection</p><h2 id="connection-panel-title">{detail?.name ?? 'Carregando…'}</h2></div>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
        {connection.isPending ? <p role="status">Carregando a Connection…</p> : connection.isError ? (
          <div className="empty"><h3>Connection não disponível</h3><p>{requestMessage(connection.error, 'consultar a Connection')}</p><button type="button" onClick={() => void connection.refetch()}>Tentar novamente</button></div>
        ) : (
          <>
            <TestState connection={connection.data.data} />
            <section className="connection-work" aria-labelledby="connection-test-title">
              <h3 id="connection-test-title">Testar Connection</h3>
              <p>O teste usa a revisão atual e a credencial resolvida pelo servidor.</p>
              {definition.isPending ? <p role="status">Carregando ambientes…</p> : definition.isError ? (
                <p role="alert">{requestMessage(definition.error, 'consultar os ambientes')}</p>
              ) : definition.data && (
                <>
                  <label htmlFor="test-environment">Ambiente do teste</label>
                  <select id="test-environment" value={testEnvironment} onChange={(event) => setTestEnvironment(event.target.value)}>
                    {definition.data.data.environments.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <button type="button" disabled={qualification.isPending || !testEnvironment} onClick={() => {
                    if (qualifyInFlight.current) return
                    if (!detail) return
                    const input: QualifyConnectionInput = {
                      connectionRevisionId: detail.currentRevisionId,
                      environment: testEnvironment,
                    }
                    const fingerprint = JSON.stringify(input)
                    if (qualificationAttempt.current?.fingerprint !== fingerprint) {
                      qualificationAttempt.current = { fingerprint, input, idempotencyKey: crypto.randomUUID() }
                    }
                    qualifyInFlight.current = true
                    qualification.mutate(qualificationAttempt.current)
                  }}>{qualification.isPending ? 'Testando…' : 'Testar Connection'}</button>
                </>
              )}
              {qualification.isError && <p role="alert">{requestMessage(qualification.error, 'executar o teste')}</p>}
              {currentQualification && (
                <div className="qualification-result" role="status">
                  <strong>{currentQualification.data.diagnostic.title}</strong>
                  <p>{currentQualification.data.diagnostic.message}</p>
                  {currentQualification.data.diagnostic.remediation && <p><strong>Como resolver:</strong> {currentQualification.data.diagnostic.remediation}</p>}
                  <p>Resultado: {currentQualification.data.outcome}</p>
                  <details><summary>Evidências e identidade do teste</summary><code>{currentQualification.data.qualificationId}</code>{currentQualification.data.evidenceRefs.map((reference) => <code key={reference}>{reference}</code>)}</details>
                </div>
              )}
            </section>

            <section className="connection-work" aria-labelledby="configuration-title">
              <div className="work-heading"><h3 id="configuration-title">Configuração</h3>{!editingConfiguration && <button type="button" onClick={() => setEditingConfiguration(true)}>Editar</button>}</div>
              {editingConfiguration && definition.data && isCurrentSankhyaDefinition(definition.data.data) && currentConfiguration ? (
                <form onSubmit={(event) => {
                  event.preventDefault()
                  if (reviseInFlight.current) return
                  reviseInFlight.current = true
                  revision.mutate()
                }}>
                  <SankhyaConfigurationFields definition={definition.data.data} environment={environment} companyCode={companyCode} onEnvironment={setEnvironment} onCompanyCode={setCompanyCode} />
                  <div className="form-actions"><button className="primary" type="submit" disabled={revision.isPending}>Salvar configuração</button><button type="button" onClick={() => setEditingConfiguration(false)}>Cancelar</button></div>
                  {revision.isError && <p role="alert">{requestMessage(revision.error, 'salvar a configuração')}</p>}
                </form>
              ) : (
                currentConfiguration ? (
                  <dl className="fact-list"><div><dt>Ambiente</dt><dd>{currentConfiguration.environment}</dd></div><div><dt>Empresa</dt><dd>{currentConfiguration.companyCode}</dd></div></dl>
                ) : <p role="alert">A configuração atual não corresponde ao formulário Sankhya admitido e não foi reinterpretada pelo navegador.</p>
              )}
            </section>

            <section className="connection-work" aria-labelledby="access-title">
              <div className="work-heading"><h3 id="access-title">Acesso</h3>{!editingCredential && <button type="button" onClick={() => {
                credentialAttemptKey.current = undefined
                setEditingCredential(true)
              }}>Substituir credencial</button>}</div>
              <p>{connection.data.data.credentialConfigured ? 'Credencial configurada. O valor permanece protegido e não é exibido.' : 'Credencial ainda não configurada.'}</p>
              {editingCredential && (
                <form onSubmit={(event) => {
                  event.preventDefault()
                  if (credentialInFlight.current) return
                  credentialInFlight.current = true
                  credential.mutate()
                }}>
                  <label htmlFor="credential-client-id">Client ID</label>
                  <input id="credential-client-id" type="password" autoComplete="new-password" value={clientId} onChange={(event) => setClientId(event.target.value)} required />
                  <label htmlFor="credential-client-secret">Client Secret</label>
                  <input id="credential-client-secret" type="password" autoComplete="new-password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} required />
                  <label htmlFor="credential-token">X-Token</label>
                  <input id="credential-token" type="password" autoComplete="new-password" value={xToken} onChange={(event) => setXToken(event.target.value)} required />
                  <div className="form-actions"><button className="primary" type="submit" disabled={credential.isPending}>Salvar nova credencial</button><button type="button" onClick={() => { credentialAttemptKey.current = undefined; setClientId(''); setClientSecret(''); setXToken(''); setEditingCredential(false) }}>Cancelar</button></div>
                  {credential.isError && <p role="alert">{requestMessage(credential.error, 'substituir a credencial')}</p>}
                </form>
              )}
            </section>

            <details className="technical-details">
              <summary>Detalhes técnicos</summary>
              <dl className="fact-list">
                <div><dt>Connection</dt><dd><code>{connection.data.data.connectionId}</code></dd></div>
                <div><dt>Revisão atual</dt><dd><code>{connection.data.data.currentRevisionId}</code></dd></div>
                <div><dt>Conector</dt><dd><code>{connection.data.data.connectorDefinitionId}@{connection.data.data.connectorVersion}</code></dd></div>
              </dl>
            </details>
          </>
        )}
      </aside>
    </div>
  )
}

export function ConnectionsSurface({
  ownerScopeKind,
  ownerId,
  heading = 'Connections',
}: {
  ownerScopeKind: ConnectionOwnerScope
  ownerId: string
  heading?: string
}) {
  const filterId = useId()
  const createTrigger = useRef<HTMLButtonElement>(null)
  const selectedTrigger = useRef<HTMLButtonElement | null>(null)
  const restoreCreateFocus = useRef(false)
  const restorePanelFocus = useRef(false)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const connections = useQuery({
    queryKey: connectionsQueryKey(ownerScopeKind, ownerId),
    queryFn: () => listConnections(ownerScopeKind, ownerId),
  })
  const visible = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase()
    if (!needle) return connections.data?.data ?? []
    return (connections.data?.data ?? []).filter((connection) => (
      `${connection.name} ${connection.connectorDefinitionId}`.toLocaleLowerCase().includes(needle)
    ))
  }, [connections.data, filter])
  useEffect(() => {
    if (!creating && restoreCreateFocus.current) {
      restoreCreateFocus.current = false
      queueMicrotask(() => createTrigger.current?.focus())
    }
  }, [creating])
  useEffect(() => {
    if (selectedConnectionId === null && restorePanelFocus.current) {
      restorePanelFocus.current = false
      queueMicrotask(() => selectedTrigger.current?.focus())
    }
  }, [selectedConnectionId])
  const closeCreate = () => {
    restoreCreateFocus.current = true
    setCreating(false)
  }
  const closePanel = () => {
    restorePanelFocus.current = true
    setSelectedConnectionId(null)
  }

  return (
    <section className="connections-surface" aria-labelledby="connections-title">
      <div className="page-heading">
        <div><p className="eyebrow">Connection lifecycle</p><h1 id="connections-title">{heading}</h1></div>
        <button className="primary" type="button" ref={createTrigger} onClick={() => setCreating(true)}>Nova Connection</button>
      </div>
      <div className="connection-toolbar">
        <label htmlFor={filterId}>Buscar Connections divulgadas</label>
        <input id={filterId} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </div>
      {connections.isPending ? <p role="status">Carregando Connections…</p> : connections.isError ? (
        <CollectionFailure error={connections.error} retry={() => void connections.refetch()} />
      ) : connections.data.data.length === 0 ? (
        <div className="empty"><h2>Nenhuma Connection divulgada</h2><p>O servidor confirmou uma coleção vazia para este escopo.</p></div>
      ) : visible.length === 0 ? (
        <p role="status">Nenhuma Connection divulgada corresponde à busca local.</p>
      ) : (
        <ul className="connection-grid">
          {visible.map((connection) => (
            <li className="connection-card" key={connection.connectionId}>
              <div><h2>{connection.name}</h2><p>{connection.connectorDefinitionId} · {connection.connectorVersion}</p></div>
              <p>{connection.credentialConfigured ? 'Credencial configurada' : 'Credencial não configurada'}</p>
              <TestState connection={connection} />
              <button type="button" onClick={(event) => {
                selectedTrigger.current = event.currentTarget
                setSelectedConnectionId(connection.connectionId)
              }}>Abrir Connection</button>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateConnectionDialog ownerScopeKind={ownerScopeKind} ownerId={ownerId} onClose={closeCreate} onCreated={(connectionId) => {
        selectedTrigger.current = createTrigger.current
        setCreating(false)
        setSelectedConnectionId(connectionId)
      }} />}
      {selectedConnectionId && <ConnectionPanel connectionId={selectedConnectionId} onClose={closePanel} />}
    </section>
  )
}
