// Installation administrators (3.5).
const administratorMessages: Readonly<Record<string, string>> = {
  ACCOUNT_NOT_FOUND: 'Nenhuma conta ativa usa este e-mail. A pessoa precisa entrar no Conexus uma vez antes.',
  ACCOUNT_EMAIL_AMBIGUOUS: 'Mais de uma conta usa este e-mail. Fale com o operador.',
  LAST_INSTALLATION_ADMINISTRATOR: 'Não é possível revogar o último administrador. Torne outra pessoa administradora antes.',
}

export const administratorErrorMessage = (type: string | null): string =>
  (type && administratorMessages[type]) || 'Não foi possível concluir. Tente de novo.'
