import { Button } from '@mastra/playground-ui/components/Button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@mastra/playground-ui/components/Collapsible'
import { RadioGroup, RadioGroupItem } from '@mastra/playground-ui/components/RadioGroup'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { providerIcon } from '../../builder/composer/model-order'
import { useBuilderModels } from '../../builder/mastra-session'
import {
  clearMyDefaults, type ModelDefaults, type ModelPack, modelDefaultsQueryKey, modelPacksQueryKey,
  readModelDefaults, readModelPacks, saveMyDefaults,
} from '../model-accounts-api'
import { RoleModelSelect } from './role-model-select'
import { SectionError, SectionLoading, StatusLine } from './states'

type Selection = 'company' | 'custom' | `pack:${string}`
type CoveredModel = Readonly<{ id: string; provider: string; modelName: string }>

const modelInfo = (id: string, models: readonly CoveredModel[]) => models.find((entry) => entry.id === id)

function ModelBadge({ id, models }: Readonly<{ id: string; models: readonly CoveredModel[] }>) {
  const model = modelInfo(id, models)
  const provider = model?.provider ?? id.split('/')[0] ?? id
  const Icon = providerIcon(provider)
  return <span className="cxs-model-badge"><Icon className="cxs-model-icon" aria-hidden="true" />{model?.modelName ?? id}</span>
}

export function MyDefaultsSection() {
  const defaults = useQuery({ queryKey: modelDefaultsQueryKey, queryFn: readModelDefaults })
  const packs = useQuery({ queryKey: modelPacksQueryKey, queryFn: readModelPacks })
  const models = useBuilderModels()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Selection>('company')
  const [build, setBuild] = useState('')
  const [fast, setFast] = useState('')
  const [fastTouched, setFastTouched] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!defaults.data) return
    const mine = defaults.data.mine
    if (!mine) { setSelected('company'); return }
    const pack = (packs.data?.packs ?? []).find((candidate) => !candidate.custom && candidate.models.build === mine.build && candidate.models.fast === mine.fast)
    setSelected(pack ? `pack:${pack.id}` : 'custom')
    setBuild(mine.build)
    setFast(mine.fast)
    setFastTouched(mine.fast !== mine.build)
  }, [defaults.data, packs.data])

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

  if (defaults.isPending || models.isPending || packs.isPending) return <SectionLoading />
  if (defaults.isError) return <SectionError description="Não foi possível consultar seus padrões." onRetry={() => void defaults.refetch()} />
  if (packs.isError) return <SectionError description="Não foi possível consultar os pacotes do provedor." onRetry={() => void packs.refetch()} />

  const covered = (models.data ?? []).filter((model) => model.hasApiKey)
  if (covered.length === 0) return <p className="cxs-empty">Conecte uma conta de modelo para escolher seus padrões.</p>

  const recommendedPacks = (packs.data?.packs ?? []).filter((pack) => !pack.custom)
  const mine = defaults.data.mine
  const activePack = mine ? recommendedPacks.find((pack) => pack.models.build === mine.build && pack.models.fast === mine.fast) : null
  const effectiveBuild = mine?.build ?? defaults.data.installation?.build ?? null
  const effectiveFast = mine?.fast ?? defaults.data.installation?.fast ?? null
  const origin = !mine ? 'da empresa' : activePack ? `do pacote ${activePack.name}` : 'escolhido por você'

  const choosePack = (pack: ModelPack) => { setSelected(`pack:${pack.id}`); save.mutate(pack.models) }

  return <div className="cxs-defaults">
    {effectiveBuild && effectiveFast
      ? <p className="cxs-effective">Agora: Construção usa <ModelBadge id={effectiveBuild} models={covered} /> e Rápido usa <ModelBadge id={effectiveFast} models={covered} /> ({origin}).</p>
      : <p>A empresa ainda não definiu padrões.</p>}
    <RadioGroup className="cxs-radio-group" aria-label="Origem dos meus padrões" value={selected} onValueChange={(value) => {
      const next = value as Selection
      if (next === 'company') { setSelected('company'); if (mine) clear.mutate() } else if (next === 'custom') setSelected('custom')
      else { const pack = recommendedPacks.find((candidate) => `pack:${candidate.id}` === next); if (pack) choosePack(pack) }
    }}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders a hidden <input type="radio"> nested inside it */}
      <label className="cxs-radio-option">
        <RadioGroupItem value="company" />
        Usar os padrões da empresa
      </label>
      {recommendedPacks.map((pack) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders a hidden <input type="radio"> nested inside it
        <label key={pack.id} className="cxs-radio-option">
          <RadioGroupItem value={`pack:${pack.id}`} />
          Usar o pacote recomendado: {pack.name}
        </label>
      ))}
      {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders a hidden <input type="radio"> nested inside it */}
      <label className="cxs-radio-option">
        <RadioGroupItem value="custom" />
        Escolher o modelo
      </label>
    </RadioGroup>
    {selected === 'custom' && <form className="cxs-form" onSubmit={(event) => {
      event.preventDefault()
      save.mutate({ build, fast: fastTouched ? fast : build })
    }}>
      <RoleModelSelect label="Construção" models={covered} value={build} onChange={(value) => { setBuild(value); if (!fastTouched) setFast(value) }} />
      <Collapsible>
        <CollapsibleTrigger type="button">Mais opções</CollapsibleTrigger>
        <CollapsibleContent>
          <RoleModelSelect label="Rápido" models={covered} value={fast} onChange={(value) => { setFast(value); setFastTouched(true) }} />
        </CollapsibleContent>
      </Collapsible>
      <Button type="submit" variant="primary" disabled={!build || save.isPending}>Salvar meus padrões</Button>
    </form>}
    {message && <StatusLine>{message}</StatusLine>}
    <p className="cxs-hint">Vale para conversas novas. Numa conversa, o seletor troca o modelo só dela.</p>
  </div>
}
