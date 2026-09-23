# Builder, Skills e SDK

Memória de R01 e das distinções que orientaram R04–R13. É pesquisa histórica. O [índice](README.md) explica a proveniência e os limites de evidência.

## R01 Harness do agente e paved road do aplicativo

A pergunta inicial era como fazer o agente montar regras de negócio sem escolher banco, autenticação, UI e infraestrutura a cada pedido. A conversa separou dois assuntos que estavam recebendo o mesmo nome, harness.

O **Agent Harness** organiza conversa, contexto, memória, ferramentas, aprovações, execução, planejamento e delegação. A hipótese era aproveitar Mastra/Factory pelos caminhos públicos, não reconstruir um Claude Code dentro do Conexus.

O **Application Paved Road** define o ambiente técnico em que o aplicativo nasce. Dados, identidade, permissões, componentes, eventos, notificações, integrações, auditoria e telemetria eram capacidades candidatas desse ambiente. A seleção deveria reduzir decisões repetidas do Builder, sem substituir código normal de domínio por uma linguagem proprietária universal.

A separação conceitual usada foi:

```text
Conexus Product Plane: Project, autorização, capacidades e publicação
Agent Development Plane: Factory, Workspace, ferramentas, contexto e execução
Application Runtime Plane: código gerado e capacidades usadas quando o app roda
```

Esses planos não eram uma proposta de três serviços físicos. Eram um teste de responsabilidade. Uma Tool do coding agent não resolve automaticamente a integração que um app publicado precisa executar. Memória do agente não vira política empresarial. Um Signal não vira event bus do negócio.

## SDK, Tool, Skill e Workflow não concorrem pela mesma função

| Mecanismo na discussão | Papel imaginado |
| --- | --- |
| SDK | Interface que código de aplicativo consome em runtime |
| Tool | Ação controlada que o agente pode invocar |
| Skill | Instruções, exemplos e procedimentos para usar uma capacidade |
| Script | Passo executável conhecido, incluindo checks e utilitários locais |
| Workflow | Sequência de trabalho com controle explícito; durabilidade a qualificar |
| Subagent | Trabalho que justifica raciocínio e contexto próprios |
| Memory | Continuidade operacional de uma conversa ou agente |
| Brain | Conhecimento empresarial governado, com origem e publicação deliberada |

O exemplo recorrente era “quando uma solicitação for aprovada, notifique o vendedor”. Um SDK expressaria a intenção de notificar. Uma Skill ensinaria quando e como usá-lo. Um Connector cuidaria do canal externo. Esperar um dia e verificar a situação poderia exigir job ou workflow. Não seriam quatro implementações do envio.

Os nomes `@conexus/ui`, `@conexus/data`, `@conexus/auth`, `@conexus/events`, `@conexus/notifications`, `@conexus/audit` e `@conexus/telemetry` formavam um mapa de necessidades, não um pacote npm por necessidade. R04 depois reduziu a hipótese para algo pequeno como `@conexus/app`, sem fechar a API.

## Skills e descoberta sob demanda

A conversa identificou três candidatos do Mastra: Agent Skills, Filesystem/Workspace Skills e `SkillSearchProcessor`, apresentado com `search_skills` e `load_skill`. A hipótese era carregar só a instrução necessária à tarefa, em vez de colocar o catálogo inteiro no system prompt. **A existência e o encaixe desses nomes no pacote efetivamente usado precisam de leitura do instalado.** [Fontes Mastra](sources-and-revalidation.md#s1-mastra-e-harness).

Uma organização ilustrativa era:

```text
conexus-data/
  SKILL.md
  references/
  scripts/

conexus-integrations/
  SKILL.md
  references/
```

Uma solicitação de aprovação de orçamento poderia levar o Builder a buscar conhecimento de dados, permissão, formulário e auditoria. O conteúdo procedimental conteria exemplos corretos, anti-exemplos, erros frequentes e o check aplicável. A forma exata de descoberta nunca foi provada por esse desenho.

As perguntas para um experimento eram concretas. A Skill chega ao Workspace E2B? O agente a descobre sem receber seu nome no pedido? Carrega referências e executa scripts quando necessário? Uma versão nova da Skill continua compatível com o SDK e com apps antigos? O agente consegue reparar um erro a partir do check? Economia de contexto seria medida, não presumida.

No momento da recuperação, Q2.0 já trata da entrega de Skills ao Builder. Essa task é o consumidor atual da ideia, não uma razão para ativar toda a pesquisa R01.

## Workspace e o limite da investigação

A conversa inicialmente perguntou se deveríamos adotar Mastra Workspace. Depois reconheceu que o caminho Factory já resolvia Workspace a partir da sessão, com E2B. A questão passou a ser quais recursos nativos ainda poderiam ser aproveitados: filesystem, sandbox, mounts, busca, Skills e processos de desenvolvimento. Não era autorização para criar outro conceito de Workspace.

A rota de estudo proposta era ler tipos e implementação do pacote instalado, exemplos oficiais e a composição real da Factory. Um recurso existir no core não prova que a Factory o exponha no caminho utilizado. Um exemplo de overview não prova compatibilidade de versão nem passagem de configurações até a execução.

Os nomes `Harness` e `Agent Controller` apareceram como evolução de nomenclatura. Essa alegação histórica não seleciona um import. O [guia Mastra do repositório](../../../.agents/skills/mastra/SKILL.md) continua sendo o ponto de entrada da verificação.

## Memória, subagentes e custo

Observational Memory foi considerada para conversas longas do Builder: conservar decisões, tentativas e situação de trabalho sem repetir todo o histórico. Não foi considerada substituta de Brain. A síntese de uma conversa não deveria adquirir autoridade de política da empresa.

Também foram discutidos especialistas de dados, UI, segurança, integração e deploy, inspirados em referências de software factories. A alternativa mais econômica era especializar primeiro o conhecimento por Skills. Subagentes seriam qualificados quando contexto separado ou trabalho independente compensassem coordenação, tokens e risco de decisões divergentes.

A sequência instruction → Skill → Tool → Workflow → subagent era uma heurística da conversa para perguntar “precisamos de mais mecanismo?”, não uma hierarquia técnica universal. Cada um serve a um problema distinto. ACP/SDK subagents foram pistas de interoperabilidade, não dependências escolhidas.

Signals, inclusive a referência a `sendSignalToThread`, foram imaginados para avisar que compilação terminou, CI falhou ou um diagnóstico ficou disponível. O aviso deveria apontar para a evidência, não substituir estado de execução, log persistido ou resultado do build. [Fontes de contexto e Signals](sources-and-revalidation.md#s1-mastra-e-harness).

## Como SDK e orientação deveriam se reforçar

O desenho discutido combinava system prompt curto com invariantes, Skills para procedimento, tipos para feedback cedo, checks para comportamento e runtime para autoridade. Bloquear imports ou acesso a `process.env` foi uma ideia de prevenção de erros. R12 corrigiu expressamente o excesso: lint, tipos e instruções não isolam código arbitrário executado no mesmo processo que segredos privilegiados.

A rigidez aprovada pelo operador dizia respeito às primitives de plataforma. O agente poderia usar bibliotecas de domínio dentro da política, mas não inventar outro login, outro armazenamento de segredos ou outra autoridade de dados porque achou mais conveniente. Exemplos citados de dependências de domínio foram `decimal.js`, `date-fns`, `papaparse`, `xlsx` e `recharts`; não houve seleção ou qualificação individual dessas bibliotecas.

Também apareceram starters de dashboard, CRUD, solicitações e catálogo. A ideia era código inicial compatível com o padrão, não construir primeiro uma galeria ou marketplace. Agent Studio foi separado do recurso Agent e do gatilho Automation. Brain ficou como conhecimento governado, sem escolha prévia de embeddings, vector database ou graph.

## Prova imaginada do Builder

O experimento transversal seria pedir uma aplicação em linguagem de negócio, observar a descoberta da orientação, deixar o agente criar e depois alterar o código, executar os checks e usar a aplicação. Medidas propostas: tentativas até funcionar, erros repetidos, código inventado fora do padrão, custo reportado, contexto consumido e quantidade de instrução manual necessária.

Isso não obriga comparar todos os frameworks. Na convergência posterior, a investigação passou a exigir uma limitação observada antes de abrir outro candidato. O [roadmap](../../roadmap.md) e a task atual determinam quais experimentos podem ocorrer.
