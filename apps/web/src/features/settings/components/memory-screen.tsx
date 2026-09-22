import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useBuilderModels } from '../../builder/mastra-session'
import { getMemoryModel, installationMemoryQueryKey, saveMemoryModel } from '../installation-api'
import { PageHeader } from './page-header'
import { RoleModelSelect } from './role-model-select'
import { SectionError, SectionLoading, StatusLine } from './states'

const FACTORY_DEFAULT_MEMORY_MODEL = 'google/gemini-3.5-flash'

export function MemoryScreen() {
  const memory = useQuery({ queryKey: installationMemoryQueryKey, queryFn: getMemoryModel })
  const models = useBuilderModels()
  const queryClient = useQueryClient()
  const [model, setModel] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => { setModel(memory.data?.model ?? '') }, [memory.data])
  const save = useMutation({
    mutationFn: () => saveMemoryModel(model || null),
    onSuccess: () => { setMessage('Padrão salvo.'); void queryClient.invalidateQueries({ queryKey: installationMemoryQueryKey }) },
    onError: () => setMessage('Não foi possível salvar.'),
  })

  return <main className="cxs-page">
    <PageHeader title="Memória" lead="O modelo que observa as conversas e resume o que importa lembrar." />
    {(memory.isPending || models.isPending) && <SectionLoading />}
    {memory.isError && <SectionError description="Não foi possível consultar o modelo de memória." onRetry={() => void memory.refetch()} />}
    {memory.isSuccess && models.isSuccess && (() => {
      const covered = models.data.filter((entry) => entry.hasApiKey)
      if (covered.length === 0) return <p className="cxs-empty">
        Nenhum modelo disponível. <Link to="/settings/installation/models">Compartilhe uma conta de modelo primeiro.</Link>
      </p>
      return <form className="cxs-form" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <p>Valor atual: {memory.data.model ?? `Padrão do Factory (${FACTORY_DEFAULT_MEMORY_MODEL})`}</p>
        <RoleModelSelect label="Modelo de memória" models={covered} value={model} onChange={setModel} />
        <Button type="submit" variant="primary" disabled={!model || save.isPending}>Salvar</Button>
        {message && <StatusLine>{message}</StatusLine>}
        <p className="cxs-hint">Escolha um modelo que uma conta compartilhada cobre; a memória roda para todas as pessoas.</p>
      </form>
    })()}
  </main>
}
