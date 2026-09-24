# Connectors: construir ou adotar

**Natureza:** registro de pesquisa, não autoridade de produto. A direção aprovada pelo operador está
na [tarefa Q4](../../tasks/stage2-q4-sankhya-connector-qualification.md).
**Origem:** dois estudos independentes feitos em 2026-09-24, lidos e resolvidos pelo operador no
mesmo dia.
**Versões:** as versões do Mastra citadas são as instaladas pelo `package-lock.json`
(`@mastra/core` 1.67.0, `@mastra/mcp` 1.18.0, `@mastra/factory` 0.15.0), não as últimas publicadas.
As dos demais candidatos são as releases vistas pelos estudos nessa data.

## Pergunta

A Conexus deve escrever a camada de conectores (Connection, Grant, broker e adaptadores) ou adotar
uma plataforma de integração pronta? O primeiro consumidor é o Q4: uma leitura real e somente
leitura do Sankhya. Os próximos imaginados são Mercado Livre, WhatsApp, Telegram e email.

## Vereditos

**Estudo 1.** Construir sobre o Mastra, com código de conector nosso. Nenhum candidato aberto
entrega custódia e grant da Conexus em self-host com conteúdo útil para Sankhya. Ninguém tem
conector Sankhya em TypeScript: existem SDKs .NET e Python, MCPs de documentação ou de banco direto,
e Skills de dicionário de dados. Activepieces é o único catálogo MIT que roda como biblioteca, e o
estudo rodou uma ação dele no próprio processo. Mas o cliente HTTP comum dos pieces desliga a
verificação TLS do processo inteiro, então serve como código de referência, não como runtime.

**Estudo 2.** Construir a camada de autoridade da Conexus sobre mecanismos existentes. Nenhuma opção
verificada substitui o grant por Project e operação com revogação conferida a cada chamada. A
operação deve ter contrato próprio em TypeScript e Zod; `createTool` é o adaptador para agentes, não
a definição obrigatória. Activepieces é a alternativa aberta mais forte para ampliar o catálogo, e
Nango ganha força quando houver OAuth e sync reais.

Os dois concordam: construir a autoridade e o adaptador Sankhya, não adotar plataforma agora.

## Candidatos

S, ML, W, T e E são Sankhya, Mercado Livre, WhatsApp, Telegram e email. "?" significa não verificado,
não ausente.

| Candidato | O que ofereceria | Licença e self-host | Grant fica com a Conexus? | Alvos | Disposição |
| --- | --- | --- | --- | --- | --- |
| [Mastra](https://mastra.ai/integrations) | `createTool`, `MCPServer`, `MCPClient`, workflows, canais | Apache-2.0 fora de `ee/` ([LICENSE](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md)); [FGA é Enterprise em produção](https://mastra.ai/blog/introducing-fine-grained-authorization) | Sim, com broker nosso | W e T só como canais de agente; S, ML, E não | REUSO: tools, MCP, workflows, `@mastra/factory/secret-encryption`. FGA não entra |
| Mastra `toolProviders` (Composio, Arcade) | Tools de terceiros no editor | Do provedor | Não, custódia do fornecedor | Herda do provedor | NOT FIT |
| [Nango](https://nango.dev/docs/guides/platform/self-hosting) 0.71.10 | Custódia, refresh OAuth, proxy; functions, syncs e webhooks | ELv2 ([LICENSE](https://github.com/NangoHQ/nango/blob/master/LICENSE)); self-host grátis cobre só auth e proxy | Parcial: a custódia fica no Nango | W, T, E; S e ML ? | NOT FIT agora; gatilho abaixo |
| [Activepieces](https://github.com/activepieces/activepieces/tree/main/packages/pieces/community) 0.92.0 | Catálogo de ações e triggers em TS, MCP | MIT fora de `ee` ([LICENSE](https://github.com/activepieces/activepieces/blob/main/LICENSE)) | Só se rodarmos o piece | W, T, E; S e ML não | NOT FIT como runtime; fonte para portar, com atribuição |
| [n8n](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) 2.40 | Engine completa | Sustainable Use: uso interno | Não | T; demais ? | NOT FIT: licença |
| [Pipedream](https://github.com/PipedreamHQ/pipedream/blob/master/LICENSE) | Componentes, Connect | Source available com restrição comercial | Não | ? | NOT FIT: licença |
| [Airbyte](https://docs.airbyte.com/community/licenses) | Sync para banco | Core ELv2; CDK oficial em Python | Sim, mas é outra plataforma | E; S ? | NOT FIT: segunda stack, sem consumidor de sync |
| [Composio](https://github.com/ComposioHQ/composio) | Tools e contas conectadas | SDK MIT; self-host só Enterprise | Não, custódia do fornecedor | E; demais ? | NOT FIT |
| [Arcade](https://docs.arcade.dev/en/guides/deployment-hosting) | Runtime de tools e OAuth | `arcade-mcp` MIT; runtime e catálogo não | Não, custódia do fornecedor | T; demais ? | NOT FIT |
| [Merge](https://help.merge.dev/articles/5389408-merge-data-encryption-and-storing-standards) | API unificada | Só nuvem; Merge guarda credenciais | Não | Nenhum confirmado | NOT FIT |
| [MCP de fornecedor](https://github.com/mercadolibre/mercadolibre-mcp-server) | Tools remotas | Varia | Só se o broker injeta o token | ML | Adiado ao conector ML |
| [Apache Camel](https://camel.apache.org/components/4.18.x/index.html) | 350+ componentes | Apache-2.0, JVM | Sim | T, E | NOT FIT: segunda stack |
| [sankhya-skills](https://github.com/andressaolivi/sankhya-skills) | Dicionário de dados Sankhya | MIT | n/a | S (conhecimento) | REUSO como fonte da Skill, conferido contra a versão da empresa |

### Por que Activepieces não roda no Hub

O cliente HTTP comum dos pieces faz `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` a cada request
([`fetch-http-client.ts`, linha 30 em 2026-09-24](https://github.com/activepieces/activepieces/blob/main/packages/pieces/common/src/lib/http/core/fetch-http-client.ts)).
Isso desliga a verificação TLS do processo inteiro. Além disso, a ação `custom_api_call` dos pieces
deixa o consumidor escolher URL e método com a credencial injetada. É o `privilegedFetch` que a
[R09](connectors-and-notifications.md#r09-connections-capabilities-e-notificacoes) proíbe.

## Sankhya

A autenticação do gateway é OAuth 2.0 client credentials com `X-Token`. O `access_token` dura cerca
de 3600 s e a Sankhya pede reuso para evitar limite de taxa
([post_authenticate](https://developer.sankhya.com.br/reference/post_authenticate),
[changelog](https://developer.sankhya.com.br/changelog/novo-fluxo-de-autenticacao-com-oauth-20)).
Não há redirect de usuário, mas há token de vida curta. O cache de token no broker é requisito.

## Divergência e resolução

**Divergência.** O estudo 1 descreve cada operação no formato de `createTool` e Zod, e trata um
pacote com uma `createTool` por sistema como forma natural. O estudo 2 diz que a operação é uma
função com contrato próprio e que `createTool` é só o adaptador para agentes; tornar isso regra
antes do segundo conector espalha o Mastra no handler.

**Resolução do operador.** A operação é uma função simples com contrato Zod de entrada e saída,
metadado de efeito (leitura ou escrita) e destino fixo. `createTool` a envolve para agentes. "Um
pacote e uma `createTool` por sistema" não vira regra antes do segundo conector. `MCPServer` fica
como superfície futura para agentes externos. A checagem de grant mora no broker, não no FGA do
Mastra.

## Camadas

- **A Conexus escreve:** Connector Definition (operações nomeadas, contrato, efeito, destino fixo),
  Workspace Connection cifrada com `@mastra/factory/secret-encryption`, Project Grant por operação,
  broker no Hub com cache de token, e o adaptador de cada sistema.
- **Reusa:** Zod, `createTool`, `MCPServer`, workflows do Mastra, `sankhya-skills` como fonte.
- **Consumidores:** o handler do app, pelo relay do runner até o broker; o agente, por uma tool que
  chama o mesmo broker com o Project da sessão; o integrador, um workflow agendado que chama leituras
  pelo broker e grava no banco do Project. "Espelho para leituras, origem para comandos." No Q4 o
  integrador e os eventos de entrada são só desenho.

## O argumento mais forte contra

A cauda longa custa caro escrita à mão. Activepieces tem centenas de pieces MIT com auth, props e
triggers. Um host de pieces isolado resolveria a cauda de uma vez. Para Sankhya nada muda: ninguém
tem o conector.

## Gatilhos de reabertura

- **Activepieces:** um host de pieces em processo isolado, com egress fixo, sem `custom_api_call`,
  e um teste que prove o TLS do processo ligado; ou a remoção da sobrescrita de TLS pelo projeto.
- **Nango:** o segundo e o terceiro conector custam, cada um, mais que o Nango na edição
  necessária, confirmada com custo e recursos.
- **Qualquer um:** o operador pede mais de dez sistemas em seis meses.
