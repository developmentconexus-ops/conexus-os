# Fontes e pendências de verificação

Este é o mapa de referências recuperadas da conversa, não uma bibliografia de fontes novamente auditadas. As URLs abaixo eram pistas citadas nas rodadas. Links podem ter mudado; datas, releases, planos comerciais, disponibilidade em versão instalada e garantias de execução precisam de verificação no uso futuro.

A fonte primária **desta recuperação** é a conversa R01–R13 e as revisões anexadas pelo operador. O material foi sintetizado, não transcrito integralmente. Não foram recuperados logs completos de todos os web/Context7 lookups originais. Nenhuma API ilustrada nos outros arquivos recebe garantia de compilação.

## S1 Mastra e harness

Referências citadas para R01, R08 e R12:

- [Mastra, Agent Harness](https://mastra.ai/blog/announcing-agent-harness).
- [Workshop sobre Harness](https://mastra.ai/workshops/mastras-harness-primitive-2026-06-11).
- [First-class Skills](https://mastra.ai/blog/introducing-first-class-skills).
- [Filesystem Skills](https://mastra.ai/blog/introducing-filesystem-skills).
- [Skill Search Processor](https://mastra.ai/blog/introducing-skill-search-processor).
- [Workspaces](https://mastra.ai/blog/introducing-mastra-workspaces).
- [SDK subagents](https://mastra.ai/blog/introducing-sdk-subagents).
- [Anatomy of a coding agent](https://mastra.ai/blog/anatomy-of-a-coding-agent).
- [Observational Memory](https://mastra.ai/research/observational-memory).
- [Agent Signals](https://mastra.ai/blog/announcing-agent-signals).
- [Dynamic Workflows](https://mastra.ai/blog/introducing-dynamic-workflows).
- [Enhanced Workflows](https://mastra.ai/blog/mastra-workflows-enhanced).
- [Schedules](https://mastra.ai/blog/introducing-schedules-for-agents-and-workflows).
- [Event system](https://mastra.ai/blog/introducing-mastras-event-system).
- [Background tasks](https://mastra.ai/blog/introducing-background-tasks).
- [Temporal workflows](https://mastra.ai/blog/introducing-temporal-workflows).
- [Workflow overview](https://mastra.ai/ai-workflows).
- [Observability](https://mastra.ai/blog/announcing-mastra-observability).

O ponto de entrada verificável no projeto é a [skill Mastra](../../../.agents/skills/mastra/SKILL.md). Tipos, fontes e docs do pacote instalado têm prioridade sobre exemplos de outra versão. O [mapa de fronteiras](../../reference/mastra-boundary.md) registra a composição realmente usada.

As referências OpenAI mencionadas na conversa foram [Harness engineering](https://openai.com/index/harness-engineering/), [Agents API](https://openai.com/index/introducing-the-agents-api/) e [Running Codex safely](https://openai.com/pt-BR/index/running-codex-safely/). A conversa as usou como inspiração de ambiente e feedback, não como evidência de que a mesma arquitetura ou orçamento serviria ao Conexus. Não houve nova consulta a esses textos neste PR.

## S2 Dados e migrations

- PostgreSQL: [schemas](https://www.postgresql.org/docs/17/ddl-schemas.html), [RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [configuração da sessão](https://www.postgresql.org/docs/17/functions-admin.html).
- Drizzle: [migration generation](https://orm.drizzle.team/docs/drizzle-kit-generate), [SQL](https://orm.drizzle.team/docs/sql), [RLS](https://orm.drizzle.team/docs/rls), [release citado](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2).
- Prisma: [ORM](https://www.prisma.io/docs/orm), [release status citado](https://www.prisma.io/docs/orm/release-status), [advanced queries citado](https://www.prisma.io/docs/orm/fundamentals/advanced-queries), [transactions citado](https://www.prisma.io/docs/orm/fundamentals/transactions), [migration planning citado](https://docs.prisma.io/docs/orm/migrations/how-migrations-work), [data migration](https://www.prisma.io/docs/guides/database/data-migration). Os paths ligados a Prisma 8/Next estão em quarentena factual abaixo.
- Kysely: repositório `kysely-org/kysely` consultado via Context7 na conversa. Não foi retido o path exato de cada trecho.
- ZenStack: documentação `zenstack.dev` consultada via Context7. Não foi retido um path exato de versão para o cliente/policy discutido.
- Atlas: [lint analyzers](https://atlasgo.io/lint/analyzers), [migration tests](https://atlasgo.io/testing/migrate), [Dev Database](https://atlasgo.io/concepts/dev-database), [lint e edições](https://atlasgo.io/versioned/lint), [destructive-change policy](https://atlasgo.io/guides/destructive-change-policy).
- Squawk: [repositório](https://github.com/sbdchd/squawk), [safe migrations](https://github.com/sbdchd/squawk/blob/master/docs/docs/safe_migrations.md).
- pgroll: [repositório](https://github.com/xataio/pgroll), [client applications](https://github.com/xataio/pgroll/blob/main/docs/guides/clientapps.mdx), [ORMs](https://github.com/xataio/pgroll/blob/main/docs/guides/orms.mdx).
- Bytebase: [PostgreSQL migrations](https://www.bytebase.com/databases/postgres/schema-migration/).
- Neon: [branching](https://neon.com/branching), [schema-only branches](https://neon.com/blog/instant-branches-schema-only-or-with-data-the-choice-is-yours), [expiração](https://neon.com/blog/expire-neon-branches-automatically).
- PGlite: [projeto](https://pglite.dev/).
- Supabase: [database](https://supabase.com/docs/guides/database/overview), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [third-party auth](https://supabase.com/docs/guides/auth/third-party/overview).
- Hasura: [event triggers](https://hasura.io/blog/announcing-webhook-triggers-on-database-events-for-hasura-graphql-engine-8136c15db3ef).
- Prisma Compute: [overview citado](https://www.prisma.io/docs/compute), [deploy citado](https://www.prisma.io/docs/prisma-compute/deploy), [changelog citado](https://www.prisma.io/changelog/2026-08-28). Não tratado como produto/GA confirmado.

## S3 Runtime auth e autorizacao

- Hono: [Web Standards](https://hono.dev/docs/concepts/web-standard), [Node](https://hono.dev/docs/getting-started/nodejs), [RPC](https://hono.dev/docs/guides/rpc).
- Fastify: [encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/), [validation/serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [type providers](https://fastify.dev/docs/latest/Reference/Type-Providers/).
- oRPC: [middleware](https://v1.orpc.dev/docs/middleware), [contract-first](https://v1.orpc.dev/docs/contract-first/define-contract), [OpenAPI handler](https://v1.orpc.dev/docs/openapi/openapi-handler).
- Keycloak: [admin guide](https://www.keycloak.org/docs/latest/server_admin/), [securing apps, versão citada](https://www.keycloak.org/docs/25.0.6/securing_apps/index.html), [pairwise subjects](https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/protocol/oidc/mappers/AbstractPairwiseSubMapper.html).
- CASL: exemplo citado nas [docs de autorização do NestJS](https://github.com/nestjs/docs.nestjs.com/blob/master/content/security/authorization.md). Não equivale à qualificação do pacote CASL no Conexus.
- Cerbos: [policies](https://docs.cerbos.dev/cerbos/latest/policies/index.html), [Hub](https://docs.cerbos.dev/cerbos-hub/index.html).
- OpenFGA: [roles e permissions](https://openfga.dev/docs/modeling/roles-and-permissions), [modeling roles](https://openfga.dev/docs/best-practices/modeling-roles).
- Biome: [restricted imports](https://biomejs.dev/linter/rules/no-restricted-imports/javascript/).

## S4 Eventos jobs e automacoes

- [pg-boss](https://github.com/timgit/pg-boss).
- [Inngest steps](https://www.inngest.com/docs/learn/inngest-steps) e [TypeScript SDK](https://www.inngest.com/docs/reference/typescript/intro).
- [Trigger.dev product](https://trigger.dev/product) e [release citado](https://trigger.dev/launchweek/2/trigger-v4-ga).
- [Temporal documentation](https://docs.temporal.io/).
- As pistas Mastra para workflows, schedules, Signals e PubSub estão em [S1](#s1-mastra-e-harness).

## S5 Connectors notificacoes e sync

- Nango: [proxy](https://nango.dev/platform/request-proxy), [webhooks](https://nango.dev/platform/webhooks), [actions/sync templates](https://nango.dev/blog/nango-clone-customize-integration-templates), [experiência com auth](https://nango.dev/blog/lessons-from-operating-api-auth-for-900-apis/).
- Composio: [toolkits](https://docs.composio.dev/toolkits), [tool router](https://docs.composio.dev/reference/v3/api-reference/tool-router), [meta-tools](https://docs.composio.dev/toolkits/meta-tools).
- Pipedream: [apps](https://pipedream.com/apps), [component contract](https://pipedream.com/docs/connect/api-reference/retrieve-component).
- Zapier: [estrutura da integração](https://developer.zapier.com/cli-guide/the-indexjs-file).
- Workato: [SDK](https://docs.workato.com/developing-connectors/sdk/sdk-reference.html), [best practices](https://docs.workato.com/developing-connectors/sdk/guides/best-practices), [OpenAPI](https://docs.workato.com/connectors/openapi/), [custom connector versions](https://docs.workato.com/en/workato-api/custom_connectors.html).
- n8n: [declarative-style node](https://github.com/n8n-io/n8n-docs/blob/main/docs/connect/create-nodes/build-your-node/tutorial-build-a-declarative-style-node.md).
- Airbyte: [protocol](https://github.com/airbytehq/airbyte/blob/master/docs/platform/understanding-airbyte/airbyte-protocol.md), [low-code CDK](https://github.com/airbytehq/airbyte/blob/master/docs/platform/connector-development/config-based/low-code-cdk-overview.md), [Oracle connector citado](https://github.com/airbytehq/airbyte/blob/master/docs/integrations/enterprise-connectors/source-oracle-enterprise.md).
- Hasura NDC: [specification](https://hasura.github.io/ndc-spec/specification/index.html), [schema](https://hasura.github.io/ndc-spec/specification/schema/index.html), [capabilities](https://hasura.github.io/ndc-spec/specification/capabilities.html).
- MCP: [annotations na revisão citada](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/schema.mdx), [SDK v2 citado](https://ts.sdk.modelcontextprotocol.io/v2/). A alegação de estabilidade dessa versão não foi confirmada nesta recuperação.
- Sankhya: [authenticate](https://developer.sankhya.com.br/reference/post_authenticate), [authorization layer](https://developer.sankhya.com.br/reference/camada-de-autoriza%C3%A7%C3%A3o-para-api), [integrações](https://developer.sankhya.com.br/reference/api-de-integra%C3%A7%C3%B5es-sankhya).
- Amazon SP-API: [onboarding](https://developer-docs.amazon.com/sp-api/docs/onboarding-overview).
- Mercado Livre: [auth](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao), [notifications](https://developers.mercadolivre.com.br/produto-receba-notificacoes).
- Oracle: [privilégios, versão 26 citada](https://docs.oracle.com/en/database/oracle/oracle-database/26/dbseg/configuring-privilege-and-role-authorization.html).
- MongoDB: [roles](https://www.mongodb.com/docs/manual/reference/built-in-roles/), [Change Streams](https://www.mongodb.com/docs/manual/changestreams/).
- Debezium: [Oracle](https://debezium.io/documentation/reference/stable/connectors/oracle.html), [MongoDB](https://debezium.io/documentation/reference/connectors/mongodb.html).
- Materialize: `materializeinc/materialize` foi a referência consultada via Context7; não foi retido path exato para cada claim.
- Novu: [workflow concepts](https://docs.novu.co/platform/concepts/workflows), [code steps citado](https://novu.co/blog/code-steps-typescript-notification-logic/), [changelog citado](https://novu.co/blog/whats-new-in-novu-august-2026/).
- Knock: [documentation](https://docs.knock.app/). Courier foi apenas mencionado, sem estudo recuperável comparável.

## S6 Observabilidade isolamento e hosting

- OpenTelemetry: [documentation](https://opentelemetry.io/docs/), [Collector](https://opentelemetry.io/docs/collector/), [JavaScript repository](https://github.com/open-telemetry/opentelemetry-js).
- Sentry: [Node OTel](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry), [custom setup](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup).
- Pino: [API](https://github.com/pinojs/pino/blob/main/docs/api.md), [redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md).
- [Fastify rate-limit](https://github.com/fastify/fastify-rate-limit) e [Cockatiel](https://github.com/connor4312/cockatiel).
- [OWASP logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- Node: [permissions da linha citada](https://r2.nodejs.org/docs/latest-v24.x/api/permissions.html).
- E2B: [security](https://e2b.dev/security), [referência SDK citada](https://e2b.dev/docs/sdk-reference/js-sdk/v2.6.2/sandbox).
- Cloud Run: [container contract](https://docs.cloud.google.com/run/docs/container-contract), [security](https://docs.cloud.google.com/run/docs/securing/security), [ingress](https://docs.cloud.google.com/run/docs/securing/ingress), [VPC](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc), [traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration).
- Fly: [architecture](https://fly.io/docs/reference/architecture/), [Machines API](https://www.fly.io/docs/machines/guides-examples/managing-machines-with-the-api/), [private networks](https://www.fly.io/docs/networking/custom-private-networks/), [network policies](https://fly.io/docs/machines/guides-examples/network-policies/).
- Mitra: [platform SDK](https://github.com/mitralab-dev/mitra-platform-sdk). Os relatórios fornecidos também identificaram `mitralab-dev/mitra-core-sdk`, `mitralab-dev/mitra-functions-sdk-js` e `mitralab-dev/mitra-functions-sdk-python`, mas não inspecionaram todos os seus arquivos.

## Afirmacoes que nao podem ser promovidas a fatos

| Afirmação recuperada | Limite que acompanha a recuperação |
| --- | --- |
| Harness foi renomeado Agent Controller; SkillSearchProcessor e Dynamic Workflows têm certas APIs | Nomes/recursos da conversa. Verificar pacote, export público, exemplos e passagem pela Factory |
| Prisma 8/Next tem contracts, lints, APIs `db.orm/db.sql/db.raw`, é RC e teria GA em outubro de 2026 | Não comprovado por artefato retido nesta recuperação. Não copiar esses exemplos como API real |
| Prisma Compute ficou GA em 28/08/2026 | Alegação histórica não confirmada. Não sustenta decisão de hosting |
| MCP TypeScript v2 é a linha estável de 2026 | Não confirmado. Revisão do protocolo e versão do SDK precisam de verificação separada |
| Novu, Mastra, Fly e provedores lançaram recursos em datas específicas | Não há qualificação atual desses releases; recursos/planos podem mudar |
| pg-boss oferece exactly-once | Não implica efeito externo exatamente uma vez; o caso de crash/retry precisa de prova |
| Trocar o engine de workflow preserva toda a semântica | Hipótese não demonstrada; persistência, atualização, credenciais e replay são parte da comparação |
| SDK Mitra prova ausência de backend por app e Functions fora de Git | Não prova. Um cliente HTTP não revela toda a topologia nem a custódia de source |
| Tipos, lint ou segredos em closures isolam código gerado | R12 retirou essa premissa. Segurança depende da fronteira efetiva |
| Papel padrão/SET LOCAL impede qualquer aumento de autoridade | Default de sessão não é automaticamente limite. A garantia depende do privilégio e da implementação efetivos |
| Dois containers/volumes ou readiness garantem isolamento e Publish seguro | Não por existência. Limites de storage/recursos e migrations anteriores à promoção importam |

## Fontes da convergencia e do estado do repositorio

A recuperação consultou a `main` em `d474b85323e107c36e6fb209f55622e4f1039ce5`, incluindo [roadmap](../../roadmap.md), [índice](../../index.md), [referência Stage 2](../../reference/stage2-managed-application-platform.md), [método de repositório](../../development/repository-method.md) e a [skill Mastra](../../../.agents/skills/mastra/SKILL.md).

As revisões fornecidas na conversa eram `stage2-architecture-review.md`, `astra-design.md` e `mitra-sdk-evidence.md`. A revisão Astra declarou não ter acessado o WSL e ter encontrado `node_modules` Windows desatualizado. Concordância de revisores não substitui um probe. O [registro de Q1](../../evidence/stage2-q1/README.md#verdict) é o destino para evidência posterior, não a lembrança da discussão.

Os princípios PSTACK mencionados nas rodadas explicam mudanças de julgamento, mas não são autoridade paralela. O código-fonte de método citado na conversa era `cursor/plugins` em `889ec4b68fa5aab0e867dad71ec3fdf386ae48f3`, sob `pstack/skills/`. Este PR não copia skills nem modifica o método do repositório.

## Testes e bibliotecas de teste citados

A conversa não escolheu um framework novo de testes para cada candidato. Os mecanismos já citados no projeto incluíam `node --test`, Playwright/Chromium, TypeScript e Biome. Os papéis eram distintos: testes de comportamento, interação de browser, feedback de tipos e prevenção de padrões de código. Um check que apenas inspeciona o texto de outro programa não substitui executar esse programa.

Os probes arquivados nas páginas temáticas são perguntas e desenhos de experimento. Não são testes implementados, não possuem resultados inventados e não autorizam executar efeitos reais em um fornecedor. O Builder real, a integração real e o estado persistido eram níveis de evidência diferentes. Preservar essa distinção é parte da memória que faltava.
