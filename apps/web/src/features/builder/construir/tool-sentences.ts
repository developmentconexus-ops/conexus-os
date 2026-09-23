// The plain sentence a person reads for each Mastra Code tool, in the running and the finished
// voice. The tool name, arguments and output stay behind the disclosure.
type Sentence = Readonly<{ running: string; done: string; ask: string }>

const sentences: Readonly<Record<string, Sentence>> = {
  view: { running: 'Lendo um arquivo', done: 'Leu um arquivo', ask: 'ler um arquivo' },
  read_file: { running: 'Lendo um arquivo', done: 'Leu um arquivo', ask: 'ler um arquivo' },
  write_file: { running: 'Escrevendo um arquivo', done: 'Escreveu um arquivo', ask: 'escrever um arquivo' },
  create_file: { running: 'Criando um arquivo', done: 'Criou um arquivo', ask: 'criar um arquivo' },
  edit_file: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo' },
  string_replace: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo' },
  str_replace: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo' },
  ast_edit: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo' },
  execute_command: { running: 'Executando um comando', done: 'Executou um comando', ask: 'executar um comando' },
  get_process_output: { running: 'Lendo a saída de um processo', done: 'Leu a saída de um processo', ask: 'ler a saída de um processo' },
  kill_process: { running: 'Parando um processo', done: 'Parou um processo', ask: 'parar um processo' },
  find_files: { running: 'Procurando arquivos', done: 'Procurou arquivos', ask: 'procurar arquivos' },
  list_files: { running: 'Listando arquivos', done: 'Listou arquivos', ask: 'listar arquivos' },
  grep: { running: 'Buscando no código', done: 'Buscou no código', ask: 'buscar no código' },
  search_content: { running: 'Buscando no código', done: 'Buscou no código', ask: 'buscar no código' },
  search: { running: 'Buscando', done: 'Buscou', ask: 'buscar' },
  web_search: { running: 'Pesquisando na internet', done: 'Pesquisou na internet', ask: 'pesquisar na internet' },
  lsp_inspect: { running: 'Inspecionando o código', done: 'Inspecionou o código', ask: 'inspecionar o código' },
  file_stat: { running: 'Consultando um arquivo', done: 'Consultou um arquivo', ask: 'consultar um arquivo' },
  delete: { running: 'Apagando um arquivo', done: 'Apagou um arquivo', ask: 'apagar um arquivo' },
  delete_file: { running: 'Apagando um arquivo', done: 'Apagou um arquivo', ask: 'apagar um arquivo' },
  mkdir: { running: 'Criando uma pasta', done: 'Criou uma pasta', ask: 'criar uma pasta' },
  ask_user: { running: 'Perguntando a você', done: 'Perguntou a você', ask: 'perguntar a você' },
  task_write: { running: 'Organizando as tarefas', done: 'Organizou as tarefas', ask: 'organizar as tarefas' },
  task_update: { running: 'Atualizando as tarefas', done: 'Atualizou as tarefas', ask: 'atualizar as tarefas' },
  task_check: { running: 'Conferindo as tarefas', done: 'Conferiu as tarefas', ask: 'conferir as tarefas' },
  task_complete: { running: 'Concluindo uma tarefa', done: 'Concluiu uma tarefa', ask: 'concluir uma tarefa' },
}

// The Mastra Code task tools (@mastra/core's built-in task-tools): task-checklist.tsx drives the
// pinned checklist from their calls instead of the conversation rendering one row per call.
export const TASK_TOOL_NAMES: ReadonlySet<string> = new Set(['task_write', 'task_update', 'task_check', 'task_complete'])

// Names the same underlying action under a different id (a shell alias, an older or provider-specific
// spelling). Each maps onto one of the sentences above instead of duplicating it.
const aliases: Readonly<Record<string, string>> = {
  bash: 'execute_command', shell: 'execute_command', run_command: 'execute_command', sh: 'execute_command',
  apply_patch: 'edit_file', patch_file: 'edit_file', str_replace_editor: 'edit_file', str_replace_based_edit_tool: 'edit_file',
  todo_update: 'task_write', plan_write: 'task_write', update_plan: 'task_write', todo_write: 'task_write',
  fetch: 'web_search', http_request: 'web_search', browser_navigate: 'web_search',
  rm: 'delete_file', remove_file: 'delete_file', make_directory: 'mkdir', mkdirp: 'mkdir',
}

// A tool name this table has never seen at all: a keyword in its own id is still a better guess than
// the fully generic sentence, so an unrecognized id still reads as a specific-sounding action.
// Order matters: task/plan/todo is checked before the ask/approve/confirm heuristic. That heuristic
// also matches the compound "ask_user", not the bare substring "ask" (real `\b` word-boundary regex
// does not help here: every tool id in this table is snake_case, so "ask" in "legacy_ask_user_v2"
// has no \w/\W boundary on either side). "ask" alone matched the "ask" inside "task", which is how
// every task_write/task_update/task_check/task_complete call used to render as a question.
const heuristics: readonly Readonly<{ test: RegExp; sentence: Sentence }>[] = [
  { test: /delete|remove|rm\b/i, sentence: { running: 'Apagando um arquivo', done: 'Apagou um arquivo', ask: 'apagar um arquivo' } },
  { test: /search|find|grep|lookup/i, sentence: { running: 'Buscando', done: 'Buscou', ask: 'buscar' } },
  { test: /write|edit|replace|patch|append|create/i, sentence: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo' } },
  { test: /read|view|get|list|inspect|stat/i, sentence: { running: 'Lendo um arquivo', done: 'Leu um arquivo', ask: 'ler um arquivo' } },
  { test: /run|exec|command|shell|bash|build|test|install/i, sentence: { running: 'Executando um comando', done: 'Executou um comando', ask: 'executar um comando' } },
  { test: /task|plan|todo/i, sentence: { running: 'Organizando as tarefas', done: 'Organizou as tarefas', ask: 'organizar as tarefas' } },
  { test: /ask_user|approve|confirm|question/i, sentence: { running: 'Perguntando a você', done: 'Perguntou a você', ask: 'perguntar a você' } },
]

const lookup = (toolName: string): Sentence | undefined =>
  sentences[toolName] ?? sentences[aliases[toolName] ?? ''] ?? heuristics.find((entry) => entry.test.test(toolName))?.sentence

/** The permission a pending call asks for, as in "O agente quer executar um comando". */
export const toolRequest = (toolName: string): string => lookup(toolName)?.ask ?? 'usar uma ferramenta'

// A name that still falls all the way through to the generic sentence names a real gap in the table
// above; logging it once, instead of only showing "Usou uma ferramenta", is what makes that gap
// findable from a live session instead of only from a source read.
const loggedUnmapped = new Set<string>()

export const toolSentence = (toolName: string, running: boolean): string => {
  const sentence = lookup(toolName)
  if (sentence) return running ? sentence.running : sentence.done
  if (!loggedUnmapped.has(toolName)) {
    loggedUnmapped.add(toolName)
    // eslint-disable-next-line no-console -- deliberate: the only record of which real tool id has no sentence yet.
    console.debug(`[construir] no pt-BR sentence for tool "${toolName}"; add it to tool-sentences.ts`)
  }
  return running ? 'Usando uma ferramenta' : 'Usou uma ferramenta'
}
