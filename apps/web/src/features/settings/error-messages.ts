import type { ModelAccountsRequestError } from './model-accounts-api'

// Model accounts: connect and share flows (3.4, 3.6 in frontend-structure.md).
export const oauthFailureMessage = (error?: string): string => error ?? 'A entrada não foi concluída. Tente de novo.'

const installationNotReadyMessage = 'O Conexus ainda não pode guardar contas de modelo. Fale com um administrador da instalação.'

export const apiKeySaveErrorMessage = (error: ModelAccountsRequestError): string => {
  if (error.status >= 500) return error.reason ?? installationNotReadyMessage
  return error.reason ?? 'O provedor recusou a chave.'
}

export const shareErrorMessage = (error: ModelAccountsRequestError): string =>
  error.status === 409 ? 'Já existe uma conta compartilhada deste provedor.' : 'Não foi possível concluir. Tente novamente.'

// Installation GitHub connect (3.5).
const githubConnectMessages: Readonly<Record<string, string>> = {
  'github-installation-missing': 'O app ainda não está instalado em nenhuma organização. Instale e verifique de novo.',
  'github-installation-ambiguous': 'O app está instalado em mais de uma conta. Deixe só a organização da empresa.',
  'github-organization-required': 'Precisa ser uma organização do GitHub. Contas pessoais não servem.',
  'github-installation-account-changed': 'Os Projects apontam para outra organização. Instale o app de novo nela.',
}

export const githubConnectErrorMessage = (type: string | null, status: number): string =>
  (type && githubConnectMessages[type]) || (status === 502 ? 'Não foi possível falar com o GitHub agora.' : 'Não foi possível concluir. Tente novamente.')

// Installation administrators (3.5).
const administratorMessages: Readonly<Record<string, string>> = {
  'account-not-found': 'Nenhuma conta ativa usa este e-mail. A pessoa precisa entrar no Conexus uma vez antes.',
  'account-email-ambiguous': 'Mais de uma conta usa este e-mail. Fale com o operador.',
  'last-installation-administrator': 'Não é possível revogar o último administrador. Torne outra pessoa administradora antes.',
}

export const administratorErrorMessage = (type: string | null): string =>
  (type && administratorMessages[type]) || 'Não foi possível concluir. Tente novamente.'
