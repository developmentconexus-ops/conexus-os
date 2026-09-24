# Registro de Decisões — Mitra → Conexus

> **O que é este arquivo.** A destilação do trabalho inteiro de engenharia reversa da Mitra num
> só lugar: cada padrão observado, seu veredito para o Conexus, e o porquê. É a peça de consulta
> mais importante desta pasta — quando for planejar o Conexus, comece por aqui.
>
> **De onde vem.** Extraído do [Mitra Inspiration Map](#mitra-inspiration-map)
> (v0.9.0), que permanece congelado como cadeia de evidência (fonte, citação, data). Este registro
> **deriva** dele; não o substitui. A coluna *Evidência* aponta a seção do mapa; a coluna *Ref*
> aponta o documento temático desta pasta que explica o padrão em profundidade.
>
> **Vocabulário** (`CAPABILITY-REALIZATION-METHOD`):
> `OWN` construir do zero como diferencial · `ADOPT` copiar o padrão · `ADAPT` copiar com mudança ·
> `SPIKE` investigar antes de decidir · `REFERENCE` guardar como lição, não implementar agora ·
> `DEFER` fora de escopo por ora · `REJECT` não fazer (com o motivo).

---

## Como ler o veredito

- **ADOPT / ADAPT** = a Mitra acertou. Copiar (talvez com ajuste). São o piso do Conexus.
- **OWN** = a Mitra **não tem** e é onde o Conexus ganha mercado. São as apostas.
- **REJECT** = a Mitra tem e está **errado/perigoso**. Cada um é um requisito negativo do Conexus
  (“não repetir isto”). Consolidados em [08 — Limites e gaps](full-study.md#08--limites-e-gaps-onde-a-mitra-falha--onde-o-conexus-ganha).
- **SPIKE / REFERENCE / DEFER** = decidir depois, com contexto.

**Placar** (após dedup): ~95 ADOPT · ~25 ADAPT · ~6 OWN · ~22 REJECT · ~3 SPIKE · ~30 REFERENCE · ~4 DEFER.

---

## 1. Harness agêntico → ``01-harness-agentico.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| Harness = Claude Code CLI sobre sandbox E2B por projeto | REFERENCE | Confirma a direção; base do Conexus alinhada | `§2`, `§20` |
| `CLAUDE.md`/`AGENTS.md` por projeto como contexto versionado | **ADOPT** | Context pack barato e auditável; precedência de arquivo sobre regra genérica | `§21`, `§31.5` |
| Protocolo de turno rígido `SYNC → BUILD → SHARE` | ADAPT | SYNC = reconciliação de abertura; SHARE = entrega explícita (no Conexus, com envelope) | `§34.10` |
| Steering por fila em arquivo, drenada no SYNC | **ADOPT** | Zero interrupção do CLI; o agente decide quando ler | `§26` |
| `taskId` = sessão contínua sem limite de turnos | ADOPT | Sessão longa por unidade de trabalho é o modelo certo | `§26` |
| Escalada após 3 tentativas com dossiê estruturado | ADOPT | Regra barata para role contract de Worker | `§21`, `§34.3` |
| Tools do agente = server functions do projeto via **MCP** (`mcp__mitra-business`) | **ADOPT** | Melhor decisão da Mitra: capacidade do agente vira artefato versionável, revisável, permissionável | `§31.2` |
| Um MCP server por domínio | **ADOPT** | Namespace limpo, isolamento por domínio | `§31.2` |
| Sem tool de SQL direto para o agente de negócio | **ADOPT** | Guarda-corpo: SQL passa por SF auditável (`consulta_livre`) | `§31.2`, `§31.6` |
| `ToolSearch` / schemas de tool sob demanda | ADAPT | Necessário quando o registry cresce; já prever o formato de nome | `§31.2` |
| Modelo × reasoning-effort como sufixo (`…:high`) por turno | ADOPT | Um seletor só; string única derivada no backend | `§26` |
| Telemetria de token/custo por turno **e** por sessão | ADOPT | `turn_end.costUSD` + `taskUsage` acumulado é o mínimo | `§26` |
| Múltiplos `agentType` (claudecode/codex/opencode) | ADAPT | Abstração existe; começar com 1 runtime sólido, interface de sessão pronta | `§18`, `§26` |
| `AskUserQuestion` deve encerrar o turno (mitigação por prompt) | REFERENCE + STRENGTHEN | Preferir bloqueio mecânico no harness; a fraqueza confessa do prompt-only é o argumento | `§34.10 (CLAUDE.md)` |
| Delegar compactação ao CLI nativo, sem expor estado | ADAPT / REJECT parcial | Base aceitável, mas o usuário precisa ver contexto restante | `§26` |

## 2. Registro de artefatos (server functions) → ``02-registro-artefatos.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| Três tipos de SF: `JAVASCRIPT` / `SQL` / `INTEGRATION` | ADOPT | Três tipos cobrem quase tudo | `§23`, `§34.4` |
| Três registries irmãos: `serverFunction` / `dataLoader` / `dbAction`, todos por id + input | **ADOPT** | Nenhum SQL do cliente; toda operação é artefato nomeado e permissionável | `§32.3`, `§33` |
| Provisionamento idempotente (`list → update \| create`) por `name` | **ADOPT** | O script é a versão; roda N vezes, mesmo estado | `§21`, `§34.3` |
| DDL idempotente (`CREATE TABLE IF NOT EXISTS`), nunca `DROP` | ADOPT | Aditividade por padrão | `§34.3` |
| Envelope `{executionId, executionStatus, output:{rowCount, rows}}` | **ADOPT** | `executionId` = auditoria de graça; `executionStatus` abre o modo assíncrono | `§32.3` |
| `executeServerFunctionAsync` + `stopServerFunctionExecution` | **ADOPT** | Cancelar execução longa é requisito | `§32.3` |
| Dois SDKs: build privilegiado (`mitra-sdk`, DDL/DML) × runtime restrito (`mitra-interactions-sdk`) | **ADOPT** | Arquitetura central: o poder mora no build, não no runtime | `§34.1` |
| Fragmentos SQL nomeados + regra "a SF de X nunca filtra `{{x}}`" + contrato `name/value/code` | **ADOPT** | Resolve cross-filter de BI inteiro com uma linha; um `Chart` genérico consome tudo | `§34.7` |
| SF com cron embutido | ADOPT | Job scheduling sem serviço separado | `§16`, `§21` |
| Espelho externo→MySQL com upsert `ON DUPLICATE KEY` (nunca DELETE+INSERT) | **ADOPT** | Paginação até esgotar + upsert em chunk + cursor derivado do dado + log por etapa | `§21`, `§34.6` |
| `serverFunctionId` **numérico** no cliente → `sf-ids.ts` gerado | **REJECT** | Acopla frontend a ids de banco; promote/duplicação vira remapeamento. O próprio prompt avisa "NUNCA IDs hardcoded". Usar slug estável | `§21`, `§32.3`, `§34.3` |
| Três sintaxes de binding (`event.x` textual / `event.x` global / `{{x}}` mustache) | **REJECT** | Inconsistência cara; uma só sintaxe | `§34.4` |
| SQL por interpolação de string + sanitização por regex **no cliente** | **REJECT** | Vulnerável por design: quem chama fora do app pula o `limpar()`. Usar bind params reais | `§34.4` |
| Código de job como string em template literal | **REJECT** | Frágil (a própria Mitra documenta a armadilha do `\s`); job é arquivo real | `§34.6` |
| Toda superfície de dados do app atrás de SF (CRUD REST bloqueado p/ business) | REFERENCE / ADOPT (princípio) | "Superfície = contratos explícitos" | `§29`, `§34.4` |

## 3. Camada de dados → ``03-camada-dados.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| Um schema MySQL + container Docker por projeto, provisionado no create | **ADOPT** | Isolamento por padrão, sem etapa manual | `§33` |
| Backend serverless: só SFs gerenciadas, sem `src/` | ADOPT | Reduz superfície; lógica versionada como SF + migration | `§21` |
| Schema derivado de descrição em linguagem natural | ADAPT | Ótimo para começar; exige revisão humana antes de produção | `§33` |
| Migrations append-only materializadas **pelo sistema** após o turno | ADOPT (princípio) | Efeito durável capturado por interceptação, fora da vontade do Worker | `§21`, `§34.3 (CLAUDE.md)` |
| Placeholders de FK (`CODVEND=0`) para dado sujo da origem | ADOPT | Detalhe de robustez que denuncia experiência real | `§34.6` |
| **Sem ambiente de teste de dados por padrão** (banco de DEV = o banco) | **REJECT** | Maior risco operacional: SF destrutiva "em dev" apaga produção. Conexus: efêmero + fixtures | `§33`, `§34.9` |
| **Banco e SFs não versionados; mudança vale na hora** | **REJECT** | Migration tem que ser gate, não só log | `§33` |
| Smoke test contra o banco de produção (única forma possível lá) | **REJECT** | Só é "seguro" porque as SFs são SELECT. Conexus: asserção de valor, não "não explodiu" | `§34.9` |
| Contradição doc-oficial × §27 sobre banco DEV vs PROD | SPIKE | Único conflito de fontes não resolvido; só um promote real decide | `§33.3` |
| Credencial de banco externo criptografada no próprio banco do projeto | ADAPT | Aceitável, mas preferimos um único cofre | `§33` |

## 4. Integração externa → ``04-integracao-externa.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| SF `INTEGRATION` = HTTP declarativo `{connection, method, endpoint, body}` (JSON, não código) | **ADOPT** | Conector declarativo + credencial simbólica → repo público-safe | `§34.5` |
| `callIntegrationMitra` (proxy REST genérico; credencial fica no servidor) | ADOPT (princípio) | App nunca vê credencial; um contrato para N provedores | `§12` |
| Conexão nomeada por blueprint (`sankhya_oauth`) + slug reutilizável | ADOPT | `connection` como handle; blueprint versionado | `§15` |
| Blueprint com `fieldsSchema` dinâmico + `testEndpoint` | ADOPT | Catálogo versionado; formulário de credencial gerado do schema | `§16.2`, `§25` |
| Union fechada de `AuthorizationConfig` (header/basic/cookie/query) + `DYNAMIC_TOKEN` | ADOPT | Cobre 95% dos SaaS; token-refresh server-side | `§25` |
| Credencial server-side em `.env` gitignored, injetada no gateway | ADOPT | Segredo nunca no cliente nem no repo | `§15` |
| Data Discovery por SQL para resolver escopo contra dado real | **ADOPT (forte)** | Antídoto ao "inventar regra": build valida hipóteses contra o schema real antes de codar | `§14`, `§15` |
| 4 camadas de dado externo (rede→conexão→virtual/materializado→REST) | ADOPT | DataLoader com executionLog = esqueleto do pipeline de carga | `§16` |
| Tunnel reverso gerenciado (Cloudflare) com token p/ a TI | ADOPT | Onboarding on-prem sem VPN; health por rota | `§18`, `§25` |
| CSV como tipo de conexão (upload FormData) | ADOPT | Fonte barata e útil | `§25` |
| Gateway com **SQL livre** contra o ERP | ADAPT (com trava) | Poderoso p/ Discovery, perigoso em produção: read-only forçado + allowlist por perfil | `§15` |
| Perfil de ERP plugável (TGFCAB/TOP, `AD_`, multiempresa) | REFERENCE | Conhecimento de domínio versionado, não hardcoded no agente | `§15` |
| Credencial de produção colada no chat; 1 token → 6 empresas | **REJECT / trava** | Canal de credencial dedicado; escopo por empresa; seleção explícita de ambiente | `§15` |
| Chave de LLM no cliente / SF pública com segredo | **REJECT** | Anti-pattern de segurança; credencial de modelo sempre server-side | `§13` |

## 5. Ciclo de vida (build → release → promote) → ``05-ciclo-de-vida.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| Branch `user/{id}` por colaborador, `main` = baseline compartilhada | ADOPT | Isolamento de trabalho por pessoa; merge no SHARE | `§34 (CLAUDE.md)` |
| Sandbox descartado após 20 min idle | REFERENCE | "Pular SHARE = trabalho órfão"; explica a urgência do commit | `§34 (CLAUDE.md)` |
| PROD como projeto forkado e ligado ao DEV | **ADOPT** | Isolamento real de ambiente > flag "modo prod" | `§27` |
| Promote com 12 steps nomeados e observáveis | **ADOPT** | Deploy legível passo a passo é requisito | `§27` |
| Falha de deploy vira tarefa do agente ("Resolve with the agent") | **ADOPT** | Fecha o loop agente↔operação | `§27` |
| Save Release desacoplado de Promote | ADOPT | Separar "marcar versão" de "publicar versão" | `§27` |
| Rollback por promote de tag antiga (código, não schema) | ADOPT | Coerente com migrations forward-only | `§27` |
| GitHub Release + CHANGELOG automáticos | ADOPT | Histórico auditável de graça | `§27` |
| Deploy por snapshot versionado (não live-mount do sandbox) | ADOPT | Prod imutável e reproduzível | `§24` |
| Status `inSync/hasOutput/published/version` → diff "publicar mudanças" | ADOPT | UX clara de "há mudanças não publicadas" | `§24` |
| `mergeMitraPackageBaseline` p/ atualizar template upstream | REFERENCE | Resolve "template evoluiu depois do fork" | `§27` |
| Scaffold / UI-kit byte-idêntico versionado entre projetos | ADAPT | Bom piso de qualidade; precisa de escape hatch | `§21`, `§34.2` |
| Dry-run de migration só dentro do promote | **REJECT** | Descobrir migration quebrada no meio do deploy é tarde; validar antes | `§27` |
| Endpoint `/cancel` que a UI diz não poder cancelar | **REJECT** | Contrato inconsistente | `§27` |
| Owner/Admin do workspace entra em todo projeto como dev | **REJECT** | Privilégio implícito não-revogável quebra segregação | `§33` |
| Painel de Git da UI morto neste deploy (`/api/e2b-git/*` devolve o SPA) | REFERENCE (lição) | Nunca deixar rota crítica degradar em silêncio | `§34.12` |

## 6. Runtime publicado → ``06-runtime-publicado.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| REST em 2 camadas: `/agentAiShortcut` (dev) × `/interactions` (runtime) | ADOPT | Separar plano de controle do plano de dados | `§20` |
| Config de runtime injetada no HTML no publish (`window.__mitraEnv`) | **ADOPT** | Sem rebuild por ambiente; app auto-contido | `§32.1` |
| `records/${table}` genérico com filtro/paginação server-side | ADOPT | CRUD tabular genérico é a espinha do runtime | `§20` |
| Normalizador defensivo do output (string JSON / `{result:[]}` / objeto) | ADOPT (disciplina) | Isolar defeito de plataforma num ponto de borda e comentar o porquê | `§34.8` |
| Página de auth em origem separada (app nunca vê senha) | **ADOPT** | Reduz superfície de credencial no app gerado | `§29` |
| Login popup **e** redirect com `returnTo` | ADOPT | Cobre embed e standalone | `§29` |
| Self-signup com código de 6 dígitos por projeto | ADOPT | Contas próprias sem convite manual | `§29` |
| RBAC do app em 5 eixos, leitura ≠ escrita, escopado por conexão | **ADOPT** | Melhor granularidade que a média low-code | `§29` |
| RBAC administrável via SDK em runtime | **ADOPT** | O agente provisiona RBAC por código | `§29` |
| `homeScreenId` por perfil | ADOPT | Landing por papel, barato e de alto valor | `§29` |
| Chat-embed: handshake `loaded → init → ready → opened` | **ADOPT** | Resolve corrida de iframe sem `setTimeout` | `§32.4` |
| Modo push/overlay/full por razão, não por breakpoint | **ADOPT** | Responsivo de verdade, 3 constantes | `§32.4` |
| S3 multitenant: prefixo por tenant + sufixo único no nome | **ADOPT** | Padrão sólido de object storage multi-tenant | `§32.2` |
| Tokens no fragment `#`, limpos via `replaceState` | ADOPT | Não vaza em referrer/log | `§21` |
| Token repassado por `postMessage` com `targetOrigin:"*"` | **REJECT** | Vaza token para qualquer frame ouvinte; origem explícita | `§32.4` |
| `X-TenantID` como **única** fronteira de tenancy | ADAPT | Bom para trace; não pode ser a única fronteira | `§32.3` |
| `/public/` do bucket legível sem URL assinada | ADAPT | OK p/ anexo; perigoso como default. Conexus: privado por padrão | `§32.2` |
| Erro colapsado em estado vazio na UI (aba Código) | **REJECT** | `vazio`, `carregando`, `falhou` são 3 estados distintos | `§34.12` |

## 7. Padrão de projeto (como um app real nasce) → ``07-padrao-de-projeto.md``

| Padrão da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| Etapa de **escopo** separada, antes do build (agente distinto) | ADOPT | O escopo é o contrato de handoff | `§13` |
| Elicitação guiada por 4 gates de suficiência (objetivo/personas/regras/fluxos) | ADOPT | Checklist barato de completude antes de gerar spec | `§13` |
| Gate de confirmação humana antes de gerar o documento | ADOPT | Interrupção só para decisão/aceite | `§13` |
| Modelo diferente por etapa (Gemini escopo / Claude build) | ADAPT | Roteamento de modelo por custo/qualidade | `§13` |
| Estágio 2 (build) **audita** o estágio 1 (escopo) contra o dado real | **ADOPT** | Achado mais importante: spec assertiva + Discovery com veto; spec só vira contrato após validada | `§14.1` |
| Docs de planejamento versionados (`ux.md`, `design.md`, `featuresearquitetura.md`, `tasks.md`) | **ADOPT** | Memória externalizada que o agente relê ("Base: integracao-sankhya.md") | `§5`, `§34.10` |
| `tasks.md` com log de correção + causa-raiz | ADOPT | Bom formato mínimo de razão de execução | `§17` |
| Validação de backend **antes** do frontend, executando de verdade | ADOPT | Proof-first puro (acentos, FK) | `§14` |
| Smoke test que reproduz as chamadas da UI sem navegador | ADOPT | Padrão de honestidade: declarar o que NÃO foi testado | `§14`, `§34.9` |
| Revisão final item-a-item contra o prompt original | ADAPT | Gate barato no fechamento de feature | `§34.10` |
| "Limitações conhecidas" + critérios de aceite **numéricos** obrigatórios | **ADOPT (requisito)** | O agente cancelou uma feature (margem) por falta de dado, com o número que prova | `§34.11` |
| Template rico → agente herda boas decisões (reuso por analogia) | ADOPT | Investir no scaffold é alavanca de qualidade | `§14` |
| Checklist-template invariante com validações embutidas | ADOPT | Barato e auditável p/ agente embutido | `§17` |
| Auto-validação sem revisor frio | ADAPT | OK p/ CRUD; manter revisor frio p/ mudança de risco | `§17` |

## 8. Agentes de 1ª classe — as apostas OWN → ``01`` + ``08``

| Lacuna da Mitra | Veredito | Racional | Evidência |
|---|---|---|---|
| **Não existe entidade "Agente"** (identidade, versão, tools declaradas, ciclo de vida) — é convenção montada à mão no app | **OWN** | O diferencial central do Conexus: agente como objeto de 1ª classe | `§30`, `§31` |
| Ausência de agentes customizados (prompt/tools/persona) | **OWN** | Lacuna clara; onde o Conexus diferencia | `§16.5` |
| Ausência de IA no SDK de backend | **OWN** | Agente de domínio server-side é território livre | `§16.5` |
| System prompt remontado à mão por app, a cada thread | **OWN** | A abstração faltante: contexto+tools+modelo+política versionados | `§31.6` |
| Contexto único por projeto (sem escopo por agente/tarefa) | **OWN** | Conexus: contexto em camadas plataforma → projeto → agente → tarefa | `§31.5` |
| **WS agêntico exige usuário logado — sem agente headless** | **REJECT → OWN** | Mata cron/webhook/evento; Conexus precisa de agente por evento com identidade de serviço | `§31.6` |
| Permissão de tool por grupo de usuário, não por agente | ADAPT | Conexus: permissão **por agente ∩ por usuário** | `§31.3` |
| Credencial de agente com escopo de workspace (coordinator) | SPIKE | Orquestrador precisa de identidade própria — desenhar antes | `§28` |

### Padrões de produto de IA que valem ADOPT (do Playground / §31.6)

| Padrão | Veredito | Racional | Evidência |
|---|---|---|---|
| **Generative UI**: agente termina desenhando HTML self-contained em canvas versionado | **ADOPT** | Melhor padrão de produto da Mitra: resposta navegável > texto | `§31.6` |
| Parâmetro de narração (`titulo`) obrigatório no contrato da tool | **ADOPT** | Trivial; ganho de percepção e auditoria | `§31.6` |
| Modelo de **segmentos** ordenados (md/tool intercalados) + fusão ×N | **ADOPT** | Diferença entre "parece travado" e "parece pensando" | `§31.6` |
| "Primeira consulta em <15s" como métrica de qualidade de contexto | **ADOPT** | Métrica objetiva | `§31.6` |
| `input` de tool truncado exigindo regex tolerante | **REJECT** | Protocolo tem que entregar input íntegro; se grande, referenciar por id | `§31.6` |
| `loadHistory()` devolvendo tool call como texto cru | **REJECT** | Histórico tipado na origem | `§31.6` |

---

## Estratégia de credenciais e economia (transversal)

| Padrão | Veredito | Racional | Evidência |
|---|---|---|---|
| BYOS via OAuth (Claude/Codex) — assinatura do cliente no lugar de API credits | **ADOPT** | Muda a economia de operação; token-refresh server-side | `§18` |
| BYOK 8 provedores + seletor de modelo por mensagem | ADOPT | Roteamento por tarefa/custo; catálogo dinâmico | `§18` |
| `connectionId` amarrando task ↔ credencial ↔ histórico do usuário | **ADOPT** | Resolve custo de IA por usuário final — peça-chave | `§16.5`, `§18` |
| `scope: user | connection` para chaves | **ADOPT** | Separar chave pessoal de chave de integração | `§28` |
| Claude OAuth gated por domínio de email | ADOPT | Controle de quem usa a assinatura corporativa | `§28` |
| Credenciais de integração em **servidor apartado**, fora do banco do projeto | **ADOPT** | Separação de domínio de segredo — copiar exatamente | `§33` |
| `updateAdditional(Business)InstructionsMitra` (instrução dev vs business) | ADOPT | Separar instrução por audiência | `§12` |
| Dogfooding total (comunidade/ajuda/tutorial = apps da própria plataforma) | **ADOPT (política)** | Prova de capacidade + loop de feedback real | `§32.5` |
| Publicar o prompt de construção do produto-exemplo como anexo | **ADOPT** | Melhor peça de developer relations deles | `§32.5` |

---

## Fora de escopo agora (DEFER / REJECT-para-Conexus)

| Item | Veredito | Motivo |
|---|---|---|
| Template de app + component library + seed data realista | DEFER | Só quando o Conexus tiver produto de geração |
| Integrações ERP-BR prontas / e-mail transacional / Drive / domínios | REJECT (p/ Conexus) | Feature de app-builder SaaS, fora do domínio agora |
| Gamificação / comunidade como parte do produto | DEFER | Fora de escopo por ora |
| Studio Nuxt × app React como stacks distintas | REFERENCE | Decisão deles; explica por que o SDK do runtime é separado |

---

*O antigo índice `00-OVERVIEW.md` foi consolidado em [full-study.md](full-study.md). Evidência-fonte congelada no
[Mitra Inspiration Map](#mitra-inspiration-map), v0.9.0.*


---

---
id: DOC-RESEARCH-MITRA-INSPIRATION-MAP
title: Mitra Inspiration Map
document_type: research_map
form: explanation
authority: research_historical
status: draft
version: 0.9.0
owners:
  - developmentconexus-ops
source_of_truth_for:
  - classification of Mitra platform patterns for predecessor program
related:
  - DOC-RESEARCH-FIRSTMATE-INSPIRATION-MAP
  - DOC-PRODUCT-BLUEPRINT
last_reviewed: 2026-08-10
---

# Mitra Inspiration Map

> Idioma: PT-BR intencionalmente (documento de estudo do Operador). Frontmatter e classificação seguem o padrão do repo.

## 1. Propósito e método

Mitra (`agent.mitralab.io`) é uma plataforma cloud brasileira de app-building por prompt ("code-builder"), voltada a apps de negócio (foco ERP: Sankhya, TOTVS Protheus, Omie). Este documento registra o que foi **observado ao vivo** em 2026-08-10, numa sessão real: exploração completa da UI, criação de um app do zero por prompt único, e leitura do código/artefatos gerados.

Método e nível de evidência:

```text
OBSERVADO   visto diretamente na UI, no código gerado ou em request de rede
INFERIDO    conclusão forte a partir de evidência indireta (marcado como tal)
```

Projeto de teste: workspace 146638, projeto 55749 ("Teste"). Prompt usado: app de controle de ordens de serviço para metalúrgica (lista + formulário + dashboard + persistência). Resultado: app completo, testado e publicado para a equipe em ~16 minutos, com 2 bugs reais encontrados e corrigidos pelo próprio agente durante o build.

## 2. Fato central: a harness é Claude Code sobre sandbox E2B

Evidências (todas OBSERVADO, salvo indicação):

- Endpoint de rede `GET /api/e2b-git/{workspaceId}/{projectId}/metadata` → sandbox **E2B** com git por projeto.
- Arquivo **`CLAUDE.md`** na raiz do projeto gerado — o mecanismo de instruções de projeto do Claude Code.
- O agente usou **ToolSearch** (tool nativa do harness Claude Code) com query "mitra project context think question" — tools da plataforma são deferidas e carregadas sob demanda.
- Checklist de execução idêntico ao padrão TodoWrite (itens com checkbox, atualizados ao vivo).
- Configurações → IA → "Claude OAuth: conecte sua assinatura Claude Pro/Max… **Claude Code** — Desconectado — **Conectar via CLI**". A plataforma usa a subscription do usuário via OAuth do Claude Code em vez de créditos de API.
- Working directory do agente: `/home/user/w-146638/p-55749/` (padrão `w-{workspace}/p-{project}` — INFERIDO: múltiplos projetos por sandbox ou naming convention de isolamento).
- Seletor de modelo por mensagem: "Claude Opus 5 Medium/High/xHigh, Sonnet 5 Medium/High/xHigh, Opus 4.8, 4.7" sob o grupo "Anthropic Subscription" — modelo × **reasoning effort** exposto como produto.
- Providers alternativos por API key: Anthropic, OpenAI, GLM (Zhipu), OpenRouter; OAuth de subscription: Claude e OpenAI.
- Telemetria por task exibida ao final: `in: 8.3M · out: 76.6K · cache: 8.3M` tokens.

Implicação para predecessor program: valida a tese ARR de rodar uma harness de agente comercial (Pi-first no nosso caso) dentro de um envelope de execução controlado, com instruções de projeto injetadas por arquivo e tools da plataforma expostas como MCP/tool registry deferido.

## 3. Arquitetura do produto (visão de plataforma)

### 3.1 Anatomia de um projeto

| Recurso | O que é (OBSERVADO) |
|---|---|
| Builder (Preview/Código) | Preview live do app + file tree/editor read-only dos arquivos do sandbox |
| Database | MySQL gerenciado por projeto ("Mitra MySQL"), SQL Editor, tabelas do usuário + tabelas nativas `INT_*` (`INT_ACTION`, `INT_ACTIONLOG`, `INT_DMLACTION`…) com log de ações da plataforma no próprio banco |
| Server Functions | Funções de servidor (tipo SQL no app observado) criadas pelo agente via SDK; identificadas por ID numérico; parametrização mustache `{{param}}` |
| Integrações | Templates de auth custom (Basic/Bearer/API Key) + apps prontos (Sankhya, Sankhya Gateway ± Sandbox, TOTVS Protheus, Omie, HubSpot, Stripe, Mercado Pago, Supabase, AllStrategy) + **Mitra Project** (integração projeto→projeto) |
| Membros & Acessos | Usuários do app final + Perfis (roles) |
| Drive | Storage de arquivos por projeto, com toggle "Permitir upload público" |
| Configurações | Geral (nome/logo/cor), Web (domínio `{ws}-{proj}.prod.mitralab.io` + domínio próprio), IA, Integração (API keys do projeto), E-mails (transacional embutido: DKIM, templates de convite/reset com variáveis `$link`, `$emailUsuario`, `$projeto`, remetente do SDK `sendEmailMitra`) |
| Agent | Painel de chat lateral onipresente + lista de **Tasks** (cada conversa = task com status vivo; "Nova Task" sugere paralelismo) |
| Terminal embutido | Botões ocultos na UI: "New terminal", dock left/bottom/right, "Switch to UI Mode" (OBSERVADO no DOM; não exercitado) |

### 3.2 Modelo de segurança de dados (o achado mais transferível)

- Todo acesso a dados do app final passa por **Server Functions**; CRUD REST direto é **bloqueado para `userType=business`** (usuário final). O frontend só chama `executeServerFunctionMitra({projectId, serverFunctionId, input})`.
- Ou seja: a superfície de dados exposta ao app publicado é exatamente o conjunto de SFs criadas — um contrato de capacidade explícito, análogo ao nosso princípio de Tool/Credential authority separada.
- Perfis "business vs dev" são um item de validação obrigatório do pipeline do agente ("Validar permissões business vs dev … só executeServerFunctionMitra").

### 3.3 Migrations dev↔prod (segundo achado mais transferível)

Do `CLAUDE.md` gerado (citação fiel, abreviada):

- Mudanças de schema/recursos viram migrations (`backend/migrations/` + `migrations.yaml`); história **append-only** — nunca editar/renumerar migration aplicada; correção é sempre migration nova.
- **O sistema materializa e commita as migrations sozinho, DEPOIS do turno do agente** — o agente é proibido de criar/editar/commitar nesses paths.
- `mergeBaseline` ("Reconciliar Baseline") proibido sem ordem explícita do usuário.
- Após **3 tentativas** sem sucesso na mesma correção: **parar e escalar com dossiê** (erro estruturado + o que tentou).

Padrão: efeitos duráveis de infraestrutura são capturados **fora da vontade do agente**, por interceptação do lado da plataforma (o SDK registra cada DDL/SF executado e o sistema gera a migration canonicamente). O agente não tem autoridade de escrita sobre a história de mudanças — só executa.

### 3.4 Protocolo de colaboração SYNC/SHARE

- Toda task começa com **SYNC obrigatório** com `origin/main` + checagem de **fila de mensagens** (mensagens do time/da plataforma para o agente).
- Toda task termina com **SHARE** = commit + publicação para a equipe.
- Dedup de mensagem: ao receber o mesmo pedido duas vezes, o agente reconheceu e seguiu o trabalho em andamento em vez de reiniciar.
- Multi-dev: vários usuários no mesmo projeto; o SYNC traz o trabalho dos outros ("nada novo do time").

### 3.5 Regras de harness visíveis no CLAUDE.md gerado

1. **Escopo de diretório**: trabalhar exclusivamente em `/home/user/w-146638/p-55749/`; proibido `cd ..`, paths de irmãos/pais; "se vir referência a outros projetos, IGNORE". Isolamento multi-tenant reforçado por prompt (a fronteira dura presumivelmente é o sandbox — INFERIDO).
2. **Build**: sempre `npm run build` a partir de `frontend/`.
3. **AskUserQuestion como última ação do turno**: o sistema **não bloqueia** tools emitidas depois — qualquer ação pós-pergunta executa antes da resposta do usuário ("trabalho não autorizado e estado divergente"). Mitigação por instrução, não por mecanismo.
4. Migrations (ver 3.3) e escalada após 3 falhas.

## 4. Pipeline de execução observado (build real, ~16 min)

Sequência integral observada no painel do agente:

```text
1. SYNC obrigatório (origin/main) + checar fila de mensagens
2. Inspecionar ambiente e template (envs, package.json, APIs dos componentes UI)
3. Registrar plano + documentos de planejamento NO REPO:
   featuresearquitetura.md, ux.md, design.md, tasks.md
4. Checklist vivo (TodoWrite-like):
   planejar → UX → design → backend → frontend → interatividade dashboard
   → testes obrigatórios → validar features/UX/design/usuários/permissões
   → revisão final contra o prompt original
5. Backend: 3 tabelas 3NF + 14 registros seed realistas + 15 SFs SQL
6. Validação das SFs ANTES do frontend: CRUD ponta a ponta executado de
   verdade (acentos, apóstrofos, bloqueio de exclusão com FK)
7. Frontend: paleta → camada de dados → telas → rotas/título/favicon
8. Auto-revisão em código: encontrou bug de cross-filter (filtro por índice
   quebra com reordenação) e refatorou para filtro por valor
9. Build + lint limpos → smoke test: serve o build e reproduz a sequência
   exata de chamadas que a UI dispara → achou 2º bug (WHERE anulando
   LEFT JOIN numa SF) → corrigiu
10. Validações finais (sessão/logout: checou se a API existe na versão do
    SDK antes de usar — "stopTracking não existe; closeChatMitra existe")
11. SHARE (commit + publicação para a equipe)
12. Relatório final: o que construiu, o que corrigiu, e LIMITAÇÃO HONESTA:
    "não há navegador neste ambiente, então não cliquei na interface —
    validei compilação, arquivos servidos e camada de dados; a renderização
    você confirma no preview"
13. Oferta de próximo passo COM pedido de autorização (ativar IA para
    usuário final exige definir perfis/permissões → decisão do usuário)
```

Os documentos de planejamento ficam versionados no repo do projeto e o `tasks.md` final registra: tabela de tasks com status/output, **log de correções com causa raiz**, revisão item-a-item contra o prompt original, e seção "Não incluído (a combinar com o usuário)".

## 5. Artefatos gerados (estrutura)

```text
/home/user/w-146638/p-55749/
├── CLAUDE.md                  # regras de harness por projeto
├── featuresearquitetura.md    # arquitetura + modelo de dados + regras
├── ux.md                      # fluxos por tela, estados obrigatórios
├── design.md                  # paleta (CSS vars), componentes, refs
├── tasks.md                   # registro durável de execução
├── backend/
│   ├── setup-backend.mjs      # DDL + seed + SFs via mitra-sdk
│   ├── update-dash-por-status.mjs  # correção = script novo (append-only)
│   └── .env(.example)         # MITRA_BASE_URL, MITRA_TOKEN, MITRA_PROJECT_ID
└── frontend/                  # React 19 + TS + Vite + Tailwind 4
    └── src/
        ├── lib/api.ts         # registro de SFs por ID + callSF/callSFWrite
        ├── lib/mitra-auth.ts  # auth nativa da plataforma
        ├── components/ hooks/ pages/
        └── ...
```

SDKs observados:

- **`mitra-sdk`** (backend/dev, `^1.0.58`; observado no app, npm latest `1.0.62`): SDK "completo" com **70 funções** — schema/JDBC/query, Server Functions, integrações, e-mail, tunnels, deploy, perfis, DataLoaders. Depende de `mitra-interactions-sdk`.
- **`mitra-interactions-sdk`** (frontend/runtime, `1.0.61`; npm latest `1.0.63`): SDK "agnóstico" com **60 funções** — execução de SF, CRUD de records, integrações, auth, variáveis, upload, perfis, e controle programático do próprio agente.

Superfície **completa** dos dois SDKs (extraída dos `index.d.ts` do npm), integrações externas (Sankhya) e dispatch de e-mail/WhatsApp no **Anexo técnico (seções 11–12)**. Assinaturas confirmadas e arquitetura do template na seção 11.

## 6. Qualidades do produto dignas de nota

- **Template rico pré-carregado**: biblioteca de componentes (`Button`, `Modal`, `Chart`/Shadcn, `Toast`, `ConfirmDialog`…), `LoginPage` com SSO, auth nativa — o agente monta sobre uma base auditada em vez de gerar UI do zero.
- **Seed data realista por domínio** (usinagem, caldeiraria, estruturas metálicas) — o preview nasce demonstrável.
- **Progresso narrado em linguagem de produto** (frases curtas por fase) com trace de tools expansível — o Operador leigo entende, o técnico audita.
- **Preview com estados** ("Materializando…", "Construindo sua ideia…", "Quase lá…") e botão "Atualizar" ao concluir.
- App final: cross-filter/drill no dashboard, paginação, validação inline, empty/loading states obrigatórios via `ux.md`.

## 7. Classificação para predecessor program

Vocabulário: `OWN / ADOPT / ADAPT / SPIKE / REFERENCE / DEFER / REJECT` (CAPABILITY-REALIZATION-METHOD).

| Padrão Mitra | Classificação | Tratamento predecessor program |
|---|---|---|
| Harness comercial (Claude Code) dentro de envelope próprio | REFERENCE | Valida a direção ARR (Pi-first); não muda a seleção S1 — OpenCode ACP challenger segue exigido |
| Sandbox cloud E2B por projeto | REFERENCE | ARR-S0/S2 já excluem KVM/Docker no host atual; E2B é dado de mercado, não candidato aceito |
| Instruções por arquivo no workspace (CLAUDE.md por projeto) | ADOPT | Equivalente ao nosso Context Pack materializado no WriteTrack; barato e auditável |
| SYNC obrigatório no início + SHARE no fim do turno | ADAPT | Mapeia para reconciliation de abertura + integração/entrega explícita; em predecessor program a entrega exige envelope aprovado, não é automática |
| Fila de mensagens agente↔plataforma com dedup | ADAPT | Já temos `predecessor programMessage`; o dedup de pedido repetido é um comportamento a especificar no Lead |
| Migrations append-only materializadas PELO SISTEMA após o turno | ADOPT (princípio) | Forte alinhamento com proof-first e com autoridade separada: efeito durável capturado por interceptação, fora da vontade do Worker; candidato a padrão para efeitos de schema/infra do M2+ |
| Agente sem autoridade de escrita sobre história de mudanças | ADOPT (princípio) | Já é nosso invariante (Worker completion ≠ acceptance); Mitra mostra uma materialização mecânica elegante |
| Escalada após 3 tentativas com dossiê estruturado | ADOPT | Regra simples e barata para Role Contracts de Writer/Investigator |
| AskUserQuestion deve encerrar o turno (mitigação por prompt) | REFERENCE + STRENGTHEN | predecessor program deve preferir bloqueio mecânico (harness/gate) a instrução; a fraqueza confessa do prompt-only é o argumento |
| Pipeline fixo com gates de validação embutidos no system prompt (validar features/UX/design/permissões + revisão contra o prompt original) | ADAPT | Nosso análogo é o contrato de validação por milestone; a "revisão final contra o prompt original" é um gate barato a considerar no fechamento de Feature |
| Documentos de planejamento versionados no repo do produto (ux.md, design.md, arquitetura, tasks.md) | ADOPT | Já fazemos (Execution Brief, Evidence); o `tasks.md` com log de correção + causa raiz é um bom formato mínimo |
| Validação de backend ANTES do frontend, executando de verdade (acentos/FK) | ADOPT | Proof-first puro; reforça TEST como deciding proof |
| Smoke test que reproduz a sequência de chamadas da UI sem navegador + reporte honesto do que NÃO foi testado | ADOPT | Padrão de honestidade de Evidence: declarar limites do proof no relatório final |
| Toda a superfície de dados do app final atrás de Server Functions (CRUD REST bloqueado para business) | REFERENCE | Análogo de capability contract; predecessor program não é app-builder, mas o princípio "superfície = contratos explícitos" já é nosso |
| Modelo × reasoning effort como seletor de produto por mensagem | REFERENCE | Interessante para o futuro painel do Operador (custo/qualidade por dispatch) |
| Subscription OAuth (Claude Pro/Max via Claude Code CLI) no lugar de API credits | REFERENCE | Relevante a custo de operação; decisão comercial, não de arquitetura |
| Telemetria de tokens por task (in/out/cache) exposta na UI | ADOPT | Barato e alinhado ao Operator Observability; registrar por Worker Run |
| Tabelas nativas `INT_*` (log de ações da plataforma no banco do projeto) | REFERENCE | Nosso análogo é SQLite operacional; não misturar com dados de produto |
| Template de app + component library + seed data realista | DEFER | Só faz sentido quando predecessor program tiver um produto de geração; não é o caso |
| Integrações ERP BR prontas / e-mail transacional / Drive / domínios | REJECT (para predecessor program) | Feature de app-builder SaaS, fora do domínio predecessor program |
| Terminal embutido oculto + "UI Mode" | REFERENCE | Sinal de ferramenta dev-mode progressiva na mesma superfície |

## 8. Lições diretas para a nossa harness

1. **Interceptação > instrução para efeitos duráveis.** O ponto mais forte do Mitra: DDL/SF viram migration por interceptação do SDK, commitadas pelo sistema após o turno. predecessor program deve preferir capturar efeitos (writes, DDL, external effects) no envelope de execução — nunca depender do agente "lembrar de registrar".
2. **Onde eles são fracos, nós já somos fortes.** A regra AskUserQuestion-por-prompt admite que o harness não bloqueia; nosso desenho de protected execution fail-closed é a resposta certa. Manter.
3. **Gates de validação como checklist embutido funcionam.** Um pipeline fixo (planejar→executar→testar→validar→revisar contra o pedido original) rendeu 2 bugs reais encontrados e corrigidos sem intervenção. O gate "revisão final contra o prompt original" é barato e candidato a entrar no fechamento de Feature.
4. **Reporte de limitação como cidadão de primeira classe.** "O que não consegui testar" no relatório final é exatamente a semântica de `ACCEPT_WITH_LIMITATIONS` — vale padronizar essa seção em toda Evidence de Worker.
5. **Dossiê de escalada após N falhas.** Regra mecânica (3 tentativas → parar + dossiê estruturado) evita loop de correção infinito; fácil de adicionar aos Role Contracts.
6. **Narração em duas camadas** (frase de produto + trace técnico expansível) é o formato certo para o painel do Operador — já alinhado com "short messages pointing to artifacts".
7. **SYNC/SHARE dá nome simples a um ciclo que já temos** (reconcile na abertura, integração explícita no fim). Nomes simples ajudam Role Contracts.

## 9. Questões em aberto (para eventual segundo passe)

- Terminal embutido: que acesso dá ao sandbox? (não exercitado)
- "Gerenciar Modelos" e perfis de IA para usuário final: como as permissões de tools em linguagem natural ("ensine a IA a usar as tools") são aplicadas em runtime?
- Fila de mensagens: formato, quem produz (só usuários? plataforma? outros agentes?).
- `migrations.yaml`: schema exato (não visível — gerado após o turno; a pasta não apareceu no file tree da UI durante a sessão).
- Publicação de produção ("Publicar") vs SHARE de equipe: pipeline de promoção dev→prod e papel das migrations na promoção.
- Se dois devs disparam tasks concorrentes no mesmo projeto: como o SYNC resolve conflito de branch/estado?

## 10. Registro de evidências

- Sessão: 2026-08-10, projeto `w/146638/p/55749` ("Teste"), operador logado.
- Build observado: prompt único 13:19 → concluído ~13:35; telemetria final `in: 8.3M · out: 76.6K · cache: 8.3M`.
- Rede: `GET /api/e2b-git/146638/55749/metadata`; namespace `/api/mitra-agent/*` (connections/registry, connections/models, auth/claude/status, files?folder=output).
- Domínio de produção gerado: `https://146638-55749.prod.mitralab.io` (status Ativo).
- Citações do CLAUDE.md, tasks.md, featuresearquitetura.md, ux.md, design.md, setup-backend.mjs e frontend/src/lib/api.ts transcritas nas seções 3–5 a partir do file viewer da plataforma.
- App resultante verificado manualmente no preview: criação de ordem (#16) refletida em lista e dashboard em tempo real.
- Extração de código por engenharia reversa (2026-08-10, segundo passe): árvore de arquivos e corpos completos obtidos via endpoint `GET /api/mitra-agent/github-files/146638/55749` (tree) e `/content?path=<url-encoded>` (corpo). Backend (`setup-backend.mjs`, `update-dash-por-status.mjs`, `.env.example`) e frontend (`mitra-auth.ts`, `App.tsx`, `main.tsx`, `api.ts`, `utils.ts`, `useHighlight.ts`, `package.json`, `vite.config.ts`, `index.html`, `README.md`) lidos na íntegra. Detalhe técnico consolidado na seção 11.

## 11. Anexo técnico — engenharia reversa

> Segundo passe (2026-08-10): corpos de arquivo extraídos na íntegra. Identificadores em inglês preservados como no código. Este anexo é a base direta para a nossa harness.

### 11.1 SDK — assinaturas confirmadas

`mitra-sdk` (backend/dev):

```js
configureSdkMitra({ baseURL, token, integrationURL })
runDdlMitra({ projectId, sql })
createRecordsBatchMitra({ projectId, tableName, records: [ {...}, ... ] })
createServerFunctionMitra({ projectId, type: 'SQL', name, description, code })
listServerFunctionsMitra({ projectId })            // → { result: [ { id, name, ... } ] }
updateServerFunctionMitra({ projectId, serverFunctionId, description, code })
```

`mitra-interactions-sdk` (frontend/runtime) — subconjunto usado no app; superfície completa na §12.2:

```js
configureSdkMitra({ baseURL, token, integrationURL?, projectId, authUrl, onTokenRefresh })
executeServerFunctionMitra({ projectId, serverFunctionId, input })
closeChatMitra()                                   // sessão/logout
```

> Correção do 1º passe: `sendEmailMitra` **não** está no SDK runtime — está no SDK **dev** (`mitra-sdk`). Ver §12.4.

Observação de disciplina do agente: antes de usar uma API de sessão ele **checou se ela existe na versão instalada** ("`stopTracking` não existe; `closeChatMitra` existe"). Verificar contrato de SDK contra versão antes de chamar é comportamento reprodutível para os nossos Role Contracts.

### 11.2 Backend setup — padrão canônico

Env auto-populado **pelo servidor** (nunca hardcoded): `MITRA_BASE_URL`, `MITRA_BASE_URL_INTEGRATIONS`, `MITRA_TOKEN`, `MITRA_PROJECT_ID`, `MITRA_WORKSPACE_ID`.

Fluxo de `setup-backend.mjs` (um único script idempotente-por-intenção):

```text
configureSdkMitra(env)
→ runDdlMitra × N            (CREATE TABLE 3NF, com FOREIGN KEY)
→ createRecordsBatchMitra    (seed por tabela, em ordem de FK)
→ const sfs = [ { name, description, code }, ... ]   (array declarativo)
→ for (sf of sfs) createServerFunctionMitra({ type: 'SQL', ...sf })
→ listServerFunctionsMitra   → monta mapa { name: id }
→ console.log(JSON.stringify(mapa))   // IDs p/ hardcode no frontend
```

Correção de SF **não** reexecuta o setup (isso recriaria o schema e apagaria dados) — é um **script separado** (`update-dash-por-status.mjs`) chamando `updateServerFunctionMitra({ serverFunctionId, ... })`. Ou seja: mesmo no lado de dev, a prática é **append-only por script**, espelhando a política de migrations da plataforma (seção 3.3).

### 11.3 Server Function — templating SQL + mustache

Placeholders mustache `{{param}}` interpolados no SQL. Idioma de filtro opcional (o valor vazio desliga o filtro):

```sql
('{{status}}' = '' OR S.NOME = '{{status}}')
```

Consts reaproveitadas entre SFs (DRY no gerador):

```js
const F_STATUS  = "('{{status}}' = '' OR S.NOME = '{{status}}')";
const F_CLIENTE = "('{{cliente}}' = '' OR C.NOME = '{{cliente}}')";
const WHERE_LISTA = `WHERE ('{{busca}}' = '' OR C.NOME LIKE '%{{busca}}%' OR ...)
                       AND ('{{statusId}}' = '' OR O.STATUS_ID = '{{statusId}}')`;
```

Paginação: `LIMIT {{limit}} OFFSET {{offset}}`. Guarda de exclusão por FK: `NOT EXISTS (...)` antes do DELETE.

**Bug real corrigido pelo agente (regra de contrato transferível):** em `dashPorStatus`, o filtro de cliente no `WHERE` externo **anulava o `LEFT JOIN`** — status sem ordens no recorte sumiam do gráfico. Correção: mover o filtro para **dentro da subquery**. O agente deixou o motivo em comentário no código-fonte. Regra destilada: *filtro opcional sobre o lado direito de um `LEFT JOIN` vai na subquery, nunca no `WHERE` externo.*

### 11.4 Frontend — arquitetura do template

Stack: React 19 + `react-router-dom` 7 + Vite 7 + Tailwind 4 (`@tailwindcss/vite`) + `recharts` 2 + `lucide-react`. `vite.config` usa `base: './'` (build com paths relativos → deploy sob subdomínio/subpath). `index.html` `lang="pt-BR"`, título setado pelo agente.

Auth (`lib/mitra-auth.ts`) — padrão de handoff de token seguro:

```text
- Token chega no FRAGMENT (#) da URL: #tokenMitra=...&backURLMitra=...&integrationURLMitra=...
  (fragment não vaza em logs de servidor nem no header Referer)
- initMitra(): lê o hash → salva sessão em localStorage ('mitra-session')
  → limpa o hash via history.replaceState → configura SDK com onTokenRefresh
    (persiste sessão renovada automaticamente)
- Fallback: sessão anterior no localStorage
- token === 'error' → limpa URL (erro já exibido pelo sdk-auth)
```

Roteamento (`App.tsx`): `useState(initMitra)` decide `configured`; HOC `protegida(pagina)` embrulha em `<Layout>` ou redireciona a `/login`; rotas `/`, `/ordens`, `/clientes`, `*→/`.

Camada de dados (`lib/api.ts`): registry `name → ID numérico` (`listarStatus:1 … dashRecentes:15`, resolvido no build do backend), `extractOutput()` normaliza a resposta, `callSF()` **lança** em `executionStatus === 'FAILED'`, `callSFWrite()` para mutações.

Hooks: `useHighlight` (seleção de índices em charts — click normal limpa+seleciona um com toggle-off; shift+click faz toggle individual; devolve `activeIndex` pronto para recharts), `useDrill` (cross-filter/drill do dashboard), `useToast`. Componentes UI pré-carregados: `Button`, `Card`, `Badge`, `Modal`, `ConfirmDialog`, `Input`, `Select`, `Radio`, `Checkbox`, `Toast`, `Chart` (wrappers Shadcn sobre recharts). O agente **compõe sobre esta base auditada** — não gera UI primitiva do zero.

### 11.5 Respostas diretas às perguntas do Operador

- **Usa Pi?** **Não.** A harness é **Claude Code CLI** rodando em sandbox **E2B**. Evidências: `CLAUDE.md` por projeto, tool `ToolSearch`, "Conectar via CLI" para OAuth Claude Pro/Max, endpoint `/api/e2b-git/.../metadata`.
- **Pesquisa na web?** **Não neste build.** Nenhum `WebSearch`/`WebFetch` observado. A query de `ToolSearch` foi `"mitra project context think question"` — carrega tools da **plataforma Mitra** + `think` + `AskUserQuestion`, não busca web. (Não exclui que exista web em outros fluxos; apenas não foi exercitado aqui.)
- **Tools da harness (mapeadas para primitivas Claude Code):** `Bash` (rótulo UI "Executando"), `Read` ("Lendo"), `Write` ("Escrevendo"), `Edit` ("Editando"), `ToolSearch` (carregamento deferido das tools Mitra), `TodoWrite` (checklist vivo), `AskUserQuestion`. **Sem `WebSearch`/`WebFetch`** neste build.
- **Método plan → build → verify (confirmado, seção 4):** plano em documentos versionados no repo → checklist vivo → **backend testado de verdade antes do frontend** (acentos, apóstrofos, bloqueio de FK) → auto-revisão em código (achou bug de cross-filter por índice) → **smoke test reproduzindo a sequência exata de chamadas da UI** sem navegador (achou o bug do `LEFT JOIN`) → relatório com **limitação honesta** do que não foi testado → SHARE (commit + publicação).

### 11.6 Superfície de rede observada (namespace)

```text
GET  /api/e2b-git/{ws}/{proj}/metadata                     sandbox E2B + git
GET  /api/mitra-agent/github-files/{ws}/{proj}             árvore de arquivos (paths + bytes)
GET  /api/mitra-agent/github-files/{ws}/{proj}/content?path=<enc>   corpo cru do arquivo
     /api/mitra-agent/connections/registry|models          providers/modelos
     /api/mitra-agent/auth/claude/status                    estado do OAuth Claude
     /api/mitra-agent/files?folder=output                   artefatos de saída
```

O endpoint `github-files` confirma **git por projeto hospedado no GitHub** por trás do sandbox — o SYNC/SHARE (seção 3.4) opera sobre esse remoto.

## 12. Superfície total dos SDKs, integrações e dispatch

> Extraído dos `dist/index.d.ts` publicados no npm (`mitra-sdk@1.0.62`, `mitra-interactions-sdk@1.0.63`). Fonte autoritativa — assinaturas e JSDoc reais. É a base direta para desenhar a camada equivalente da Conexus.

### 12.1 `mitra-sdk` (dev/backend) — 70 funções por domínio

```text
Plataforma      createMitraSdkInstance · listWorkspacesMitra · listProjectsMitra ·
                createProjectMitra · getProjectsMitra · getProjectContextMitra ·
                updateProjectSettingsMitra · getGitConfigMitra · configureSdkMitra
Instruções IA   updateAdditionalInstructionsMitra ·
                updateAdditionalBusinessInstructionsMitra
Dados/Schema    runQueryMitra · runDdlMitra · runDmlMitra ·
                listTablesMitra · createOnlineTableMitra · updateOnlineTableMitra ·
                listOnlineTablesMitra · createRecordsBatchMitra (via interactions)
JDBC externo    listJdbcConnectionsMitra · createJdbcConnectionMitra ·
                updateJdbcConnectionMitra
DataLoaders     listDataLoadersMitra · createDataLoaderMitra · updateDataLoaderMitra ·
(ETL)           executeDataLoaderMitra · deleteDataLoaderMitra
Server Fns      listServerFunctionsMitra · readServerFunctionMitra ·
                createServerFunctionMitra · updateServerFunctionMitra ·
                deleteServerFunctionMitra · getServerFunctionExecutionMitra ·
                togglePublicExecutionMitra
Integrações     listIntegrationTemplatesMitra · getIntegrationTemplateMitra ·
                createIntegrationMitra · testIntegrationMitra · testIntegrationByIdMitra
E-mail          sendEmailMitra
Perfis/Acesso   listProjectUsersMitra · manageUserAccessMitra · listProfilesMitra ·
                getProfileDetailsMitra · createProfileMitra · updateProfileMitra ·
                deleteProfileMitra · setProfileUsersMitra · setProfileSelectTablesMitra ·
                setProfileScreensMitra · setProfileServerFunctionsMitra
Arquivos        listProjectFilesMitra · getFilePreviewMitra
Tunnels         createTunnelMitra · listTunnelsMitra · getTunnelMitra ·
(on-prem reach) syncTunnelStatusMitra · syncTunnelProcessStatusMitra ·
                updateTunnelAliasMitra · deleteTunnelMitra · getTunnelRouteMitra ·
                addTunnelRouteMitra · updateTunnelRouteMitra · syncTunnelRouteStatusMitra ·
                removeTunnelRouteMitra · activateTunnelMitra · deactivateTunnelMitra ·
                stopTunnelMitra
Deploy/Promote  deployToS3Mitra · pullFromS3Mitra · getDeployStatusMitra
```

### 12.2 `mitra-interactions-sdk` (runtime/frontend) — 60 funções por domínio

```text
Config          createMitraInstance · configureSdkMitra · getConfig · resolveProjectId
Chat/IA app     openChatMitra · closeChatMitra
Auth end-user   loginMitra · loginWithEmailMitra · loginWithGoogleMitra ·
                loginWithMicrosoftMitra · refreshTokenSilently · emailSignupMitra ·
                emailVerifyCodeMitra · emailResendCodeMitra · emailLoginMitra ·
                sendPasswordResetCodeMitra · validatePasswordResetCodeMitra ·
                resetPasswordMitra
Server Fns      executeServerFunctionMitra · executeServerFunctionAsyncMitra ·
                executePublicServerFunctionMitra · executePublicServerFunctionAsyncMitra ·
                getPublicServerFunctionExecutionMitra · stopServerFunctionExecutionMitra
Dados (dev)     listRecordsMitra · getRecordMitra · createRecordMitra · updateRecordMitra ·
                patchRecordMitra · deleteRecordMitra · createRecordsBatchMitra ·
                executeDbActionMitra · executeDataLoaderMitra · runActionMitra
Integrações     listIntegrationsMitra · callIntegrationMitra
Variáveis       setVariableMitra · listVariablesMitra · getVariableMitra
Arquivos        uploadFilePublicMitra · uploadFileLoadableMitra · setFileStatusMitra
Perfis          listProfilesMitra · getProfileDetailsMitra · createProfileMitra ·
                updateProfileMitra · deleteProfileMitra · setProfileUsersMitra ·
                setProfileSelectTablesMitra · setProfileDmlTablesMitra ·
                setProfileActionsMitra · setProfileScreensMitra ·
                setProfileServerFunctionsMitra
Controle agente manageAgentChatMitra · getAgentTaskMitra · manageAgentCredentialMitra
```

### 12.3 Integração externa — como o app fala com Sankhya/Protheus/HubSpot/etc

**Nenhum ERP é método hardcoded no SDK.** Integração é genérica, por três caminhos:

**(a) REST proxy — `callIntegrationMitra`** (o primitivo universal):

```ts
callIntegrationMitra({
  projectId?, connection: string,   // slug da integração configurada no painel
  method: string,                   // GET | POST | PUT | DELETE
  endpoint?: string,                // ex: "/api/v1/pedidos"
  params?, /* query */ body?, headers?
}): Promise<CallIntegrationResponse>
```

A integração guarda `authType` + `credentials` (criada por `createIntegrationMitra({name, slug, blueprintId, blueprintType, authType, credentials})` a partir de um **blueprint/template** ou custom). O servidor injeta a auth e faz o proxy — a credencial **nunca** vai ao browser. Sankhya, TOTVS Protheus, Omie, HubSpot, Stripe, Mercado Pago, Supabase, AllStrategy são blueprints prontos; "Customizado" (Basic/Bearer/API Key) cobre o resto.

**(b) Banco direto — JDBC** (acesso profundo estilo Sankhya):

```ts
createJdbcConnectionMitra({ name, type, host, port, database, user, password })
runQueryMitra({ ... })   // SQL direto no banco do ERP
```

Sankhya expõe base relacional → o app lê/escreve por SQL, além do REST. `DataLoaders` (ETL) sincronizam esse dado para tabelas do projeto; a UI de conexão mostrava `connectionType: QUERY | CSV` e **DynamicCubeQuery** (consulta a cubo/BI).

**(c) On-premise — Tunnels.** Quando o ERP está atrás de firewall do cliente, `createTunnelMitra({alias})` + rotas (`addTunnelRouteMitra`, `activateTunnelMitra`) abrem um **túnel reverso** para a plataforma alcançar o serviço interno. Este é o mecanismo para Sankhya/Protheus on-prem.

### 12.4 Dispatch (e-mail, WhatsApp, notificações)

- **E-mail: nativo, lado dev.** `sendEmailMitra({ projectId?, to: string[], subject, body /* HTML */ })`. Mais o e-mail transacional de auth (convite/reset) da própria plataforma (templates com `$link`, `$emailUsuario`, `$projeto`).
- **WhatsApp / SMS / push / webhook / Slack: NÃO existem nativos.** Grep nos dois `index.d.ts` = 0 ocorrências. Caminho para WhatsApp = **integração custom** (`createIntegrationMitra` → Meta Cloud API/Twilio) chamada por `callIntegrationMitra`. Não há blueprint pronto de mensageria.

Implicação Conexus: dispatch multicanal (WhatsApp/SMS/push) é **lacuna** do Mitra — oportunidade de diferenciação se a Conexus tratar mensageria como capability de primeira classe (ver §7/§8).

### 12.5 Injeção de metodologia (onde mora o "system prompt")

O método plan→build→verify **não** é código no SDK do app — é o system prompt server-side do harness Claude Code, do qual só vemos a fatia por projeto (`CLAUDE.md`, seção 2–3). Os pontos de injeção observados no SDK dev:

- `getProjectContextMitra` — contexto que o agente carrega no início (schema, SFs, envs).
- `updateAdditionalInstructionsMitra` — instruções custom para o **agente dev**.
- `updateAdditionalBusinessInstructionsMitra` — instruções para a **IA voltada ao usuário final** (o chat embutido no app publicado).

Ou seja: duas camadas de instrução persistidas por projeto (dev vs business), somadas ao system prompt fixo do produto. Análogo direto do nosso Context Pack + Role Contract, mas separando audiência.

### 12.6 Controle programático do agente pelo runtime (o modelo de "task/fila")

`getAgentTaskMitra` retorna uma `AgentTaskSession`; `{create:true}` cria um chat novo e o `taskId` é preenchido após o primeiro `send()`. Há stream de eventos tipados: `AgentDeltaEvent`, `AgentToolEvent`, `AgentTurnEndEvent`, `AgentStatusChangeEvent`, `AgentQueueChangeEvent`, `AgentTaskCreatedEvent`, `AgentErrorEvent`, `AgentStatus`. `manageAgentChatMitra` (list/rename/delete) e `manageAgentCredentialMitra` sobre **`/sdk-ws`** (websocket) para credenciais OAuth (Claude/Codex).

Conclusão: a **fila de mensagens** (seção 3.4) e a lista de **Tasks** (seção 3.1) são exatamente essa `AgentTaskSession` com sua `queue` e eventos `AgentQueueChangeEvent` — o SDK expõe dirigir o agente e observar tools/turnos/fila em tempo real. É um contrato de orquestração de agente pronto, muito próximo do que a nossa harness precisa para o painel do Operador.

### 12.7 Novas linhas de classificação para predecessor program

| Padrão Mitra (SDK/integração) | Classificação | Tratamento predecessor program/Conexus |
|---|---|---|
| `callIntegrationMitra` (proxy REST genérico, credencial fica no servidor) | ADOPT (princípio) | Primitivo de External Effect: app nunca vê credencial; um só contrato para N provedores. Alinhado a Credential Grant + Egress authority |
| Integração por blueprint + custom (Basic/Bearer/API Key) | ADAPT | Registro de conectores; não criar abstração genérica antes do 2º consumidor real (invariante) |
| JDBC direto + `runQuery` + DataLoaders (ETL) para ERP | REFERENCE | Caminho de acesso profundo a Sankhya/Protheus; relevante se Conexus mirar ERP BR |
| Tunnels reversos para on-prem | REFERENCE + SPIKE | Como alcançar sistema do cliente atrás de firewall; candidato a spike se houver caso real |
| `sendEmailMitra` nativo; WhatsApp/SMS ausentes | ADAPT + OPPORTUNITY | Dispatch multicanal como capability de 1ª classe é diferenciação clara da Conexus |
| `updateAdditional(Business)InstructionsMitra` (instrução dev vs business) | ADOPT | Separar instrução por audiência (Operador/dev vs usuário final) é padrão limpo |
| `AgentTaskSession` + eventos (`AgentQueueChangeEvent`, `AgentToolEvent`…) | ADAPT | Contrato de orquestração/observação de agente; mapeia a Worker Run + Domain Events + painel |
| `manageAgentCredentialMitra` via `/sdk-ws` (OAuth Claude/Codex) | REFERENCE | Modelo de conectar subscription do usuário ao harness; decisão comercial |
| Perfis granulares (`setProfileSelectTables/DmlTables/ServerFunctions/Screens`) | ADOPT (princípio) | Autorização por recurso e por audiência = capability contract explícito; forte alinhamento com nossa autoridade separada |
| `deployToS3` + `getDeployStatus` (promote dev→prod) | REFERENCE | Pipeline de promoção; nosso análogo é Integration/Delivery Gate |
| Variáveis de projeto (`setVariable/getVariable`) | REFERENCE | Store de config/segredo por projeto; nosso análogo é Credential/Config authority |

## 13. `Mitra Escopo` — a camada de escopagem pré-build (specialist.mitralab.io)

> Mapeado em 2026-08-10 a partir de `specialist.mitralab.io/t/{uuid}` ("Mitra Escopo"). Ferramenta **separada** do code-builder: transforma "quero um CRM" numa **especificação técnica funcional** que depois alimenta o builder. SPA de bundle único (`index-*.js`), backend `newmitra.mitrasheet.com:8080`.

### 13.1 Achado central: o pipeline usa DOIS modelos, um por trabalho

```text
Mitra Escopo   → Google Gemini 2.5 Pro   (escopagem conversacional + geração de spec)
Code-builder   → Claude Code (Anthropic)  (build agêntico, seções 2–12)
```

Ou seja, Mitra **não usa o mesmo modelo para tudo**: um modelo conversacional barato e de alto contexto (`gemini-2.5-pro`, `temperature 0.7`, `maxOutputTokens 65536`) faz a elicitação de requisitos e gera o documento de escopo; o harness agêntico premium (Claude Code) faz a implementação. Entrada por voz é transcrita com `gemini-2.5-flash` (`inlineData` audio/webm).

Implicação forte para a nossa harness: **separar o agente de escopo/spec do agente de build**, possivelmente com modelos diferentes, é um padrão de custo/qualidade validado em produto. O artefato de escopo é o "prompt certo" de handoff entre as duas etapas.

### 13.2 Arquitetura (dogfooding — o Escopo é ele mesmo um app Mitra)

- O Escopo é um app Mitra (projeto `42949`). Sua **skill (metodologia), a chave Gemini e o modelo** ficam numa tabela do projeto, lidos em runtime por Server Function pública:

```js
executeServerFunction({ projectId: 42949, serverFunctionId: 4, input: {} })
// → result.output.rows[0] = { SKILL_MD, GEMINI_API_KEY, MODELO_GEMINI }
```

- Chamada via SDK anônimo `agentAiShortcut` (`/agentAiShortcut/executeServerFunction`, `setVariable`, `getVariable`, `runAction`) no backend `newmitra.mitrasheet.com:8080`.
- Sinal de conclusão: a IA emite a tag `[ESCOPO_FINALIZADO]` numa linha isolada ao final do documento (regex `/\[?\s*ESCOPO[_ ]FINALIZADO\s*\]?/i`).

### 13.3 System prompt (capturado verbatim do bundle)

O prompt é montado por `Ep(skillMd)`:

```text
Você é um assistente de escopagem técnica da Mitra. Seu trabalho é conduzir o
usuário pela definição do escopo técnico funcional do projeto dele, seguindo a
skill descrita abaixo.

DATA DE HOJE: {data}. Use esta data como referência temporal.

INSTRUÇÕES DE COMPORTAMENTO:
- Sempre responda em português brasileiro
- Seja profissional, objetivo e amigável
- Faça perguntas para entender completamente o projeto do usuário
- Não gere o escopo final até ter informações suficientes sobre: objetivo do
  sistema, personas/atores, regras de negócio principais, fluxos esperados
- Quando você considerar que tem informações suficientes para gerar o escopo
  completo, PERGUNTE ao usuário se ele deseja que você gere o documento de escopo
- Quando o usuário confirmar, gere o documento completo de escopo técnico
  funcional seguindo a estrutura obrigatória da skill
- Ao FINALIZAR o documento completo, inclua EXATAMENTE a tag [ESCOPO_FINALIZADO]
  em uma linha separada no FINAL da sua última mensagem
- NÃO inclua a tag antes de gerar o documento completo / em mensagens intermediárias
- Se o usuário pedir para gerar o escopo antes de ter informações suficientes,
  avise que ainda precisa de mais detalhes

SKILL DE ESCOPO TÉCNICO:
--- {SKILL_MD} ---
```

O **corpo da SKILL_MD** (a "estrutura obrigatória" do documento) fica no servidor e é servido junto com a chave Gemini secreta; não foi extraído verbatim por trazer o segredo acoplado. Sua função é definir a estrutura do documento de escopo técnico funcional — que cobre no mínimo: objetivo do sistema, personas/atores, regras de negócio, fluxos esperados (os gates de suficiência acima).

### 13.4 Método de escopagem (destilado, transferível)

```text
1. Usuário descreve o projeto em linguagem natural (texto ou voz)
2. Agente faz perguntas até cobrir 4 dimensões mínimas:
   objetivo · personas/atores · regras de negócio · fluxos
3. Gate de confirmação: PERGUNTA se pode gerar o documento (não gera sozinho)
4. Gera documento de escopo técnico funcional (estrutura fixa da skill)
5. Marca conclusão com sentinela [ESCOPO_FINALIZADO]
6. Documento vira o input de spec para o code-builder
```

### 13.5 Achados de segurança (anti-patterns a NÃO repetir)

1. **Chave Gemini exposta ao browser**: a chamada é `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GEMINI_API_KEY}` feita direto do cliente — a chave trafega na URL e fica legível no DevTools/Network de qualquer visitante. Cota abusável por terceiros.
2. **Skill + chave servidas anonimamente**: `serverFunctionId 4` do projeto 42949 retorna `SKILL_MD` + `GEMINI_API_KEY` sem autenticação. Lição inversa para nós: segredo de modelo **nunca** no cliente; toda chamada de LLM passa por backend com credencial server-side (alinhado ao nosso Credential Grant / Egress authority).

### 13.6 Classificação para predecessor program

| Padrão Mitra Escopo | Classificação | Tratamento predecessor program/Conexus |
|---|---|---|
| Etapa de escopagem separada, antes do build | ADOPT | Agente de spec/escopo distinto do agente de build; o escopo é o contrato de handoff (nosso Context Pack/Execution Brief nasce daqui) |
| Modelo diferente por etapa (Gemini p/ escopo, Claude p/ build) | ADAPT | Roteamento de modelo por tarefa (custo/qualidade); decisão a validar, mas o princípio é forte |
| Elicitação guiada por 4 gates de suficiência (objetivo/personas/regras/fluxos) | ADOPT | Checklist barato de completude antes de gerar spec; entra no nosso Discovery→Decision |
| Gate de confirmação humana antes de gerar o documento | ADOPT | Alinhado ao nosso princípio de interrupção só para decisão/aceite do Operador |
| Sentinela de conclusão (`[ESCOPO_FINALIZADO]`) para orquestração | ADAPT | Sinal estruturado de fim-de-fase; nós preferimos evento de domínio a parsing de texto |
| Skill/metodologia versionada como dado (tabela do projeto) e injetada no prompt | ADAPT | Nossas skills já são versionadas; guardar como dado editável sem redeploy é conveniente |
| Chave de LLM no cliente / SF pública com segredo | REJECT | Anti-pattern de segurança; toda credencial de modelo fica server-side |

## 14. Experimentos observados (evidência de comportamento, não só de superfície)

Dois experimentos rodados ao vivo para capturar **comportamento** do agente, não apenas API. Fonte: conversa real do usuário no Escopo (`specialist.mitralab.io/t/b02048a6-…`) e build de migração no code-builder (`agent.mitralab.io`, projeto "controle de OS metalúrgica").

### 14.1 Escopo — saída real capturada (conversa "Conexus Sales Radar")

Input do usuário: prompt-manifesto de 23 seções (princípios anti-mock, gates, autonomia alta, data contract, score determinístico, NBA). Comportamento observado do Escopo (Gemini 2.5 Pro):

1. **Não despejou escopo.** Turno 1 = **5 perguntas de clarificação** exatamente nos 4 eixos de suficiência do system prompt (personas/visibilidade, regra de conversão "ganho", heurística do score, comportamento do feedback, gatilhos de NBA). Ofereceu inferir se o usuário preferisse.
2. Usuário respondeu pedindo recomendação ("me recomende a solução Global Maximum").
3. **Turno 2 = documento de escopo canônico de 10 seções**: Capa+metadados / Objetivo / Atores / Pré-condições (PC-01 ERP read-only Sankhya/Oracle) / Glossário / Regras de Negócio / Fluxo Principal / Fluxos Alternativos / Critérios de Aceite (12) / Pontos em Aberto.
4. **Resolveu ambiguidade inventando valores concretos**: onde o usuário deixou o score aberto, o Escopo definiu `Score = (P1*0.40)+(P2*0.40)+(P3*0.20)` com exemplos numéricos; definiu conversão via vínculo `ID_ORCAMENTO→ID_NOTA_FISCAL`; RLS `ID_VENDEDOR_ERP==ID_USUARIO_MITRA`; snooze de 24h.
5. Fecho: sentinela **"Escopo finalizado com sucesso"** → "documento salvo automaticamente" + botões **Copiar Documento / Pedir Alterações / Nova Conversa**.

**Divergência crítica a mapear**: o princípio do usuário era *"não invente dado/regra sem marcar UNRESOLVED"*. O Escopo faz o **oposto** — resolve ambiguidade com recomendação assertiva e só registra os resíduos em "Pontos em Aberto". Para Conexus isso é ADAPT com trava: gerar spec assertiva **é** desejável para velocidade, mas cada valor inventado precisa carimbo `hipótese`/`UNRESOLVED` explícito, não virar fato silencioso. O Escopo transforma gates→seções numeradas e perde a distinção fato/regra/hipótese que o usuário exigia.

### 14.2 Migração por interceptação — probe de autonomia

Base (msg 1): app de OS metalúrgica — 3 tabelas (CLIENTES, STATUS_ORDEM, ORDENS), 15 SFs SQL, dashboard cross-filter. Achou+corrigiu 2 bugs reais no próprio QA (filtro no WHERE anulando LEFT JOIN; cross-filter por índice vs por valor).

Probe (msg 2, ambiguidades plantadas de propósito): *"cada ordem precisa de VALOR e PRIORIDADE; novo KPI de faturamento; registrar propostas/orçamentos por cliente antes de virarem ordem"* — sem definir escala de prioridade, sem definir o que é "faturamento", sem moeda.

Comportamento observado:

1. **SYNC obrigatório primeiro** ("nada novo do time"), depois **orientação** (17 tool calls lendo o código existente) antes de tocar em qualquer coisa.
2. **NÃO disparou AskUserQuestion** em nenhuma das 3 ambiguidades. Resolveu tudo sozinho — confirma a metodologia de autonomia alta (interromper só em bloqueio material, não em ambiguidade de design).
3. **Migração aditiva explícita**: "Migration aditiva … sem tocar no que já existe." Adicionou colunas `VALOR`+`PRIORIDADE` em ORDENS e criou tabelas novas.
4. **Reuso consistente do padrão lookup**: PRIORIDADE virou tabela `PRIORIDADES` e status de proposta virou `STATUS_PROPOSTA` — espelhando o `STATUS_ORDEM` da base (mesma decisão de modelagem, aplicada por analogia ao código existente).
5. **Refatoração para reuso no 2º passe**: extraiu componentes compartilhados (`CurrencyInput`, `DatePicker`, `KpiCard`) e evoluiu o cross-filter de 2→3 dimensões — em vez de só empilhar código novo.
6. Mesma esteira de QA/validação da base (SFs ponta a ponta, build, lint, permissões business vs dev, revisão final contra o prompt) e SHARE no fim.

**Lições para Conexus**:
- Migração **sempre aditiva por padrão** (nunca destrutiva sem autorização) — ADOPT direto.
- Orientar-se lendo o estado atual **antes** de planejar a evolução (o SYNC+17-tools-de-leitura é barato e evita quebrar contrato existente) — ADOPT.
- Autonomia na ambiguidade **de design** é boa para velocidade, mas ver §14.1: casar com carimbo de hipótese. Para Conexus, a regra é **decidir e registrar a decisão**, não decidir em silêncio.
- Reuso por analogia ao código existente (lookup table, componentes compartilhados) é comportamento emergente forte do agente sobre um template consistente — reforça investir no **template/scaffold** como alavanca de qualidade (ADOPT: template rico → agente herda boas decisões).

## 15. Integração Sankhya ao vivo — mecanismo real (experimento 3)

Experimento decisivo para a pergunta original do usuário: *"como integraria com o Sankhya e saberia acessar tudo lá dentro"*. Rodado no projeto **Sales Radar** (ws 146638 / proj 55785). Operador colou credenciais reais de produção no chat; o agente executou a integração ponta a ponta. **Credenciais redigidas neste doc por política.**

### 15.1 Fluxo de credencial e registro da conexão

1. Operador fornece 3 segredos no chat: `x_token`, `client_id`, `client_secret` (padrão OAuth Sankhya).
2. Agente **não** hardcoda: "`.env` está no gitignore — vou usar isso para as credenciais". Segredo vai para `.env` do sandbox, fora do repo SHARE.
3. Agente lê o blueprint: template **`sankhya_oauth`**, que exige exatamente `x_token` + `client_id` + `client_secret`.
4. `testIntegrationMitra` → **"Conexão validada com sucesso no gateway de produção (`sankhya_oauth`). O sandbox recusou (401)"** — há gateway de **produção** vs **sandbox** distintos; as credenciais eram de produção.
5. `createIntegrationMitra` → integração persistida com **slug `sankhya`**.
6. Chamada de dados: **`callIntegrationMitra({ connection: 'sankhya', … })`** — o agente errou com `integrationSlug`, viu o erro e corrigiu para **`connection`** (confirma a assinatura mapeada em §12).

### 15.2 Como "sabe tudo lá dentro" — introspecção via SQL Oracle

O gateway `sankhya_oauth` expõe **execução de SQL direto contra o Oracle do ERP** ("Query rodando (Oracle)"). Não é REST de entidade nomeada — é query livre. Foi assim que o agente resolveu, **com dado real (não hipótese)**, os pontos que o Escopo deixara em aberto:

| Descoberta real no ERP do cliente | Como obteve |
|---|---|
| Orçamento = **TOP 14** (7.881 docs/12 meses) + **TOP 714** "ORCAMENTO COMISSIONADO" | `SELECT` agregado em TGFCAB por CODTIPOPER (TOP) |
| **`NUNOTAORIG` não existe** nesta base — vínculo padrão orçamento→NF ausente | introspecção de colunas de TGFCAB |
| Campos customizados `AD_VENDIDA`, `AD_STATUSNEG`, `AD_NUMNOTAORIG` carregam a semântica real (prefixo `AD_` = campo do cliente) | leitura do dicionário de colunas |
| **Ambiente multiempresa**: 1 credencial enxerga **6 schemas** de produção (`UNIPARTSPRD, ICROPPRD, ATTRAPRD, PANICEPRD, METALPRD, VASSOURASPRD`) | `SELECT` no catálogo de schemas Oracle |

Insight central: a "integração Sankhya" não é conhecimento embutido de ERP — é **conexão genérica + agente que faz Data Discovery por SQL** sobre o schema real, reconhecendo convenções Sankhya (TGFCAB/TGFTOP, TOP=CODTIPOPER, prefixo AD_ de custom fields, multiempresa por schema).

### 15.3 Achados de governança (para Conexus)

1. **Blast radius da credencial**: um único `x_token`/OAuth deu acesso de leitura a **6 empresas** de produção. Lição: no Conexus, escopar credencial por empresa/schema e registrar o alcance real no momento da conexão.
2. **Produção sem rede de proteção**: o teste bateu direto no gateway de produção do cliente. Não houve etapa de "conectar em homolog primeiro". Para Conexus: exigir seleção explícita de ambiente e marcar leituras em produção.
3. **Segredo em `.env` do sandbox + no histórico do chat**: correto não versionar, mas o segredo trafega no chat e persiste no `.env` do sandbox. Conexus deve ter canal de credencial fora do prompt (nosso Credential Grant), nunca colado no chat.

### 15.4 Classificação para predecessor program

| Padrão Mitra (integração) | Classificação | Tratamento Conexus |
|---|---|---|
| Conexão genérica por blueprint (`sankhya_oauth`) + slug reutilizável | ADOPT | Registro de conexão nomeada com blueprint versionado; `connection` como handle |
| Credencial server-side em `.env` gitignored, injetada no gateway | ADOPT | Alinhado ao Credential Grant / Egress authority; segredo nunca no cliente nem no repo |
| Gateway com **SQL livre** contra o ERP | ADAPT (com trava) | Poderoso p/ Discovery, mas SQL livre em produção é risco; Conexus: read-only forçado + allowlist de tabelas/schema por perfil |
| **Data Discovery por SQL** para resolver escopo com dado real | ADOPT (forte) | Exatamente o antídoto ao "inventar regra" do §14.1: o build valida hipóteses do escopo contra o schema real antes de codar |
| Reconhecimento de convenções do ERP (TGFCAB/TOP, AD_, multiempresa) | REFERENCE | Encapsular como "perfil de ERP" plugável (Sankhya, depois outros) — conhecimento de domínio versionado, não hardcoded no agente |
| Credencial de produção colada no chat; 1 token → 6 empresas | REJECT / trava | Canal de credencial dedicado; escopo de credencial por empresa; seleção explícita de ambiente |
| Gateway prod vs sandbox distintos (401 no sandbox) | ADOPT | Separação de ambiente no gateway; default para não-produção |

### 15.5 Artefatos versionados do Discovery (extraídos do repo do projeto)

O agente materializou o trabalho em dois documentos **na raiz do repo** (`discovery-sankhya.md`, `escopo-sales-radar.md`) — spec e evidência são artefatos versionados, não só texto de chat.

**`discovery-sankhya.md`** — fatos técnicos completos:

- **Mecanismo de query**: serviço nativo Sankhya **`DbExplorerSP.executeQuery` via `/gateway/v1/mge/service.sbr`**; limite **5.000 linhas/consulta** (`burstLimit`) → paginação via SQL.
- Schema da conexão: `METALPRD` (Metal Nobre Ferragens Finas Ltda); demais 5 schemas flagados para confirmação de escopo (PA-19).
- **Vínculo de conversão real**: `TGFCAB.NUNOTAORIG` inexistente; conversão rastreada por **`TGFVAR`** (`NUNOTAORIG`→`NUNOTA`), populada (5.171 conversões/12m mapeadas por tipo de destino).
- Cursor incremental viável: `DTALTER` sem nulos. Vendedor↔usuário via `TGFVEN.EMAIL`.
- **Dado contradisse a premissa do escopo**: 67% dos orçamentos abertos (73% do valor, R$ 4,45 mi) têm +10 dias — aplicar o P2 especificado inverteria o propósito do produto. O agente **não recalibrou sozinho**: registrou como decisão de negócio (PA-16) e **bloqueou a implementação** ("Aguardando Discovery Técnico"). Contabilidade explícita: 7 PAs bloqueantes / 5 resolvidos.
- Seção de segurança auto-gerada: recomenda **rotacionar Client Secret/X-Token** por terem sido transmitidos via chat.

**`escopo-sales-radar.md` v2.0** — o build agent **reescreveu** o escopo do specialist (10→15 seções): adicionou RN-06 Explicabilidade Obrigatória, RN-07 Transparência de Origem, RN-08 Imutabilidade do ERP, seção de Riscos, Sequência de Implementação, Aprovação — e assina "**Assistente Conexus**" (veste a marca do produto do usuário). Destaques da seção 6 (protocolo de integração):

- Marcador **`[DECISÃO DO CLIENTE]`**: decisões que o time técnico está proibido de assumir (ex.: modelo de consumo Online × Importação Periódica × Misto, com tabela de prós/contras e recomendação justificada).
- **Staging obrigatório**: `IMP_<entidade>` truncada por execução + upsert atômico (`INSERT … ON DUPLICATE KEY UPDATE`); **proibido** `DELETE + INSERT` (janela de dados vazios).
- Incremental diurno via cursor + **full refresh noturno**; batching parametrizado pelo `burstLimit`.
- **Monitoramento como entrega obrigatória**: log de importações, tela de cargas, alerta por e-mail em falha, indicador "última atualização" em toda tela. Justificativa: carga que falha em silêncio é o pior modo de falha.
- Regra escrita no próprio doc: "**Credenciais do banco jamais são solicitadas ou trafegadas por chat**" — o agente codificou a lição do incidente.

**Contraste central do pipeline (achado mais importante do estudo)**: o Escopo (Gemini) **inventa** valores para fechar spec rápido; o build agent (Claude) **verifica contra o dado real e trava** nas decisões de negócio. O pipeline Mitra funciona porque o segundo estágio audita o primeiro. Para Conexus: ADOPT — spec assertiva no estágio 1 + Discovery com veto no estágio 2; a spec só vira contrato depois de validada contra a fonte real.

### 15.6 Escopo v2.0 completo — template de metodologia (capturado integral)

Esqueleto do `escopo-sales-radar.md` v2.0 (15 seções) — serve de **template canônico de spec** para Conexus:

1. Capa+metadados (status: `Aguardando Discovery Técnico`) · 2. Atores · 3. Pré-condições · 4. Glossário · 5. Regras de Negócio (RN-01..08, cada uma com exemplo numérico) · 6. Arquitetura de Dados e Integração (protocolo §15.5) · 7. Fluxo Principal (9 passos) · 8. Fluxos Alternativos/Exceções · 9. Escopo de Telas (tela×persona×conteúdo) · 10. Critérios de Aceite (15) · 11. **Fora de Escopo explícito** · 12. **Riscos e Mitigação** (RM-01..06) · 13. **Pontos em Aberto** (resolvidos × residuais × bloqueantes) · 14. **Sequência de Implementação** (F0–F6) · 15. **Aprovação** (sign-off de 3 papéis, incl. responsável técnico do ERP).

Padrões dignos de ADOPT direto:

- **PA como moeda de rastreabilidade**: cada ponto em aberto tem ID; o Discovery move PAs de "bloqueante" → "resolvido" com a resolução técnica anotada (ex.: PA-01 → `CODTIPOPER IN (14,714)` + `PENDENTE='S'` sem vínculo em `TGFVAR`). Classe "residual — não bloqueia" com **impacto declarado se não resolvido**.
- **Assunções carimbadas**: PA-02 "**assumido** incremental 30 min + full refresh 3h" — decidiu, mas marcou como assunção reversível ("mudança de configuração, não de arquitetura").
- **Degradação graciosa como regra de spec**: EX-02 "falha de IA não bloqueia o produto" (score+explicabilidade continuam; NBA indisponível); PA-18 → P3 desligado com P1+P2 renormalizados até alinhamento; CA-14/CA-15 amarram isso em critério de aceite.
- **Fases com dependência explícita** (F0 Discovery → F1 cargas+monitoramento → F2 score → F3 UI → F4 IA → F5 gestor → F6 piloto+recalibração) e uma **ordem inegociável justificada**: monitoramento antes do produto ("carga que falha em silêncio = decisões comerciais sobre dado de confiabilidade desconhecida").
- **Recalibração obrigatória embutida** (RM-02: piloto + recalibrar score em 60 dias contra conversão real) — o produto nasce com loop de validação, não como entrega estática.
- Fora de Escopo nomeia o que **não** é: sem ML no score (determinístico+explicável; IA só no texto), sem escrita no ERP, sem envio automático ao cliente final.

## 16. Framework de abstração completo (modelo de dados dos SDKs, verbatim dos d.ts)

Extraído integral dos `.d.ts` publicados (unpkg, `mitra-sdk` + `mitra-interactions-sdk`). Este é o **meta-modelo da plataforma** — a resposta a "como eles abstraem tudo como classe/estrutura".

### 16.1 Tunnel = Cloudflare Tunnel (confirmado na fonte)

Hipótese do Operador validada: TI conecta banco on-prem **sem VPN**. Modelo:

```ts
interface CloudflareTunnel {
  id; workspaceId; tunnelName; alias;
  cfTunnelId: string;          // tunnel Cloudflare real
  tunnelToken: string;         // token que a TI roda no conector (cloudflared)
  status; lastErrorMsg;
  dhStatusLastCheck/LastError/LastSuccess;  // telemetria de saúde
  routes?: CloudflareTunnelRoute[];
}
interface CloudflareTunnelRoute {
  subdomain; alias; hostname;   // hostname público gerado (DNS record)
  internalDbUrl: string;        // IP/host interno do banco
  internalDbPort: number;
  dnsRecordId;
  routeStatus; processStatus;   // status separados: rota DNS × processo conector
  // + timestamps de health por rota e por processo
}
```

**Fluxo operacional** (o que a TI do cliente faz): `createTunnelMitra({alias})` → plataforma devolve `tunnelToken` → TI executa o conector (cloudflared) com o token na rede interna → `addTunnelRouteMitra({tunnelId, alias, internalDbUrl, internalDbPort})` → nasce `hostname` público → `createJdbcConnectionMitra({host: hostname, port, database, user, password})`. Só tráfego de **saída** no cliente; nenhuma porta aberta; health-check por tunnel e por rota. 15 funções de ciclo de vida (activate/deactivate/stop/sync status/CRUD rotas).

### 16.2 Integração REST — blueprint como classe, instância como conexão

```ts
// A "classe": template versionado no catálogo
interface ConnectorTemplateResponse {
  id; name; logo; authStrategy;
  fieldsSchema: { fields: {key; label; type:'text'|'password'; required; placeholder?; default?}[] };
  authenticationConfig;   // fluxo de token (ex.: DYNAMIC_TOKEN — caso Sankhya OAuth)
  authorizationConfig;    // como injetar credencial na request
  docUrl; testEndpoint;   // validação embutida
  custom; active;
}
// Injeção de credencial: union fechada
type AuthorizationConfig =
  | { type:'header'; config:{name;value}[] }
  | { type:'basic';  config:{username;password} }
  | { type:'cookie'; config:{name;value} }
  | { type:'query';  config:{name;value} };
// A "instância"
interface IntegrationResponse { id; projectId; name; slug; blueprintId; blueprintType;
  authType; credentials; status; lastCheckedAt; }
// O runtime (única porta de chamada)
callIntegrationMitra({ connection: slug, method, endpoint?, params?, body? })
  → { statusCode, body }
```

`fieldsSchema` gera o formulário de credencial dinamicamente (por isso o agente soube que `sankhya_oauth` exige `x_token`+`client_id`+`client_secret`); `testEndpoint` dá o teste de conexão padrão; `custom:true` permite blueprint próprio sem template.

### 16.3 Camadas de dados externas — 4 níveis de abstração

| Camada | Estrutura | Função |
|---|---|---|
| 1. Rede | `CloudflareTunnel`+`Route` | banco on-prem alcançável sem VPN |
| 2. Conexão | `JdbcConnection {name,type,host,port,database,user,password}` | credencial de banco nomeada, `isOnline` |
| 3a. Dado virtual | `OnlineTable {jdbcId, name, sqlQuery, columns[]}` | view sobre o banco externo, consultada ao vivo |
| 3b. Dado materializado | `DataLoader {jdbcId, query, tableName, runWhenCreate, input}` → `executionLog {timestamp,rowCount,duration,fileSize,status}` | ETL: query externa → tabela local, com log de execução por carga |
| 4. API REST | blueprint+integration+`callIntegration` | qualquer SaaS/gateway (caso Sankhya) |

**Agendamento embutido**: `ServerFunction` tem `cronExpression`+`cronInputJson` — SF é também job agendado; e SF aceita `jdbcId` → roda SQL **direto no banco externo**. A dupla DataLoader+SF-cron é exatamente a "Importação Periódica" do escopo v2.0 (§15.6) — a plataforma já tem as primitivas.

### 16.4 Meta-modelo do projeto (o "mundo" que o agente enxerga)

`getProjectContextMitra()` devolve o inventário completo em 1 chamada — o world-model do agente:

```ts
{ project: {id, name, instructions},        // instruções injetáveis (metodologia)
  inventory: {
    jdbcs[]; tables[{name, columns[{name,type,isPk,nullable}]}];
    onlineTables[]; dbActions{}; serverFunctions[]; dataLoaders[];
    variables[{key,value}]; sourceFiles } }
```

RBAC como grade `Profile × recurso`: `{users, selectTables, dmlTables, actions, screens, serverFunctions, color, homeScreenId}` — leitura e escrita separadas por tabela, telas e SFs permitidas por perfil. Usuários tipados `dev|business` (`manageUserAccessMitra {action: INVITE|REMOVE|CHANGE_TYPE}`).

Convenção de envelope uniforme: toda resposta é `{status, result, paramsApplied?}`; erros e logs padronizados em SF (`{executionId, executionStatus, output, logs, error, durationMs}`).

### 16.5 Agente embutível como estrutura de dados

`AgentTaskSession` (interactions-sdk) é a superfície completa para embutir o builder em qualquer UI:

- Estado: `'opening'|'idle'|'uploading'|'streaming'|'cancelled'|'error'|'closed'`
- Fila editável: `QueuedItem {id,text,seq,status:'pending'|'sending',injected?}` + `editQueueItem/removeQueueItem/clearQueue`
- Eventos tipados: `historyLoaded, turnStart, delta {kind:'text'|'tool'}, tool {tool,input,content}, turnEnd, taskCreated, cancelled, error, queueChange, statusChange`
- `send(prompt, {agentType?, modelId?, files?})` — **modelo selecionável por mensagem**

### 16.6 Classificação

| Padrão | Classificação | Nota |
|---|---|---|
| Tunnel gerenciado (Cloudflare) com token p/ TI + rotas host:porta | ADOPT | Onboarding on-prem sem VPN; health por rota; nossa versão pode usar cloudflared ou rathole/frp |
| Blueprint de conector com `fieldsSchema` dinâmico + `testEndpoint` | ADOPT | Catálogo versionado de conectores; form de credencial gerado do schema |
| Union fechada de `AuthorizationConfig` (header/basic/cookie/query) + `DYNAMIC_TOKEN` | ADOPT | Cobre 95% dos SaaS; token-refresh server-side |
| 4 camadas de dado externo (rede→conexão→virtual/materializado→REST) | ADOPT | Separação limpa; DataLoader com executionLog é o esqueleto do nosso pipeline de carga |
| SF com cron embutido | ADOPT | Job scheduling sem serviço separado |
| `getProjectContext` como world-model de 1 chamada | ADOPT (forte) | Contexto do agente barato e completo; espelha nosso Context Pack |
| RBAC grade perfil×recurso com select/dml separados | ADOPT | Base do nosso authority model de dados |
| `AgentTaskSession` com fila editável e eventos tipados | REFERENCE | Blueprint do nosso protocolo de sessão de agente embutido |

### 16.6b Databases externos via Cloudflare Tunnel — evidência de UI (bundle do app)

Validação do achado do Operador (conectar qualquer banco on-prem via túnel, sem VPN). Extraído do bundle `entry.Hp59YscR.js` (6,9 MB, agent.mitralab.io):

- **Tela "Cloudflare Tunnels"** nas configurações do workspace: *"Manage Cloudflare tunnels and routes to securely expose internal services. A workspace can have multiple tunnels, each with multiple associated routes."*
- **Form da rota é exatamente IP+porta do banco interno**: placeholder do host `"ex: 192.168.1.100"`, placeholder da porta `"ex: 3306"`. TI preenche IP interno + porta → plataforma gera hostname público → JDBC aponta pro hostname.
- **Drivers JDBC confirmados no código**: `dataBaseDriverType ∈ {ORACLE, MYSQL, SQLSERVER}` (+ `PostgreSQL` no exemplo do README do SDK). Templates "Base de Conhecimento (ORACLE/MySQL/SQLSERVER)" como projetos prontos.
- **Multi-tenant por driver**: endpoint `/multiTenant/tenantConfig?dataBaseDriverType=` — a config de tenant da plataforma é parametrizada pelo tipo de banco; `partnerUsesOracleDB` como getter de licença (parceiros/integradores têm driver associado).
- **Catálogo de credenciais na mesma tela** (i18n do painel de conexões): Gmail (access token / Google Client ID+Secret), Google Calendar, HubSpot (API Key), **SAP (url + client_id + client_secret)**, **Supabase (Project URL + Service Role Key)**, campo `Test Endpoint` ("ex: /health ou /api/status") — a materialização visual do `fieldsSchema` dos blueprints (§16.2).
- Fluxo completo documentado no README do SDK: `createTunnel → addTunnelRoute(internalDbUrl, internalDbPort) → activateTunnel` ("**inicia processos cloudflared**") → `syncTunnelStatus`. O `activate` sobe processo bridge no lado da plataforma (por isso `processStatus` por rota, separado do `routeStatus` DNS).

Classificação: ADOPT — onboarding de banco on-prem vira formulário de 2 campos (IP+porta) para a TI do cliente, com health-check por rota. É o menor atrito possível para o caso "conectar Oracle do ERP sem VPN".

### 16.7 De onde vem o conhecimento de domínio do ERP (avaliado)

Pergunta do Operador: *"como ele sabe e mapeia tudo do Sankhya? Tem um especialista, documentação?"* Resposta: **não há especialista nem doc de ERP embutidos**. Três camadas:

1. **Blueprint = só mecânica.** `sankhya_oauth` carrega `fieldsSchema` (3 campos), `testEndpoint`, `docUrl`. Zero semântica de negócio.
2. **O "especialista" é o pré-treino do LLM.** Sankhya tem documentação pública massiva (developer.sankhya.com.br): OAuth client credentials, gateway `service.sbr?serviceName=`, dicionário TGFCAB/TGFITE/TGFPRO/TGFPAR — e publica até **`llms.txt`** (índice de docs para LLMs). Prova decisiva: `DbExplorerSP.executeQuery` **não consta na doc oficial** — é serviço semi-interno difundido em fóruns/GitHub da comunidade — e o agente o usou mesmo assim. Conhecimento veio do corpus, não da plataforma.
3. **Discovery corrige o prior.** O agente assumiu o padrão público (`NUNOTAORIG`), sondou a base real, constatou ausência e achou o mecanismo verdadeiro (`TGFVAR`, `AD_*`). Prior dá direção; introspecção dá verdade.

**Fórmula**: conector genérico (mecânica) + prior do modelo (domínio) + loop de verificação (base específica).

**Para Conexus**: não construir bases de conhecimento por ERP antecipadamente — o prior cobre sistemas grandes. Mas o prior degrada com a obscuridade do sistema; para nicho, ativar o "perfil de ERP" (§15.4): pacote versionado de convenções + docs do vendor (aproveitar a adoção crescente de `llms.txt` pelos vendors) injetado como contexto quando o Discovery detectar prior fraco (muitas correções seguidas).

## 17. "Sistema de missão" do Mitra — governança mínima viável (comparativo com predecessor program)

Pergunta do Operador: nosso sistema de missão é muito complexo/extenso ("talvez até demais") — como o Mitra faz essa parte? Resposta com base nos 3 experimentos: **o Mitra quase não tem sistema de missão** — e entrega qualidade mesmo assim.

### 17.1 Os 4 mecanismos observados

1. **Missão = 1 task de chat com checklist-template fixo.** Os dois builds (criação e migração) usaram a MESMA lista de 13 itens: Planejar → UX → Design → Backend → Frontend → Testes → Validar features/UX/design/usuários/permissões → **Revisão final contra o prompt original**. Não é plano sob medida; é template de disciplina nas instruções, materializado via TodoWrite.
2. **Estado de longo prazo em documentos versionados, não em processo.** `escopo-*.md` (status no cabeçalho = gate; fases F0–F6 com dependências; PAs bloqueantes/residuais) + `discovery-*.md` (evidência). O gate é o campo `status` do doc; o tracking é o ciclo de vida dos PAs; o ledger é o git (SYNC/SHARE).
3. **Zero hierarquia de agentes.** Um agente, tasks sequenciais, sem orquestrador nem validador frio. Validação = 5 itens de auto-validação do checklist + revisão final contra o prompt.
4. **Única máquina de fases separada é o Escopo** (2 estágios, sentinela `[ESCOPO_FINALIZADO]`).

### 17.2 Comparativo

| Dimensão | predecessor program | Mitra |
|---|---|---|
| Plano | Mission→Milestone→Feature, planner packs | Checklist fixo por task |
| Gates | P6/P7, validadores frios, contracts | Campo `status` do doc de escopo |
| Rastreio | Ledgers, evidence packs | PAs com ID no doc + git history |
| Validação | Agentes QA dedicados | Auto-validação no checklist |
| Horizonte longo | Sistema de missão | Documentos versionados como estado |

### 17.3 Leitura e classificação

O Mitra comprime disciplina em **template** (checklist invariante + protocolo no doc) em vez de processo externo. Funciona porque cada task tem horizonte curto; o horizonte longo mora nos docs. Qualidade observada: achou e corrigiu os próprios bugs, travou em decisão de negócio — com ~5% da maquinaria do predecessor program.

| Padrão | Classificação | Tratamento |
|---|---|---|
| Checklist-template invariante com validações embutidas | ADOPT | Para o agente embutido do produto Conexus; barato e auditável |
| Doc-como-contrato com status-gate e PA lifecycle | ADOPT | Substitui maquinaria pesada para trabalho de produto |
| Auto-validação (sem revisor frio) | ADAPT | Suficiente para app CRUD; manter revisor frio para mudanças de risco (dados, permissões, produção) |
| predecessor program-grade completo | manter | Para construir a plataforma em si; não exportar para o produto |

## 18. Harness plugável — BYOK / BYOS / multi-agente (achado tardio, alto impacto)

Cluster de tipos do interactions-sdk não visto antes. Revela que o builder do Mitra **não é fixo em Claude Code** — é um harness plugável de credencial, modelo e runtime de agente. Explica o "**Sub**" em "Claude Opus 5 High Sub" = assinatura Claude conectada via OAuth.

### 18.1 Três eixos de plugabilidade (verbatim dos tipos)

```ts
// Runtime do agente (a CLI que roda no sandbox)
type AgentType = 'claudecode' | 'codex' | 'opencode-cli' | 'opencode-sdk';
// Credencial por assinatura (BYOS — traga sua conta)
type AgentSubscriptionTarget = 'claude' | 'openai_oauth' | 'codex';
type ConnectableSubscriptionTarget = 'claude' | 'codex';
// Credencial por API key (BYOK — 8 provedores)
type AgentApiKeyTarget = 'anthropic'|'openai'|'gemini'|'kimi'|'minimax'|'glm'|'qwen'|'openrouter';
type CredentialAccessType = 'subscription' | 'api_key';
type AuthMethod = 'api_key' | 'paste_code' | 'device';
```

O usuário do Mitra pode: (a) **conectar a própria assinatura** Claude Max/Pro ou ChatGPT/Codex via OAuth; (b) **colar API key** de 8 provedores (Anthropic, OpenAI, Gemini, Kimi, MiniMax, GLM, Qwen, OpenRouter); (c) escolher o **runtime** (Claude Code, Codex CLI, OpenCode). O modelo é selecionável por mensagem (`SendOptions.modelId`).

### 18.2 Máquina de credencial (`manageAgentCredentialMitra`)

Uma função, 3 overloads, ação-máquina:

```ts
type CredentialAction = 'auth'|'connect'|'status'|'remove'|'list'|'list_models'
  |'list_providers'|'validate'|'save'|'oauth_start'|'oauth_exchange'
  |'device_start'|'device_poll'|'device_cancel';
```

- **OAuth assinatura Claude**: `{action:'auth', target:'claude'}` → `AuthClaudeResult {authUrl, state}` (abre browser) → `{action:'connect', target:'claude', code, state}` → `ConnectAgentSubscriptionResult {success, account:{email, orgName}, expiresAt}`.
- **Device flow Codex**: `{action:'auth', target:'codex'}` → `AuthCodexResult {userCode, verificationUrl, pollId}` → poll `device_poll`.
- **Provider list p/ UI**: `list_providers` → `AgentProviderListItem {name, type, connected, account, maskedKey, expiresAt}` (é o seletor de modelo que vimos); `list_models` → grupos `AgentModelGroup {type: 'subscription'|'api_key', models[]}`.
- Credencial roda sobre websocket `/sdk-ws` (visto no `useAgentWebSocket` do bundle).

### 18.3 Task do agente amarrada à credencial

```ts
interface GetAgentTaskCreateOptions { create:true; projectId?; agentType?:AgentType;
  modelId?:string; name?:string; connectionId?:string; }
```

`connectionId` liga a task a uma credencial específica → multiusuário com contas próprias. `manageAgentChatMitra` faz list/rename/delete de chats (histórico por projeto).

### 18.4 Por que isso importa para Conexus

Este é o achado mais estratégico do estudo. O Mitra provou um **harness agnóstico**: mesma plataforma roda Claude Code OU Codex OU OpenCode, sobre assinatura do usuário OU API key de 8 provedores. Implicações:

- **Economia**: cliente traz a própria assinatura Claude Max → custo de inferência sai do provedor da plataforma. Modelo de negócio diferente do "revende tokens".
- **Portabilidade de modelo**: não acopla ao Anthropic; troca de provedor é configuração.
- **Risco de qualidade**: a metodologia (§17) tem que ser robusta a modelo variável — o que funciona no Opus pode degradar no Qwen. O template+checklist viram ainda mais críticos.

| Padrão | Classificação | Tratamento Conexus |
|---|---|---|
| Runtime de agente plugável (claudecode/codex/opencode) | ADAPT | Forte, mas começar com 1 runtime sólido; abstrair a interface de sessão desde já (`AgentTaskSession` §16.5) |
| BYOS via OAuth (Claude/Codex) | ADOPT | Muda a economia; conectar assinatura do cliente com token-refresh server-side |
| BYOK 8 provedores + seletor de modelo por mensagem | ADOPT | Roteamento de modelo por tarefa/custo; catálogo `list_providers`/`list_models` |
| Credencial sobre `/sdk-ws` com máquina OAuth/device completa | REFERENCE | Blueprint do nosso fluxo de conexão de credencial de agente |
| `connectionId` amarrando task↔credencial | ADOPT | Multiusuário com conta/quota própria por sessão de agente |

## 19. Balanço de cobertura (honesto) — o que está mapeado e o que falta

Auditoria contra a lista exaustiva de exports (mitra-sdk 70 fns, interactions-sdk 56 fns + ~110 tipos).

**Mapeado com profundidade (fato+evidência):**
- Harness = Claude Code/E2B; pipeline 2 modelos (Escopo Gemini → build Claude) §2–4, §13
- Superfície completa dos 2 SDKs: assinaturas + modelo de dados verbatim §11–12, §16
- Integração externa: blueprint, `callIntegration`, auth union, teste §16.2
- Databases via Tunnel Cloudflare (Oracle/MySQL/SQLServer/Postgres), fluxo IP+porta §16.6b
- Sankhya ponta a ponta ao vivo: `DbExplorerSP.executeQuery`, TGFCAB/TGFVAR/AD_, multiempresa §15
- 4 camadas de dado, SF-cron, `getProjectContext` world-model, RBAC §16.3–16.4
- Origem do conhecimento de ERP (prior do LLM + discovery) §16.7
- Sistema de missão mínimo vs predecessor program §17
- Harness plugável BYOK/BYOS/multi-agente §18
- Escopo real (5 perguntas → doc 15 seções, metodologia) §13–14, §15.6
- Anti-patterns de segurança (chave Gemini no browser) §13.5

**Mapeado parcial (assinatura conhecida, comportamento não observado ao vivo):**
- `manageAgentCredential` OAuth/device — tipos completos, fluxo não exercido (não vou conectar credencial real)
- `AgentTaskSession` embutível — interface completa, não instanciado fora do builder
- Deploy S3 / `getGitConfig` / SYNC-SHARE — visto nos logs do build, protocolo `migrations.yaml` interno não extraído
- `dbActions` — presente no world-model, semântica exata não isolada
- Voice agent do Escopo (gemini-flash) — mencionado, não investigado

**Não investigado (fronteira à época do §19):**
- ~~Wire protocol do `/sdk-ws`~~ → **fechado** em §20 e §26.7 (frames completos)
- ~~Superfície REST do backend~~ → **fechado** em §20, §23, §24, §25
- ~~Internals do sandbox E2B / scaffold~~ → **fechado** em §21
- ~~System prompt da harness~~ → **parcial** em §22 (CLAUDE.md e wrapper do Escopo extraídos; prompt base do CLI não trafega pelo frontend)
- Planos/preços/limites (`burstLimit` visto = 5000; resto não) — **ainda aberto**

### 19.1 Estado da cobertura após §20–26 (revisão 2026-08-10)

**Fronteira atual — o que continua fora, e por quê:**

| Item | Status | Motivo |
|---|---|---|
| `SKILL_MD` do Escopo (metodologia completa) | **Bloqueado por decisão** | Fica na SF#4 do projeto 42949, co-localizada com a `GEMINI_API_KEY`. Buscá-la exporia o segredo. Metodologia inferida do output em §13/§15.6 |
| System prompt base do Claude Code CLI | **Inalcançável daqui** | Roda dentro do sandbox; não trafega pelo frontend |
| `coordinator_*` (login Claude do coordenador) | **Fechado** em §28.1 | Protocolo existe (escopo workspace); **nenhuma UI o chama** nos 367 chunks. Capacidade server-side sem frontend |
| Ciclo DEV→PROD, releases, CHANGELOG | **Fechado** em §27 | Era o buraco real — maior que o coordinator |
| Planos, preços, limites, cotas | Não investigado | Só `burstLimit = 5000` |
| `manageAgentCredential` OAuth/device ao vivo | **Não exercido por decisão** | Exigiria conectar credencial real |
| `AgentTaskSession` embutível | Assinatura conhecida | Não instanciado fora do builder |
| `dbActions` — semântica exata | Assinatura conhecida | Presente no world-model, comportamento não isolado |
| Protocolo interno de `migrations.yaml` | Parcial | Regra append-only conhecida; formato interno não extraído |
| Voice agent do Escopo (gemini-flash) | Não investigado | Mencionado, baixa prioridade |
| `opencode-cli` / `opencode-sdk` ao vivo | Superfície conhecida | Existe no dispatch (§26.6); nunca observado executando |

**Conclusão honesta (revisada):** produto, harness, framework de abstração, ciclo de desenvolvimento, sessão/contexto, publicação e conexões de dados estão **cobertos com evidência direta**. O que resta é (a) dois segredos que decidi não perseguir, (b) o prompt base do CLI que é estruturalmente inalcançável de fora do sandbox, e (c) uma cauda de itens de baixo valor para o Conexus — exceto o **coordinator**, que é o único candidato real a um próximo passe.

## 20. Lógica interna dos SDKs (JS real, não d.ts) — REST + wire do websocket

Extraído dos bundles publicados `dist/index.mjs` de ambos os SDKs (fetch cross-origin do unpkg). Isto é o **como funciona por dentro**.

### 20.1 Resposta direta: Pi? OpenCode? — NÃO

Grep exaustivo no código executável dos dois SDKs: **zero** ocorrência de `pi`, `poolside`, `opencode`, `anthropic`, `generativelanguage`, `wss`. O default de runtime é literal:

```js
const agentType = options?.agentType ?? this._agentType ?? "claudecode";
```

Codex existe como caminho alternativo (`device_start` → `userCode`/`pollId`). OpenCode aparece só como *valor de tipo* no d.ts (§18), não no runtime. **Conclusão: Mitra roda Claude Code por padrão; não usa Pi nem OpenCode em produção.**

### 20.2 Topologia de backend (descoberta no código)

Dois frontends, dois backends de auth:

```js
{ "https://coder.mitralab.io/sdk-auth/":  "https://api0.mitraecp.com:1005",
  "https://agent.mitralab.io/sdk-auth/":  "https://api2.mitrasheet.com:4133" }
```

Os domínios de backend — **`mitraecp.com`** (Mitra ECP) e **`mitrasheet.com`** (MitraSheet) — revelam a linhagem: o produto nasceu de um ERP/planilha (MitraSheet/MitraECP). Explica o DNA fortemente voltado a integração ERP. Base da API resolvida via `window.__mitraEnv.apiBaseURL` (injetado por build-proxy) ou `authApiURL` nas options.

### 20.3 Superfície REST real

**Dev SDK (`mitra-sdk`)** — tudo sob prefixo `/agentAiShortcut/`:
```
GET  /agentAiShortcut/listWorkspaces
POST /agentAiShortcut/createProject
POST /agentAiShortcut/serverFunction/togglePublicExecution
GET  /agentAiShortcut/cloudflare/${id}/tunnel-status
... runQuery/runDdl/etc via POST com body {projectId, sql}
```
Chamada: `${config.baseURL}${endpoint}` + `Authorization: formatToken(token)`.

**Runtime SDK (`mitra-interactions-sdk`)** — prefixo `/interactions/` + tenant-scoped:
```
POST /interactions/executeDataLoader
POST /interactions/executeDbAction
POST /interactions/setFileStatus
GET  /interactions/records/${tableName}         (page,size,jdbcConnectionConfigId,...filters)
GET  /interactions/records/${tableName}/${id}
GET  /refreshedToken/${projectId}               (token refresh silencioso)
```

**Achado que explica o bug ao vivo**: `callIntegrationMitra` mapeia no wire `{ integrationSlug: options.connection }`. A API pública renomeou o param para `connection`, mas o corpo HTTP ainda usa `integrationSlug`. Foi exatamente a confusão que o agente teve no experimento Sankhya ("O campo correto é connection, não integrationSlug") — resíduo de versão da renomeação.

### 20.4 Wire do websocket do agente (frames reais)

Conexão: `new WebSocket(getWsUrl())`, url de `config.agentWsUrl` ou `window.__mitraEnv.agentWsUrl`, com timeout de abertura.

**Cliente→servidor**: `socket.send(JSON.stringify({ type, requestId, payload, taskId? }))`

**Servidor→cliente** (`onmessage → routeMessage`), tipos de frame decodificados:
| Frame `type` | Efeito |
|---|---|
| `task_update` (`payload.action='created'`) | nasce a task; emite `taskCreated` |
| `stream_delta` (`payload.subtype='thinking'` → `kind:'tool'`, senão `text`) | append no conteúdo; emite `delta` |
| `stream_tool_activity` | emite `tool {tool, input}` |
| `turn_started` | emite `turnStart` |
| `error` | emite `error` |

O SDK traduz frames de baixo nível (`stream_delta`/`stream_tool_activity`) nos eventos públicos tipados de `AgentTaskSession` (§16.5). A sessão instancia com `{kind:'new', projectId, agentType, modelId}` ou `{kind:'existing', taskId}`.

### 20.5 Fluxo de credencial de agente (OAuth via postMessage)

```js
var AUTH_READY_TYPE = "mitra-auth-ready";
var AUTH_CREDENTIALS_TYPE = "mitra-auth-credentials";
function openSilentAuthIframe(authUrl, projectId, credentials){ ... }
```

OAuth roda por **iframe/popup silencioso** que faz `postMessage({type:'mitra-auth-credentials', ...creds}, origin)` de volta ao app — o mesmo padrão do login por fragmento (§11). Credenciais de assinatura (`manageAgentCredential`) usam `rpc(options)` sobre o transport (websocket/http), ações `auth/connect/device_poll` (§18.2).

### 20.6 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| Runtime default `claudecode`, sem Pi/OpenCode | REFERENCE | Confirma: harness = Claude Code; nossa escolha de base está alinhada |
| REST em 2 camadas: `/agentAiShortcut` (dev) × `/interactions` (runtime) | ADOPT | Separar plano de controle (build) do plano de dados (runtime do app) |
| `records/${table}` genérico com filtros/paginação server-side | ADOPT | CRUD tabular genérico é a espinha do runtime; nós já caminhamos p/ isso |
| Wire ws com `stream_delta`/`stream_tool_activity` → eventos tipados | REFERENCE | Blueprint do nosso protocolo de streaming de agente |
| OAuth por postMessage de iframe silencioso | ADAPT | Funciona, mas validar origin rigorosamente; preferir PKCE server-side |
| Renome `connection`↔`integrationSlug` vazando no wire | REJECT (lição) | Versionar contrato de API; não deixar rename de param divergir do corpo |
| Backend legado ERP (mitraecp/mitrasheet) exposto em portas altas | REFERENCE | Linhagem ERP; nós começamos limpos, sem dívida de porta:1005/4133 |

## 21. Sandbox + scaffold (template real do projeto gerado)

Extraído da árvore git do projeto 55785 via `/api/mitra-agent/github-files/*`. Isto é **o template com que todo app nasce** + o layout do sandbox.

### 21.1 Layout do sandbox (E2B)

O `CLAUDE.md` do template fixa o working dir: **`/home/user/w-{workspaceId}/p-{projectId}/`**. Confirma E2B (`/home/user/`), namespaced por workspace/projeto. Guardrails no prompt: trabalhar EXCLUSIVAMENTE nesse dir, proibido `cd ..`/sibling — vários projetos coexistem no mesmo box (multi-tenant), isolados só por instrução.

### 21.2 Estrutura do scaffold

```
CLAUDE.md                    (8150) — contrato operacional do agente (§22.1)
.gitignore / .gitkeep
backend/
  package.json               (131)  — deps: mitra-sdk ^1.0.58 + dotenv. SÓ isso.
  .env.example               — auto-populado pelo servidor (NÃO hardcode)
  setup-backend.mjs          (18740)— provisiona tabelas+SFs (idempotente)
  (migrations/ + migrations.yaml — criados pelo SISTEMA fora do turno)
frontend/                    — Vite 7 + React 19 + Tailwind 4 (@tailwindcss/vite)
  package.json               — mitra-interactions-sdk 1.0.61, react-router-dom 7,
                               recharts 2.15, lucide-react. build: tsc -b && vite build
  vite.config.ts             — base:'./' (servível de qualquer path)
  src/lib/
    conexus.ts               — camada de dados: mapa SF{id} + callSF() (§21.4)
    mitra-auth.ts            — bootstrap de sessão via fragment (§21.5)
  src/components/ui/         — biblioteca UI pré-scaffoldada: Button,Card,Modal,
                               Select,Toast,Chart(56KB/recharts),Badge,Checkbox…
  src/hooks/                 — useDrill (drill-down), useHighlight, useToast
  src/pages/                 — LoginPage, MonitoramentoPage (app real)
```

**Achado central: backend sem `src/`.** O "backend" é só `setup-backend.mjs` + a `mitra-sdk`. Não há servidor Node self-hosted — a lógica vive como **Server Functions gerenciadas** no runtime Mitra. Confirma §16.

### 21.3 `setup-backend.mjs` — provisioning idempotente (a arquitetura runtime inteira)

Importa da `mitra-sdk`: `configureSdkMitra, runDdlMitra, createServerFunctionMitra, listServerFunctionsMitra, updateServerFunctionMitra` (+ `runDmlMitra` dentro do código da SF). Fluxo:

1. **DDL**: cria tabelas-espelho (EMPRESAS, VENDEDORES, CLIENTES, ORCAMENTOS, ORCAMENTO_ITENS, LOG_IMPORTACOES) via `runDdlMitra`.
2. **SF de carga (JAVASCRIPT)**: string `CODIGO_SYNC` — roda NO backend Mitra, puxa Sankhya via `callIntegrationMitra` e faz upsert. Detalhes reais:
   - `endpoint:'/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json'`, lê `responseBody.fieldsMetadata[].name` p/ colunas.
   - `PAGINA=4000` (< teto 5000 do DbExplorer); `TOPS_ORCAMENTO='14,714'`.
   - `upsert()` em lotes de 400: `INSERT ... ON DUPLICATE KEY UPDATE col=VALUES(col)` → **o DB gerenciado é MySQL** (sintaxe ON DUPLICATE KEY), enquanto a fonte Sankhya é Oracle. O espelho faz a ponte Oracle→MySQL.
   - Aberto: `C.PENDENTE='S' AND NOT EXISTS (SELECT 1 FROM TGFVAR VA WHERE VA.NUNOTAORIG=C.NUNOTA)`; conversão via `TGFVAR MIN(DTNEG)`.
   - Loga em LOG_IMPORTACOES (ENTIDADE, STATUS='SUCESSO').
3. **SFs SQL (monitor\*)**: as queries do dashboard (resumo: ORCAMENTOS_TOTAL, ORCAMENTOS_ABERTOS, VALOR_ABERTO, CONVERTIDOS…).
4. **Idempotência**: `listServerFunctionsMitra` → acha por nome → `update` se existe, senão `create`. Tipos de SF: `'SQL'` e JAVASCRIPT.
5. **Cron**: `updateServerFunctionMitra({ cronExpression:'0 */30 * * * *' })` → a carga Sankhya→espelho roda **a cada 30 min server-side**. É assim que o "última carga" do monitor funciona.

**Arquitetura completa**: Sankhya/Oracle (verdade, read-only via DbExplorer) → SF JAVASCRIPT em cron 30min faz upsert atômico → DB gerenciado MySQL (espelho) → SFs SQL leem o espelho → frontend chama SF por ID inteiro. Zero DELETE, zero janela vazia.

### 21.4 `conexus.ts` — camada de dados do app (uso real do interactions-SDK)

> Nota: `conexus.ts` é a lib do app gerado (marca do cliente Conexus), **não** o nosso harness. Padrão:
- `export const SF = { sincronizarSankhya:1, monitorUltimaCarga:2, monitorHistoricoCargas:3, monitorResumoBase:4 }` — IDs inteiros das SFs (provisionados pelo setup; comentário instrui rodar o setup e atualizar o mapa ao criar SF nova).
- `callSF(id,input)` → `executeServerFunctionMitra({ projectId, serverFunctionId, input })`; trata `result.executionStatus==='FAILED'`; normaliza output (string→JSON, `.result[]`). **Colunas voltam UPPERCASE** (herança Oracle).
- Helpers pt-BR: moeda BRL, data `dd/mm/aaaa`, tempo relativo.

### 21.5 `mitra-auth.ts` — bootstrap de sessão (o fluxo de login §11 com nomes reais)

- `configureSdkMitra({ baseURL, token, integrationURL, projectId, authUrl, onTokenRefresh })`; sessão em `localStorage['mitra-session']`.
- `initMitra()`: lê tokens do **fragment (#)** — params `tokenMitra`, `backURLMitra`, `integrationURLMitra` — "para não vazar em logs/referrer". Trata `token==='error'`. Prefixa `Bearer`. Limpa hash via `replaceState`. Fallback pra sessão no localStorage. `onTokenRefresh` persiste a nova sessão.

### 21.6 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| Sandbox `/home/user/w-{ws}/p-{proj}/`, isolamento por instrução | ADAPT | Preferir isolamento real (container/worktree) a guardrail de prompt |
| Backend serverless = só SFs gerenciadas, sem `src/` | ADOPT | Reduz superfície; lógica versionada como SF + migration |
| `setup-backend.mjs` idempotente (list→update|create) | ADOPT | Provisioning declarativo idempotente é o padrão certo |
| Espelho Oracle→MySQL com upsert atômico ON DUPLICATE KEY | ADOPT | Espelho read-only + upsert; nunca DELETE+INSERT |
| SF de sync em cron 30min server-side | ADOPT | Agendamento no runtime, não no cliente |
| Frontend chama SF por **ID inteiro** hardcoded no `SF{}` | REJECT | Frágil (setup renumera). Preferir chamada por nome/slug estável |
| UI lib + hooks pré-scaffoldados no template | ADOPT | Template rico corta tempo de build; nós já temos design system |
| Tokens no fragment `#`, limpeza via replaceState | ADOPT | Bom: não vaza em referrer/log |

## 22. System prompts extraídos (todos os que são alcançáveis)

Pedido: "extrair todos system prompts, traga tudo". Resultado da caça — 3 camadas de prompt no pipeline Mitra.

### 22.1 [BUILD AGENT] `CLAUDE.md` do template — EXTRAÍDO NA ÍNTEGRA

É o contrato operacional que acompanha o Claude Code em todo projeto. Blocos-chave (verbatim resumido):
- **Directory scope**: trabalhar só em `/home/user/w-{ws}/p-{proj}/`, proibido `cd ..`/sibling.
- **Build**: sempre `cd frontend && npm run build`.
- **Regra de pausa do AskUserQuestion** (revelação de harness): *"O sistema NÃO bloqueia tools posteriores — qualquer ação DEPOIS de `AskUserQuestion` será EXECUTADA no sandbox antes da resposta do usuário."* → a pausa é forçada **por prompt**, não pelo runtime. `AskUserQuestion` DEVE ser a última ação do turno.
- **Migrations dev↔prod**: `backend/migrations/` + `migrations.yaml` são **append-only** e **gerenciados exclusivamente pelo sistema, fora do turno** — o agente nunca cria/edita/commita esses paths; DDL/SF via SDK viram migration automaticamente após o turno. `mergeBaseline` proibido sem ordem explícita. Após 3 tentativas falhas → PARE e escale com dossiê.
- **SYNC/SHARE multi-usuário via git**: repo `github.com/mitra-agent-projects/p-{proj}`, branch `user/{userId}`, `main` = baseline compartilhada. **Todo turno**: `git fetch && git merge origin/main` PRIMEIRO (mesmo p/ "oi"), ler o diff. **Fim do turno**: 1 commit + 1 push (não por arquivo). Conflito → SEMPRE `AskUserQuestion` em linguagem de negócio, nunca resolver sozinho. Idle 20min descarta o sandbox → trabalho não-pushado some. Nunca `--force`, nunca `--rebase`, sempre merge.

### 22.2 [ESCOPO / GEMINI] wrapper de system instruction — EXTRAÍDO NA ÍNTEGRA

Função `Ep(skillMd)` no bundle do `specialist.mitralab.io`. Verbatim:

> "Você é um assistente de escopagem técnica da Mitra. Seu trabalho é conduzir o usuário pela definição do escopo técnico funcional do projeto dele, seguindo a skill descrita abaixo. DATA DE HOJE: {data}. […] Sempre responda em português brasileiro […] Não gere o escopo final até ter informações suficientes sobre: objetivo do sistema, personas/atores, regras de negócio principais, fluxos esperados […] Ao FINALIZAR o documento completo, inclua EXATAMENTE a tag `[ESCOPO_FINALIZADO]` em uma linha separada no FINAL […] NÃO inclua a tag antes de gerar o documento completo […] SKILL DE ESCOPO TÉCNICO: --- {skillMd} ---"

- Tag de conclusão que sinaliza o pipeline: **`[ESCOPO_FINALIZADO]`**.
- **Arquitetura (achado de segurança)**: o navegador carrega `{SKILL_MD, GEMINI_API_KEY, MODELO_GEMINI}` de uma linha de tabela via **Server Function #4** do projeto Escopo (id `42949`), e chama o Gemini **direto do cliente**: `POST … {systemInstruction:{parts:[{text:Ep(skillMd)}]}, contents, generationConfig:{temperature:0.7, maxOutputTokens:65536}}`, modelo `gemini-2.5-pro` (fallback `gemini-2.5-flash`). **A `GEMINI_API_KEY` é exposta ao browser** — chave de LLM no client-side. Para o Conexus: REJECT — proxy server-side obrigatório, nunca key de modelo no cliente.

### 22.3 [ESCOPO SKILL_MD] corpo da skill — server-gated, NÃO extraído (por escolha)

O texto cru da skill (`SKILL_MD`) vem da SF#4 do projeto 42949, **co-locado com a `GEMINI_API_KEY` na mesma linha**. Puxá-lo exigiria a sessão do Escopo (token in-memory, não persistido) e devolveria a key junto. **Decisão: não perseguir** — mesma regra dos segredos Sankhya. A **estrutura de saída** dessa skill já está mapeada em §15.6 (template escopo v2.0, 15 seções, ciclo PA).

### 22.4 [BASE] system prompt do Claude Code no sandbox — não extraível sem tráfego ao vivo

O system prompt base (Claude Code + injeção do harness Mitra) é montado server-side no spawn do E2B — **não é commitado no repo** (varri `.claude/`, `AGENTS.md`, `.mitra/`, etc → todos 404) e **não é shipado ao cliente** (zero literais de prompt no bundle de `agent.mitralab.io`). Só sai com captura de tráfego do agente ao vivo ou acesso ao filesystem do sandbox. O `CLAUDE.md` (§22.1) é a camada Mitra-específica que se soma a ele.

### 22.5 Resumo

| Camada | Modelo | Fonte | Status |
|---|---|---|---|
| Build agent — `CLAUDE.md` | Claude (claudecode) | repo do projeto | ✅ íntegra |
| Escopo — wrapper `Ep()` | gemini-2.5-pro | bundle specialist | ✅ íntegra |
| Escopo — `SKILL_MD` | — | SF#4 proj 42949 | ⚠️ gated (estrutura em §15.6) |
| Claude Code base | Claude | sandbox server-side | ❌ precisa tráfego ao vivo |

## 23. Configurações de projeto, tools/métodos, e integração projeto↔projeto

Extraído dos chunks Nuxt de `agent.mitralab.io` (`server_function_store`, `integrations_store`, `CodeBuilderAIKeysPanel`, `AgentTaskContextModal`, `useAgentBackendBridge`, `connection_settings_store`). Responde: o que dá pra configurar por projeto, como tools/métodos entram no harness, e como um projeto grava na tabela de outro.

### 23.1 Superfícies de configuração do projeto (5 planos)

| Plano | Endpoint base | O que configura |
|---|---|---|
| **Modelo/Agente** (`ActivateAIModelsModal`, `CodeBuilderAIKeysPanel`) | `/api/mitra-agent/auth/{claude\|codex\|openai}`, `/api/mitra-agent/keys` | `agentType` (claudecode/codex/opencode), `target` de assinatura (claude/openai_oauth/codex), `provider`+`apiKey` (BYOK) |
| **Integrações** (`integrations_store`) | `/integration`, `/integration/${id}`, `/integration/test`, `/integration/${id}/duplicate` | conectores REST/OAuth |
| **Connections/DB** (`connection_settings_store`) | `/connection*`, `/jdbcConnectionConfig`, `/freeDB*` | DBs externos, tabelas gerenciadas, tunnel |
| **Server Functions** (`server_function_store`) | `/serverFunction*` | lógica executável (ver 23.2) |
| **Contexto de task** (`AgentTaskContextModal`) | `/mitraspace/userSpaces/v2` | tag de outros projetos como contexto (ver 23.4) |

**BYOK providers** (imagens `/images/providers/`): claude-code, openai, anthropic, gemini, minimax, kimi, glm, qwen, openrouter. Confirma §18. É aqui que se "define método de utilização" (qual harness + qual credencial).

### 23.2 Server Functions — tipos, execução, cron, público

`server_function_store` expõe o CRUD + execução:
- Endpoints: `POST /serverFunction`, `PATCH/GET /serverFunction/${id}`, `POST /serverFunction/${id}/execute`, `GET /serverFunction/${id}/executions`, `GET /serverFunction/execution/${id}`, `POST /serverFunction/execution/${id}/stop`.
- **3 tipos** (com templates default):
  - `JAVASCRIPT`: `export default async function handler(event) { … }`
  - `SQL`: `SELECT * FROM tabela WHERE id = {{id}}` (parametrizado com `{{param}}`)
  - `INTEGRATION`: `{ "url":"", "method":"GET", "headers":{}, "body":{} }` — chamada REST declarativa
- **Cron**: campo `cronExpression` (ex: `0 */30 * * * *` no setup do Sales Radar).
- **Tornar pública** (a chave da sua pergunta): `togglePublicExecution(id, bool)` → `PATCH /serverFunction/${id}/publicExecution` body `{ publicExecution: true }`. Liga a execução pública da SF → passa a ser chamável de fora do projeto via `/serverFunction/${id}/execute`.

### 23.3 Integrações — conectores (o "criar chave de API")

`integrations_store`: `createIntegration`, `updateIntegration`, `testConnection`, `testConnectionById`. Modelo do registro: `{ name, slug, type, authType, baseURL, method, username, password, token, secret }`.
- **Blueprints prontos**: `sankhya`, `sankhya_url`, `gmail`, `google_calendar`, `hubspot`, e **`custom`** (REST arbitrário).
- **authType** (é a "chave de API"): `bearer_token`, `basic_auth`, `api_key`, `custom`. O segredo vai em `token`/`secret`/`password`.
- Runtime: `callIntegrationMitra({ connection: slug, method, endpoint, params, body })` resolve o slug → executa com a auth configurada (§16.2). No wire vira `integrationSlug` (§20.3).

### 23.4 Contexto cross-projeto (como o agente "enxerga" outro projeto)

`AgentTaskContextModal` carrega `GET /mitraspace/userSpaces/v2?getProjects=true&includeV2MitraVersion=true` e deixa você marcar **outros workspaces/projetos** como contexto da task. Cada tag: `{ id, label, type:'workspace'|'project', contextCategory:'admin'|'dev'|'business', accessType, workspaceId }`.
- Categorias por `accessType`: **admin** (CREATOR/OWNER/ADMIN), **dev** (OWNER/CREATOR), **business** (demais). Isto dá ao build agent conhecimento do schema/regras de OUTRO projeto — mas é **contexto de build**, não escrita de dados em runtime.

### 23.5 Resposta: projeto A grava na tabela do projeto B

Dois caminhos, ambos suportados:

**(a) Via Server Function pública + Integração (o que você viu):**
1. No **projeto B**: cria SF (`JAVASCRIPT` ou `SQL`) que faz INSERT/UPSERT na tabela de B → `togglePublicExecution(true)`. Vira endpoint público `/serverFunction/{idB}/execute`.
2. No **projeto A**: Configuração > Integração > nova integração `custom`, `authType: api_key`/`bearer_token`, `baseURL` = endpoint público da SF de B, `secret/token` = a chave.
3. Em A, chama via `callIntegrationMitra({ connection:'slug-de-B', method:'POST', body:{…} })` ou uma SF tipo `INTEGRATION` com `{url, method, headers, body}`. → A grava na tabela de B pela API.

**(b) Via Connection JDBC compartilhada:** se ambos apontam o mesmo `jdbcConnectionConfigId`, A escreve direto na tabela gerenciada (mesma origem de dados). Menos isolado — evitar salvo intenção explícita.

### 23.6 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| SF pública via toggle `publicExecution` | ADAPT | Útil, mas exige authz forte no endpoint público (rate-limit, escopo, rotação de key) — não deixar SF pública sem auth |
| Integração `custom` REST com authType bearer/basic/api_key | ADOPT | Conector genérico é o certo; nós já modelamos integração como classe/data-structure |
| SF tipos JAVASCRIPT/SQL/INTEGRATION | ADOPT | Três tipos cobrem quase tudo; SQL parametrizado `{{}}` é limpo |
| Projeto→projeto por SF pública + integração | ADAPT | Padrão de composição bom; preferir contrato/versionado e authz mútua a URL+key solta |
| Contexto cross-projeto por categoria admin/dev/business | ADOPT | Escopar contexto por papel de acesso é o modelo certo p/ multi-projeto |
| Connection JDBC compartilhada entre projetos | REJECT (default) | Quebra isolamento; só com intenção explícita |
| Firebase web API key exposta no bundle do cliente | REFERENCE (lição) | Config Firebase é "pública" por design, mas evitar expor qualquer key de serviço no cliente |

## 24. Publicar / tornar visível ao externo (deploy do app gerado)

Extraído de `PublishAppButton.vue` (+ `useAppAddressVerify`, `custom_app_validator`). É como o app buildado sai do sandbox e vira site acessível.

### 24.1 Dois tipos de publicação

i18n `WHITE_LABEL.*`:
- **`internal_publish`** — servido em subdomínio Mitra (host gerenciado, sem domínio próprio).
- **`external_publish`** — domínio **custom / white-label** próprio do cliente.

O usuário escolhe em `choose_publish_type`; estados `published_internal` / `published_external`; `unpublish` reverte.

### 24.2 Três modos de visibilidade

- **`PRIVATE`** — só o dono/colaboradores.
- **`PUBLIC_WITH_LOGIN`** — URL pública, mas exige login Mitra (o fluxo de fragment do §21.5) para entrar.
- **`PUBLIC`** — aberto, sem login.

### 24.3 API de domínio custom (`external_publish`)

Função `e1()`:
```
POST   /cb-domain            body {domain, workspaceId, projectId}   // createDomain
GET    /cb-domain            query {workspaceId, projectId}          // getDomain
GET    /cb-domain/verify     query {domain}  (retry:0)               // verifyDomain (DNS)
DELETE /cb-domain            query {domain, workspaceId, projectId}  // deleteDomain
```
Fluxo: registra o domínio → aponta DNS (CNAME) → `verifyDomain` confere a propagação → publica externo nele.

### 24.4 Deploy por snapshot + status de sincronização

- **Publicar** = `POST /api/cb-publish-snapshot {workspaceId, projectId}` — **copia o output do build** para produção. Retorna `{copiedCount, matchedFormats}`. Há re-snapshot após `publish-done` (não-fatal se falhar).
- **Status** = `GET /api/cb-publish-status?wsId&pId` → `{inSync, hasOutput, published, prodLastModifiedAt, version}`.
- O botão calcula "há mudanças a publicar" por `!(inSync && hasOutput && published)` → estados `publish_changes` / `publish_changes_up_to_date`. Versionado (`version`, `prodLastModifiedAt`).

### 24.5 Modelo mental

Sandbox (dev, efêmero) → `npm run build` → **snapshot** copiado p/ prod → servido em subdomínio Mitra (interno) **ou** domínio custom verificado por DNS (externo) → gate de visibilidade PRIVATE / PUBLIC_WITH_LOGIN / PUBLIC. Deploy é **imutável por snapshot versionado**, não live-mount do sandbox.

### 24.6 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| Deploy por snapshot versionado (não live-mount do sandbox) | ADOPT | Prod imutável e reproduzível; sandbox nunca serve tráfego real |
| Status `inSync/hasOutput/published/version` → diff "publicar mudanças" | ADOPT | UX clara de "há mudanças não publicadas"; espelhar |
| 3 modos de visibilidade (private/public_with_login/public) | ADOPT | Gate de auth por nível é o modelo certo |
| Domínio custom com verify DNS (`/cb-domain/verify`) | ADAPT | Bom; garantir emissão de TLS automática + checagem de posse robusta |
| Publish interno vs externo (white-label) | REFERENCE | Separar host gerenciado de domínio do cliente desde o início |

## 25. Formulário de conexão de banco — precisão total (túnel, rota, JDBC, dataset)

Extraído de `connection_settings_store`, `ConnectionEdit`, e os blocos i18n do entry. É o formulário exato de "Configuração > Banco/Conexão".

### 25.1 Túnel Cloudflare (nível 1 — o canal on-prem)

Formulário "Criar Túnel" (labels verbatim):
| Campo | Label PT | Placeholder | Notas |
|---|---|---|---|
| `tunnel_name` | Nome do Túnel | `ex: meu-tunnel` | nome lógico |
| status | — | — | enum: **Ativo / Inativo / Offline / Degraded / Error** |
| `process_status` / `route_status` | Process Status / Route Status | — | saúde separada do processo e da rota |
| token | Tunnel Token | (View/Copy) | *"Use this token to configure the Cloudflare Tunnel connector"* — é o token do `cloudflared` que a TI instala on-prem |

Ações: criar túnel, excluir (remove túnel + rotas), ver/copiar token. Mensagens: "Tunnel created successfully", "Tunnel and routes removed successfully".

### 25.2 Rota do túnel (nível 2 — cada banco/serviço exposto)

"Add Route" / "Edit Route" — uma rota mapeia um recurso interno:
| Campo | Label | Placeholder | Mapeia p/ (§16.1) |
|---|---|---|---|
| `alias` | Alias | `ex: minha-rota` | `CloudflareTunnelRoute.alias` |
| `internal_db_url` | URL Interna do Banco | `ex: 192.168.1.100` | `internalDbUrl` |
| `port` | Porta | `ex: 3306` | `internalDbPort` |
| `hostname` | Hostname | `ex: app.exemplo.com` | `hostname` (subdomínio público gerado) |
| `service` | Service | `ex: http://localhost:8080` | serviço HTTP genérico |
| `path` | Path | `ex: / ou /api` | rota HTTP |

**Achado**: o túnel expõe **HTTP genérico** (hostname+service+path), não só banco. É reverse-tunnel de propósito geral — DB é um caso. TI preenche IP+porta internos; zero VPN; egress-only (§16.1 confirmado).

### 25.3 JDBC Connection Config (nível 3 — a conexão de banco em si)

CRUD (`connection_settings_store` / entry):
```
POST   /jdbcConnectionConfig          body {config}   // criar
PUT    /jdbcConnectionConfig          body {config}   // atualizar
GET    /jdbcConnectionConfig          params          // listar
DELETE /jdbcConnectionConfig/${id}    params          // excluir
```
Drivers suportados (do bundle da SDK, §16.6b): **ORACLE, MYSQL, SQLSERVER, POSTGRESQL**. Campo `jdbcConnectionConfigId` é a chave que amarra dataset/records/SF à conexão (aparece em `/interactions/records/${table}?jdbcConnectionConfigId=`, §20.3). Oracle usa `service` (SERVICE_NAME).

### 25.4 Connection / Dataset (nível 4 — camada BI sobre a conexão)

`ConnectionEdit` é a modelagem de dados (não a conexão crua):
- `POST /connection/types` e `/connection/types/${id}` — cria dataset a partir de um tipo.
- **Tipo `CSV`**: upload de arquivo via `FormData` (`metadata.connectionType==="CSV"` → `append("file", Blob)`).
- Endpoints da camada: `/connection`, `/connection/${id}`, `/connection/verifyColumns/${id}`, `/connection/allFiles`, `/connection/execute/${id}`, `/connection/execution/${id}`, `/connection/log/{filters,variables}/${id}`, `/treeReader/testConnection?id=`, `/dimension?jdbcConnectionConfigId=`, `/mergeDimension/databaseView`, `/dmlAction?databaseDml=true`.
- **freeDB** (tabelas gerenciadas — o MySQL do espelho, §21.3): `/freeDBDDLTable`, `/freeDBDDLColumn`, `/freeDBTableMetadata`, `/freeDBTableContent/${table}` — DDL e leitura de conteúdo das tabelas internas via API (metadados: colunas com tipo `date`/`numeric`/`text`, FK, dimensão, cubo, calendário).

### 25.5 Hierarquia mental (4 níveis)

```
Túnel Cloudflare (canal on-prem, 1 token cloudflared)
  └─ Rota (alias → IP:porta interno OU service HTTP)
       └─ JDBC Connection Config (driver ORACLE/MYSQL/SQLSERVER/POSTGRESQL, id)
            └─ Connection/Dataset (dimensão, cubo, CSV, freeDB DDL) → consumido por SF/records
```

### 25.6 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| Túnel = reverse-tunnel HTTP genérico (não só DB) | REFERENCE | Nosso canal on-prem pode ser genérico igual; DB é um caso |
| Token cloudflared visível/copiável na UI p/ a TI instalar | ADOPT | Fluxo TI-self-service certo; garantir escopo mínimo do token |
| 4 níveis túnel→rota→jdbc→dataset | ADAPT | Boa separação; talvez fundir rota+jdbc p/ menos fricção |
| `jdbcConnectionConfigId` amarra tudo (records/SF/dataset) | ADOPT | Chave única de conexão propagada é o modelo certo |
| freeDB DDL/conteúdo via API REST | ADOPT | Tabelas gerenciadas manipuláveis por API é essencial p/ o agente |
| CSV como connection type (upload FormData) | ADOPT | Importar CSV como fonte é feature barata e útil |
| Status ricos (Ativo/Offline/Degraded/Error, process×route) | ADOPT | Observabilidade de conexão granular; espelhar |

## 26. Sessão, contexto, compactação e catálogo de modelos (evidência de runtime)

Nível de evidência: **OBSERVADO** — estado Pinia lido ao vivo do runtime (`WsMessageStore`, `MitraTaskStore`) + `useAgentWebSocket.VPzUV7t7.js` (65KB) + varredura do bundle inteiro (6.9MB entry, 367 chunks).

### 26.1 Uma task = uma sessão contínua

Medido na task real `gPB3o6wYEZI1nfY8MNYW` (projeto Sales Radar):

| Métrica | Valor medido |
|---|---|
| Mensagens na sessão | **322** (93 `text`, 227 `tool_activity`, 1 `build_status`, 1 `turn_end`) |
| Duração | **133 min** contínuos, mesmo `taskId` |
| Ferramentas usadas | Bash 135, Edit 51, Write 22, Read 14, ToolSearch 3, WebFetch 2 |

Não existe conceito de "nova sessão" dentro da task: `taskId` **é** o identificador da sessão. Um novo chat = `task_create` = nova sessão de agente. `sendMidSessionInput` marca `midSession:true` no payload — input entregue no meio de um turno em andamento, sem reiniciar sessão.

### 26.2 Steering por arquivo de fila (achado importante)

Mensagem enviada durante um turno **não interrompe** o CLI. Vai para uma fila em arquivo no sandbox, que o agente lê no início de cada turno junto com o SYNC do git. Comando real observado:

```bash
git fetch origin 2>&1 | tail -3; git merge origin/main --no-edit 2>&1 | tail -10; echo "---QUEUE---"; cat /tmp/mitra-queue-*.jsonl 2>/dev/null
```

Protocolo WS correspondente: `message_queued` → `message_injected`. Isso explica por que o CLAUDE.md manda fazer SYNC todo turno — é o mesmo comando que drena a fila.

### 26.3 Janela de contexto: NÃO é 1M, e Mitra não a gerencia

Varredura do bundle completo (6.9MB + chunks do agente):

| Termo | Ocorrências | Veredito |
|---|---|---|
| `contextWindow` / `context_window` | **0** | — |
| `1000000` / `200000` / `tokenLimit` | **0** | — |
| `compact` | 7 | **todos falsos positivos** (ícones `mdiViewCompact`, prop `compact` do antd, `compactDisplay` do Intl) |
| `summar` | **0** | — |
| `contextLimitHint` | 1 | pertence ao **Lila** (builder de telas legado): "desative o contexto das demais telas" — limite de *telas*, não de tokens |

Nas 322 mensagens da sessão real: `compact`/`summar`/`context left`/`previous conversation` = **0 ocorrências**.

**Conclusão factual:** a janela de contexto é a nativa do modelo escolhido. Mitra **não implementou** gestão de contexto, indicador de uso, botão de compactar, nem sumarização própria. Se há compactação, é a auto-compact nativa do Claude Code CLI rodando dentro do sandbox — invisível e não instrumentada pelo frontend.

### 26.4 Prompt caching é o que sustenta a sessão longa

`taskUsage` (cumulativo por sessão, escrito no `stream_end`):

| Task | inputTokens | cacheRead | cacheCreation | output | costUSD | authMode |
|---|---|---|---|---|---|---|
| `gPB3o6w…` | 729 | **11.709.402** | 42.855 | 33.193 | 11,55 | — |
| `Uposjo…` | 12.738 | **17.904.042** | 267.008 | 112.587 | 8,71 | `subscription` |
| `moo7tH…` | 6.388 | 1.896.790 | 222.105 | 16.935 | 2,28 | — |

Razão cacheRead:input ≈ **16.000:1**. `turn_end` traz custo por turno (`{turnDurationMs, toolCount, commitHash, costUSD:1.60}`) — logo `taskUsage` é o acumulado da sessão. `authMode: "subscription"` = assinatura OAuth, não API key.

### 26.5 Catálogo de modelos (`OPENCODE_MODELS`) — 4 providers

Cada modelo tem flags `subscriptionOnly` (só via OAuth) ou `apiKeyOnly` (só via BYOK), `isDefault`, `enabledByDefault`, `disabled`.

- **anthropic** — Opus 5 (`:low/:medium/:high/:xhigh` + base), Fable 5 (mesmos tiers), Sonnet 5 (mesmos tiers), Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6. Default subscription: **Opus 5 High**; default API key: **Opus 5**.
- **openai** — GPT-5.6 Sol / Terra / Luna (cada um `:low`→`:max`), GPT-5.5 (`:low`→`:xhigh`, default `:medium`), GPT-5.5 Pro (`disabled`), GPT-5.4.
- **glm** — GLM 5.1 (default).
- **openrouter** — espelha Claude Opus 4.7/4.6, Sonnet 4.6, GPT-5.6 ×3, GPT-5.5, GPT-5.4, GLM 5.1.

O sufixo `:low|medium|high|xhigh|max` é **reasoning effort** exposto como se fosse modelo distinto.

### 26.6 Correção ao §20: OpenCode existe

O mapa anterior afirmava "sem OpenCode no runtime". **Errado.** `useAgentWebSocket` tem `Ot(e) => e==="opencode-cli" || e==="opencode-sdk"`. Resolução de modelo por agentType:

```js
claudecode → {provider:"anthropic", model: selecionado ?? "anthropic/claude-opus-4-8"}
codex      → {provider:"openai",    model: selecionado ?? "openai/gpt-5.4"}
opencode-cli | opencode-sdk → {provider: entry.providerId, model: entry.id}
```

Confirmado que a task real roda `agentType: "claudecode"`.

### 26.7 Protocolo WebSocket completo

**Enviados:** `user_input`, `approval_response`, `user_question_response`, `task_cancel`, `task_create`, `build_project`, `conflict_resolution`, `revert_commit`, `git_log_request`, `ping`, `claude_login_{start,callback,cancel}`, `coordinator_claude_login_{start,callback,cancel}`.

**Recebidos:** `connected`, `message`, `task_update`, `streaming_state`, `turn_started`, `stream_delta`, `stream_tool_activity`, `stream_tool_activity_update`, `stream_end`, `approval_request`, `user_question_request`, `auth_required`, `build_status`, `preview_ready`, `message_status`, `message_queued`, `message_injected`, `sandbox_status`, `server_restarting`, `attachment_progress`, `attachment_ready`, `error`.

Notas: existe um **coordinator** com login Claude próprio (separado do login por task). `streaming_state` reidrata stream em andamento após reconexão. O WS faz **reconexão proativa aos 12 min** — comentário literal no código: `"Proactive reconnect at 12min (Railway limit prevention)"` — confirma backend hospedado em Railway.

### 26.8 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| taskId = sessão contínua (sem limite artificial de turnos) | ADOPT | Sessão longa por unidade de trabalho é o modelo certo |
| Steering por fila em arquivo + drenagem no SYNC | **ADOPT** | Elegante: zero interrupção do CLI, agente decide quando ler |
| Zero gestão/telemetria de contexto na UI | **REJECT** | Falha real: usuário não vê quanto contexto resta nem quando compactou |
| Delegar compactação ao CLI nativo | ADAPT | Aceitável como base, mas expor estado ao usuário |
| Telemetria de custo/token por turno **e** por sessão | ADOPT | `turn_end.costUSD` + `taskUsage` acumulado é o mínimo |
| Reasoning effort como sufixo de modelo (`:high`) | ADOPT | Simplifica UI; um seletor só |
| `subscriptionOnly` × `apiKeyOnly` no catálogo | ADOPT | Modela corretamente OAuth vs BYOK por modelo |
| Reconexão proativa 12min por limite de PaaS | REFERENCE | Sintoma de Railway; evitar essa restrição na escolha de infra |
| Múltiplos agentType (claudecode/codex/opencode) | ADAPT | Abstração de harness existe; validar custo de manter N backends |

### 26.9 Correção de leitura anterior sobre o projeto monitorado

Registro de honestidade: relatos anteriores neste mapa disseram que o Sales Radar estava "parado em escopo v2.0, com números inventados pelo Escopo/Gemini". Isso veio de ler apenas o topo do chat (mensagem mais antiga). O estado real da sessão mostra o oposto — o Claude Code **executou Data Discovery contra o Sankhya real**:

- "Discovery: TIPMOV e TOPs da base Sankhya"
- "Discovery: status, vínculo e colunas dos orçamentos"
- "Analisar janela real de conversão e os 2801 fechados"
- "Curva de sobrevivência e taxa real de conversão"

E seguiu para implementação: Server Functions publicadas, matriz de segurança revalidada, feature "ver como" (impersonation de vendedor) com trava de autorização, `ux.md`, builds limpos, commits na `main`. O documento de escopo do topo é o artefato inicial; os pesos foram depois confrontados com dados reais. **O padrão §14 não se aplica a esta sessão.**

**Amostra de qualidade do turno final** (observada 2026-08-10 20:44, agente ocioso aguardando decisão do operador). Quatro comportamentos que valem como padrão:

1. **RBAC validado por matriz executada contra a base real**, não por asserção. O agente publicou as contagens dos cinco caminhos de autorização — vendedora normal, vendedora tentando forjar persona de outro (ignorado), gestor, gestor filtrando, técnico sem persona (zero registros) — provando a trava em vez de afirmá-la.
2. **Dados sujos do ERP reportados como bloqueio nomeado**: quatro cadastros de vendedor quebrados no Sankhya (domínio errado, e-mail ausente, e-mail duplicado de outro usuário) com o impacto quantificado — orçamentos que ficam sem dono na tela.
3. **Limite de conhecimento declarado**: avisou que um usuário só passa a existir em `INT_USER` no primeiro login, antecipando o modo de falha em vez de deixar o operador descobrir.
4. **Encerrou com pergunta e parou** (F4 ou F5), coerente com a regra do CLAUDE.md de `AskUserQuestion` como última ação (§22).

Também confirmou de forma incidental que o `git push` no sandbox é **intermitente** — o agente relatou falha em turno anterior e sucesso depois, sem perda. Reforça a leitura de §21 sobre fragilidade do SYNC/SHARE.

Classificação: matriz de autorização executada contra dados reais como artefato de entrega — **ADOPT** para o Conexus. É a diferença entre "implementei RBAC" e "aqui estão os números que provam que a trava segura".

## 27. Promote DEV→PROD e sistema de releases (o achado maior — §24 estava incompleto)

Nível de evidência: **OBSERVADO** — composable `sa()` em `LabSidebar.zayUnn7U.js` (69KB) + bloco i18n `PROMOTE` completo do entry.

O §24 mapeou só o *publish* (snapshot para link público). Faltava a camada de cima: **promoção para produção com projeto PROD separado, versionamento semver e releases no GitHub**. Isto é o ciclo de vida real do app.

### 27.1 Modelo mental: DEV e PROD são dois projetos ligados

Texto literal da UI: *"Create a production version of \"{name}\". This action creates a linked PROD project and ships the first release (v0.1.0)."*

`promoteFirstTime` retorna `{prodProjectId, tag}` — o backend **forka um projeto novo**. A lista de projetos ganha filtros `Dev` / `Production` e o par aparece como `DEV → PROD`. Há atalhos "Open production project" / "Open development project".

Isto é diferente de tudo em §24: publish = link público de um snapshot; promote = **ambiente de produção separado, com banco e migrations próprios**.

### 27.2 API completa

Auth de todas: query `?userId=` + header `x-user-jwt`.

| Função | Verbo + rota | Retorno / efeito |
|---|---|---|
| `previewPromote` | `GET /api/mitra-agent/promote/${ws}/${proj}/preview` | delta a promover; em erro traz `errorCode` |
| `promoteFirstTime` | `POST /api/mitra-agent/promote/${ws}/${proj}` | `{prodProjectId, tag}` — cria PROD + v0.1.0 |
| `updateProd` | `POST /api/mitra-agent/promote/${ws}/${proj}/update` | `{tag}` — nova versão no PROD existente |
| `saveRelease` | `POST /api/mitra-agent/release-tag/${ws}/${proj}` | cria git tag em DEV, **sem promover** |
| `pollStatus` | `GET /api/mitra-agent/promote/${ws}/${proj}/status` | `{state, steps[], error, prodProjectId, releaseTag}` |
| `cancelPromote` | `POST /api/mitra-agent/promote/${ws}/${proj}/cancel` | — |
| `unpublishProd` | `POST /api/mitra-agent/promote/${ws}/${proj}/unpublish` | tira de produção, mantém histórico |
| `deleteRelease` | `DELETE /api/mitra-agent/release/${ws}/${proj}/${tag}` | remove bundle + GitHub Release |
| `getReleaseFile` | `GET /api/mitra-agent/github-files/${ws}/${proj}/release-content?version=` | conteúdo de arquivo numa versão |
| — | `GET .../release-tree`, `.../releases` | árvore e lista de versões |

`state` ∈ `idle | running | success | error`.

### 27.3 As 12 etapas do promote (nomes literais)

Agrupadas em blocos na UI:

| # | Step | Label | Bloco |
|---|---|---|---|
| 1 | `step_preview` | Compute delta | Preparing production |
| 2 | `step_fork` | **Create Production project** | Preparing production |
| 3 | `step_env` | Materialize `.env.production` | Preparing production |
| 4 | `step_baseline` | Initialize baseline | Preparing production |
| 5 | `step_build` | Build frontend | Publishing application |
| 6 | `step_tarball` | Pack bundle | Publishing application |
| 7 | `step_sync_prod_repo` | **Sync code DEV→PROD** | Publishing application |
| 8 | `step_apply` | **Apply PROD migrations** | Applying database changes |
| 9 | `step_deploy` | Deploy to S3 | Publishing application |
| 10 | `step_changelog` | Update CHANGELOG | Recording version |
| 11 | `step_github_release` | Publish GitHub Release | Recording version |
| 12 | `step_tag` | Create git tag | Recording version |

Blocos adicionais: `block_legacy` ("Updating internal publication" — ponte para o publish do §24), `block_save`, `block_save_changelog`.

### 27.4 Regras de negócio observadas (as partes difíceis)

- **Migrations são forward-only.** Literal: *"Migrations already applied in PROD are NOT reverted (forward-only)"*. Apagar uma release remove bundle e GitHub Release, mas **não desfaz o banco**.
- **Dry run acontece dentro do promote**, não antes: *"{n} pending migrations — the dry run runs during promote"*.
- **O agente conserta falha de promote.** Em erro, a UI mostra "Failed at step \"{step}\"" com botão **"Resolve with the agent"** / "Resolve now". O gate diz *"There are pending items — the agent can resolve them"*. Ou seja: falha de deploy vira tarefa do agente, com o step nomeado como contexto.
- **Não cancelável na prática**: apesar do endpoint `/cancel`, a UI diz *"Please wait for completion. This process cannot be cancelled."*
- **Save Release ≠ Promote**: *"Creates a git tag in DEV as a snapshot. Does not promote to production."* Permite acumular versões e promover uma antiga depois ("Promote this version").
- **Promover versão arbitrária**: escolhe-se entre "IN EDITING" (`Current project (create new version)` — inclui mudanças não salvas) e "SAVED RELEASES".
- **Unpublish** derruba o link público imediatamente, mas mantém o histórico para republicar.
- Preview mostra: `Pending migrations`, `Commits since last version`, `Next version`.
- Release detail traz: changelog, commit SHA, "Released by", migrations da versão, lista de commits, link "View on GitHub".

### 27.5 Achado lateral: `TEMPLATE_LOCK`

No mesmo bloco i18n: projetos criados de template oficial carregam badge "Official template" / "Customized", com aviso *"Using the Agent will unlink the project from the template"* e "New version available" + botão Update. Existe um `POST /api/mitra-agent/proxy/agentAiShortcut/mergeMitraPackageBaseline` que faz o merge do baseline do pacote Mitra — é como templates recebem atualização upstream enquanto não foram "destravados" pelo agente.

### 27.6 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| PROD como projeto forkado e ligado ao DEV | **ADOPT** | Isolamento real de ambiente; melhor que flag de "modo prod" |
| 12 steps nomeados e observáveis no status | **ADOPT** | Deploy legível passo a passo é requisito, não luxo |
| Falha de deploy vira tarefa do agente ("Resolve with the agent") | **ADOPT** | Fecha o loop agente↔operação. Padrão forte pro Conexus |
| Migrations forward-only, sem rollback | ADAPT | Correto por default, mas precisa de plano de compensação explícito |
| Dry run só dentro do promote | **REJECT** | Descobrir migration quebrada no meio do deploy é tarde; validar antes |
| Save Release desacoplado de Promote | ADOPT | Separar "marcar versão" de "publicar versão" é o certo |
| Promote de release arbitrária (rollback via promote de tag antiga) | ADOPT | Rollback de código sem rollback de schema — coerente com forward-only |
| GitHub Release + CHANGELOG automáticos | ADOPT | Histórico auditável de graça |
| Endpoint `/cancel` que a UI diz não poder cancelar | REJECT | Contrato inconsistente; ou cancela ou não expõe |
| `mergeMitraPackageBaseline` p/ atualizar template upstream | REFERENCE | Resolve "template evoluiu depois que o cliente forkou" |

## 28. Coordinator, chaves BYOK e login OAuth no sandbox

### 28.1 Coordinator: existe no protocolo, não existe na UI

Varredura dos **367 chunks**: `coordinator` aparece em **um único arquivo** (`useAgentWebSocket`), nas três funções que o emitem — e **nenhum componente as importa**.

```js
sendCoordinatorClaudeLoginStart(workspaceId)    → {type:"coordinator_claude_login_start",    payload:{workspaceId}, taskId:""}
sendCoordinatorClaudeLoginCallback(ws, url)     → {type:"coordinator_claude_login_callback", payload:{workspaceId, callbackUrl}, taskId:""}
sendCoordinatorClaudeLoginCancel(workspaceId)   → {type:"coordinator_claude_login_cancel",   payload:{workspaceId}, taskId:""}
```

Diferença de escopo é o que importa: o login normal é por **task** (`batchGroupId` + `userIds[]`), o do coordinator é por **workspace**. Sugere um processo de agente de nível de workspace — orquestrador acima das tasks — cuja credencial é provisionada separadamente. **Conclusão factual: capacidade server-side com UI ausente** (feature em construção, removida, ou acionada por rota interna). Não há evidência de comportamento; não afirmo que existe orquestração multi-task, só que o protocolo a prevê.

### 28.2 Login Claude roda como terminal dentro do sandbox

Componente `ClaudeLoginTerminal`, props `{batchGroupId, userIds}`. Fluxo por WS, sem REST:

1. emite `claude_login_start {batchGroupId, userIds}`
2. recebe `claude_login_data` — payload traz `automaticUrl`, aberto em nova aba
3. usuário cola o código de callback → `claude_login_callback {callbackUrl}`
4. recebe `claude_login_complete {success}` ou `claude_login_error {error}`
5. timeout de **30s** esperando resposta do servidor

`batchGroupId` + `userIds[]` = provisionamento de credencial **em lote para vários usuários** de uma vez.

### 28.3 Painel de chaves: escopo e providers

`scope.kind` ∈ **`user` | `connection`** — chave pessoal ou chave amarrada a uma conexão.

Dois modos de auth: **OAuth** (`claude-oauth` / `openai-oauth`) e **API key** por provider. Providers com logo no painel: `anthropic`, `openai`, `gemini`, `minimax`, `kimi`, `glm`, `qwen`, `openrouter` — **minimax, kimi e qwen não aparecem no `OPENCODE_MODELS`** do §26.5, logo o catálogo de chaves é mais largo que o de modelos selecionáveis (provavelmente via `isDynamicProvider`/`fetchModels`, que busca modelos do provider em runtime).

Claude OAuth é **gated por domínio**: `isClaudeOAuthAllowed` vem de `loadEnabledDomains` (há um `manageProviderDomainsModal`). Modelos marcados `isFree` são auto-habilitados ao validar a chave.

Endpoints: `/api/mitra-agent/keys`, `/keys/validate`, `/models/${provider}`, `/connections`, `/connections/models`, `/connections/registry`, `/connections/auth/{claude,openai}`, `/auth/{claude,codex,openai}`.

### 28.4 Persistência do histórico de task

`GET /api/mitra-agent/tasks/` e `GET /api/mitra-agent/tasks/${taskId}/messages` — é daqui que vêm as 322 mensagens medidas em §26.1. Histórico é server-side e recarregável, não estado efêmero de socket.

### 28.5 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| Credencial de agente com escopo workspace (coordinator) | **SPIKE** | Se vamos ter orquestrador, ele precisa de identidade própria — desenhar antes |
| Login OAuth em lote (`batchGroupId` + `userIds[]`) | ADOPT | Onboarding de time sem N logins manuais |
| OAuth conduzido por WS com terminal no sandbox | ADAPT | Funciona, mas colar código manualmente é fricção |
| `scope: user \| connection` para chaves | **ADOPT** | Separar chave pessoal de chave de integração é correto |
| Claude OAuth gated por domínio de email | ADOPT | Controle de quem pode usar assinatura corporativa |
| Catálogo de chaves > catálogo de modelos | REFERENCE | Providers dinâmicos evitam hardcode de modelo |
| Histórico de task via REST paginável | ADOPT | Sessão longa exige histórico server-side |

## 29. Login e RBAC do app publicado (o que acontece quando o usuário externo acessa)

Nível de evidência: **OBSERVADO** — `mitra-interactions-sdk/dist/index.d.ts` (52KB, 56 funções) verbatim.

Complementa §24 (que mapeou a publicação) com **o que roda no app publicado quando alguém acessa**.

### 29.1 Quatro métodos de login, todos via a página de auth da Mitra

```ts
loginMitra(method: 'email' | 'google' | 'microsoft' | 'mitra', options?: LoginOptions): Promise<LoginResponse>
loginWithEmailMitra(options?) / loginWithGoogleMitra(options?) / loginWithMicrosoftMitra(options?)
```

`LoginOptions`: `{ authUrl, projectId, mode: 'popup' | 'redirect', returnTo, create }` — `create:true` abre cadastro em vez de login; `mode:'redirect'` volta para `returnTo` com token nos query params.

`LoginResponse`: `{ token /* JWT já com prefixo Bearer */, baseURL, integrationURL }`. As três funções **auto-configuram o SDK** após sucesso — o app não precisa chamar `configureSdkMitra` de novo.

A página de auth é hospedada pela Mitra (`https://coder.mitralab.io/sdk-auth/`, `https://validacao.mitralab.io/sdk-auth/`), não pelo app. Ou seja: **o app publicado nunca vê a senha** — o fluxo acontece em origem separada, via popup ou redirect.

### 29.2 Cadastro próprio com verificação por código

```ts
emailSignupMitra({authUrl, projectId, name, email, password}): Promise<void>
emailVerifyCodeMitra({...}): Promise<LoginResponse>   // código de 6 dígitos; loga automático
emailResendCodeMitra({...}): Promise<void>
emailLoginMitra({...}): Promise<LoginResponse>        // via iframe silencioso
refreshTokenSilently(authUrl, projectId): Promise<LoginResponse>  // iframe invisível; dedupe de refresh concorrente
```

Isto é um **sistema de contas completo por projeto**: o app externo pode ter self-signup com verificação de e-mail, sem o operador convidar ninguém. O refresh silencioso via iframe invisível mantém a sessão viva sem re-login.

### 29.3 RBAC por Profile — permissões granulares por objeto

11 funções de perfil. Um Profile é um papel do app publicado:

```ts
createProfileMitra({projectId, name, color, homeScreenId})   // homeScreenId = tela inicial do papel
setProfileUsersMitra({profileId, userIds: number[]})
setProfileScreensMitra({profileId, screenIds: number[]})
setProfileActionsMitra({profileId, actionIds: number[]})
setProfileServerFunctionsMitra({profileId, serverFunctionIds: number[]})
setProfileSelectTablesMitra({profileId, jdbcConnectionConfigId?, tables: ProfileTableRef[]})  // leitura
setProfileDmlTablesMitra({profileId, jdbcConnectionConfigId?, tables: ProfileTableRef[]})     // escrita
listProfilesMitra / getProfileDetailsMitra / updateProfileMitra / deleteProfileMitra
```

Cinco eixos de permissão independentes: **telas, ações, Server Functions, tabelas de leitura, tabelas de escrita** — leitura e escrita separadas, e ambas escopadas por `jdbcConnectionConfigId` (amarra ao §25.3). `homeScreenId` por perfil dá landing page diferente por papel.

O ponto forte: essas permissões são **configuráveis via SDK**, ou seja, o app pode administrar seus próprios papéis em runtime — e o agente de build pode provisioná-los por código.

### 29.4 Como isso se conecta a §24

A visibilidade do §24 (`PRIVATE` / `PUBLIC_WITH_LOGIN` / `PUBLIC`) é o portão de entrada; o Profile é o que decide o que a pessoa vê **depois** de entrar. `PUBLIC_WITH_LOGIN` + self-signup + Profile default é a combinação que produz um app externo com contas próprias. Foi exatamente o que a sessão monitorada exercitou ao tratar `INT_USER` e allowlist (§26.9).

### 29.5 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| Página de auth em origem separada (app nunca vê senha) | **ADOPT** | Reduz superfície de credencial no app gerado; correto por construção |
| Login popup **e** redirect com `returnTo` | ADOPT | Cobre embed e standalone |
| Self-signup com código de 6 dígitos por projeto | ADOPT | App externo com contas próprias sem convite manual |
| Refresh silencioso por iframe invisível, com dedupe | ADAPT | Funciona; iframe tende a quebrar com política de cookies 3rd-party — preferir refresh token |
| RBAC em 5 eixos, leitura ≠ escrita, escopado por conexão | **ADOPT** | Melhor granularidade que a maioria dos low-code; espelhar |
| `homeScreenId` por perfil | ADOPT | Landing por papel é detalhe barato de alto valor |
| Permissões administráveis via SDK em runtime | **ADOPT** | Permite o agente provisionar RBAC por código |

## 30. Agentes dentro do projeto — o que existe de fato (e o que não existe)

Nível de evidência: **OBSERVADO** — `.d.ts` verbatim do interactions-sdk; varredura dos 367 chunks e dos 70 exports do `mitra-sdk`.

**Resposta curta e honesta:** dá para **embutir o agente da Mitra dentro do app publicado**, com sessão, streaming, fila e histórico — mas **não existe construtor de agentes customizados**. Não há API para definir system prompt, persona, conjunto de tools próprio ou orquestração multi-agente. O agente que você embute é o mesmo agente de desenvolvimento (Claude Code / Codex / OpenCode), operando no sandbox do projeto.

### 30.1 O que existe: `AgentTaskSession` embutível

```ts
getAgentTaskMitra({create: true, projectId?, agentType?, modelId?, name?, connectionId?}): AgentTaskSession
getAgentTaskMitra({taskId}): AgentTaskSession   // abre existente; mesma taskId → MESMA instância (cache)

interface AgentTaskSession {
  readonly taskId: string | null;
  readonly task: AgentChat | null;
  readonly isNew: boolean;
  readonly status: AgentTaskStatus;
  readonly history: ReadonlyArray<AgentMessage>;
  readonly content: string;
  readonly queue: ReadonlyArray<QueuedItem>;
  loadHistory(options?: {limit?: number}): Promise<AgentMessage[]>;
  send(prompt: string, options?: SendOptions): void;
  cancel(): Promise<void>;
  editQueueItem(itemId: string, newText: string): boolean;
  removeQueueItem(itemId: string): boolean;
  clearQueue(): void;
  close(): void;
  on<E>(event: E, handler): () => void;
}
```

Eventos: `historyLoaded`, `turnStart`, `delta` (`{delta, kind:'text'|'tool'}`), `tool` (`{tool, input, content, timestamp}`), `turnEnd` (`{content}`), `taskCreated`, `error`, `queueChange`, `statusChange`.

`SendOptions`: `{agentType?, modelId?, files?: File[]}` — anexos são detectados, subidos e montados pela própria SDK durante o `send`.

A **fila é editável pelo consumidor** (`editQueueItem` / `removeQueueItem` / `clearQueue`) — é a contraparte cliente do steering por arquivo do §26.2.

### 30.2 A peça que torna isso viável para usuário final: `connectionId`

Comentário verbatim do `.d.ts` (issue #756):

> *"Connection do projeto a usar. Quando passado, a credencial e o sandbox da task usam a connection do projeto em vez das suas pessoais; o chat/histórico continua seu. Requer que o dono do projeto a tenha configurado."*

Isso resolve o problema óbvio: sem `connectionId`, cada usuário do app precisaria da própria chave de IA. Com ele, **o dono do projeto banca a credencial e o sandbox**, e cada usuário mantém chat e histórico próprios. É o que permite entregar "camada inteligente" a usuários externos.

### 30.3 Seleção de modelo em runtime

`modelId` aceita, por turno ou por sessão: `'openai/gpt-5.5:medium'`, `'glm/glm-5.1'`, `'subscription:anthropic:claude-opus-4-7'`. O backend deriva `agentType`/`provider`/`model` a partir da string. Valores vêm de `manageAgentCredentialMitra({action:'list_models'})`.

`agentType`: `'claudecode' | 'codex' | 'opencode-cli' | 'opencode-sdk'` — confirma §26.6 no contrato público do SDK.

### 30.4 Credenciais: uma função, 14 verbos

```ts
manageAgentCredentialMitra({action, ...})
// baixo nível (RPC no backend): status | remove | list | list_models | list_providers | validate | save
//                               oauth_start | oauth_exchange | device_start | device_poll | device_cancel
// alto nível (orquestrado no browser): auth | connect
```

Targets de subscription: `'claude' | 'openai_oauth' | 'codex'`. Targets de API key (8): `'anthropic' | 'openai' | 'gemini' | 'kimi' | 'minimax' | 'glm' | 'qwen' | 'openrouter'` — confirma §28.3 e fecha a lacuna: os providers extras do painel são de fato suportados pelo backend.

`auth` retorna o que a UI deve mostrar, sem efeito colateral de janela (claude → `{authUrl, state}`; codex → `{userCode, verificationUrl, ...}`); `connect` encadeia tudo e abre popup. Boa separação: o app controla UI, popup e timing.

### 30.5 Gestão de chats

```ts
manageAgentChatMitra({action:'list'})    → AgentChat[]
manageAgentChatMitra({action:'rename'})  → RenameAgentChatResult
manageAgentChatMitra({action:'delete'})  → DeleteAgentChatResult
```

`AgentChat`: `{id, name, agentType?, provider?, createdAt, updatedAt}`.

### 30.6 O que NÃO existe (verificado, não presumido)

- **Nenhuma API de definição de agente.** Zero funções do tipo `createAgent`, `agentConfig`, `toolDefinition`, `systemPrompt` nos 70 exports do `mitra-sdk` nem nos 56 do interactions-sdk. Os hits de `functionCalling`/`toolConfig` no bundle são do **SDK do Google GenAI embutido** para o Lila/Escopo, não uma superfície da Mitra.
- **Nenhuma tool customizada.** Não há como registrar uma função do app como tool do agente.
- **Nenhuma orquestração multi-agente.** O `coordinator` do §28.1 é o único indício de camada acima da task, e não tem UI.
- **`mitra-sdk` (backend) não tem IA nenhuma.** 70 funções, zero de inferência. Um app Mitra não chama LLM do backend pelo SDK oficial — se quiser, usa Server Function tipo INTEGRATION apontando para a API do provider (§23), pagando e gerindo a chave por fora.

Conclusão: a "camada inteligente" da Mitra é **um agente de desenvolvimento embutível**, não um framework de agentes de negócio. Para um app com agente de domínio (persona, tools do negócio, RAG), o caminho na Mitra hoje é Server Function INTEGRATION contra o provider + lógica própria — sem apoio de framework.

### 30.7 Classificação

| Achado | Classificação | Nota Conexus |
|---|---|---|
| `AgentTaskSession` embutível com streaming/fila/histórico | **ADOPT** | Contrato de sessão bem desenhado; copiar a forma |
| Fila editável pelo cliente (`editQueueItem`/`remove`/`clear`) | **ADOPT** | Steering com UX de verdade; melhor que só "cancelar" |
| `connectionId` — credencial/sandbox do projeto, histórico do usuário | **ADOPT** | Resolve o custo de IA por usuário final. Peça-chave |
| `modelId` por turno, string única derivada no backend | ADOPT | Simples e flexível |
| `auth` (sem efeito colateral) separado de `connect` (orquestrado) | **ADOPT** | Deixa o app dono da UI; padrão de API maduro |
| Ausência de agentes customizados (prompt/tools/persona) | **OWN** | Lacuna clara da Mitra. É onde o Conexus pode diferenciar de verdade |
| Ausência de IA no SDK de backend | **OWN** | Agente de domínio server-side é território livre |
| Agente embutido = agente de dev (edita código no sandbox) | REJECT (como modelo p/ usuário final) | Dar agente que edita código ao usuário final do app é risco, não feature |

---

## 31. O framework agêntico real da Mitra — MCP, contexto injetado e Playground

> **Fonte primária desta seção**: material oficial da própria Mitra, não engenharia reversa.
> (a) artigo *"Criando agentes de IA no seu projeto: IA compartilhada e Playground"* (ajudamitra.prod.mitralab.io, atualizado 23/07/2026);
> (b) artigo *"Como criar um contexto específico para o seu projeto (arquivo .md)"* (27/07/2026);
> (c) anexo `Missão construir o Playground — BI.txt` publicado no feed da comunidade em 15/07/2026
> (`mitra-multitenant-prod.s3.amazonaws.com/tenant_51210/ai-files/public/MissoconstruiroPlaygroundBI-mrv1nkrma2co3b.txt`, 7.604 bytes).
> Este é o documento mais denso que a Mitra publicou sobre a própria stack agêntica — escrito pela equipe, para desenvolvedores.

### 31.1 A correção que esta seção impõe ao §30

O §30 concluiu: *"não existe builder de agente customizado — sem API de system prompt, tools ou persona"*.
Isso está **parcialmente errado** e precisa ser corrigido com precisão:

| Afirmação do §30 | Veredito | O que é de fato |
|---|---|---|
| "Sem API de system prompt" | **ERRADO** | Existem **dois campos de contexto persistente concatenados a todo acionamento** (31.4) |
| "Sem controle de tools" | **ERRADO** | Existe **Perfil de IA** limitando tabelas e server functions que a IA pode usar (31.3) |
| "Sem persona" | Parcialmente certo | Não há objeto "agente" nomeado; a persona vive dentro dos campos de contexto |
| "Sem multi-agente / sub-agentes" | **Confirmado** | Nada no material oficial nem nos 367 chunks |
| "mitra-sdk (backend) tem zero IA" | **Confirmado** | Segue válido |

A conclusão estratégica do §30 (OWN — o builder de agentes é o diferencial do Conexus) **continua válida**, mas por um motivo mais estreito: a Mitra tem os *primitivos* (credencial compartilhada, RBAC de tools, contexto persistente, sessão embarcável), e **não tem** a *abstração* — não existe entidade "Agente" com identidade, versão, conjunto de tools declarado e ciclo de vida próprio. O agente da Mitra é uma convenção montada à mão dentro de um app.

### 31.2 A descoberta central: `mcp__mitra-business__executeServerFunction`

Do anexo da missão, na definição do contexto a injetar:

> *"Contratos EXATOS com serverFunctionId numérico e nome da chave de input, via `mcp__mitra-business__executeServerFunction`."*

Isto revela a peça que faltava em todo o mapa: **como o Claude Code dentro do sandbox toca o projeto**.
A Mitra expõe ao agente um **MCP server chamado `mitra-business`**, cuja tool `executeServerFunction` é o mesmo endpoint REST que o app publicado usa (`POST /interactions/executeServerFunction`, §32.3). Ou seja:

```
Claude Code (sandbox E2B)
   └─ MCP server "mitra-business"
        └─ tool executeServerFunction({serverFunctionId, input})
             └─ mesma SF que o frontend chama
                  └─ MySQL do projeto
```

Consequências arquiteturais:

- **A superfície de ação do agente É o registry de server functions.** Não há tool "rodar SQL" genérica exposta ao agente de negócio — quem quer que o agente consulte o banco precisa **criar uma SF que faz isso** (no Playground: `consulta_livre`). Toda capacidade do agente é uma SF que alguém escreveu.
- **Tool = função de negócio versionada no projeto**, não plugin externo. Adicionar capacidade = criar SF. Remover = tirar do Perfil.
- O nome `mitra-business` sugere que existem outros MCP servers (`mitra-dev`?) — **não confirmado**; nenhum outro nome aparece no material.
- O prompt também menciona que, sem contexto injetado, o agente gasta minutos em `getProjects` / `ToolSearch` — logo o agente **também tem tools de descoberta de plataforma**, e `ToolSearch` indica **carregamento diferido de schemas de tool** (mesma técnica do harness da Anthropic). Forte indício de que o MCP server publica muitas tools e o agente busca sob demanda.

**Classificação**

| Achado | Classificação | Motivo |
|---|---|---|
| Tools do agente = server functions do projeto via MCP | **ADOPT** | Melhor decisão de design da Mitra inteira. Capacidade do agente vira artefato versionado, revisável e permissionável — não config solta |
| Um MCP server por domínio (`mitra-business`) | **ADOPT** | Namespace limpo, isolamento por domínio |
| `ToolSearch` / schemas sob demanda | **ADAPT** | Necessário quando o registry cresce; nós ainda não precisamos, mas o formato do nome deve já prever |
| Não existir tool de SQL direto para o agente de negócio | **ADOPT** | Guarda-corpo certo: SQL passa por SF auditável (ver `consulta_livre`, 31.6) |

### 31.3 Perfil de IA — o RBAC das tools

Do artigo oficial, seção *"Segurança corporativa: perfis, tabelas e server functions"*. Cada Perfil (em **IA para usuários finais**) define três coisas:

| Eixo | O que limita |
|---|---|
| **Membros** | quem pertence ao perfil |
| **Tabelas que a IA pode utilizar em consultas** | o que a IA pode **ler** |
| **Server Functions** | o que a IA pode **executar** |

Citação: *"a IA nunca acessa dados ou ações fora do que foi permitido"*.

Isto conecta diretamente ao §29.3 (Profiles do app publicado, 5 eixos de permissão): **é o mesmo sistema de Perfis**, com dois dos eixos (select tables, server functions) reaproveitados para governar a IA. A Mitra não construiu um RBAC separado para o agente — **estendeu o RBAC do app**.

| Achado | Classificação | Motivo |
|---|---|---|
| RBAC da IA reusa o RBAC do app (mesmos Perfis) | **ADOPT** | Uma fonte de verdade de permissão. Duas seria bug garantido |
| Permissão de tool por grupo de usuário, não por agente | **ADAPT** | Certo para IA compartilhada; nosso modelo precisa de permissão **por agente ∩ por usuário** (o agente não deve poder tudo que o usuário pode) |

### 31.4 Contexto persistente — o "system prompt" da Mitra

Dois campos, dois públicos, **ambos concatenados a cada prompt** (citação: *"instruções que são aplicadas em todo acionamento dela, concatenadas a cada prompt"*):

| Campo | Onde fica | Governa |
|---|---|---|
| **Diretrizes para a IA** | seção *IA para usuários finais* | a IA compartilhada que atende o usuário final |
| **Considerações Adicionais** | Configurações → aba **IA** → *Configurações de IA para Desenvolvedores* | a IA de desenvolvimento (o Claude Code do code-builder) |

Uso recomendado pela própria Mitra: *"regras do negócio, glossário e o tom das respostas"*.

E a fórmula que eles publicam para montar um agente:

> *"É com esse conjunto — IA conectada + perfil + contexto — que você monta, por exemplo, o agente do playground do projeto."*

**Essa é a definição de agente na Mitra**: `credencial + perfil (tools) + contexto`. Três campos, nenhum objeto.

### 31.5 `CLAUDE.md` / `AGENTS.md` — a "skill" do projeto (e o furo)

Do artigo do arquivo `.md`:

- Arquivo na **raiz do projeto**, nomes reconhecidos: **`CLAUDE.md` ou `AGENTS.md`**.
- Conteúdo: convenções, regras de negócio, decisões técnicas, restrições, padrões de nomenclatura.
- Precedência declarada: *"ele tem prioridade sobre as orientações genéricas"*.
- Anti-padrões que a própria Mitra lista: nunca segredos/tokens (o arquivo é versionado); nada que muda com o uso (contagens, listas); não duplicar o que dá para ler no código.

**O furo, admitido no artigo**: criar o arquivo **não garante leitura**.

> *"Criar uma pasta ou um arquivo .md solto no projeto não garante, sozinho, que a IA vá lê-lo em toda sessão. Para que a leitura seja garantida e automática (…) é preciso apontar essa instrução em (…) Configurações de IA para Desenvolvedores."*

Ou seja: o mecanismo de contexto de projeto depende de **uma instrução em linguagem natural, num campo de texto, pedindo para ler um arquivo**. Não é carregamento determinístico — é um pedido ao modelo.

| Achado | Classificação | Motivo |
|---|---|---|
| Contexto de projeto como arquivo versionado no repo | **ADOPT** | Já é o nosso modelo; confirma a convenção `CLAUDE.md`/`AGENTS.md` |
| Precedência do arquivo sobre regra genérica | **ADOPT** | Hierarquia explícita evita conflito silencioso |
| Lista de anti-padrões (segredo, dado volátil, duplicação) | **ADOPT** | Vale virar lint/checklist |
| **Leitura garantida só por instrução em campo de texto** | **REJECT** | Carregamento de contexto tem que ser determinístico no harness, não um pedido ao modelo. Se o arquivo existe no path convencionado, ele entra — ponto |
| Contexto único por projeto (sem escopo por agente/tarefa) | **OWN** | Nosso modelo precisa de contexto em camadas: plataforma → projeto → agente → tarefa |

### 31.6 O Playground, dissecado — a receita completa de um agente

O anexo da missão é um documento de engenharia completo. Vale destrinchar porque é **a única evidência existente de como a Mitra acha que um agente de produto deve ser construído**.

**Produto**: seção no portal onde cada usuário cria N *estudos*. Estudo = **canvas HTML** (a análise) + **chat com agente analista**, lado a lado (`grid 1fr 400px`). Usuário pergunta → agente investiga o banco via SQL → **narra o raciocínio em tempo real** → ao final desenha a tela HTML no canvas e **renomeia o estudo**. Tudo persistente e compartilhável por link público.

**(a) Ciclo de sessão** — API confirmada:

```js
getAgentTaskMitra({ create: true, agentType: 'claudecode', modelId })   // nova sessão
getAgentTaskMitra({ taskId })                                          // reabre — reconecta inclusive stream ATIVA
// modelId ex.: 'subscription:anthropic:claude-fable-5:medium'
```

**Formato do `modelId` decodificado** (fecha lacuna do §28):
`{origem}:{provider}:{modelo}:{esforço}` — `subscription` (assinatura OAuth) vs. chave de API, e um **nível de reasoning effort** (`medium`) no fim. Confirma que a Mitra expõe controle de esforço por turno.

**(b) Eventos do stream** (fecha o protocolo do §26.7 pelo lado do SDK):

| Evento | Payload | Nota operacional da própria Mitra |
|---|---|---|
| `taskCreated` | `{task}` | *"SALVE task.id imediatamente"* |
| `turnStart` | — | |
| `delta` | `{delta, kind}` | *"use SÓ `kind==='text'`"* — existem outros kinds (thinking?) que o SDK entrega e não devem ir para a UI |
| `tool` | `{tool, input}` | **`input` chega TRUNCADO** |
| `turnEnd` | `{content}` | |
| `error`, `statusChange` | — | |

Métodos: `send()`, `cancel()`, `loadHistory()`.

**(c) Três armadilhas que a Mitra documenta contra si mesma** — as mais reveladoras:

1. **WS agêntico só aceita sessão de usuário logado.** Token de integração → `"conexão fechada"`. (String confirmada no bundle do app publicado: `"Agent Chat: conexão fechada"`.) Logo **não existe agente headless/server-to-server** — todo agente precisa de um humano logado por trás. Limitação dura.
2. **`input` do evento `tool` chega truncado.** Instrução literal: *"NUNCA use JSON.parse nele — extraia campos por regex tolerante"*, com a regex sugerida `'"campo"\s:\s"((?:[^"\\]|\\.){1,400})'`. Um protocolo que exige regex tolerante no consumidor é um protocolo quebrado.
3. **`loadHistory()` devolve tool calls como TEXTO CRU** no formato `mcp__...{json}` — o app precisa detectá-los por regex (`/^(mcp_[\w-]+_)?[\w-]+\s*\{"/`) e converter em segmento de tool, *"JAMAIS renderize como fala"*. O histórico persistido **perde a tipagem** dos eventos.

**(d) Contexto injetado na 1ª mensagem — "a alma da velocidade"**

Citação: *"Sem isso o agente gasta minutos explorando (getProjects/ToolSearch/etc.)"*. O que se injeta no prepend do primeiro `send()`:

1. **Contratos exatos** — `serverFunctionId` numérico + nome da chave de input, por tool.
2. **Schema inline** — tabelas-núcleo com colunas; demais só nomes.
3. **Convenções** — formato de datas, enums.
4. **Design tokens** — cores hex, fonte, radius, padrões de KPI/tabela/SVG, *"a tela gerada deve sair no design system, não genérica"*.
5. **Regras de comportamento** — narrar tudo em pt-BR em tempo real; investigar fundo antes de concluir; a tela é o "grande final" (salvar HTML uma única vez, self-contained, SVG inline com valores reais, zero placeholder); sempre renomear o estudo; fechar com conclusão de 2-3 frases.

Nas mensagens seguintes, um **sufixo curto** relembra `playgroundId` + as regras críticas.

> Leitura crítica: isto é **system prompt montado à mão pelo app, a cada thread**. Não há mecanismo de plataforma para isso. Cada app que quiser um agente reimplementa a mesma injeção — e o custo de esquecer um pedaço é "o agente gasta minutos explorando".

**(e) Fundação backend do agente** (o que precisa existir no projeto):

| SF | Papel | Guardas |
|---|---|---|
| `consulta_livre` | SELECT livre para o agente | só SELECT; **1 statement** (rejeita `;`); blocklist DML/DDL; **LIMIT 200 forçado** |
| `schema_resumo` | `INFORMATION_SCHEMA`: tabela + `GROUP_CONCAT(colunas)` | — |
| `playground_salvar_html {playgroundId, html}` | grava a análise, versionando a anterior | — |
| `playground_renomear {id, nome}` | agente renomeia o próprio estudo | — |
| criar/listar/get/excluir(soft)/salvar_conversa/set_task/compartilhar/publico/versoes/restaurar | CRUD do estudo | `compartilhar` gera token hex; `publico` resolve por token |

Tabelas: `PLAYGROUND (ID, USUARIO, NOME, HTML MEDIUMTEXT, TASK_ID, SHARE_TOKEN, CONVERSA MEDIUMTEXT, timestamps)` + `PLAYGROUND_VERSAO`.

O campo `titulo` de `consulta_livre` merece nota: é **obrigatório em toda chamada e a SF o descarta** — existe só para a UI exibir ao vivo *"o que o agente está investigando"* em linguagem humana. Padrão elegante: **parâmetro de narração embutido no contrato da tool**, forçando o modelo a verbalizar intenção antes de agir.

**(f) UX de agente — o modelo de SEGMENTOS** (onde a Mitra diz que mora a qualidade percebida):

- Turno = lista ordenada de `{t:'md', c}` | `{t:'tool', label, n?, det?, t0?}` — a tool aparece **entre** as falas, no ponto exato. Ao chegar `tool`, **descarregar o buffer de texto pendente antes** de inserir o passo, *"senão a ordem mente"*.
- **Chamadas repetidas da mesma tool não empilham**: fundem no mesmo passo com contador **×N** (animação pop a cada incremento), `det` trocando com fade. Justificativa: *"sem isso, 6 consultas seguidas parecem travamento"*.
- Cronômetro no passo ativo a partir de ~3s.
- Streaming suave: *"chunks são GRANDES"* — bufferizar e drenar `max(2, len/14)` chars a cada 24ms.
- Label da tool resolvido pelo `serverFunctionId` extraído do input, via **registry de SFs — nunca IDs hardcoded**; desconhecidas caem para nome limpo (strip `mcp__*__`).

**(g) Persistência e F5**: `taskCreated` → salva `TASK_ID`; persiste **conversa rica** (JSON das ~60 últimas msgs com segmentos; tool guarda só o label) a cada `turnEnd` e a cada msg do usuário. No **mount** (não só no 1º send) reconecta a sessão e carrega: 1º a conversa rica, fallback `loadHistory()`.

**(h) Canvas**: `iframe sandbox="" + srcDoc`, `key` para re-render com fade, "chrome" de janela com status vivo, recarga ao ver o tool de `salvar_html`/`renomear` (delay ~2,5s) e no `turnEnd`.

**(i) Critérios de aceite** que a Mitra define para o agente estar bom:

- Suíte dos guardas de `consulta_livre` (SELECT ok, minúsculo ok, UPDATE bloqueado, multi-statement bloqueado, LIMIT aplicado).
- **Primeira consulta do agente em < 15s** — *"se explorar antes, o contexto está incompleto"*. Métrica objetiva de qualidade do contexto injetado.
- Título humano trocando a cada consulta; ×N pulsando em repetições.
- F5 no meio E depois do turno → conversa idêntica, sem linhas `mcp__` cruas.
- Tela final nos design tokens; estudo renomeado sozinho ao final.

**Classificação do Playground**

| Achado | Classificação | Motivo |
|---|---|---|
| **Generative UI**: agente termina desenhando HTML self-contained em canvas versionado | **ADOPT** | O melhor padrão de produto do Mitra inteiro. Resposta navegável > texto solto |
| Parâmetro de narração (`titulo`) obrigatório no contrato da tool | **ADOPT** | Trivial de implementar, ganho enorme de percepção e de auditoria |
| Modelo de **segmentos** ordenados (md ∕ tool intercalados) + fusão ×N | **ADOPT** | É a diferença entre "parece travado" e "parece pensando" |
| "Primeira consulta em <15s" como métrica de contexto | **ADOPT** | Métrica objetiva para qualidade de contexto — vamos usar |
| Persistir conversa rica própria em vez de confiar no histórico da plataforma | **ADAPT** | Sintoma de plataforma fraca; no Conexus o histórico tipado é responsabilidade do harness |
| `input` de tool truncado exigindo regex tolerante | **REJECT** | Protocolo tem que entregar o input íntegro. Se é grande, referenciar por id |
| `loadHistory()` devolvendo tool call como texto cru | **REJECT** | Histórico deve ser tipado na origem |
| **WS agêntico exige usuário logado — sem agente headless** | **REJECT** | Mata cron/webhook/evento. Nosso agente precisa rodar por evento, com identidade de serviço |
| System prompt remontado à mão por app, a cada thread | **OWN** | Exatamente a abstração faltante: agente como objeto de 1ª classe (contexto + tools + modelo + política, versionado) |

---

## 32. O ecossistema Mitra por fora — apps publicados em produção, runtime e canais

> Evidência: os próprios produtos da Mitra são apps Mitra publicados. Três alvos analisados por HTTP direto e sessão autenticada do usuário:
> **Comunidade** (`comunidade.prod.mitralab.io`, w/18470 p/51210), **Ajuda** (`ajudamitra.prod.mitralab.io`, w/146429 p/53676), **Tutorial Claude** (`tutorialclaud.prod.mitralab.io`).
> Isto é *dogfooding* total — e nos deu o runtime de produção sem precisar publicar nada.

### 32.1 Anatomia de um app publicado

O HTML de um app publicado é uma SPA **React + Vite** (`<div id="root">`, `/assets/index-<hash>.js`), **não Nuxt** — Nuxt é só o studio (`agent.mitralab.io`). Duas coisas são injetadas no `<head>` no momento do publish:

```html
<script>window.__mitraEnv={
  "apiBaseURL":"https://api2.mitrasheet.com:4133",
  "agentWsUrl":"wss://mitra-agent-websocket-production.up.railway.app/sdk-ws"
};</script>
```

- **`window.__mitraEnv` é o mecanismo de configuração de runtime** do `mitra-interactions-sdk` no app publicado. Fora dele, passa-se por `configureSdkMitra({agentWsUrl})`.
- Confirma o §26: o WS agêntico é **Railway** (`mitra-agent-websocket-production.up.railway.app/sdk-ws`) — daí o reconnect proativo aos 12min.
- Observado em runtime: o app da comunidade chama de fato `https://newmitra.mitrasheet.com:8080/interactions/...` — ou seja, **o `apiBaseURL` injetado não é necessariamente o host efetivo**; há resolução/override por tenant.

| Achado | Classificação | Motivo |
|---|---|---|
| Config de runtime injetada no HTML no publish (`__mitraEnv`) | **ADOPT** | Simples, sem rebuild por ambiente, e o app publicado fica auto-contido |
| Studio (Nuxt) e app publicado (React/Vite) como stacks distintas | REFERENCE | Decisão deles; nada a copiar, mas explica por que o SDK do runtime é separado |

### 32.2 Storage de arquivos por tenant

Arquivos públicos ficam em S3 com layout previsível:

```
mitra-multitenant-prod.s3.amazonaws.com/tenant_{projectId}/ai-files/public/{nomeSanitizado}-{sufixoUnico}.{ext}
```

Exemplo real: `tenant_51210/ai-files/public/MissoconstruiroPlaygroundBI-mrv1nkrma2co3b.txt`.

Três leituras: (1) **tenant = projectId** — coerente com "um banco por projeto" (§33); (2) a pasta chama-se **`ai-files`**, indicando que o caminho de upload nasceu do fluxo de IA e virou o storage geral; (3) o sufixo é um **id tipo ULID/nanoid** anexado ao nome sanitizado — evita colisão e enumeração trivial, mas **`/public/` é publicamente legível sem assinatura**.

| Achado | Classificação | Motivo |
|---|---|---|
| Prefixo por tenant no bucket + sufixo único no nome | **ADOPT** | Padrão sólido de multi-tenant em object storage |
| `/public/` legível sem URL assinada | **ADAPT** | Aceitável para anexo de post; perigoso como default. No Conexus: privado por padrão, público é opt-in explícito |

### 32.3 O contrato de runtime do app publicado

Endpoints observados no bundle do app de Ajuda (superfície completa do `mitra-interactions-sdk` em produção):

```
POST /interactions/executeServerFunction        POST /interactions/executeServerFunctionAsync
POST /interactions/stopServerFunctionExecution  POST /interactions/executeDataLoader
POST /interactions/executeDbAction              POST /interactions/runAction
GET  /interactions/integrations                 POST /interactions/integrations/call
GET/POST /interactions/{get,set,list}Variable(s)
POST /interactions/uploadFilePublic             POST /interactions/uploadFileLoadable
POST /interactions/setFileStatus
GET  /interactions/profiles{,/users,/screens,/actions,/selectTables,/dmlTables,/serverFunctions}
GET/POST/PATCH /interactions/records/{table}    /interactions/records/{table}/{id}    /interactions/records/{table}/batch
```

**Fecha a lacuna do §19.1 — `dbActions`.** Assinatura exata, extraída do bundle:

```js
async executeDbAction(b){
  const v = { projectId: i(b.projectId), dbActionId: b.dbActionId };
  if (b.input !== undefined) v.input = b.input;
  return g("POST","/interactions/executeDbAction",{ body: v });
}
```

`dbAction` é, portanto, **uma operação de banco pré-registrada, invocada por id numérico com input opcional** — exatamente a mesma forma de `executeDataLoader({projectId, dataLoaderId, input})`. Três primitivos irmãos, três registries: **server function** (lógica), **data loader** (ingestão), **db action** (operação de dados). Nenhum aceita SQL do cliente.

**Envelope de resposta** (capturado ao vivo na comunidade):

```jsonc
// req:  {"projectId":51210,"serverFunctionId":13,"input":{"categoriaId":"","busca":"","limit":20,"offset":0}}
// resp:
{ "status":"success",
  "result":{ "executionId":"ba753764-…", "executionStatus":"COMPLETED",
             "output":{ "rowCount":2, "rows":[ { "ID":12, "TITULO":"…", "CORPO":"…" } ] } } }
```

Header de escopo: **`X-TenantID`** em toda chamada.

Observação forte: **o app da comunidade não usa `/records` em nenhuma tela** — todo o feed, fórum, categorias e agenda saem de `executeServerFunction` com ids numéricos (`11`, `13`, `8`, `47`, `190`). Confirma em produção o padrão do §22: **backend serverless = só SFs gerenciadas**, e o `/records` genérico é conveniência de CRUD, não o caminho principal.

| Achado | Classificação | Motivo |
|---|---|---|
| Três registries irmãos (SF ∕ dataLoader ∕ dbAction), todos por id + input | **ADOPT** | Nenhum SQL vindo do cliente; toda operação é artefato nomeado e permissionável |
| Envelope `{executionId, executionStatus, output:{rowCount, rows}}` | **ADOPT** | `executionId` dá rastro de auditoria de graça; `executionStatus` abre caminho pro modo assíncrono |
| `executeServerFunctionAsync` + `stopServerFunctionExecution` | **ADOPT** | Cancelamento de execução longa é requisito, não luxo |
| **`serverFunctionId` numérico no cliente** | **REJECT** | Acopla o frontend a ids de banco; qualquer promote/duplicação vira remapeamento manual. O próprio prompt do Playground avisa: *"NUNCA IDs hardcoded"*. Usar slug estável |
| `X-TenantID` explícito por request | ADAPT | Bom para trace; não pode ser a **única** fronteira de tenancy |

### 32.4 O widget de chat embarcável — protocolo completo

O site de Ajuda embarca o agente com um script inline autoral (comentários em pt-BR, escrito pelo próprio time). Contrato completo:

- **Iframe**: `https://agent.mitralab.io/chat-embed/{workspaceId}/{projectId}` (ex.: `/chat-embed/146429/53676`), `z-index: 2147483647`, `allow="clipboard-write"`.
- **Protocolo `postMessage`** (JSON string, prefixo `mitra-chat:`):

| Mensagem | Direção | Função |
|---|---|---|
| `mitra-chat:init` `{token}` | host → iframe | autentica a sessão |
| `mitra-chat:loaded` | iframe → host | iframe pronto; host reenvia o `init` |
| `mitra-chat:ready` | iframe → host | pode abrir |
| `mitra-chat:open` / `close` | host → iframe | comando |
| `mitra-chat:opened` / `closed` | iframe → host | confirmação; host então mostra/esconde |
- **API global** `window.__mitraChat = { init(token), open(), close(), get isOpen, get isReady }`.
- **Three-mode layout** por razão largura-do-chat/viewport: `push` (app encolhe, `width: calc(100vw - min(480px,100vw))`), `overlay` (por cima), `full` (100vw). Limiares `PUSH_RATIO=0.4`, `FULL_RATIO=0.75`.
- **White-label**: `?wl=` da URL persistido em `localStorage.mitra_wl` e repassado ao iframe.
- Troca de token derruba e recria o iframe (`if(token && token!==tk && f){ f.remove() … }`).

| Achado | Classificação | Motivo |
|---|---|---|
| Handshake `loaded → init → ready → opened` | **ADOPT** | Resolve a corrida clássica de iframe sem `setTimeout` |
| Confirmação de estado pelo iframe antes do host mostrar | **ADOPT** | Sem flash de painel vazio |
| Modo push/overlay/full por razão, não por breakpoint fixo | **ADOPT** | Responsivo de verdade, e são 3 constantes |
| Token repassado por `postMessage` com `targetOrigin:"*"` | **REJECT** | Vaza token para qualquer frame que escute. Tem que ser origem explícita |
| Embed distribuído como script inline copiável | ADAPT | Ótimo para adoção; nós devemos versionar como loader hospedado |

### 32.5 Canais de conteúdo (contexto de produto)

| Canal | URL | O que é |
|---|---|---|
| Comunidade | `comunidade.prod.mitralab.io` | App Mitra (p/51210). Rotas: `/feed`, `/forum`, `/imersoes`, `/agenda`, `/videos`, `/certificados`, `/ranking`, `/pontos`, `/conquistas`, `/pesquisas`, `/robo`, `/gestao-imersoes`, `/analytics`. Gamificação completa (pontos, ranking, conquistas, certificados) |
| Ajuda | `ajudamitra.prod.mitralab.io/publico` | Base de conhecimento oficial, **13 artigos**, tags Mitra/Sankhya/Técnico/Usuário. Lançada 23/07/2026 |
| Tutorial Claude | `tutorialclaud.prod.mitralab.io` | Passo a passo de conexão da assinatura Claude |
| Store | dentro do studio | Templates gratuitos do time (HCM, FP&A). Lançada 22/07/2026 |

Sinais de roadmap extraídos do feed (baixa confiança, mas úteis): o post de 09/07/2026 posiciona **MCP como a camada de integração** que a Mitra pretende ocupar (*"expor dados via server functions e disponibilizá-los via MCP para que agentes operem com contexto real de negócio"*) e cita **A2A** como protocolo agente↔agente. Multi-agente aparece como *tese de mercado no blog*, **não** como recurso do produto — nada nos 367 chunks, nada no SDK, nada na documentação oficial.

| Achado | Classificação | Motivo |
|---|---|---|
| Dogfooding total (comunidade, ajuda, tutorial = apps da própria plataforma) | **ADOPT** | Prova de capacidade e loop de feedback real. Vale como política |
| Publicar o prompt de construção do produto-exemplo como anexo | **ADOPT** | Melhor peça de developer relations que eles têm |
| Gamificação/comunidade como parte do produto | DEFER | Fora do escopo do Conexus agora |
| MCP como estratégia de integração declarada | REFERENCE | Confirma que a aposta em MCP é direcional, não experimento |

---

## 33. Banco de dados interno — veredito de cobertura e as correções da fonte oficial

> Responde diretamente à pergunta: *"mapeou a database interna, como usa as tabelas, lógica?"*
> Fonte: artigo oficial **"A base de dados do seu projeto: como ela nasce e por que cada projeto é isolado"** (05/08/2026, 16 min de leitura) + evidência de runtime das seções anteriores.

**Veredito honesto**: estava mapeado em ~70%. O que existia (§16.3-16.4 camadas de dado, §21.3 espelho Oracle→MySQL, §22 migrations, §25.4 endpoints freeDB, §29.3 permissão por tabela) estava **correto mas incompleto**, e havia **dois erros de modelo** que só a fonte oficial expôs. Agora está fechado.

### 33.1 Como o banco nasce e como é preenchido

- **Todo projeto nasce com um MySQL próprio.** Não há etapa de provisionar. *"No momento em que um projeto é criado, ele já vem com um banco de dados MySQL próprio."* Nele ficam tabelas, dados, **server functions** e configurações do projeto.
- **Três pontos de partida**: do zero (descrição em linguagem natural → estrutura de tabelas gerada), a partir de **template da Store**, ou **duplicando projeto** (leva dados, telas, funções, variáveis, integrações e configurações).
- **Você não desenha o banco.** *"não é necessário entregar um modelo de dados pronto, nem escrever SQL"* — descreve-se o processo e a estrutura é derivada. A conversa técnica não some, muda de momento: de *"quais tabelas"* para *"como o processo funciona"*.
- **Quatro formas de popular**, coexistindo: cadastro pelas telas; **CSV pelo próprio usuário na tela**; importação periódica agendada de outro sistema (§21.3); **consulta em tempo real na origem** (nada armazenado).

### 33.2 Isolamento — o modelo preciso

| Camada | Isolamento |
|---|---|
| Banco | **schema MySQL independente por projeto** |
| Execução | backend + servidor de integrações + banco em **container Docker dedicado por projeto** |
| Credenciais de integrações externas (tokens, chaves, senhas de API) | **servidor apartado**, dedicado a integrações — **não ficam no banco do projeto** |
| Credenciais de conexão com bancos externos | **criptografadas dentro do próprio banco** do projeto |

A Mitra faz questão de delimitar o que isso **não** é: *"banco isolado por projeto em container dedicado, não servidor físico exclusivo por projeto"*. Isolamento de infraestrutura maior (instância exclusiva, buckets dedicados, on-premise) existe **contratado à parte**.

Hierarquia e a pegadinha de segurança:

```
Workspace (agrupa projetos, define quem cria/exclui, controla acesso global)
  ├── Projeto A → banco próprio, usuários próprios
  ├── Projeto B → banco próprio, usuários próprios
  └── Projeto C → banco próprio, usuários próprios
```

> *"quem é Owner ou Administrador do Workspace entra em todos os projetos daquele workspace, sempre como desenvolvedor (…) Se dois conjuntos de dados não podem ter nenhum administrador em comum, eles não devem estar no mesmo workspace."*

Dois papéis por projeto: **dev** (constrói; acessa banco, conexões, importações, integrações) e **business** (usa o app publicado; **não** acessa banco, integrações nem estrutura).

### 33.3 As duas correções que a fonte oficial impõe ao mapa

**(1) `/tenant_{projectId}/` no S3 e "um banco por projeto" fecham o mesmo modelo.** O tenant da Mitra **é o projeto**, não o workspace. Isso valida o §32.2 e explica por que `jdbcConnectionConfigId` (§25) precisa ser propagado explicitamente: dentro de um projeto pode haver múltiplas conexões, mas nunca cruzamento entre projetos.

**(2) O §27 está incorreto sobre o escopo do promote DEV→PROD.** O §27 descreveu PROD como *"ambiente de produção separado, com banco e migrations próprios"*. A documentação oficial diz o oposto, e é explícita:

> *"Quando um projeto tem ambientes separados de desenvolvimento e produção, essa separação vale para o frontend — as telas. **O banco de dados e as Server Functions são os mesmos nos dois.**"*
> *"executar uma função de servidor que grava ou apaga dados afeta a base real, mesmo estando 'no ambiente de desenvolvimento'. **Não existe base de teste separada por padrão.**"*

Como reconciliar honestamente, sem escolher a versão conveniente:

- O §27 foi derivado do bundle `LabSidebar` (`promoteFirstTime` → `{prodProjectId, tag}`, `step_apply` = *"Apply PROD migrations"*), que é o pipeline **novo, de projetos code-builder**, e de fato cria um **projeto PROD linkado** — e projeto novo implica banco novo, pelo modelo de 33.2.
- O artigo (05/08/2026) descreve a plataforma **na visão geral / trilha no-code legada**, onde "publicar" é publicar telas.
- **Portanto convivem dois modelos de publicação** — o §24 (publish = snapshot de telas, banco compartilhado) e o §27 (promote = projeto PROD forkado, banco próprio) — e o artigo descreve o primeiro. Marcar o §27 como *válido apenas para a trilha code-builder/promote*.
- **Não verificado por evidência direta**: se o promote realmente cria schema novo e roda as migrations num banco vazio. É o único ponto do mapa que permanece inferido dos dois lados. Para fechar seria preciso rodar um promote real e comparar dados entre DEV e PROD.

**(3) Banco e SFs não são versionados — só o frontend é.**

> *"O banco de dados e as Server Functions não são versionados. Alterações em tabelas, em dados e em funções de servidor passam a valer imediatamente, para todos os usuários."*

Isto **contextualiza** (não contradiz) o §22: `backend/migrations/` + `migrations.yaml` **registram** a história de DDL/SF de forma append-only, mas **não são um gate de deploy** — a mudança já valeu no instante em que a SDK executou o DDL. A migration é **log de auditoria e insumo de promote**, não trava de publicação. Isso reinterpreta o achado que eu chamei de "o mais forte da Mitra" no §3.3: a interceptação é excelente como *registro*, mas não protege produção.

### 33.4 Respostas diretas (tabela oficial, reproduzida)

| Pergunta | Resposta |
|---|---|
| Um projeto pode consultar a tabela de outro? | Não |
| Dois clientes em projetos diferentes compartilham base? | Não |
| Usuário do Projeto A enxerga dados do Projeto B? | Não, salvo autorização também no B |
| Erro de consulta num projeto afeta outro? | Não — bancos e containers separados |
| Existe base de teste separada da de produção? | **Não** — banco e SFs são os mesmos; a separação dev/prod vale para as telas |
| Admin do workspace enxerga todos os projetos? | **Sim**, como desenvolvedor |

### 33.5 Integração entre projetos — confirmação do §16.5

O isolamento *"não tem modo desligado"*. Para dois projetos conversarem: alguém com permissão no **projeto de origem** gera uma **chave de API** e entrega a quem configura o projeto consumidor. Acesso *"não é automático nem implícito"*. Confirma o caminho (a) do §16.5 e reforça que a via (b) — compartilhar `jdbcConnectionConfigId` — é exceção, não padrão.

### 33.6 Classificação

| Achado | Classificação | Motivo |
|---|---|---|
| Um banco (schema MySQL) + container Docker por projeto, provisionado no create | **ADOPT** | Isolamento por padrão, sem etapa manual. É a fundação certa |
| Credenciais de integração em **servidor apartado**, fora do banco do projeto | **ADOPT** | Separação de domínio de segredo — vale copiar exatamente |
| Credencial de banco externo criptografada no próprio banco | ADAPT | Aceitável, mas inconsistente com a regra acima. Preferimos um único cofre |
| Schema derivado de descrição em linguagem natural | ADAPT | Excelente para começar; precisa de revisão humana antes de virar produção |
| Duplicação de projeto levando **dados** junto | **ADAPT** | Prático e perigoso: duplicar para outro cliente carregando dados do primeiro é vazamento por descuido. Duplicar deve perguntar sobre dados, com default "não" |
| **Sem ambiente de teste de dados por padrão** | **REJECT** | O maior risco operacional da plataforma: SF destrutiva rodada "em dev" apaga produção |
| **Banco e SFs não versionados; mudança vale na hora** | **REJECT** | Incompatível com operação séria. Migration tem que ser gate, não só log |
| Owner/Admin de workspace entra em todo projeto como dev | **REJECT** | Privilégio implícito não-revogável quebra qualquer segregação. Precisa ser explícito e auditável |
| Isolamento sem "modo desligado"; cruzar projetos exige chave de API emitida na origem | **ADOPT** | Compartilhamento explícito, unidirecional e revogável |
| `dbAction` / `dataLoader` / `serverFunction` como três registries por id | **ADOPT** | Fecha a lacuna do §19.1 — ver §32.3 |

### 33.7 Estado do mapa após esta rodada

| Lacuna listada no §19.1 | Estado agora |
|---|---|
| `dbActions` — semântica exata | **FECHADA** (§32.3 — assinatura do bundle de produção) |
| Protocolo interno de `migrations.yaml` | **Parcial → contextualizada** (§33.3: é log de auditoria, não gate; formato interno segue não extraído) |
| Framework agêntico / criação de agentes | **FECHADA** (§31 — fonte oficial) |
| System prompt / skills do agente | **FECHADA** (§31.4, §31.5 — corrige o §30) |
| Runtime do app publicado | **FECHADA** (§32) |
| Payload real do `preview` de promote | Aberta (só i18n) |
| Promote cria banco novo? | **Aberta e explicitamente contraditória** (§33.3) — único conflito de fontes não resolvido do mapa |

---

# 34. Dissecação de um projeto real de ponta a ponta — "Analisador de Orçamentos" (w 146638 / p 55833)

> **Fonte primária desta seção**: o código-fonte real de um projeto entregue e validado, lido
> integralmente via `GET /api/mitra-agent/github-files/146638/55833/content?path=…`.
> Nenhuma inferência: tudo aqui é citação do repositório.
>
> Esta é a seção que responde à pergunta de fundo do projeto Conexus:
> **"o padrão da Mitra é workflow, skill, ou código gerado por LLM?"**
> Resposta curta: **é código gerado por LLM, disciplinado por um `CLAUDE.md` de plataforma e por um
> SDK de build-time.** Não há workflow engine. Não há orquestrador de agentes. O "padrão" é uma
> convenção de arquivo + um SDK + um protocolo de turno.

## 34.1 O achado central: `mitra-sdk` vs `mitra-interactions-sdk`

São **dois SDKs distintos**, e a distinção é a espinha dorsal de toda a arquitetura Mitra:

| SDK | Onde roda | Quem chama | O que pode fazer |
|---|---|---|---|
| **`mitra-sdk`** | Sandbox E2B (build time) e dentro de SFs `JAVASCRIPT` (runtime) | O **agente**, via `node script.mjs` | `runDdlMitra`, `runDmlMitra`, `runQueryMitra`, `createServerFunctionMitra`, `updateServerFunctionMitra`, `listServerFunctionsMitra`, `executeServerFunctionMitra` |
| **`mitra-interactions-sdk`** | Browser do usuário final (runtime) | O **app React publicado** | `executeServerFunctionMitra`, `executeDbAction`, `getAgentTaskMitra`, `manageAgentCredentialMitra` |

O `mitra-sdk` é o **privilegiado**: tem DDL e DML arbitrários. O `mitra-interactions-sdk` é o
**restrito**: só executa artefatos previamente registrados, por id numérico. Essa assimetria é o
modelo de segurança inteiro da plataforma — **o poder mora no build, não no runtime**.

Configuração do SDK de build (idêntica nos 3 scripts do projeto):

```js
configureSdkMitra({
  baseURL:         process.env.MITRA_BASE_URL,
  token:           process.env.MITRA_TOKEN,
  integrationURL:  process.env.MITRA_BASE_URL_INTEGRATIONS,
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
```

→ O sandbox recebe `.env` com `MITRA_TOKEN` + `MITRA_PROJECT_ID`. **O agente nunca vê a senha do
banco**: fala com o banco pela API autenticada da plataforma. Isso é o que torna "o agente tem DDL"
aceitável — o escopo é o projeto, garantido do lado do servidor.

**Conexus**: **ADOPT integral.** Dois SDKs, dois níveis de privilégio, fronteira no `projectId`
derivado do token. É a decisão de arquitetura mais reaproveitável do mapa inteiro.

## 34.2 Anatomia real do repositório

```
backend/
  setup-backend.mjs     19.616  DDL (8 tabelas) + 9 SFs INTEGRATION + 3 SFs JAVASCRIPT
  add-analytics.mjs     19.628  28 SFs SQL analíticas (aditivo, não toca no de cima)
  importar.mjs           2.923  orquestrador de carga inicial (backfill por período)
  testar-sfs.mjs         3.181  suíte de fumaça: 31 chamadas reais de SF
frontend/src/lib/
  sf-ids.ts                988  GERADO — mapa nome→id numérico
  api.ts                 4.255  callSF / callSFOne / runSF + formatadores pt-BR
  mitra-auth.ts          2.287
CLAUDE.md                7.924  gerado pela plataforma (protocolo de turno)
integracao-sankhya.md    6.122  descobertas da fase de discovery
featuresearquitetura.md  6.611  o quê e por quê
ux.md / design.md        3.322 / 4.427
tasks.md                 4.637  o razão de execução
uploads/spec-…md        10.098  o prompt original do usuário, anexado
```

**Leitura**: o backend inteiro do projeto são **4 scripts Node**. Não existe "servidor". Existe um
programa que **provisiona** o servidor da plataforma e depois é descartado (mas fica versionado).

## 34.3 O padrão de provisionamento idempotente (o coração da coisa)

Todo script de backend segue exatamente esta forma:

```js
const existentes = await listServerFunctionsMitra({ projectId });
const mapa = {};
for (const sf of (existentes?.result ?? existentes ?? [])) mapa[sf.name] = sf.id;

const ids = {};
for (const def of TODAS) {
  if (mapa[def.name]) {                       // já existe → UPDATE
    await updateServerFunctionMitra({ projectId, serverFunctionId: mapa[def.name],
                                      code: def.code, description: def.description });
    ids[def.name] = mapa[def.name];
  } else {                                    // não existe → CREATE
    const r = await createServerFunctionMitra({ projectId, ...def });
    ids[def.name] = r?.result?.serverFunctionId ?? r?.result?.id ?? r?.id;
  }
}
```

Três propriedades que valem ouro:

1. **Idempotência por `name`.** O nome é a chave lógica; o id numérico é detalhe de implementação.
   Rodar o script 10 vezes dá o mesmo resultado. Resolve o problema do §27 ("SFs não são
   versionadas") — **o script é a versão**.
2. **DDL idempotente**: todo `CREATE TABLE IF NOT EXISTS`. O agente nunca faz `DROP`.
3. **Aditividade declarada**: `add-analytics.mjs` abre com
   `"ADITIVO: cria/atualiza apenas Server Functions SQL … NAO executa DDL, NAO toca em dados, NAO
   altera as SFs de importacao (sk_* / imp_*)"`. O agente **escreveu um contrato para si mesmo**
   no topo do arquivo, e o segundo script honra o primeiro.

### O elo perdido: `sf-ids.ts` é um artefato de build

Aqui está a peça que faltava para entender como um frontend legível conversa com uma API de ids
numéricos:

```js
writeFileSync('../frontend/src/lib/sf-ids.ts',
  '// GERADO POR backend/setup-backend.mjs — nao editar a mao\n' +
  'export const SF = ' + JSON.stringify(ids, null, 2) + ' as const;\n');
```

E o segundo script **faz merge, não sobrescreve**:

```js
let anteriores = {};
try { const txt = readFileSync(alvo,'utf8');
      anteriores = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}')+1)); } catch {}
const todos = { ...anteriores, ...ids };
```

Resultado versionado (40 SFs):

```ts
export const SF = { "sk_vendedores": 2, /* … */ "imp_incremental": 12,
                    "dash_kpis": 13, /* … */ "int_cobertura": 40 } as const;
```

O comentário do agente explica *por que* o hack existe:
`"IDs ficam versionados para o frontend consumir (o SDK desta versao nao expoe variaveis)"`.

> **Isto é uma limitação da Mitra que o agente contornou com codegen.** O `missao-playground`
> (§31.6) dá a mesma ordem por outro caminho: *"mapa construído do registry de SFs, NUNCA IDs
> hardcoded"*.
>
> **Conexus — REJECT o sintoma, ADOPT o remédio errado como aviso:** artefatos devem ser
> endereçáveis por **nome estável**, não por id auto-incremento. Se a API expusesse
> `callFunction('dash_kpis')`, `sf-ids.ts` não existiria. **Chave natural desde o dia 1.**

## 34.4 Os três tipos de Server Function têm **três sintaxes de parâmetro diferentes**

Esta é a inconsistência mais cara da plataforma, e só ficou visível com o código na mão:

| Tipo | Binding | Exemplo real |
|---|---|---|
| `INTEGRATION` | `event.x` **dentro de string SQL**, substituído textualmente | `OFFSET TO_NUMBER('event.offset') ROWS` |
| `JAVASCRIPT` | `event.x` como **variável global JS** | `const dtIni = event.dtIni ?? '2024-01-01'` |
| `SQL` | `{{x}}` mustache, **sempre entre aspas** | `AND ('{{vendedor}}'='' OR o.CODVEND='{{vendedor}}')` |

Nenhum dos três é *bind parameter* de verdade. **Todos são interpolação de string.**

### Consequência 1 — o padrão de parâmetro opcional

Como não há bind, "filtro opcional" vira um idioma:

```sql
AND ('{{vendedor}}'='' OR o.CODVEND='{{vendedor}}')
```

Uma única SF serve filtrada e não-filtrada. O frontend sempre manda todas as chaves, vazias quando
não aplicáveis (ver `VAZIO = { vendedor:'', cliente:'', faixa:'', mes:'' }` em `testar-sfs.mjs`).

### Consequência 2 — injeção é mitigada por convenção, não pelo motor

O agente reconheceu o risco e escreveu a mitigação **no cabeçalho do arquivo**:

```
 *   - Filtros por CODIGO (numerico), nunca por nome — evita quebra com apostrofo
```

E no frontend, uma segunda barreira:

```ts
/** Remove caracteres que quebrariam a string SQL da Server Function. */
export const limpar = (v: string) => String(v ?? '').replace(/['"\\%;]/g, '').trim();
```

> **Conexus — REJECT frontal.** Interpolação de string em SQL, com sanitização por regex no
> **cliente**, é vulnerabilidade por design: quem chamar a SF fora do app (o SDK é público, o id é
> numérico e sequencial) pula o `limpar()` inteiro.
> **Conexus usa bind parameters reais.** Parâmetro opcional se resolve com `(:vendedor IS NULL OR
> col = :vendedor)`, que é o mesmo idioma **sem** a superfície de ataque.

## 34.5 SFs `INTEGRATION` são HTTP declarativo, não código

```js
const intSF = (name, sql, description) => ({
  name, type: 'INTEGRATION', description,
  code: JSON.stringify({
    connection: 'sankhya',
    method: 'POST',
    endpoint: '/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json',
    body: { serviceName: 'DbExplorerSP.executeQuery', requestBody: { sql } },
  }),
});
```

O `code` de uma SF `INTEGRATION` é **um JSON**, não um script: `{connection, method, endpoint,
body}`. `connection: 'sankhya'` referencia a credencial registrada no projeto — **a credencial
nunca aparece no código nem no repositório**. Todo o `event.x` do corpo é interpolado pelo servidor.

**Conexus — ADOPT.** Conector declarativo + referência simbólica à credencial é a forma certa. É o
que permite o repositório ser público-safe.

## 34.6 SFs `JAVASCRIPT`: o agente escreve um runtime dentro de uma string

`imp_dimensoes`, `imp_periodo` e `imp_incremental` são geradas por **template literal**, todas
prefixadas por um bloco `JS_HELPERS` compartilhado. Dentro da SF, `require('mitra-sdk')` está
disponível — é assim que uma SF chama outra SF e roda DML.

**Helper de paginação** (contorna o teto de 5.000 linhas do DbExplorer do Sankhya):

```js
async function fetchAll(sfId, baseInput) {
  const todas = []; let offset = 0;
  for (;;) {
    const rows = await fetchPage(sfId, Object.assign({}, baseInput, { offset, limite: PAGE }));
    todas.push.apply(todas, rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
    if (offset > 400000) throw new Error('Paginacao excedeu o teto de seguranca');
  }
  return todas;
}
```

**Upsert em lote** — comentado `"nunca linha a linha"`, chunks de 400:

```js
await sdk.runDmlMitra({ projectId,
  sql: 'INSERT INTO ' + tabela + ' (' + colunas.join(',') + ') VALUES ' + values +
       ' ON DUPLICATE KEY UPDATE ' + sets });
```

**Cursor incremental auto-derivado** — sem estado externo:

```js
// Cursor derivado dos proprios dados: auto-corrige e dispensa estado externo.
// Recuo de 1h cobre transacoes em voo no momento da ultima sync.
const qr = await sdk.runQueryMitra({ projectId, sql:'SELECT MAX(DTALTER) AS M FROM ORCAMENTOS' });
// … d.setUTCHours(d.getUTCHours() - 1);
```

**Toda importação é instrumentada**: `etapas.{entidade}_ms`, `etapas.{entidade}` (contagem), e um
`log()` final que grava em `LOG_IMPORTACOES` com `ETAPAS_JSON`, `DURACAO_MS`, `PARAMETROS` e o erro
truncado em 900 chars. O `try/catch` registra sucesso **e** falha antes de re-lançar.

**Detalhe de robustez que denuncia experiência real:**

```js
// placeholders para CODVEND=0 / CODPARC=0 (existem no Sankhya) — evita quebra de FK
INSERT INTO VENDEDORES VALUES (0,'SEM VENDEDOR','-','N') ON DUPLICATE KEY UPDATE …
```

**Conexus — ADOPT o padrão, REJECT o veículo.** Paginação-até-esgotar com teto de segurança, upsert
em chunk, cursor derivado do dado e log estruturado por etapa são exatamente o que queremos. Mas
gerar isso como **string dentro de template literal** é frágil — a própria Mitra documenta a
armadilha em §31.6 (*"`\s` vira `s`; regexes precisam de `\\s` NO ARQUIVO"*). Em Conexus, código
de job é **arquivo de verdade**, não string.

## 34.7 A camada analítica: composição por fragmento SQL

`add-analytics.mjs` não escreve 28 queries — escreve **constantes e as compõe**:

```js
const DIAS_PARADO = `DATEDIFF(CURDATE(), o.DTALTER)`;
const FAIXA = `CASE WHEN ${DIAS_PARADO} <= 3 THEN 'Janela de ouro' … END`;
const FATOR = `CASE WHEN ${DIAS_PARADO} <= 3 THEN 1.00 WHEN … <= 7 THEN 0.45
                    WHEN … <= 30 THEN 0.20 ELSE 0.05 END`;
const PENDENTE = `o.PENDENTE='S' AND o.TEM_DERIVADO='N'`;
const BASE = `FROM ORCAMENTOS o JOIN VENDEDORES v ON … JOIN CLIENTES cl ON … WHERE ${PENDENTE}`;
const fVend = `AND ('{{vendedor}}'='' OR o.CODVEND='{{vendedor}}')`;
```

Uma SF vira uma linha de composição:

```js
sql('dash_por_vendedor', `
SELECT v.APELIDO AS name, o.CODVEND AS code, COUNT(*) AS QTD,
       ROUND(SUM(o.VLRNOTA),2) AS value, ROUND(AVG(${DIAS_PARADO}),0) AS PARADO_MEDIO
${BASE} ${fCli} ${fFaixa} ${fMes}
GROUP BY v.APELIDO, o.CODVEND ORDER BY value DESC`, '…'),
```

**A regra de ouro do cross-filter**, declarada no cabeçalho e visível na composição acima:

```
 *   - Cross-filter: a SF de X nunca recebe o proprio {{x}}
```

`dash_por_vendedor` recebe `fCli`, `fFaixa`, `fMes` — **mas não `fVend`**. É por isso que clicar num
vendedor filtra os outros gráficos sem apagar o próprio. Regra de uma linha que resolve um problema
de BI inteiro.

**Contrato de nomes de coluna**: `name` / `value` / `code` em toda SF de gráfico → um componente
`Chart.tsx` genérico consome qualquer uma sem adaptador, e `code` carrega a chave para o drill.

**Conexus — ADOPT integral.** Fragmentos SQL nomeados + regra "X não filtra X" + contrato
`name/value/code`. É barato, testável, e é o que dá coerência semântica ao dashboard inteiro.

## 34.8 A borda frontend: um adaptador de 3 funções

`api.ts` inteiro cabe em três funções + formatadores. O interessante é o **normalizador defensivo**:

```ts
function extractOutput(res: any): any {
  let output = res?.result?.output;
  if (typeof output === 'string') { try { output = JSON.parse(output); } catch {} }
  if (output && typeof output === 'object' && Array.isArray(output.result)) return output.result;
  return output;
}
```

→ **A API da Mitra devolve o mesmo dado em três formas diferentes**: string JSON, `{result:[…]}`, ou
objeto direto. O agente descobriu isso na prática e blindou num único ponto. Erro vem por
`res.result.executionStatus === 'FAILED'` + `res.result.error` — **HTTP 200 com falha no corpo**.

`callSF` → linhas · `callSFOne` → primeira linha (KPIs) · `runSF` → output bruto (jobs).

Detalhe revelador de banco:

```ts
/** O banco não aceita acentos nesse rótulo; a interface exibe acentuado. */
export const rotuloFaixa = (nome: string) => (nome === 'Reativacao' ? 'Reativação' : nome);
```

→ Encoding do MySQL do projeto não fecha com acento em literal SQL. O agente **não escondeu**:
armazenou sem acento e traduziu na borda de apresentação, com o porquê no comentário.

**Conexus — REJECT o problema (UTF-8 fim a fim, não negociável), ADOPT a disciplina**: quando a
plataforma tem um defeito, isolar num único ponto de borda e **comentar a razão**.

## 34.9 A suíte de testes — e o que ela prova sobre o protocolo

`testar-sfs.mjs` (3.181 bytes) lê o `sf-ids.ts` gerado, roda **31 chamadas reais** e encadeia
estado — pega um `NUNOTA` de uma consulta e injeta nas seguintes:

```js
const params = JSON.parse(JSON.stringify(input).replace('{NUNOTA}', String(nunota ?? 0)));
```

Cobre caso base **e** caso filtrado para cada SF crítica
(`['dash_kpis', VAZIO]` + `['dash_kpis (filtro vendedor)', {…, vendedor:'1128'}]`), conta `falhas`
e sai com código de erro.

> **É a única forma de teste possível nesta plataforma.** Não há ambiente de teste (§27/§33): o
> banco de DEV *é* o banco. Então o "teste" é **smoke test contra produção**, e a única razão de ser
> seguro é que as 28 SFs analíticas são `SELECT`.
>
> **Conexus — este é o gap mais claro para nos diferenciarmos.** Ambiente efêmero + fixtures +
> asserção de valor (não só "não explodiu"). Aqui a Mitra tem um teto real.

## 34.10 O ciclo de trabalho reconstruído (o que o usuário perguntou)

Cruzando `tasks.md` (o razão), `CLAUDE.md` (o protocolo) e os artefatos:

```
Fase 1  DISCOVERY      → agente consulta o ERP e escreve integracao-sankhya.md
                          (descobre: CODTIPOPER IN (14,714); TGFTOP.ORCAMENTO='S' está errado;
                           VLRCUS não é custo em 94,8% dos itens)
Fase 2  ARQUITETURA    → decide importação vs. tempo real, com justificativa escrita
Fase 3  ALINHAMENTO    → confirma definições canônicas com o usuário
Fase 4  CHECKPOINT     → contrato aprovado ANTES de escrever código
Fase 5  PLANEJAMENTO   → featuresearquitetura.md → ux.md → design.md
Fase 6  IMPLEMENTAÇÃO  → setup-backend.mjs → importar.mjs → add-analytics.mjs → telas
Fase 7  TESTE          → testar-sfs.mjs (31 SFs) + smoke headless em 8 cenários
Fase 8  REVISÃO        → confronto item a item contra o prompt original (uploads/spec-…md)
```

Sobreposto a isso, o protocolo de turno do `CLAUDE.md` (§ anterior):
`SYNC → BACKEND → FRONTEND → BUILD → SHARE`, **todo turno, inclusive para "oi"**.

### O que produz a qualidade — veredito

Não é workflow engine. Não é agent framework. São **quatro coisas empilhadas**:

| # | Mecanismo | Onde vive | Força |
|---|---|---|---|
| 1 | Protocolo de turno rígido | `CLAUDE.md` gerado pela plataforma | **Alta** — é regra, não sugestão |
| 2 | Documentos de planejamento como artefato versionado | `*.md` no repo | **Alta** — decisão fica auditável e o agente relê |
| 3 | SDK de build-time privilegiado | `mitra-sdk` | **Alta** — dá poder real sem dar a senha |
| 4 | Scaffold byte-idêntico | UI kit (`Chart.tsx`, `useDrill.ts`, `LoginPage.tsx`) | **Média** — garante o piso visual, não o teto |

O item 2 é o que mais surpreende: **o agente escreve documentos que depois usa como contexto**.
`add-analytics.mjs` abre com `"Definicoes canonicas (ver integracao-sankhya.md)"`, e
`featuresearquitetura.md` abre com `"Base: integracao-sankhya.md"`. É **memória externalizada em
arquivo versionado** — barata e eficaz.

## 34.11 Honestidade do agente — o traço mais copiável

O projeto **declara o que não conseguiu fazer**, em tabela, com encaminhamento:

| # | Limitação | Impacto | Encaminhamento |
|---|---|---|---|
| 1 | `VLRCUS` não é custo — 91.856 de 96.936 itens (94,8%) idênticos ao `VLRUNIT` | Margem não é calculável | **Margem fora da Fase 1** |
| 2 | Não há vínculo usuário Mitra ↔ `CODVEND` | Tela do vendedor usa seletor | Mapear por e-mail quando houver de-para |
| 3 | `TGFPRO.MARGLUCRO` média 3,6 | Parece markup, não percentual | Validar na Fase 2 |
| 4 | Sem rotina de expiração de orçamento | 37 orçamentos 90d+ vivos | Pendência aberta |

E o §8 fecha: `"Fase 2 (fora deste escopo) … Depende de resolver a limitação #1."`

O agente **cancelou uma feature pedida** (margem) porque o dado não sustenta, disse o número que
prova, e não entregou um gráfico bonito com dado errado.

> **Conexus — ADOPT como requisito de produto, não como virtude.** O deliverable deve **exigir**
> um bloco "Limitações conhecidas" com evidência numérica, e critérios de aceite verificáveis
> (`"Pendentes na tela = 187 / R$ 6.283.878 (bate com o Sankhya)"`), não subjetivos.

## 34.12 Por que a aba "Código" aparece vazia — diagnóstico fechado

Confirmado por leitura do bundle (`useCodeBuilder.2qVY5YjV.js`) e por chamada direta à API:

1. **A aba Código lê o GitHub, não o sandbox.**
   `GET /api/mitra-agent/github-files/{ws}/{proj}` → só enxerga o que já foi **pushado** pelo SHARE.
   Trabalho feito no turno atual e ainda não compartilhado **não aparece**.
2. **Todo erro vira lista vazia**, indistinguível de "projeto sem código":
   ```js
   catch (a) { console.error("Failed to load files:", a);
               o.value = a.message || "Failed to load files"; $.value = [] }
   ```
   Sessão expirada, 403 ou repo indisponível renderizam a mesma tela em branco.
3. **O painel de Git está morto neste deploy.** `/api/e2b-git/{ws}/{proj}/log`, `/metadata` e
   `/branches` retornam **o shell HTML do SPA, não JSON** — rota Nitro ausente. Por isso branch,
   histórico e troca de branch não funcionam pela UI. *(Verificado nesta sessão, ws 146638/p 55833.)*
4. **O código de 55833 está íntegro e legível** — todos os arquivos desta seção foram lidos pela
   API. **Não é perda de dados; é falha de superfície.**

**Contorno imediato**: `https://agent.mitralab.io/api/mitra-agent/github-files/146638/55833`
(logado) devolve a árvore, e `…/content?path=backend/setup-backend.mjs` devolve o arquivo.

**Conexus — REFERENCE (lição negativa).** Nunca colapsar erro em estado vazio. `vazio`, `carregando`
e `falhou` são três estados distintos na UI, sempre.

## 34.13 Placar de decisões desta seção

| Achado | Decisão Conexus |
|---|---|
| Dois SDKs (build privilegiado / runtime restrito) | **ADOPT** — arquitetura central |
| Provisionamento idempotente por `name` em script versionado | **ADOPT** |
| Conector `INTEGRATION` declarativo com credencial simbólica | **ADOPT** |
| Fragmentos SQL nomeados + "X nunca filtra X" + contrato `name/value/code` | **ADOPT** |
| Paginação com teto, upsert em chunk, cursor derivado, log por etapa | **ADOPT** |
| Doc de planejamento como memória versionada que o agente relê | **ADOPT** |
| "Limitações conhecidas" + critérios de aceite numéricos obrigatórios | **ADOPT** |
| Três sintaxes de parâmetro (`event.x` textual / `event.x` global / `{{x}}`) | **REJECT** — uma só |
| Interpolação de string em SQL + sanitização por regex no cliente | **REJECT** — bind params |
| Ids numéricos sequenciais → `sf-ids.ts` gerado | **REJECT** — chave natural por nome |
| Código de job como string em template literal | **REJECT** — arquivo real |
| Smoke test contra o banco de produção (não há ambiente de teste) | **REJECT** — efêmero + fixtures |
| Erro colapsado em estado vazio na UI | **REJECT** — 3 estados |
| Scaffold/UI kit byte-idêntico versionado | **ADAPT** — bom piso, precisa de escape hatch |
