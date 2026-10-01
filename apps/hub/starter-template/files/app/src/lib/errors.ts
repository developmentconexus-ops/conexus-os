// Plain Portuguese for what the person can act on. A code not listed gets the table's fallback.

// The codes an operation call throws as `ConexusError`. A handler that throws is a bug, so
// HANDLER_FAILED and HANDLER_OUTPUT_REFUSED get the fallback.
const CALL_MESSAGES: Record<string, string> = {
  INPUT_REFUSED: 'Algum campo tem um valor que o app não aceita. Confira os dados e tente de novo.',
  INPUT_TOO_LARGE: 'Os dados enviados são grandes demais.',
  HANDLER_TIMEOUT: 'A operação demorou mais que o permitido. Tente de novo em instantes.',
  RESPONSE_TOO_LARGE: 'Há resultados demais para mostrar. Use um filtro para reduzir a lista.',
  DATABASE_UNAVAILABLE: 'Os dados salvos do app estão indisponíveis agora. Tente de novo em instantes.',
  APPLICATION_RUNNER_BUSY: 'O app está ocupado. Tente de novo em instantes.',
  APPLICATION_RUNNER_UNAVAILABLE: 'O app está indisponível agora. Tente de novo em instantes.',
}
const CALL_FALLBACK = 'Não foi possível concluir a operação. Tente de novo.'

// The codes of a failed `connectors.fetch`, which a handler returns in its output's `failure` field.
const CONNECTION_MESSAGES: Record<string, string> = {
  NOT_GRANTED: 'Este app perdeu o acesso ao sistema da empresa. Peça a quem administra o Workspace para vincular a Conexão de novo.',
  CONNECTOR_UNCONFIGURED: 'A integração com o sistema da empresa não está configurada. Isso não depende deste app.',
  CREDENTIAL_REFUSED: 'O sistema da empresa recusou o acesso. Avise quem administra a integração.',
  PROVIDER_TIMEOUT: 'O sistema da empresa não respondeu a tempo. Tente de novo em instantes.',
  PROVIDER_UNAVAILABLE: 'O sistema da empresa não respondeu a tempo. Tente de novo em instantes.',
}
const CONNECTION_FALLBACK = 'Não foi possível ler o sistema da empresa agora. Tente de novo em instantes.'

// `ConexusError` lives in the generated client, which an app without operations does not have, so
// the code is read from the error's shape.
const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined

export function errorMessage(error: unknown): string {
  return CALL_MESSAGES[codeOf(error) ?? ''] ?? CALL_FALLBACK
}

export function connectionMessage(code: string): string {
  return CONNECTION_MESSAGES[code] ?? CONNECTION_FALLBACK
}
