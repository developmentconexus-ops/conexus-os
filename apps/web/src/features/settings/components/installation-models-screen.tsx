import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { Notice } from '@mastra/playground-ui/components/Notice'
import {
  SettingsContainer,
  SettingsDescription,
  SettingsGroup,
  SettingsHeader,
  SettingsLayout,
  SettingsRow,
  SettingsTitle,
} from '@mastra/playground-ui/new/settings'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useBuilderModels } from '../../builder/mastra-session'
import { shareErrorMessage } from '../error-messages'
import { getMemoryModel, installationMemoryQueryKey, saveMemoryModel } from '../installation-api'
import {
  listModelAccounts,
  type ModelAccountsRequestError,
  modelAccountsQueryKey,
  modelDefaultsQueryKey,
  readModelDefaults,
  saveInstallationDefaults,
  shareWithEveryone,
  stopSharing,
} from '../model-accounts-api'
import { connectableProviders, shareableRows, sharedRows } from '../model-account-rows'
import { ConnectAccount } from './connect-account'
import { RoleModelSelect } from './role-model-select'
import { Chip, SectionEmpty, SectionError, SectionLoading, StatusLine, type StatusLineTone } from './states'

function SharedAccountsGroup() {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<{ text: string; tone?: StatusLineTone } | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })
  const stop = useMutation({
    mutationFn: (provider: string) => stopSharing(provider),
    onSuccess: () => { setMessage(null); refresh() },
    onError: () => setMessage({ text: 'Não foi possível concluir. Tente de novo.', tone: 'danger' }),
  })
  const share = useMutation({
    mutationFn: (provider: string) => shareWithEveryone(provider),
    onSuccess: () => { setMessage(null); refresh() },
    onError: (error) => setMessage({ text: shareErrorMessage(error as ModelAccountsRequestError), tone: 'danger' }),
  })

  return <SettingsGroup>
    <SettingsHeader>
      <SettingsTitle>Contas compartilhadas</SettingsTitle>
      <SettingsDescription>
        Uma conta compartilhada atende todas as pessoas que não conectaram a sua. Removê-la vale a partir da próxima execução.
      </SettingsDescription>
    </SettingsHeader>

    <Notice variant="warning">
      <Notice.Message>Compartilhar uma assinatura pessoal pode violar os termos do provedor.</Notice.Message>
    </Notice>

    {message && <StatusLine tone={message.tone}>{message.text}</StatusLine>}

    {accounts.isPending && <SectionLoading />}
    {accounts.isError && (
      <SectionError
        description="Não foi possível consultar as contas compartilhadas."
        onRetry={() => void accounts.refetch()}
      />
    )}

    {accounts.isSuccess && (() => {
      const shared = sharedRows(accounts.data.providers)
      const shareable = shareableRows(accounts.data.providers)
      const connectable = connectableProviders(accounts.data.providers)

      return <>
        <SettingsContainer>
          {shared.length === 0 ? (
            <div className="p-4">
              <SectionEmpty>Nenhuma conta compartilhada.</SectionEmpty>
            </div>
          ) : (
            shared.map((row) => (
              <SettingsRow
                key={row.provider}
                label={row.label}
                description={<Chip tone="neutral">Compartilhada pela instalação</Chip>}
              >
                <AlertDialog>
                  <AlertDialog.Trigger
                    render={<Button type="button" variant="outline">Parar de compartilhar</Button>}
                  />
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay />
                    <AlertDialog.Content>
                      <AlertDialog.Header>
                        <AlertDialog.Title>Parar de compartilhar {row.label}</AlertDialog.Title>
                      </AlertDialog.Header>
                      <AlertDialog.Body>
                        <AlertDialog.Description>Vale a partir da próxima execução.</AlertDialog.Description>
                      </AlertDialog.Body>
                      <AlertDialog.Footer>
                        <AlertDialog.Cancel
                          render={<Button type="button" variant="outline">Cancelar</Button>}
                        />
                        <AlertDialog.Action
                          render={
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={stop.isPending}
                              onClick={() => stop.mutate(row.provider)}
                            >
                              Parar de compartilhar
                            </Button>
                          }
                        />
                      </AlertDialog.Footer>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog>
              </SettingsRow>
            ))
          )}
        </SettingsContainer>

        {shareable.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <h3 className="text-ui-md font-medium text-neutral5">Suas contas que podem ser compartilhadas</h3>
            <SettingsContainer>
              {shareable.map((row) => (
                <SettingsRow key={row.provider} label={row.label}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={share.isPending}
                    onClick={() => share.mutate(row.provider)}
                  >
                    Compartilhar com todos
                  </Button>
                </SettingsRow>
              ))}
            </SettingsContainer>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <h3 className="text-ui-md font-medium text-neutral5">Conectar uma conta para compartilhar</h3>
          <ConnectAccount providers={connectable} onConnected={refresh} />
        </div>
      </>
    })()}
  </SettingsGroup>
}

function InstallationModelDefaultsGroup() {
  const defaults = useQuery({ queryKey: modelDefaultsQueryKey, queryFn: readModelDefaults })
  const models = useBuilderModels('installation')
  const queryClient = useQueryClient()
  const [build, setBuild] = useState('')
  const [fast, setFast] = useState('')
  const [message, setMessage] = useState<{ text: string; tone?: StatusLineTone } | null>(null)

  useEffect(() => {
    if (!defaults.data?.installation) return
    setBuild(defaults.data.installation.build)
    setFast(defaults.data.installation.fast)
  }, [defaults.data])

  const save = useMutation({
    mutationFn: () => saveInstallationDefaults({ build, fast }),
    onSuccess: () => {
      setMessage({ text: 'Padrões salvos.' })
      void queryClient.invalidateQueries({ queryKey: modelDefaultsQueryKey })
    },
    onError: () => setMessage({ text: 'Não foi possível salvar.', tone: 'danger' }),
  })

  return <SettingsGroup>
    <SettingsHeader>
      <SettingsTitle>Modelos padrão</SettingsTitle>
      <SettingsDescription>
        O modelo com que toda conversa nova começa, quando a pessoa não escolheu os seus.
      </SettingsDescription>
    </SettingsHeader>

    {(defaults.isPending || models.isPending) && <SectionLoading />}
    {defaults.isError && (
      <SectionError
        description="Não foi possível consultar os padrões da instalação."
        onRetry={() => void defaults.refetch()}
      />
    )}

    {defaults.isSuccess && models.isSuccess && (() => {
      const covered = models.data.filter((model) => model.hasApiKey)
      if (covered.length === 0) {
        return <p className="cxs-empty">
          Nenhum modelo disponível. Compartilhe uma conta de modelo primeiro acima.
        </p>
      }

      return <form
        className="cxs-form"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <RoleModelSelect label="Construção" models={covered} value={build} onChange={setBuild} />
        <RoleModelSelect label="Rápido" models={covered} value={fast} onChange={setFast} />
        <Button type="submit" variant="primary" disabled={!build || !fast || save.isPending}>
          Salvar padrões
        </Button>
        {message && <StatusLine tone={message.tone}>{message.text}</StatusLine>}
        <p className="cxs-hint">Vale só para conversas novas.</p>
      </form>
    })()}
  </SettingsGroup>
}

function MemoryGroup() {
  const memory = useQuery({ queryKey: installationMemoryQueryKey, queryFn: getMemoryModel })
  const models = useBuilderModels('installation')
  const queryClient = useQueryClient()
  const [model, setModel] = useState('')
  const [message, setMessage] = useState<{ text: string; tone?: StatusLineTone } | null>(null)

  useEffect(() => {
    setModel(memory.data?.model ?? '')
  }, [memory.data])

  const save = useMutation({
    mutationFn: () => saveMemoryModel(model || null),
    onSuccess: () => {
      setMessage({ text: 'Padrão salvo.' })
      void queryClient.invalidateQueries({ queryKey: installationMemoryQueryKey })
    },
    onError: () => setMessage({ text: 'Não foi possível salvar.', tone: 'danger' }),
  })

  return <SettingsGroup>
    <SettingsHeader>
      <SettingsTitle>Memória</SettingsTitle>
      <SettingsDescription>
        O modelo que observa as conversas e resume o que importa lembrar.
      </SettingsDescription>
    </SettingsHeader>

    {(memory.isPending || models.isPending) && <SectionLoading />}
    {memory.isError && (
      <SectionError
        description="Não foi possível consultar o modelo de memória."
        onRetry={() => void memory.refetch()}
      />
    )}

    {memory.isSuccess && models.isSuccess && (() => {
      const covered = models.data.filter((entry) => entry.hasApiKey)
      if (covered.length === 0) {
        return <p className="cxs-empty">
          Nenhum modelo disponível. Compartilhe uma conta de modelo primeiro acima.
        </p>
      }

      return <form
        className="cxs-form"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <p>Valor atual: {memory.data.model ?? 'Padrão do Conexus'}</p>
        <RoleModelSelect label="Modelo de memória" models={covered} value={model} onChange={setModel} />
        <Button type="submit" variant="primary" disabled={!model || save.isPending}>
          Salvar
        </Button>
        {message && <StatusLine tone={message.tone}>{message.text}</StatusLine>}
        <p className="cxs-hint">
          Escolha um modelo que uma conta compartilhada cobre; a memória roda para todas as pessoas.
        </p>
      </form>
    })()}
  </SettingsGroup>
}

export function InstallationModelsScreen() {
  return <main className="cxs-page">
    <SettingsLayout
      title="Modelos da empresa"
      description="Gerencie as contas compartilhadas, os modelos padrão de execução e a memória de toda a instalação."
    >
      <div className="flex flex-col gap-8">
        <SharedAccountsGroup />
        <InstallationModelDefaultsGroup />
        <MemoryGroup />
      </div>
    </SettingsLayout>
  </main>
}
