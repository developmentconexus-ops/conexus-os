export const PROBLEM_TYPES = {
  projectNameMismatch: 'urn:conexus:problem:PROJECT_NAME_MISMATCH',
  projectBusy: 'urn:conexus:problem:PROJECT_BUSY',
} as const

export function deleteFailureMessage(status: number, type: string | null): string {
  if (type === PROBLEM_TYPES.projectNameMismatch) return 'O nome digitado não corresponde ao Projeto. Confira e digite exatamente como aparece.'
  if (type === PROBLEM_TYPES.projectBusy) return 'O Projeto está processando uma tarefa agora. Espere terminar e tente de novo.'
  if (status === 403) return 'Só administradores da instalação podem excluir Projetos.'
  if (status === 404) return 'Este Projeto já não existe.'
  if (status === 503) return 'A exclusão não terminou. O que já foi apagado não volta atrás; tente de novo para concluir.'
  return 'O servidor não respondeu desta vez. Nada foi excluído.'
}
