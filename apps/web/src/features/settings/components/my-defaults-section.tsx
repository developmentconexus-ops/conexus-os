import { Button } from '@mastra/playground-ui/components/Button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useBuilderModels } from '../../builder/mastra-session'
import {
  clearMyDefaults, type ModelDefaults, modelDefaultsQueryKey, readModelDefaults, saveMyDefaults,
} from '../model-accounts-api'
import { RoleModelSelect } from './role-model-select'
import { SectionError, SectionLoading, StatusLine } from './states'

const modelLabel = (id: string, models: readonly { id: string; provider: string; modelName: string }[]) => {
  const model = models.find((entry) => entry.id === id)
  return model ? `${model.provider} · ${model.modelName}` : id
}

export function MyDefaultsSection() {
  const defaults = useQuery({ queryKey: modelDefaultsQueryKey, queryFn: readModelDefaults })
  const models = useBuilderModels()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'company' | 'mine'>('company')
  const [build, setBuild] = useState('')
  const [fast, setFast] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!defaults.data) return
    setMode(defaults.data.mine ? 'mine' : 'company')
    setBuild(defaults.data.mine?.build ?? '')
    setFast(defaults.data.mine?.fast ?? '')
  }, [defaults.data])
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelDefaultsQueryKey })
  const save = useMutation({
    mutationFn: (value: ModelDefaults) => saveMyDefaults(value),
    onSuccess: () => { setMessage('Padrões salvos.'); refresh() },
    onError: () => setMessage('Não foi possível salvar.'),
  })
  const clear = useMutation({
    mutationFn: () => clearMyDefaults(),
    onSuccess: () => { setMessage('Voltou a usar os padrões da empresa.'); refresh() },
    onError: () => setMessage('Não foi possível salvar.'),
  })

  if (defaults.isPending || models.isPending) return <SectionLoading />
  if (defaults.isError) return <SectionError description="Não foi possível consultar seus padrões." onRetry={() => void defaults.refetch()} />

  const covered = (models.data ?? []).filter((model) => model.hasApiKey)
  if (covered.length === 0) return <p className="cxs-empty">Conecte uma conta de modelo para escolher seus padrões.</p>

  return <div className="cxs-defaults">
    <div className="cxs-toggle" role="radiogroup" aria-label="Origem dos meus padrões">
      <Button type="button" variant={mode === 'company' ? 'primary' : 'outline'} aria-pressed={mode === 'company'}
        onClick={() => { setMode('company'); if (defaults.data?.mine) clear.mutate() }}>
        Usar os padrões da empresa
      </Button>
      <Button type="button" variant={mode === 'mine' ? 'primary' : 'outline'} aria-pressed={mode === 'mine'} onClick={() => setMode('mine')}>
        Escolher os meus
      </Button>
    </div>
    {mode === 'company' && (
      defaults.data.installation
        ? <p>Construção: {modelLabel(defaults.data.installation.build, models.data ?? [])}. Rápido: {modelLabel(defaults.data.installation.fast, models.data ?? [])}.</p>
        : <p>A empresa ainda não definiu padrões.</p>
    )}
    {mode === 'mine' && <form className="cxs-form" onSubmit={(event) => { event.preventDefault(); save.mutate({ build, fast }) }}>
      <RoleModelSelect label="Construção" models={covered} value={build} onChange={setBuild} />
      <RoleModelSelect label="Rápido" models={covered} value={fast} onChange={setFast} />
      <Button type="submit" variant="primary" disabled={!build || !fast || save.isPending}>Salvar meus padrões</Button>
    </form>}
    {message && <StatusLine>{message}</StatusLine>}
    <p className="cxs-hint">Vale para conversas novas. Numa conversa, o seletor troca o modelo só dela.</p>
  </div>
}
