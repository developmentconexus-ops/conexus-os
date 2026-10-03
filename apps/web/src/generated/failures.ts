// GENERATED from contracts/technical/failures.json by scripts/generate-failures.mjs. Do not edit.

export const FAILURE_ACTIONS = {
  'NONE': null,
  'SIGN_IN': 'Entre na sua conta para continuar.',
  'CONNECT_MODEL_ACCOUNT': 'Conecte uma conta de modelo em Configurações.',
  'ASK_ADMIN': 'Peça a quem administra o Conexus.',
  'ASK_CHANGE': 'Peça a quem pode alterar isso.',
  'CHOOSE_OTHER_MODEL': 'Escolha outro modelo.',
  'RETRY_LATER': 'Tente novamente mais tarde.',
} as const

export type FailureAction = keyof typeof FAILURE_ACTIONS

export const FAILURES = {
  'INTERNAL_UNEXPECTED': { message: 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.', action: 'NONE' },
  'NOT_FOUND': { message: 'Não encontramos o que você procurou.', action: 'NONE' },
  'REQUEST_VALIDATION_FAILED': { message: 'Alguns dados do pedido não são válidos.', action: 'NONE' },
  'REQUEST_JSON_INVALID': { message: 'O pedido chegou ao Conexus ilegível.', action: 'NONE' },
  'REQUEST_JSON_EMPTY': { message: 'O pedido chegou ao Conexus sem conteúdo.', action: 'NONE' },
  'REQUEST_BODY_TOO_LARGE': { message: 'O pedido é maior do que o Conexus aceita.', action: 'NONE' },
  'REQUEST_MEDIA_TYPE_UNSUPPORTED': { message: 'O Conexus não aceita esse formato de pedido.', action: 'NONE' },
} as const satisfies Readonly<Record<string, Readonly<{ message: string; action: FailureAction }>>>

export type FailureCode = keyof typeof FAILURES
