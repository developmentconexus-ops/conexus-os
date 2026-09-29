import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@mastra/playground-ui/components/Select'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { type BuilderModel, useBuilderModels } from '../../builder/mastra-session'
import { humanizeModelName } from '../../builder/composer/model-display-name'
import { callModelAccounts as call } from '../model-accounts-api'
import { PageHeader } from './page-header'
import { SectionError, SectionLoading, StatusLine } from './states'

// The person's observational-memory settings, as `/api/control/model-accounts/memory` holds them:
// a null model is the conversation's own.
type MemorySettings = Readonly<{
  observerModelId: string | null
  reflectorModelId: string | null
  observationThreshold: number
  reflectionThreshold: number
}>

const memoryQueryKey = ['model-accounts', 'memory'] as const
const memoryUrl = '/api/control/model-accounts/memory'
const CONVERSATION_MODEL = 'conversation'
const THRESHOLD = { min: 1_000, max: 1_000_000 } as const

function ModelField({ label, hint, value, models, onChange }: Readonly<{
  label: string; hint: string; value: string | null; models: readonly BuilderModel[]; onChange: (modelId: string | null) => void
}>) {
  const id = useId()
  // A model chosen before its account was disconnected stays named, so the screen shows what is saved.
  const kept = value !== null && !models.some((model) => model.id === value) ? [{ value, label: value }] : []
  const items = [{ value: CONVERSATION_MODEL, label: 'O modelo da conversa' }, ...models.map((model) => ({ value: model.id, label: humanizeModelName(model.modelName) })), ...kept]
  return <div className="cxs-field">
    <label htmlFor={id}>{label}</label>
    <p className="cxs-hint">{hint}</p>
    <Select value={value ?? CONVERSATION_MODEL} onValueChange={(next) => onChange(next === CONVERSATION_MODEL ? null : String(next))} items={items}>
      <SelectTrigger id={id} className="cxs-field-control"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

function ThresholdField({ label, hint, value, onChange }: Readonly<{ label: string; hint: string; value: string; onChange: (value: string) => void }>) {
  const id = useId()
  return <div className="cxs-field">
    <label htmlFor={id}>{label}</label>
    <p className="cxs-hint">{hint}</p>
    <Input id={id} className="cxs-field-control" type="number" inputMode="numeric" min={THRESHOLD.min} max={THRESHOLD.max} step={1_000} value={value} onChange={(event) => onChange(event.target.value)} />
  </div>
}

const thresholdOf = (draft: string): number | null => {
  const value = Number(draft)
  return Number.isInteger(value) && value >= THRESHOLD.min && value <= THRESHOLD.max ? value : null
}

function MemoryForm({ saved, models }: Readonly<{ saved: MemorySettings; models: readonly BuilderModel[] }>) {
  const queryClient = useQueryClient()
  const [observerModelId, setObserver] = useState(saved.observerModelId)
  const [reflectorModelId, setReflector] = useState(saved.reflectorModelId)
  const [observation, setObservation] = useState(String(saved.observationThreshold))
  const [reflection, setReflection] = useState(String(saved.reflectionThreshold))
  const [message, setMessage] = useState<Readonly<{ text: string; failed: boolean }> | null>(null)
  const save = useMutation({
    mutationFn: (settings: MemorySettings) => call<{ settings: MemorySettings }>('PUT', memoryUrl, settings),
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(memoryQueryKey, { settings })
      setMessage({ text: 'Salvo. Vale a partir da próxima vez que o Builder trabalhar.', failed: false })
    },
    onError: () => setMessage({ text: 'Não foi possível salvar. Nada mudou.', failed: true }),
  })
  const observationThreshold = thresholdOf(observation)
  const reflectionThreshold = thresholdOf(reflection)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (observationThreshold === null || reflectionThreshold === null) return
    setMessage(null)
    save.mutate({ observerModelId, reflectorModelId, observationThreshold, reflectionThreshold })
  }
  return <form className="cxs-memory-form" onSubmit={submit}>
    <section aria-label="Modelos">
      <h2>Modelos</h2>
      <ModelField label="Quem observa" hint="Resume a conversa em observações quando as mensagens enchem." value={observerModelId} models={models} onChange={setObserver} />
      <ModelField label="Quem reflete" hint="Junta as observações num resumo mais curto quando elas enchem." value={reflectorModelId} models={models} onChange={setReflector} />
    </section>
    <section aria-label="Limites">
      <h2>Limites</h2>
      <ThresholdField label="Mensagens antes de observar" hint="Em tokens. Mais alto guarda mais conversa exata e custa mais por pedido." value={observation} onChange={setObservation} />
      <ThresholdField label="Observações antes de refletir" hint="Em tokens. Mais alto guarda mais detalhe na memória." value={reflection} onChange={setReflection} />
      {(observationThreshold === null || reflectionThreshold === null) && <StatusLine tone="danger">Use um número inteiro entre 1.000 e 1.000.000.</StatusLine>}
    </section>
    <div className="cxs-row-actions cxs-actions-start">
      <Button type="submit" variant="primary" disabled={save.isPending || observationThreshold === null || reflectionThreshold === null}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button>
    </div>
    {message && <StatusLine tone={message.failed ? 'danger' : 'positive'}>{message.text}</StatusLine>}
  </form>
}

/**
 * How the Builder remembers a long conversation: which model observes it and which reflects on the
 * observations, and how full each budget gets first. The Factory's memory settings, as ours.
 */
export function MemoryScreen() {
  const memory = useQuery({ queryKey: memoryQueryKey, queryFn: () => call<{ settings: MemorySettings }>('GET', memoryUrl), retry: false })
  const models = useBuilderModels()
  return <main className="cxs-page">
    <PageHeader title="Memória do Builder" lead="Numa conversa longa, o Builder resume o que já aconteceu para lembrar do que importa. Por padrão ele usa o modelo da própria conversa, pago pela sua conta." />
    {(memory.isPending || models.isPending) && <SectionLoading rows={4} />}
    {memory.isError && <SectionError description="Não foi possível ler as suas configurações de memória." onRetry={() => void memory.refetch()} />}
    {!memory.isError && models.isError && <SectionError description="Não foi possível ler os modelos que você pode usar." onRetry={() => void models.refetch()} />}
    {memory.data && models.data && <MemoryForm saved={memory.data.settings} models={models.data} />}
  </main>
}
