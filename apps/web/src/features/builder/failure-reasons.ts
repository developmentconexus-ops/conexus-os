export type BuilderFailureCategory =
  | 'ENVIRONMENT_PREPARATION_FAILED'
  | 'MODEL_CREDENTIAL_REFUSED'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_REQUEST_REFUSED'
  | 'SOURCE_RESULT_REJECTED'
  | 'APPLICATION_BUILD_FAILED'
  | 'RUN_CANCELLED'
  | 'RUN_INTERRUPTED'
  | 'INTERNAL_ERROR'

export const failureReasons: Readonly<Record<BuilderFailureCategory, string>> = Object.freeze({
  ENVIRONMENT_PREPARATION_FAILED: 'Não foi possível preparar o ambiente de código. Tente enviar o pedido novamente.',
  MODEL_CREDENTIAL_REFUSED: 'A credencial do modelo está ausente, revogada ou foi recusada. Verifique a conexão em configurações.',
  MODEL_RATE_LIMITED: 'O provedor do modelo está limitando as requisições. Tente novamente em alguns minutos.',
  MODEL_REQUEST_REFUSED: 'O provedor do modelo recusou ou interrompeu o pedido. Tente novamente ou escolha outro modelo.',
  SOURCE_RESULT_REJECTED: 'A nova fonte proposta foi recusada. O Project continua na fonte anterior.',
  APPLICATION_BUILD_FAILED: 'O aplicativo não compilou. Peça um ajuste no código.',
  RUN_CANCELLED: 'Execução interrompida por você.',
  RUN_INTERRUPTED: 'O Conexus reiniciou durante a execução. Envie o pedido novamente.',
  INTERNAL_ERROR: 'Ocorreu um erro interno inesperado. Tente novamente.',
})

export const failureReason = (category: BuilderFailureCategory | null | undefined): string =>
  category ? failureReasons[category] : failureReasons.INTERNAL_ERROR
