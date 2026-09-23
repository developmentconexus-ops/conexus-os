/**
 * playground-ui@55.0.0's AskUser and TaskList hard-code English copy and expose no labels API
 * (verified against dist/ask-user-*.js and dist/components/ai/task-list.es.js), so the pt-BR
 * strings that replace them live here once instead of scattered across ask-user-pt.tsx and
 * task-list-pt.tsx.
 */
export const builderCopy = {
  askUser: {
    placeholder: 'Digite sua resposta…',
    submit: 'Enviar resposta',
    pending: 'Enviando…',
  },
  taskList: {
    listLabel: 'Lista de tarefas',
    progressLabel: 'Progresso das tarefas',
    status: {
      completed: 'Concluída',
      in_progress: 'Em andamento',
      pending: 'Pendente',
    },
  },
} as const
