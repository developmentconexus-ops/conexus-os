# 64. Ondas S1 a S5: o que sai, o que usar no lugar e o que fica nosso

> **Research.** Not authority. Estudo de 2026-10-04 com the operator. As decisões vivem no `conexus-os`
> (roadmap, registro de decisões e a spec de cada onda). Feito por leitura de código e por cinco testes
> descartáveis; nada aqui rodou contra a Hub. Cada número é estimativa até a spec da onda medir.

Entrada histórica para o censo de cada onda. O fluxo atual segue `conexus-study`,
`conexus-spec`, `conexus-build` e `conexus-prove`. Continua os estudos [62](62-mastra-state-signals.md) e
[63](63-mastra-processors.md).

## O critério

As ondas S1 a S5 existem para **tirar** código escrito à mão e fácil de errar, usando o que já está
resolvido, e deixar o time na lógica do produto e na arquitetura (the operator, 2026-10-04). Uma peça
nova entra quando apaga trabalho repetido e reduz decisões na próxima funcionalidade. Se só
acrescenta configuração, ela fica de fora. A ordem de busca é: os pacotes `@mastra` instalados, depois
um padrão de um produto aberto bem feito, depois uma biblioteca consagrada, e por último código nosso.

## Fontes

| Fonte | Versão ou commit | Para que serviu |
| --- | --- | --- |
| `conexus-os` | `main` em `bfca3ff` (2026-10-03) | o estado de hoje; todos os caminhos abaixo são deste commit |
| `@mastra/core`, `@mastra/server` | 1.71.0 (instalados) | `createRoute`, adapter Fastify, suspensão, agendador |
| `@mastra/fastify` | 1.5.15 (instalado) | como as rotas do Mastra entram no Fastify |
| `@mastra/client-js`, `@mastra/react` | 1.50.0, 1.5.0 (instalados) | tipos do cliente, `useChat` |
| `mastra-ai/mastra` | HEAD `4ba7038` (2026-10-04) | stack inteira, Mastra Code, factory-ui, e2e do playground |
| `documenso/documenso` | `80823ed` (2026-10-03), v2.19.0 | sessão, cookies, Origin, jobs, tRPC com OpenAPI, autorização |
| `triggerdotdev/trigger.dev` | `b21b2ec` (2026-10-02), SDK 4.7.2 | estado de execução, espera dentro do run, heartbeat, cron |
| `vercel/ai-chatbot` | `c2f8235` (2026-07-08), `ai` 7.0.15 | registro único da conversa, testes com modelo falso |
| Testes descartáveis | openapi-typescript 7.13 + openapi-fetch 0.17; Orval 8.39; Fastify 5.12 + fastify-type-provider-zod 7.0; Hono 4.13 | o cliente gerado e o contrato com Zod como fonte |

Onde o HEAD do Mastra difere do instalado, o texto diz. Os testes rodaram fora do repositório e
foram descartados; o que eles mostraram está nas seções.

## Decisões

| Data | Decisão | Estado |
| --- | --- | --- |
| 2026-10-04 | S1: o contrato passa a ser Zod nas rotas, no padrão `createRoute` do Mastra, com o OpenAPI gerado delas | direção dada por the operator; entra na spec da S1 |
| 2026-10-04 | S3 antes da S1, como no roadmap: um hook de escopo do Fastify e o acesso posto na rota por um `onRoute` valem para o registrador de hoje e para as rotas do Mastra; a S1 herda | provado no censo da S3 |
| 2026-10-04 | S4: nenhum dos dois. Uma Hub por banco (a trava de instância) tira a necessidade de execução única; o executor é uma lista de tarefas dentro da Hub, sem dependência nova | decidido no censo da S4; the operator escolheu que só o lixo técnico tem prazo |
| pendente | S5: mover os testes de navegador do Builder para o harness `live` | recomendado: sim |
| 2026-10-04 | S3: nenhum modelo de CSRF. Toda escrita já exige a Origin exata e o cookie é `__Host-`; o token sai inteiro | decidido no censo da S3; vai à `interrogate` na spec. Prazos de sessão fixos com um dono (the operator escolheu A) |

## Visão geral

| Onda | Escrito à mão hoje | O que usar no lugar | Sai (estimativa) | Fica nosso |
| --- | --- | --- | --- | --- |
| S1 Contrato | 4 geradores (669 linhas), clientes que devolvem `Response` cru, 29 `fetch` soltos, `as` na web | `createRoute` do Mastra sobre o nosso Fastify; Zod na borda da web | geradores, schemas Ajv gerados, `fetch` soltos, extensões `x-conexus-*` sem leitor | `problem+json`, a checagem do contrato no CI |
| S2 Run | pergunta "estacionada" e retomada em sessão nova; duas sessões por conversa; resumo do run copiado em 5 funções SQL | suspensão nativa do Mastra na sessão viva; espera como linha própria (Trigger.dev) | 350 a 450 linhas (TS e SQL) | espelho Git, gate do candidato, posse do run, estados do run |
| S3 Segurança | Origin + CSRF em 21 lugares, 3 formatos, 3 códigos; dois modelos de CSRF | um hook no registrador da S1; módulo único de cookies (Documenso) | 60 a 90 linhas | sessão no banco, refresh no Keycloak, regra do host do app |
| S4 Jobs | mesmo agendador copiado 3 vezes; timers só em memória; expirações sem limpeza | pg-boss, ou chave única por horário no Postgres (Documenso); catálogo de jobs (Trigger.dev) | cerca de 150 linhas (e entra quase o mesmo) | as regras de expiração de cada tabela |
| S5 Tela e testes | a conversa em uns 8 registros; 138 rotas simuladas num teste de 2.188 linhas | harness `live` com modelo roteirizado; um dono da conversa (AI Chatbot) | 1.500 a 1.900 de teste + 250 a 350 da tela, depois da S2 | prévia, diff, cartões de pergunta e plano |

## S1. O contrato entre a web e a Hub

### Hoje

- O contrato é YAML em `contracts/api/product/*.yaml`, com 30 operações. Os geradores são
  `scripts/generate-{iam,workspace,project,connector}-contracts.mjs` (669 linhas). Eles escrevem
  `apps/hub/src/generated/*-routes.ts` (schemas do Fastify, validados por Ajv) e
  `apps/web/src/generated/*-client.ts`.
- O cliente gerado devolve `Response` cru (`apps/web/src/generated/project-client.ts`). Quem chama faz
  o resto à mão, com `as`: `apps/web/src/features/project/api.ts`, `listProjects`, faz
  `response.json() as Promise<ProjectSummary[]>` sob um `biome-ignore ... debt: owning wave`.
- A web tem 29 `fetch` fora do gerado, em 20 arquivos (`apps/web/src/app/http.ts` é o `hubFetch`). A Hub
  tem uns 17 caminhos `/api/...` fora do contrato.
- Extensões `x-conexus-*`: 13 tipos. Só três têm leitor, e só em geradores e testes: `4a-id` (os 4
  geradores e `scripts/check-wire-bijection.mjs`), `contract-state` (a bijeção) e `ingress` (um
  teste). `current-state-carrier`, `authority-routes` e outras 8 não têm leitor. A
  `authority-routes` afirma quem pode chamar a rota, mas a Hub decide a permissão em outro lugar.
- Os erros já saem como `problem+json` (RFC 9457) de um lugar só: `apps/hub/src/http/problem.ts`.

### Referência

- **Mastra** (`@mastra/server` 1.71). `createRoute` em
  `server/server-adapter/routes/route-builder.ts:246`, com `pathParamSchema`, `queryParamSchema`,
  `bodySchema`, `responseSchema`, `requiresAuth`, `requiresPermission`, `onValidationError`. O handler é
  tipado pelos schemas: `InferParams` em `routes/index.d.ts:59`, retorno `z.infer` do
  `responseSchema`. São cerca de 380 rotas assim.
- O OpenAPI sai das rotas: `generateRouteOpenAPI` em `openapi-utils.ts:60-119`, o documento em
  `generateOpenAPIDocument` (`openapi-utils.ts:219-250`), servido em `/openapi.json`.
- Os tipos do `client-js` são gerados das rotas por `packages/server/scripts/generate-route-types.ts`
  (`zod-to-ts`) em `route-types.generated.ts` (25.363 linhas no HEAD). As classes do cliente são
  escritas à mão (`client.ts`, 2.655 linhas) e usam `PathParams<'GET /agents/:agentId'>` e
  `RouteResponse<...>`.
- O adapter Fastify (`@mastra/fastify` 1.5.15, `src/index.ts:528`) não usa o validador do Fastify:
  roda `parseAsync` do Zod em query, body e path (`index.ts:580-617`). Um erro Zod vira 400 por um
  formatador único (`index.ts:1369-1390`). O `any` fica dentro do registrador
  (`index.ts:1319-1337`); quem escreve a rota não o vê.
- O Mastra **não** confere a resposta em execução: o `responseSchema` serve ao tipo e ao OpenAPI
  (`src/index.ts:678-679` manda o resultado direto). Os erros dele são `{ error: message }`, mais
  fracos que o nosso `problem+json`.
- "O Mastra não usa `any`" é falso: `@mastra/core` tem 684 `as any` e 681 `: any`; `@mastra/server`
  90 e 81. A regra `no-explicit-any` não está ligada no lint deles. O que vale copiar é a fronteira
  tipada; nosso `tsconfig` é mais rígido que o deles.
- **Documenso**. tRPC 11 com `.input(Z...Request).output(Z...Response)` em arquivo `*.types.ts` irmão, e
  OpenAPI gerado por `trpc-to-openapi` a partir de `.meta({ openapi })` (`trpc/server/open-api.ts:6`).
  Variantes de rota com o login embutido: `authenticatedProcedure`, `adminProcedure`
  (`trpc.ts:192-197`). Um `AppError` com mapa de código para status (`trpc.ts:39-67`).

### O que os testes mostraram

| | openapi-typescript + openapi-fetch | Orval 8.39 | Fastify + Zod (fonte) | Hono RPC |
| --- | --- | --- | --- | --- |
| Código para 4 operações | 60 linhas escritas + tipos gerados | 1.195 de hooks + 133 de Zod | rotas com schema | rotas + `hc<AppType>` |
| Header obrigatório esquecido | erro de compilação | compila | erro de compilação | erro de compilação |
| Retorno errado no handler | não se aplica | não se aplica | erro de compilação | o tipo vem do handler, sem schema |
| Confere a resposta em execução | não (`{projectId:42,name:null}` passou) | não; o Zod é chamado à mão | não se aplica | não |
| Arquivo de contrato | o YAML de hoje | o YAML de hoje | OpenAPI gerado; perde `x-conexus-*`, `problem+json` declarado, `$ref`, os 3 arquivos | nenhum |
| Atrito | declara só TypeScript 5; instalou com `--legacy-peer-deps` | não filtra por operação; 4xx volta como valor | o `problem+json` do 400 veio de um tratador escrito no teste | só TypeScript para TypeScript |

### Proposta

1. Cada rota é declarada uma vez: schemas Zod de path, query, body e resposta, mais `requiresAuth`, a
   permissão e se a rota muda dados, como campos tipados.
2. Um registrador único sobre o Fastify valida a entrada com Zod, cumpre a permissão e a regra da S3,
   e converte o erro em `problem+json`. O `any` fica só nele.
3. O OpenAPI é gerado das rotas e continua no repositório. O CI recusa o PR se o arquivo mudar sem a
   rota mudar, para o contrato continuar revisável no diff. O lint do Redocly e a bijeção passam a ler o
   gerado.
4. Os tipos do cliente da web são gerados das rotas, como no Mastra.
5. A web passa toda resposta pelo schema da rota (`z.array(ProjectSummary).parse(await
   response.json())`). É isso que apaga os `as` de `features/*/api.ts`. O Mastra não faz isso.

**Apagar:** os 4 geradores, os `*-routes.ts` e `*-client.ts` gerados de hoje, os `fetch` soltos, as
extensões sem leitor. Uma extensão que alguém precisa vira campo tipado da rota.

**Fica:** `problem+json`; o `operation-ledger.md` e a bijeção, adaptados ao OpenAPI gerado.

### Provar antes da spec

- O caminho inteiro em uma operação real: rota Zod → registrador → OpenAPI gerado passando no Redocly →
  tipos do cliente → `parse` na web.
- Se o `createRoute` ou o `registerApiRoute` do Mastra pode registrar rotas nossas, em vez de
  reescrevermos o padrão.
- Se o `@fastify/swagger` declara `problem+json` nos erros. No teste ele saiu `application/json`.

## S2. O run do Builder

### Hoje

Caminhos em `apps/hub/src/builder/`.

- **Pergunta estacionada**, o maior bloco: `run-runtime.ts:299-363` (mapa `warm`, `WARM_PARKED_MS` de
  30 min, `take/letGo/evict`), `:723-728`, `:756-780` (`letGoOfParked`, que mexe em
  `session.suspensions.clear()` e `run.requestAbort`), `:920-935` (`createParkedDiscard`);
  `runtime.ts:109-148` (`readParkedCalls` raspa `metadata.suspendedTools` da thread) e `:170-177`
  (resume numa sessão nova); `service.ts:409-433` (`answerBuilderRun`); `store.ts`
  (`resumeBuilderRun`, `expireParkedBuilderRuns`); migrations `0043` e `0052`; a fase `PARKED` em
  `contracts/technical/builder-run-vocabulary.json`.
- **Duas sessões por conversa:** `builder:<id>` (`run-runtime.ts:783`) e `conversation:<id>`
  (`conversation-sessions.ts:88`), ligadas por três mapas de módulo (`module.ts:152-154`) e por
  `owners/forget` (`run-runtime.ts:809-839`). `createControllerRunSessions` tem 134 linhas.
- **Resumo do run:** o mesmo `jsonb_build_object('builderRunId', ...)` em 5 funções (`claim_builder_run`,
  `read_builder_run`, `list_builder_runs` em 0041; `request_builder_run_cancellation` em 0043;
  `advance_builder_run_source` em 0015), uns 60 no total, e outras formas em 0051 e 0052.
- **Arquivo do run:** `run-runtime.ts` tem 1.039 linhas; `execute` tem 367 (`:365-731`).
- **Posse do run:** `run-lease.ts` (heartbeat de 10 s, takeover a cada 30 s) e
  `take_over_stale_builder_runs` com `FOR UPDATE SKIP LOCKED` (migration 0051).

### Referência

- **Mastra 1.71.** A pergunta já é uma suspensão nativa: `ask_user` e `submit_plan`
  (`tools/builtin/ask-user.ts:81-120`), que a Hub já usa (`harness/tools.ts:82-130`). A resposta na
  sessão viva: `session.respondToToolSuspension` (`agent-controller/session.ts:4166`). O estado
  "esperando" já existe: `SessionSuspensions` (`session.ts:1162-1260`) e
  `displayState.pendingSuspensions`. Quando a sessão acaba, `session.abort()` chama
  `settleSuspendedToolCallsAsDenied` (`session.ts:3346-3385`), que é exatamente "a pergunta termina
  com a sessão". `Agent.listSuspendedRuns` (`agent.ts:8578`) lê do storage depois de um restart.
  `MASTRA_SUSPENDED_RUN_TTL_MS` (30 min) limita o estado quente.
- O Mastra **não** tem máquina de estados pronta, nem TTL de sessão ociosa, nem keep-alive do E2B.
  O `tripwire` segue sem tratamento no AgentController também no HEAD.
- **Mastra Code** (HEAD, `mastracode/factory/src/session/live-sessions.ts:43-110`) não guarda "run
  estacionado" em tabela: lê `session.run.isRunning()` e `pendingSuspensions`.
  `SessionRetirementCoordinator` (`factory/src/sandbox/session-retirement.ts:45-182`) aposenta por
  evento, não por ociosidade.
- **Trigger.dev.** O estado da execução é um log que só cresce: `TaskRunExecutionSnapshot`
  (`schema.prisma:1372`), e o estado atual é o último snapshot válido. Não há biblioteca de máquina de
  estados: cada operação faz `switch` sobre o estado, com `assertNever`. Contra corrida, toda ação leva
  o id do snapshot que viu e é recusada se ele não for mais o último
  (`runAttemptSystem.ts:355-368`). A espera é uma linha própria, `Waitpoint` (`schema.prisma:1487`),
  com tipo, status, saída, prazo e chave de idempotência. A resposta completa a linha
  (`waitpointSystem.ts:99`) e enfileira um "continue" com id fixo (`:567`). Antes de mudar qualquer
  coisa, um job de garantia é armado e só é confirmado no fim (`waitpointSystem.ts:119-178`). O
  heartbeat é um timer preso ao snapshot (`executionSnapshotSystem.ts:517-526`): mudar de estado o
  invalida sozinho. Eles usam Redis para fila e trava; nós temos a linha no Postgres.

### Proposta

1. A pergunta vira uma espera dentro do run, na sessão viva, respondida por
   `respondToToolSuspension`. Se a sessão acabou, `settleSuspendedToolCallsAsDenied`, e a próxima
   mensagem da pessoa leva a resposta, como no Claude Code. Sai o modelo "estacionar e retomar":
   `warm`, `evict`, `lettingGo`, `letGoOfParked`, `createParkedDiscard`, `readParkedCalls`,
   `registerParkedCalls`, a fase `PARKED`, `resumeBuilderRun`, `expireParkedBuilderRuns` e a
   migration 0052. Estimativa: 250 a 300 linhas TS e uns 60 de SQL.
2. Uma sessão por conversa. Somem o escopo duplo e `owners/forget`: 40 a 60 linhas.
3. Uma função `builder.run_summary(run)` no lugar dos 5 literais: de uns 60 para uns 15.
4. Do Trigger.dev, levar o padrão e não a biblioteca: a transição como `switch` exaustivo com
   `assertNever`; a recusa por "estado que você viu já mudou"; e, se a espera precisar sobreviver a um
   restart, uma linha de espera com chave de idempotência em vez de raspar a thread.
5. Dividir `run-runtime.ts` por assunto: sandbox, espelho, gate, sessão e `execute`.

**Fica nosso:** o espelho Git e a admissão; o gate do candidato (o `isTaskComplete` do Mastra já é o
gancho); `holdOpen` e o usuário root do sandbox; a posse do run no Postgres; os estados e fases;
`watchTripwire` e o watchdog de 10 min de silêncio.

### Provar antes da spec

- Um run pode esperar a pergunta dentro do mesmo turno sem disparar o watchdog de silêncio e sem perder
  o heartbeat da posse.
- O que o Mastra faz com uma ferramenta negada quando chega a próxima mensagem.
- Se o snapshot do run suspenso some depois de `settleSuspendedToolCallsAsDenied`, para o
  `listSuspendedRuns` não listar um run já negado.
- Se o workspace pode vir só do resolver por `requestContext`, sem os mapas de módulo.

## S3. Origin, CSRF, sessão e tempos de vida

### Hoje

Caminhos em `apps/hub/src/`.

- A regra "Origin exato + `x-conexus-csrf` igual ao cookie `__Host-conexus_csrf`" está escrita em
  21 lugares: `identity-access/routes.ts:146-148` e `:174-175`, `identity-access/application-access.ts:177-178`,
  `identity-access/membership.ts:146-147`, `identity-access/installation-routes.ts:31-32`,
  `workspace/routes.ts:33-34`, `project/routes.ts:75-76` e `:111-112`, `builder/routes.ts:115-116`,
  `:146-147` e `:184-185`, `builder/model-accounts.ts:145-146`,
  `builder/mastra-session-routes.ts:266-268`, `connectors/routes.ts:52-53`. São 3 códigos de erro
  (`origin-denied`, `csrf-denied`, `request-authenticity-denied`). Em 10 arquivos,
  `const CSRF_COOKIE` e `header` são redeclarados.
- Divergências: `connectors/routes.ts:53` compara a origem por igualdade simples, não por
  `isExactOrigin` (`platform/origin.ts:2`). Dois modelos de CSRF convivem: com digest no banco
  (`resolveCurrentSession(request, true)`, `identity-access/module.ts:71-77`, SQL
  `iam.resolve_hub_session` em 0026) e só cookie igual ao header. O mount do Mastra
  (`mastra-session-routes.ts:260-268`), que recebe a maior parte das escritas, usa o segundo. A origem
  também é checada ali, então não é uma falha aberta. A ordem 401/403 muda por rota.
- Cookies: nomes em `identity-access/routes.ts:15-21`, `mar/application-host-routes.ts:14-15`,
  `mar/preview-routes.ts:9`. As opções `{path, secure, httpOnly, sameSite}` aparecem em 4 lugares.
- Tempos de vida: em SQL, na migration 0026 (8 h absoluta, 30 min ociosa, refresh a cada 5 min,
  Preview 15 min, handoff 60 s e 30 s): 16 literais, mais 7 em 0023 a 0025. A spec 0005 já cita
  `identity.session.max`, da spec 0008.
- O refresh no Keycloak já tem um dono: `identity-access/host-sessions.ts:156-177` (`checkProvider`).

### Referência

- **Mastra.** `requiresAuth` e `requiresPermission` são campos da rota, aplicados pelo adapter
  (`src-fastify/src/index.ts:543-566` e `:650-690`). O login dele é por token (`Bearer`). Não há CSRF,
  checagem de Origin, sessão ociosa dentro de absoluta, nem provedor para Keycloak. Serve como molde de
  "a rota declara, o registrador aplica", não como peça.
- **Plugins do Fastify.** `@fastify/csrf-protection` 8.0.1 cobre só cookie igual ao header, sem Origin
  nem banco. `@fastify/session` 11.1.3 tem um só `maxAge`. `@fastify/secure-session` 8.4.0 não revoga
  no servidor. Nenhum cobre a nossa sessão.
- **Documenso.** A sessão é escrita à mão em uns 160 linhas, no padrão do guia do Lucia
  (`packages/auth/server/lib/session/session.ts`): token aleatório, só o SHA-256 no banco, uma função
  única que valida, expira e renova, e revogação com auditoria numa transação (`:129-161`). Cookies num
  módulo só (`session-cookies.ts:27-33`), nomes por função (`lib/constants/auth.ts:71-73`) e tempos num
  `config.ts`. A checagem de Origin é um middleware único no roteador pai
  (`packages/auth/server/index.ts:21-38`). Autorização: mapas de papéis tipados
  (`lib/constants/organisations.ts:24-40`) e uma função que devolve o filtro da consulta já restrito a
  membro e papel (`lib/utils/teams.ts:129-176`), usada em 40 arquivos.
- **O que não copiar do Documenso.** O token CSRF existe só no login; as outras escritas não têm token
  nem Origin; o cookie é `SameSite=none` em produção; a expiração é só deslizante de 30 dias; o
  middleware aceita a ausência do header Origin. A nossa regra é mais rígida.

### Proposta

1. A S3 entra na S1: um hook no registrador, acionado pelos campos da rota (`requiresAuth`, "muda
   dados"), com um só nome de cookie e header e um só código de erro. Saem as 21 guardas e as 10
   redeclarações.
2. Um só modelo de CSRF, o que confere contra o banco. O mount do Mastra passa a usar o mesmo.
3. Um módulo de cookies com nomes e opções, como o do Documenso.
4. Uma tabela única de tempos de vida, que gera o SQL e o texto da referência de segurança (spec 0008).
5. Exigir o header Origin em todo método que muda dados; a ausência não passa.

**Fica nosso:** a sessão opaca em `iam.host_session` e seus três tipos, o handoff, o refresh no
Keycloak, a regra do host do app (Origin do próprio app, sem CSRF, porque o cookie `__Host-` não chega
ao host irmão; ver `mar/application-host-routes.ts:140-141`), e o 503 `identity-provider-unavailable`.

**Estimativa:** saem de 100 a 110 linhas, entram de 30 a 40: 60 a 90 a menos.

### Provar antes da spec

- Se alguma das 5 chamadas sem `true` em `builder/routes.ts` é uma escrita, e se alguma escrita escapa
  da checagem de Origin.

## S4. Trabalho periódico e o que expira

### Hoje

| Trabalho | Onde | Intervalo | Sobrevive a restart | Duas Hubs |
| --- | --- | --- | --- | --- |
| VMs E2B pausadas há 7 dias | `builder/idle-machine-sweep.ts:41,65` | 1 h + no boot | sim | idempotente, sem trava |
| Posse do run | `builder/run-lease.ts:2-4,42` | 10 s / 30 s | sim (Postgres) | `SKIP LOCKED` |
| Spans do Mastra (30 dias) | `builder/storage.ts:25-58` | 24 h + no boot | sim | idempotente |
| Sessões de conversa ociosas | `builder/conversation-sessions.ts:10-11,43-48` | 60 s | não (mapa em memória) | cada Hub vê as suas |
| Run parado na pergunta | `builder/run-runtime.ts:304,724` | 30 min | não | por processo |
| Backup | `infra/backup/conexus-backup.timer` + scripts | diário | sim (systemd) | não se aplica |

O molde do agendador (`inFlight` + `AbortController` + `close()`) está copiado 3 vezes, uns 120
linhas.

**Expirações sem limpeza (a confirmar):** `iam.session`, `iam.oidc_transaction`,
`iam.bootstrap_context`, `model_connection."authorization"` e `iam.workspace_invitation` têm validade,
mas ela só aparece como filtro de leitura; a busca por `DELETE` nas migrations não achou nada.
`project.claim_abandoned_create_project_attempt` (`0001_baseline.sql:1210`) não tem chamador em
TypeScript. Os recibos concluídos de `project.operation_idempotency` não têm retenção.

### Referência

- **Mastra 1.71.** O `Scheduler` (`workflows/scheduler/scheduler.ts`) é seguro com várias instâncias e
  sobrevive a restart, mas só agenda `workflow` ou `agent` (`storage/domains/schedules/base.ts:14`).
  Não tem fila genérica nem limpeza de tabela. Não serve para o trabalho da Hub.
- **pg-boss 12.36.0.** Filas no Postgres, cron (`boss.schedule`), uma execução só entre instâncias,
  retry com backoff, heartbeat por job (cobre a posse do run) e retenção. Precisa de um schema próprio
  e de permissão de DDL, que o modelo de papéis da Hub não prevê.
- **Documenso.** Jobs declarados com id, cron, schema Zod e handler. Um só processo verifica os horários
  por instância. A execução única vem de um id determinístico por horário como chave primária: quem
  perde a corrida recebe conflito e pula (`lib/jobs/client/local.ts:18-28,124-152`). Limpeza em lote
  com `ctid` e `LIMIT` (`cleanup-rate-limits.handler.ts:20-27`). Eles também não apagam sessões e
  tokens vencidos.
- **Trigger.dev.** Catálogo tipado de jobs (nome → schema, timeout, retry, cron), cron com
  `job:<horário>` inserido uma vez só (`packages/redis-worker/src/worker.ts:1085-1103`) e jitter. Eles
  removeram o graphile-worker e usam Redis; o padrão vale, a infraestrutura não.

### Proposta

1. Um runner: pg-boss, ou o padrão do Documenso (id por horário + `INSERT ... ON CONFLICT DO NOTHING`)
   sem dependência nova. A decisão é dthe operator no censo; o pg-boss traz retry e heartbeat, o padrão do
   Documenso evita o schema novo.
2. Um catálogo de jobs declarado, como os do Documenso e do Trigger.dev, no lugar das 3 cópias.
3. Um reaper: uma tabela de políticas (tabela, coluna de validade, lote) com `DELETE` em lote, para as
   expirações sem limpeza. Os prazos vêm da S2 e da spec 0008.

**Fica fora do runner:** o heartbeat da posse do run, que depende da S2; backup e worktree-reap, que
são systemd; os timers de vida de um run (30 min, 10 min, 5 s) e o `holdOpen` do E2B.

## S5. A tela do Builder e os testes

### Hoje

Caminhos em `apps/web/src/features/builder/` (5.066 linhas no total).

- A conversa vive em uns 8 registros: a janela da thread em Query (`mastra-session.ts:183-187`); o
  transcript em `useReducer` (`transcript.ts`, 618 linhas); runtime e memória (`runtime.ts`); o estado
  do run por polling de 1 a 15 s, com três escritores (`builder-session.ts:48,60-87` e invalidates em
  `construir/construir.tsx:180,209`) e um `Map` global `liveRuns`; a assinatura SSE (`connection.ts`, 147
  linhas); a bolha local de envio (`construir.tsx:111,160-172`); e os pedidos remontados do SQL
  (`persistedRequestsOf`, `construir.tsx:49,248`).
- A reconciliação manual (`mergeServerWindow`, `claimOnScreenEntries` e outras) tem uns 200 linhas em
  `transcript.ts:250-460`. Há 31 pontos de invalidate ou refetch, e um "repair" que relê a thread
  porque o veredito do check não chega pelo stream (`mastra-session.ts:198-229`).
- O `transcript.ts` foi adaptado da factory-ui do Mastra Code. O `useChat` do `@mastra/react` não fala
  a API do AgentController.
- Testes: `tests/implementation/builder.browser.test.mjs` (2.188 linhas, uns 62 testes) roda contra
  uma Hub simulada, com 138 `page.route`. Já existe `tests/live/` (harness de 218 linhas) com Postgres,
  Keycloak, Hub real e modelo roteirizado, no CI, mas com 9 fluxos.

### Referência

- **Mastra.** O e2e do playground sobe um servidor Mastra real com modelos falsos
  (`packages/playground/e2e/playwright.config.ts`). O Mastra Code testa o controller sem browser, com o
  AgentController e o servidor reais (`mastracode/web/e2e/web/agent-controller-server.ts`, 46
  cenários). O `useChat` do `@mastra/react` 1.5.0 instalado não tem `withInitialHistory` (só no HEAD).
- **Vercel AI Chatbot.** Um dono só da conversa: o store do `useChat`. O histórico salvo entra uma vez
  por conversa, guardado por id (`hooks/use-active-chat.tsx:184-198`), e depois só o stream mexe. O
  cliente gera o id da mensagem e o servidor grava com ele (`route.ts:189`): a mensagem otimista sai sem
  bolha local. O formato salvo é o da tela (`lib/db/schema.ts:42`, `parts` em JSON; a leitura é um
  `map` de 8 linhas). A aprovação de ferramenta é estado da parte da mensagem, e a resposta atualiza a
  mesma mensagem. Os testes trocam o modelo por um falso na camada do provider
  (`lib/ai/providers.ts:5-19`), com servidor e banco reais.
- **O que não serve do AI Chatbot.** O caminho de aprovação não roda em nenhuma ferramenta daquele
  commit (`needsApproval` não aparece). A retomada depois de recarregar é um stub que devolve 204. A
  suíte tem 23 testes rasos. A conversa tem um escritor só; a nossa tem três.

### Proposta

1. **Testes, primeiro e sem depender de nada:** mover os testes do Builder para o harness `live`, um
   fluxo de uns 30 linhas por caso. Saem de 1.500 a 1.900 linhas e as fixtures de mock. Ficam simulados
   só os de layout e os de erro de rede (401, 403).
2. **Tela, depois da S2:** com o estado completo do run no stream da sessão única, saem o polling, o
   `liveRuns`, o "repair", `runSettled/runParked`, `persistedRequestsOf` e a bolha local: de 250 a 350
   linhas e de 20 a 30 dos 31 invalidates. Do AI Chatbot, levar o desenho: o histórico semeia uma vez,
   o id da mensagem nasce no cliente, e a pergunta é estado da parte da mensagem.
3. **Não agora:** trocar o `transcript.ts` pelo `useChat`. Seria trocar de protocolo, não de registro.

**Fica nosso:** a prévia do app (`use-preview.ts`), o diff e o código, os cartões de pergunta e de
plano, o trace e as frases das ferramentas.

## Ferramentas avaliadas e recusadas

| Ferramenta | Por quê |
| --- | --- |
| Hono / Hono RPC | Sem arquivo de contrato e sem schema de resposta; trocar o HTTP da Hub reabre a segurança da S3. O Mastra usa Hono como base, mas tem adapter para o nosso Fastify |
| Orval | 1.195 linhas para 4 operações; header obrigatório vira opcional; não liga o Zod ao fetch |
| Drizzle, Prisma, Kysely | O Q2 provou SQL direto para os apps; Mastra e o pg do Mastra usam SQL direto; seria uma segunda fonte do esquema |
| AdonisJS, Wasp, NestJS como base | Trazem login, ORM e estrutura próprios, que batem no Keycloak e no Fastify do Mastra |
| TanStack Form | Já decidido na C-033: React Hook Form |
| `@fastify/session`, `secure-session`, `csrf-protection` | Não cobrem sessão ociosa dentro de absoluta, digest no banco nem revogação |
| Agendador do Mastra | Só dispara workflow ou agente |
| Redis (BullMQ, redis-worker, redlock) | Serviço novo; o Postgres resolve o mesmo |
| `useChat` do AI SDK ou do `@mastra/react` | Não falam a API do AgentController |
| Storybook | Sem falha que ele pegaria hoje; só se `packages/brand` virar um design system grande |

## Ordem e dependências

- A S3 cabe dentro da S1, porque quem aplica a regra é o registrador de rotas.
- A parte de testes da S5 não depende de nada e pode vir antes. A parte da tela depende da S2.
- A S4 usa os prazos que a S2 e a spec 0008 definem.
- O roadmap de 2026-10-03 põe a S2 primeiro. Nada aqui contradiz isso.

## O que não foi verificado

- Nada rodou contra a Hub. Os números do `conexus-os` vêm de leitura e `wc`; os dos outros
  repositórios, de leitura no commit da tabela de fontes.
- As expirações sem limpeza vêm de busca nas migrations e no TypeScript; uma limpeza dentro de outra
  função SQL não foi descartada.
- A versão instalada de `@mastra/e2b` não foi comparada com o HEAD em `lifecycle.onTimeout`.
- O pg-boss não rodou contra o nosso Postgres nem contra o modelo de papéis da Hub.
