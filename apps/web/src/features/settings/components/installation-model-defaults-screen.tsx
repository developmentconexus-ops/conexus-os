import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useBuilderModels } from '../../builder/mastra-session'
import { modelDefaultsQueryKey, readModelDefaults, saveInstallationDefaults } from '../model-accounts-api'
import { PageHeader } from './page-header'
import { RoleModelSelect } from './role-model-select'
import { SectionError, SectionLoading, StatusLine } from './states'

export function InstallationModelDefaultsScreen() {
  const defaults = useQuery({ queryKey: modelDefaultsQueryKey, queryFn: readModelDefaults })
  const models = useBuilderModels()
  const queryClient = useQueryClient()
  const [build, setBuild] = useState('')
  const [fast, setFast] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!defaults.data?.installation) return
    setBuild(defaults.data.installation.build)
    setFast(defaults.data.installation.fast)
  }, [defaults.data])
  const save = useMutation({
    mutationFn: () => saveInstallationDefaults({ build, fast }),
    onSuccess: () => { setMessage('Padrões salvos.'); void queryClient.invalidateQueries({ queryKey: modelDefaultsQueryKey }) },
    onError: () => setMessage('Não foi possível salvar.'),
  })

  return <main className="cxs-page">
    <PageHeader title="Modelos padrão" lead="O modelo com que toda conversa nova começa, quando a pessoa não escolheu os seus." />
    {(defaults.isPending || models.isPending) && <SectionLoading />}
    {defaults.isError && <SectionError description="Não foi possível consultar os padrões da instalação." onRetry={() => void defaults.refetch()} />}
    {defaults.isSuccess && models.isSuccess && (() => {
      const covered = models.data.filter((model) => model.hasApiKey)
      if (covered.length === 0) return <p className="cxs-empty">
        Nenhum modelo disponível. <Link to="/settings/installation/models">Compartilhe uma conta de modelo primeiro.</Link>
      </p>
      return <form className="cxs-form" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
        <RoleModelSelect label="Construção" models={covered} value={build} onChange={setBuild} />
        <RoleModelSelect label="Rápido" models={covered} value={fast} onChange={setFast} />
        <Button type="submit" variant="primary" disabled={!build || !fast || save.isPending}>Salvar padrões</Button>
        {message && <StatusLine>{message}</StatusLine>}
        <p className="cxs-hint">Vale só para conversas novas.</p>
      </form>
    })()}
  </main>
}
