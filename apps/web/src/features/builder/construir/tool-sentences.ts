// The plain sentence a person reads for each Mastra Code tool, in the running and the finished
// voice. The tool name, arguments and output stay behind the disclosure.
import { ASK_USER_TOOL, SUBMIT_PLAN_TOOL } from '../mastra-tool-names.ts'
import type { BuiltinToolId } from '@mastra/core/agent-controller'
import type { WORKSPACE_TOOLS_PREFIX, WorkspaceToolName } from '@mastra/core/workspace'

type ToolKind = 'ler' | 'editar' | 'executar' | 'buscar' | 'verificar' | 'outros'
type Sentence = Readonly<{ running: string; done: string; ask: string; kind: ToolKind }>

const sentence = (running: string, done: string, ask: string, kind: ToolKind): Sentence => ({ running, done, ask, kind })

// Typed by Mastra's own tool names, so a name Mastra renames stops compiling instead of quietly
// reading as "Usou uma ferramenta". The web cannot import the runtime constants (@mastra/core's
// workspace entry pulls Node's `os` and `path`), so the names are checked as types only.
type WorkspacePrefix = `${typeof WORKSPACE_TOOLS_PREFIX}_`
type BareWorkspaceTool = WorkspaceToolName extends `${WorkspacePrefix}${infer Name}` ? Name : never

const readFile = sentence('Lendo um arquivo', 'Leu um arquivo', 'ler um arquivo', 'ler')
const editFile = sentence('Editando um arquivo', 'Editou um arquivo', 'editar um arquivo', 'editar')
const grep = sentence('Buscando no código', 'Buscou no código', 'buscar no código', 'buscar')
const deleteFile = sentence('Apagando um arquivo', 'Apagou um arquivo', 'apagar um arquivo', 'outros')

const workspaceSentences: Readonly<Partial<Record<BareWorkspaceTool, Sentence>>> = {
  read_file: readFile,
  write_file: sentence('Escrevendo um arquivo', 'Escreveu um arquivo', 'escrever um arquivo', 'editar'),
  edit_file: editFile,
  ast_edit: editFile,
  execute_command: sentence('Executando um comando', 'Executou um comando', 'executar um comando', 'executar'),
  get_process_output: sentence('Lendo a saída de um processo', 'Leu a saída de um processo', 'ler a saída de um processo', 'executar'),
  kill_process: sentence('Parando um processo', 'Parou um processo', 'parar um processo', 'executar'),
  list_files: sentence('Listando arquivos', 'Listou arquivos', 'listar arquivos', 'buscar'),
  grep,
  search: sentence('Buscando', 'Buscou', 'buscar', 'buscar'),
  index: sentence('Indexando arquivos', 'Indexou arquivos', 'indexar arquivos', 'buscar'),
  lsp_inspect: sentence('Inspecionando o código', 'Inspecionou o código', 'inspecionar o código', 'buscar'),
  file_stat: sentence('Consultando um arquivo', 'Consultou um arquivo', 'consultar um arquivo', 'ler'),
  delete: deleteFile,
  mkdir: sentence('Criando uma pasta', 'Criou uma pasta', 'criar uma pasta', 'outros'),
}

const builtinSentences: Readonly<Partial<Record<BuiltinToolId, Sentence>>> = {
  ask_user: sentence('Perguntando a você', 'Perguntou a você', 'perguntar a você', 'outros'),
  submit_plan: sentence('Enviando o plano', 'Enviou o plano', 'enviar o plano', 'outros'),
  task_write: sentence('Organizando as tarefas', 'Organizou as tarefas', 'organizar as tarefas', 'outros'),
  task_update: sentence('Atualizando as tarefas', 'Atualizou as tarefas', 'atualizar as tarefas', 'outros'),
  task_check: sentence('Conferindo as tarefas', 'Conferiu as tarefas', 'conferir as tarefas', 'outros'),
  task_complete: sentence('Concluindo uma tarefa', 'Concluiu uma tarefa', 'concluir uma tarefa', 'outros'),
}

// The Builder's own tools, and the names other agents give the same file actions.
const ownSentences: Readonly<Record<string, Sentence>> = {
  view: readFile,
  create_file: sentence('Criando um arquivo', 'Criou um arquivo', 'criar um arquivo', 'editar'),
  string_replace: editFile,
  str_replace: editFile,
  find_files: sentence('Procurando arquivos', 'Procurou arquivos', 'procurar arquivos', 'buscar'),
  search_content: grep,
  delete_file: deleteFile,
  web_search: sentence('Pesquisando na internet', 'Pesquisou na internet', 'pesquisar na internet', 'buscar'),
  conexus_check: sentence('Verificando o app', 'Verificou o app', 'verificar o app', 'verificar'),
  conexus_run_operation: sentence('Testando uma operação com dados reais', 'Testou uma operação com dados reais', 'testar uma operação com dados reais', 'verificar'),
  skill: sentence('Consultando a skill', 'Consultou a skill', 'consultar a skill', 'ler'),
  skill_read: sentence('Lendo a skill', 'Leu a skill', 'ler a skill', 'ler'),
  skill_search: sentence('Procurando uma skill', 'Procurou uma skill', 'procurar uma skill', 'buscar'),
  connector_fetch: sentence('Consultando um sistema da empresa', 'Consultou um sistema da empresa', 'consultar um sistema da empresa', 'outros'),
  web_fetch: sentence('Abrindo uma página da internet', 'Abriu uma página da internet', 'abrir uma página da internet', 'outros'),
  context7_resolve_library_id: sentence('Procurando uma biblioteca na documentação', 'Procurou uma biblioteca na documentação', 'procurar uma biblioteca na documentação', 'outros'),
  context7_query_docs: sentence('Lendo a documentação de uma biblioteca', 'Leu a documentação de uma biblioteca', 'ler a documentação de uma biblioteca', 'outros'),
  recall: sentence('Relendo conversas anteriores', 'Releu conversas anteriores', 'reler conversas anteriores', 'outros'),
}

const sentences: Readonly<Record<string, Sentence>> = { ...ownSentences, ...workspaceSentences, ...builtinSentences }

// The Mastra Code task tools (@mastra/core's built-in task-tools): construir.tsx drives the
// pinned checklist from their calls instead of the conversation rendering one row per call.
export const TASK_TOOL_NAMES: ReadonlySet<string> = new Set<BuiltinToolId>(['task_write', 'task_update', 'task_check', 'task_complete'])

// Calls that always read as their own row: the person answers them, or they open a skill, so a fold
// into "Editou 4 arquivos" would hide the one call the conversation turns on.
export const UNGROUPED_TOOL_NAMES: ReadonlySet<string> = new Set([ASK_USER_TOOL, SUBMIT_PLAN_TOOL, 'skill'])

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

// The Builder's workspace tools reach the conversation as `mastra_workspace_<name>`; the tables above
// key them by the bare name. The compile-time check pins the literal to Mastra's own prefix.
const WORKSPACE_PREFIX = 'mastra_workspace_' satisfies WorkspacePrefix
const lookup = (toolName: string): Sentence | undefined => {
  const name = toolName.startsWith(WORKSPACE_PREFIX) ? toolName.slice(WORKSPACE_PREFIX.length) : toolName
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
