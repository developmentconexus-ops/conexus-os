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
}

/** The permission a pending call asks for, as in "O agente quer executar um comando". */
export const toolRequest = (toolName: string): string => sentences[toolName]?.ask ?? 'usar uma ferramenta'

export const toolSentence = (toolName: string, running: boolean): string => {
  const sentence = sentences[toolName]
  if (sentence) return running ? sentence.running : sentence.done
  return running ? 'Usando uma ferramenta' : 'Usou uma ferramenta'
}
