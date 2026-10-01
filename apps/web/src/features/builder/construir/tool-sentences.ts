// The plain sentence a person reads for each Mastra Code tool, in the running and the finished
// voice. The tool name, arguments and output stay behind the disclosure.
type ToolKind = 'ler' | 'editar' | 'executar' | 'buscar' | 'verificar' | 'outros'
type Sentence = Readonly<{ running: string; done: string; ask: string; kind: ToolKind }>

const sentences: Readonly<Record<string, Sentence>> = {
  view: { running: 'Lendo um arquivo', done: 'Leu um arquivo', ask: 'ler um arquivo', kind: 'ler' },
  read_file: { running: 'Lendo um arquivo', done: 'Leu um arquivo', ask: 'ler um arquivo', kind: 'ler' },
  write_file: { running: 'Escrevendo um arquivo', done: 'Escreveu um arquivo', ask: 'escrever um arquivo', kind: 'editar' },
  create_file: { running: 'Criando um arquivo', done: 'Criou um arquivo', ask: 'criar um arquivo', kind: 'editar' },
  edit_file: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo', kind: 'editar' },
  string_replace: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo', kind: 'editar' },
  str_replace: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo', kind: 'editar' },
  ast_edit: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo', kind: 'editar' },
  execute_command: { running: 'Executando um comando', done: 'Executou um comando', ask: 'executar um comando', kind: 'executar' },
  get_process_output: { running: 'Lendo a saída de um processo', done: 'Leu a saída de um processo', ask: 'ler a saída de um processo', kind: 'executar' },
  kill_process: { running: 'Parando um processo', done: 'Parou um processo', ask: 'parar um processo', kind: 'executar' },
  find_files: { running: 'Procurando arquivos', done: 'Procurou arquivos', ask: 'procurar arquivos', kind: 'buscar' },
  list_files: { running: 'Listando arquivos', done: 'Listou arquivos', ask: 'listar arquivos', kind: 'buscar' },
  grep: { running: 'Buscando no código', done: 'Buscou no código', ask: 'buscar no código', kind: 'buscar' },
  search_content: { running: 'Buscando no código', done: 'Buscou no código', ask: 'buscar no código', kind: 'buscar' },
  search: { running: 'Buscando', done: 'Buscou', ask: 'buscar', kind: 'buscar' },
  web_search: { running: 'Pesquisando na internet', done: 'Pesquisou na internet', ask: 'pesquisar na internet', kind: 'buscar' },
  lsp_inspect: { running: 'Inspecionando o código', done: 'Inspecionou o código', ask: 'inspecionar o código', kind: 'buscar' },
  file_stat: { running: 'Consultando um arquivo', done: 'Consultou um arquivo', ask: 'consultar um arquivo', kind: 'ler' },
  delete: { running: 'Apagando um arquivo', done: 'Apagou um arquivo', ask: 'apagar um arquivo', kind: 'outros' },
  delete_file: { running: 'Apagando um arquivo', done: 'Apagou um arquivo', ask: 'apagar um arquivo', kind: 'outros' },
  mkdir: { running: 'Criando uma pasta', done: 'Criou uma pasta', ask: 'criar uma pasta', kind: 'outros' },
  conexus_check: { running: 'Verificando o app', done: 'Verificou o app', ask: 'verificar o app', kind: 'verificar' },
  conexus_run_operation: { running: 'Testando uma operação com dados reais', done: 'Testou uma operação com dados reais', ask: 'testar uma operação com dados reais', kind: 'verificar' },
  skill: { running: 'Consultando a skill', done: 'Consultou a skill', ask: 'consultar a skill', kind: 'ler' },
  skill_read: { running: 'Lendo a skill', done: 'Leu a skill', ask: 'ler a skill', kind: 'ler' },
  skill_search: { running: 'Procurando uma skill', done: 'Procurou uma skill', ask: 'procurar uma skill', kind: 'buscar' },
  connector_fetch: { running: 'Consultando um sistema da empresa', done: 'Consultou um sistema da empresa', ask: 'consultar um sistema da empresa', kind: 'outros' },
  web_fetch: { running: 'Abrindo uma página da internet', done: 'Abriu uma página da internet', ask: 'abrir uma página da internet', kind: 'outros' },
  recall: { running: 'Relendo conversas anteriores', done: 'Releu conversas anteriores', ask: 'reler conversas anteriores', kind: 'outros' },
  ask_user: { running: 'Perguntando a você', done: 'Perguntou a você', ask: 'perguntar a você', kind: 'outros' },
  submit_plan: { running: 'Enviando o plano', done: 'Enviou o plano', ask: 'enviar o plano', kind: 'outros' },
  task_write: { running: 'Organizando as tarefas', done: 'Organizou as tarefas', ask: 'organizar as tarefas', kind: 'outros' },
  task_update: { running: 'Atualizando as tarefas', done: 'Atualizou as tarefas', ask: 'atualizar as tarefas', kind: 'outros' },
  task_check: { running: 'Conferindo as tarefas', done: 'Conferiu as tarefas', ask: 'conferir as tarefas', kind: 'outros' },
  task_complete: { running: 'Concluindo uma tarefa', done: 'Concluiu uma tarefa', ask: 'concluir uma tarefa', kind: 'outros' },
}

// The Mastra Code task tools (@mastra/core's built-in task-tools): construir.tsx drives the
// pinned checklist from their calls instead of the conversation rendering one row per call.
export const TASK_TOOL_NAMES: ReadonlySet<string> = new Set(['task_write', 'task_update', 'task_check', 'task_complete'])

// Calls that always read as their own row: the person answers them, or they open a skill, so a fold
// into "Editou 4 arquivos" would hide the one call the conversation turns on.
export const UNGROUPED_TOOL_NAMES: ReadonlySet<string> = new Set(['ask_user', 'submit_plan', 'skill'])

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
  { test: /delete|remove|rm\b/i, sentence: { running: 'Apagando um arquivo', done: 'Apagou um arquivo', ask: 'apagar um arquivo', kind: 'outros' } },
  { test: /search|find|grep|lookup/i, sentence: { running: 'Buscando', done: 'Buscou', ask: 'buscar', kind: 'buscar' } },
  { test: /write|edit|replace|patch|append|create/i, sentence: { running: 'Editando um arquivo', done: 'Editou um arquivo', ask: 'editar um arquivo', kind: 'editar' } },
  { test: /read|view|get|list|inspect|stat/i, sentence: { running: 'Lendo um arquivo', done: 'Leu um arquivo', ask: 'ler um arquivo', kind: 'ler' } },
  { test: /run|exec|command|shell|bash|build|test|install/i, sentence: { running: 'Executando um comando', done: 'Executou um comando', ask: 'executar um comando', kind: 'executar' } },
  { test: /task|plan|todo/i, sentence: { running: 'Organizando as tarefas', done: 'Organizou as tarefas', ask: 'organizar as tarefas', kind: 'outros' } },
  { test: /ask_user|approve|confirm|question/i, sentence: { running: 'Perguntando a você', done: 'Perguntou a você', ask: 'perguntar a você', kind: 'outros' } },
]

// The Builder's workspace tools reach the conversation as `mastra_workspace_<name>`; the table above
// keys them by the bare name.
const lookup = (toolName: string): Sentence | undefined => {
  const name = toolName.replace(/^mastra_workspace_/, '')
  return sentences[name] ?? sentences[aliases[name] ?? ''] ?? heuristics.find((entry) => entry.test.test(name))?.sentence
}

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

const toolKind = (toolName: string): ToolKind => lookup(toolName)?.kind ?? 'outros'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

// The settled header of a group: what the calls did, by kind, in the order the kinds first appear.
const kindPhrases: Readonly<Record<ToolKind, (count: number) => string>> = {
  ler: (count) => `leu ${plural(count, 'arquivo', 'arquivos')}`,
  editar: (count) => `editou ${plural(count, 'arquivo', 'arquivos')}`,
  executar: (count) => `executou ${plural(count, 'comando', 'comandos')}`,
  buscar: (count) => `buscou ${plural(count, 'vez', 'vezes')}`,
  verificar: (count) => `verificou o app ${plural(count, 'vez', 'vezes')}`,
  outros: (count) => `fez ${plural(count, 'outra ação', 'outras ações')}`,
}

/** "Editou 4 arquivos, executou 1 comando", with the failures named when there are any. */
export const groupSummary = (toolNames: readonly string[], failed: number): string => {
  const counts = new Map<ToolKind, number>()
  for (const name of toolNames) counts.set(toolKind(name), (counts.get(toolKind(name)) ?? 0) + 1)
  const text = [...counts].map(([kind, count]) => kindPhrases[kind](count)).join(', ')
  const summary = text.charAt(0).toUpperCase() + text.slice(1)
  return failed > 0 ? `${summary} · ${failed} ${failed === 1 ? 'falhou' : 'falharam'}` : summary
}
