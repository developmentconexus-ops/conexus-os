# Connectors, notificações e dados externos

Memória de R09–R11 e da intervenção do operador que mudou o centro da investigação. Contratos e APIs são conceituais. [Fontes](sources-and-revalidation.md#s5-connectors-notificacoes-e-sync) e [limites desta recuperação](README.md).

## R09 Connections capabilities e notificacoes

O primeiro desenho separava **Connection**, que representa acesso configurado, de **Capability**, que representa uma operação autorizada. Uma conexão com Sankhya não deveria automaticamente permitir qualquer chamada a seu ERP. App, agente e automação poderiam usar a mesma operação por superfícies distintas.

O anti-exemplo era um `privilegedFetch(url, method, body)` que injeta um segredo e deixa o consumidor escolher o destino. Uma operação nomeada, com entrada/saída e efeito conhecidos, permitiria autorização mais limitada. Isso não exigia quatro implementações da mesma operação para app, Tool, workflow e MCP.

### Infraestrutura de autenticacao de integracoes

| Candidato | Papel pesquisado | Limite ou custo levantado |
| --- | --- | --- |
| Nango | Custódia de Connection, OAuth/refresh, proxy, actions, syncs e webhooks | Não deveria possuir os grants Conexus nem tornar todas as APIs acessíveis ao Project |
| Composio | Catálogo de tools, connected accounts, sessões e descoberta por agente | Contratos para agentes não foram demonstrados como tipos estáveis para apps compilados |
| Pipedream Connect | Auth, actions, triggers, proxy e MCP reutilizáveis | Ainda exige decidir quais operações/contratos o app pode usar |
| Adapter direto | Sistema específico, pequeno e controlado | Custo de implementar corretamente autenticação, limites e erros do fornecedor |

Sankhya direto foi considerado um primeiro caso real. Para Google, Microsoft, Slack e outros SaaS, delegar peculiaridades de OAuth parecia mais atraente. “Direto versus Nango” era uma comparação de custo por integração, não uma regra universal. Claims sobre milhares de tools, refresh e compatibilidade de schemas não foram revalidados nesta recuperação.

A conversa citou `/authenticate`, `client_id`, `client_secret`, `X-Token` e a camada de autorização da API Sankhya. Também citou DatasetSP e CRUDServiceProvider como pistas de operações. São referências históricas a confirmar contra o gateway e a versão da empresa; nenhum endpoint, campo ou credencial real é definido aqui.

### Notificacao nao e envio de email

Notification foi entendida como intenção de negócio: avisar uma pessoa sobre uma aprovação. Canal, template, preferência, digest, atraso e estado de entrega poderiam pertencer a infraestrutura reutilizada. O exemplo `notify('purchase-request-approved', recipient, payload)` era pseudocódigo, não a API escolhida.

Novu e Knock foram os candidatos mais discutidos. A conversa procurava reaproveitar Inbox, preferências, múltiplos canais, routing, delays, digest e acompanhamento de entrega. Courier foi apenas citado como alternativa, sem estudo equivalente. Recursos de notification-as-code e conversas com agentes apareceram como claims de lançamentos, não como funcionalidades já qualificadas.

O experimento imaginado era notificar o gerente no app, aguardar, enviar e-mail se aplicável e respeitar sua preferência de canal. Depois da aprovação, avisar o solicitante. Mediríamos duplicação, status, preferência, latência, código de adaptação e operação. Isso ficou adiado no primeiro núcleo.

## R10 Connector SDK e facetas

O operador esclareceu que queria **construir integradores reutilizáveis**, inclusive para sistemas sem MCP pronto, e conectar bancos externos como Oracle ou MongoDB. Somente guardar Connection e listar capabilities não dava ao Builder conhecimento suficiente para desenvolver software sobre esses sistemas.

A investigação mudou para:

```text
Connector Definition: conhecimento reutilizável do sistema externo
    -> Workspace Connection: uma instância configurada
    -> Project Grant: acesso concedido para um uso
    -> app, agente ou automação
```

Zapier, Workato, n8n, Pipedream e Nango foram referências de como empacotar auth, operations/actions, triggers, schemas e opções dinâmicas. Airbyte contribuiu com `spec/check/discover/read`. Hasura NDC contribuiu com anúncio de capabilities, schema, query e explain. Eram precedentes para estudar o formato, não engines adotados pelo Conexus.

### Padronizar a mecanica sem apagar o fornecedor

O estudo rejeitou criar de início `UniversalOrder`, `UniversalCustomer` e `UniversalInvoice`. Pedido no ERP, pedido de marketplace, feed da Amazon e documento no Mongo têm significados distintos. O Connector deveria tornar a mecânica e a descoberta consistentes sem fingir que esses domínios são iguais.

Sankhya, Amazon SP-API e Mercado Livre foram exemplos de Service Connectors. Oracle, PostgreSQL externo, SQL Server, MySQL e MongoDB foram exemplos de Data Connectors. O modelo convergiu para facetas opcionais em vez de obrigar Oracle a parecer Slack:

| Faceta | Necessidade ilustrada |
| --- | --- |
| Connection/check | Configurar e testar acesso |
| Operations | Ações e consultas nomeadas com contrato |
| Events | Avisos do fornecedor, sem confundir com eventos do domínio local |
| Data/discovery | Descobrir schemas, tabelas, collections, campos e capacidades |
| Knowledge | Conceitos, instruções, exemplos e armadilhas para o Builder |

Nenhum facet era obrigatório para todos. Discovery também podia significar listar canais Slack, empresas/TOPs do Sankhya ou marketplaces Amazon, não apenas tabelas.

### Banco externo nao exige uma linguagem de query universal

A conversa considerou manter SQL reconhecível para Oracle e filtros nativos para Mongo, dentro de limites e privilégios reais. `oracle.query(sql, params)` e `mongo.find(...)` eram exemplos de desenho, não endpoints autorizados.

A proteção imaginada para consultas vinha de usuário/role de leitura, objetos permitidos e limites de recursos. Um parser que “acha o SQL seguro” não deveria ser a única barreira. A existência de uma modalidade read-only de Oracle, sua versão e suas garantias eram claims a verificar; não se presume a versão usada pela empresa.

A hipótese genérica de live query foi reduzida na convergência posterior. O núcleo começou com operações nomeadas e limitadas do Sankhya. Oracle e discovery amplo ficaram para um consumidor real. O histórico não autoriza abrir um console SQL ao browser.

### Formato do SDK de Connector

Foram comparados um manifesto universal YAML/JSON, TypeScript livre e TypeScript que produz contrato inspecionável. O manifesto universal parecia exigir muitas exceções. Código livre dificultaria listar operações e schemas sem executar código privilegiado. A terceira hipótese reunia código, contrato, tipos e conhecimento:

```text
Fonte do Connector
    -> contrato legível por máquina
    -> implementação de runtime
    -> tipos para consumidores
    -> Skill/referências/exemplos
    -> testes
```

`defineConnector({ connection, operations?, events?, data? })` era apenas um formato ilustrativo. Não se decidiu criar um compilador próprio. Usar schemas e ferramentas existentes continuava sendo parte da comparação.

Knowledge faria parte do pacote do Connector, não necessariamente do contrato consumido em runtime. A Skill Sankhya explicaria termos, sequência correta e erros comuns. Conhecimento específico da empresa, como o que “estoque disponível” significa naquele negócio, ficaria distinguível do conhecimento genérico do fornecedor.

### Codigo privilegiado e versoes

O Connector pode precisar de segredos que o app não deve conhecer. Por isso o estudo passou a separar execução de Connector de código gerado. A invocação ideal indicaria conexão autorizada, versão conhecida, operação e entrada validada; não URL ou credencial livre.

Metadados como read-only, destructive e idempotent foram considerados úteis para UI, retries, teste e política. São descrição de efeito, não a própria autorização. Annotations de MCP externo foram tratadas como claims não confiáveis até qualificação. Mesmo uma implementação própria não torna uma declaração infalível.

Versão de contrato e estado da Connection foram separados. Um app não deveria mudar silenciosamente porque um Connector foi atualizado. O desenho exigiria saber contra qual contrato o app foi testado, sem necessariamente recriar a Connection a cada release. Compatibilidade do fornecedor externo continuaria sendo uma questão adicional.

### MCP e OpenAPI como superficies e pontos de partida

MCP não foi escolhido como transporte obrigatório entre funções no mesmo runtime. Poderia expor Connectors a agentes ou ser consumido por um adapter. OpenAPI/MCP existentes poderiam gerar um **draft** de Connector, seguido de revisão e testes, não um Connector automaticamente confiável.

A progressão imaginada era acesso genérico limitado → Connector curado → conhecimento de domínio reutilizável. O Builder poderia ajudar a escrever Connectors, mas código que recebe credencial empresarial exigiria uma qualificação diferente de um componente React.

Os três probes históricos eram Sankhya read-only com uso por app e Tool, Oracle com discover/read e escrita negada, e importação de um MCP/OpenAPI simples. A convergência retirou os dois últimos do núcleo inicial. Um segundo facet não é obrigatório para provar a primeira necessidade real.

## R11 Live query sync e replicacao

A pergunta deixou de ser “o Connector é live ou sync?”. Um mesmo Connector poderia servir recursos com estratégias diferentes.

| Estratégia estudada | Uso imaginado | Problema a verificar |
| --- | --- | --- |
| Live query | Consulta no momento da ação | Latência, carga, indisponibilidade e limite do fornecedor |
| Polling incremental | Cópia local usando cursor de alterações | Cursor confiável, deleções, paginação, checkpoints e recuperação |
| CDC/change stream | Replicação a partir de mudanças do banco | Permissões administrativas, logs, snapshot, retomada e custo operacional |
| Webhook + reconciliation | Aviso rápido seguido de busca e correção periódica | Eventos perdidos, repetidos, atrasados ou fora de ordem |

Exemplos de uso eram catálogo/histórico local para leitura frequente, mas consulta atual ao ERP para disponibilidade crítica. Esses exemplos são hipóteses de produto. Um dado obtido live não resolve sozinho concorrência ou reserva de estoque.

Airbyte foi candidato a replicar streams entre origem e destino. Debezium foi candidato específico para CDC de bancos, incluindo discussões de LogMiner/XStream e Change Streams. Nango sync foi candidato para APIs SaaS, checkpoints e reconciliação. Materialize apareceu como referência de views mantidas continuamente, não como peça do stack.

O princípio discutido foi **mirror for reads, source for commands**. A cópia local não vira dona do pedido externo. Uma alteração no ERP passaria pela operação do Connector contra a origem; sync atualizaria depois a projeção local. Notas e aprovações próprias do app seriam dados locais distintos.

Uma Sync foi imaginada como configuração de uso do Project sobre uma Connection autorizada, não consequência automática de conectar um banco. Ela indicaria recursos necessários, campos, origem, checkpoint, última aplicação, falhas e freshness. Conectar Oracle não significaria copiar a base inteira.

CDC não poderia ser ligado por conveniência do agente: requisitos de logs, privilégios, retenção e impacto no banco precisariam de qualificação operacional. O começo pequeno proposto era leitura limitada; sync só voltaria por latência, carga, volume ou disponibilidade observados.

## O que o proximo consumidor recupera daqui

O estudo preserva três caminhos de reutilização sem fixar fornecedor: adapter operacional, acesso a dados descobertos e replicação. Preserva também a separação entre SDK de app, Tool de agente, transporte MCP e conhecimento procedural.

A implementação atual não precisa de todos eles. O [roadmap](../../roadmap.md) e a [referência do Stage 2](../../reference/stage2-managed-application-platform.md) prevalecem. Os exemplos de compras, estoque e marketplace não inventam endpoints, schemas, permissões ou requisitos já aprovados para a empresa.
