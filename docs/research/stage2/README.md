# Memória da pesquisa do Stage 2

**Natureza:** reconstrução histórica, não autoridade de produto nem plano de execução.
**Origem:** conversa de planejamento R01–R13, correções do operador e revisões Claude/Astra fornecidas nessa conversa.
**Recuperado em:** 2026-09-23.

Esta pasta preserva o que motivou a pesquisa de bibliotecas e SDKs antes da implementação. O registro anterior manteve a direção e uma fila resumida de tecnologias, mas perdeu boa parte das alternativas, exemplos, limites e testes imaginados. O consumidor é quem chegar a uma capacidade futura e precisar entender o que já foi considerado, sem reconstruir a conversa.

O [roadmap](../../roadmap.md) continua sendo o dono da próxima ação. A [referência da plataforma gerenciada](../../reference/stage2-managed-application-platform.md) e o [registro de decisões](../../decisions/index.md) continuam sendo os donos do desenho aceito. Esta pasta não altera Q2, não autoriza dependências, não cria tasks e não obriga ninguém a executar todos os experimentos descritos.

## Leitura por pergunta

| Pergunta | Memória recuperada |
| --- | --- |
| Como o Builder aprende nosso padrão sem carregar um prompt enorme? | [Builder, Skills e SDK](builder-and-sdk.md) |
| Por que discutimos Prisma, Drizzle, Kysely, Hono, oRPC e migrations? | [Dados, runtime e autenticação](data-runtime-auth.md) |
| Por que pg-boss, Dynamic Workflows, Inngest e Trigger.dev apareceram? | [Eventos, jobs e automações](events-and-automations.md) |
| Como Sankhya, Oracle, MCP, Nango, notificações e sync se relacionavam? | [Connectors, notificações e dados externos](connectors-and-notifications.md) |
| Por que chegamos a OCI/Cloud Run e depois recuamos para managed apps? | [Observabilidade, isolamento e publicação](operations-and-publish.md) |
| Onde estavam as fontes e quais afirmações precisam ser verificadas? | [Fontes e pendências de verificação](sources-and-revalidation.md) |

## Cobertura das rodadas

| Rodada da conversa | Assunto preservado | Local |
| --- | --- | --- |
| R01 | Dois harnesses, três planos, SDK/Skill/Tool, Workspace, memória e primeiros candidatos | [R01](builder-and-sdk.md#r01-harness-do-agente-e-paved-road-do-aplicativo) |
| R02 | Project Data, topologia, ORM, RLS, Atlas, Supabase e Hasura | [R02](data-runtime-auth.md#r02-project-data-e-alternativas) |
| R03 | Backend, Preview full-stack, bancos descartáveis e last-good Preview | [R03](data-runtime-auth.md#r03-runtime-e-dados-de-preview) |
| R04 | Procedures, Hono/Fastify/oRPC, contexto e tamanho do SDK | [R04](data-runtime-auth.md#r04-procedures-e-o-primeiro-sdk) |
| R05 | Cliente de dados injetado, repository pattern e ZenStack | [R05](data-runtime-auth.md#r05-cliente-de-dados-sem-orm-próprio) |
| R06 | Migrations, Squawk/Atlas/pgroll/Bytebase e seed | [R06](data-runtime-auth.md#r06-migrations-e-ciclo-de-dados) |
| R07 | Identidade, admissão, permissões, CASL/Cerbos/OpenFGA e RLS | [R07](data-runtime-auth.md#r07-autenticacao-e-autorizacao) |
| R08 | Eventos transacionais, jobs, workflows, automação e Signals | [R08](events-and-automations.md#r08-conceitos-que-nao-sao-equivalentes) |
| R09 | Connection/Capability, Nango/Composio/Pipedream, Novu/Knock | [R09](connectors-and-notifications.md#r09-connections-capabilities-e-notificacoes) |
| R10 | Connector SDK, facetas, discovery, código privilegiado e versões | [R10](connectors-and-notifications.md#r10-connector-sdk-e-facetas) |
| R11 | Live query, polling, CDC, webhook e read models | [R11](connectors-and-notifications.md#r11-live-query-sync-e-replicacao) |
| R12 | OpenTelemetry, audit, limites e diagnósticos para o Builder | [R12](operations-and-publish.md#r12-observabilidade-auditoria-e-diagnosticos) |
| R13 | Workloads, OCI, E2B/Cloud Run/Fly, ingress e Publish | [R13](operations-and-publish.md#r13-isolamento-hosting-e-release) |
| Revisão posterior | Correções do operador, Mitra, Claude/Astra e redução do primeiro perfil | [Convergência](operations-and-publish.md#convergencia-para-managed-apps) |

## Como interpretar o conteúdo

Os textos são uma síntese da discussão visível, não uma transcrição integral. Preservam a pergunta, o papel imaginado para cada mecanismo, os argumentos e os experimentos sugeridos. Os exemplos de `ctx.*`, `defineConnector`, `protectedProcedure` e pacotes `@conexus/*` são pseudocódigo histórico. Não são APIs disponíveis ou propostas para implementar neste PR.

Uma afirmação sobre biblioteca significa **“a conversa apresentou essa capacidade”**, a menos que o parágrafo a atribua explicitamente a uma evidência atual do repositório. As URLs foram recuperadas das referências da conversa. Não houve uma nova qualificação dos fornecedores, execução de seus exemplos ou verificação de todos os links externos nesta recuperação.

A discussão continha afirmações específicas de produto, versão, lançamento e garantia que não podem virar fatos por terem sido repetidas. O [registro de pendências](sources-and-revalidation.md#afirmacoes-que-nao-podem-ser-promovidas-a-fatos) destaca esses casos, inclusive Prisma 8/Next, recursos recentes do Mastra, SDK MCP e inferências sobre a infraestrutura do Mitra.

As revisões fornecidas pelo operador eram `stage2-architecture-review.md`, `astra-design.md` e `mitra-sdk-evidence.md`. Esta recuperação resume os pontos pertinentes, não republica os anexos nem afirma que suas inspeções foram refeitas. Os relatórios originais distinguiam leitura de código, inferência e limitações de ambiente; essas distinções são mantidas aqui.

## Evolução das ideias, sem restaurar propostas antigas

A ordem da conversa importa. R02–R05 exploraram aplicativos full-stack com cliente de dados injetado. R03 e R06 chegaram a bancos por candidato para preservar last-good Preview. O operador retirou esse requisito. R13 explorou uma imagem OCI e um workload independente por Project. A revisão posterior reduziu o primeiro perfil a aplicativos gerenciados, com frontend estático e handlers fora do Hub.

Por isso, **adiado não significa escolhido para depois**, e **retirado não significa proibido para sempre**. Significa que a justificativa precisa ser reavaliada contra um consumidor real e o estado do repositório naquele momento. A intenção de preservar pesquisa não reabre decisões nem troca a implementação atual.

Na recuperação, a base lida foi `d474b85323e107c36e6fb209f55622e4f1039ce5`. Seu roadmap registra Q1 fechado e Q2 como próxima qualificação. A referência já relata workers bubblewrap, relay por invocação e SQL parametrizado. Isso é posterior às hipóteses de processo compartilhado sem essa fronteira. Para status vivo, prevalecem os arquivos atuais, não este retrato histórico.

## O que ficou como fio condutor

O operador queria que o agente se concentrasse na lógica pedida e recebesse um caminho técnico conhecido. A pesquisa investigou a combinação de bibliotecas prontas, interfaces pequenas, documentação procedural e verificação. O objetivo não era construir todos os subsistemas de uma vez.

A contribuição reaproveitável desta pasta é o raciocínio: onde uma biblioteca poderia remover trabalho próprio; que fronteira não deveria assumir; qual exemplo ajudaria a comparar; e o que precisaria ser provado antes da adoção. A decisão de quando usar esse material continua fora desta pasta.
