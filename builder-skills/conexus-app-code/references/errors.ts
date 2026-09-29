import { ConexusError } from '@/conexus/api.gen'

// Plain Portuguese for what the person can act on. A code not listed here gets the last line.
const MESSAGES: Record<string, string> = {
  INPUT_REFUSED: 'Algum campo tem um valor que o app não aceita. Confira os dados e tente de novo.',
  INPUT_TOO_LARGE: 'Os dados enviados são grandes demais.',
  HANDLER_TIMEOUT: 'A operação demorou mais que o permitido. Tente de novo em instantes.',
  RESPONSE_TOO_LARGE: 'Há resultados demais para mostrar. Use um filtro para reduzir a lista.',
  DATABASE_UNAVAILABLE: 'Os dados salvos do app estão indisponíveis agora. Tente de novo em instantes.',
  APPLICATION_RUNNER_BUSY: 'O app está ocupado. Tente de novo em instantes.',
  APPLICATION_RUNNER_UNAVAILABLE: 'O app está indisponível agora. Tente de novo em instantes.',
}

export function errorMessage(error: unknown): string {
  if (error instanceof ConexusError) return MESSAGES[error.code] ?? 'Não foi possível concluir a operação. Tente de novo.'
  return 'Não foi possível concluir a operação. Tente de novo.'
}
