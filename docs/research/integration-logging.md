# Registro das chamadas de integração

**Natureza:** pesquisa que sustenta uma decisão, não autoridade. A decisão em vigor é a
[C-029](../decisions/index.md), e o mecanismo está em
[`apps/hub/src/connectors/record.ts`](../../apps/hub/src/connectors/record.ts).
**Feita em:** 2026-09-26, a partir da primeira leitura real do Sankhya no Q4.7.

A pergunta era como registrar cada chamada que um Connector faz a um sistema externo, de modo que
uma falha possa ser diagnosticada pelo registro, sem que o registro vaze credencial ou dado de
negócio.

## O registro anterior não explicava a falha

Na execução do Q4.7 de 2026-09-26, a primeira leitura real do Sankhya respondeu `PROVIDER_ERROR`
depois de uma autenticação bem-sucedida. As duas leituras seguintes, com a mesma entrada, deram
certo. O broker escrevia uma linha de auditoria em stderr com
`{event, consumer, projectId, operation, services, result, ms}`. A linha não tinha hora, status
HTTP do provedor, código de erro do provedor, passo nem tentativa, e `sankhya/gateway.ts`
descartava a resposta do provedor em toda falha.

`PROVIDER_ERROR` cobre dois casos diferentes: um status HTTP fora de 2xx, 401, 403 e 5xx (um 400
na chamada de serviço, por exemplo), e um envelope com `status` diferente de `"1"`. A linha não
dizia qual dos dois aconteceu.

## O Mastra já tem o mecanismo

Versões instaladas: `@mastra/core` 1.67.0 e `@mastra/observability` 1.17.8.

- O Hub já constrói uma instância de `Observability` para o Builder, com `MastraStorageExporter`
  gravando em `factory.mastra_ai_spans` e retenção de 30 dias
  (`apps/hub/src/builder/module.ts`, `apps/hub/src/builder/factory.ts`).
- `startSpan` funciona fora de uma execução de agente. Um span tem hora de início e de fim,
  `metadata` livre, `errorInfo` e spans filhos
  (`node_modules/@mastra/core/dist/docs/references/reference-observability-tracing-spans.md`).
- `Observability.registerInstance` acrescenta uma segunda instância ao registro sem trocar a
  instância padrão do Builder. Quando o Mastra da Factory é construído, ele inicializa os
  exportadores de todas as instâncias com o armazenamento da Factory (`setMastraContext`,
  `node_modules/@mastra/observability/dist/index.js`). Duas `configs` no construtor exigem um
  `configSelector`, por isso o registro vem depois.
- `SensitiveDataFilter` redige por nome de campo. A comparação é exata depois de minúsculas e sem
  separadores, então `xToken`, `access_token` e `clientId` não batem com a lista padrão.
  Passar `sensitiveFields` substitui a lista padrão em vez de ampliá-la
  (`dist/index.js`, construtor de `SensitiveDataFilter`). O Connector usa o filtro padrão e um
  segundo filtro com os campos de credencial e de token.

O desenho do Q4 decidiu não rastrear o broker porque a lista padrão não redigia `xToken` nem
`access_token`. Isso era uma lacuna de configuração, não um limite do Mastra.

## O que os padrões pedem

- **OpenTelemetry, spans de cliente HTTP.** `http.request.method`, `server.address`,
  `server.port` e `url.full` são obrigatórios. `http.response.status_code` entra quando há
  resposta, `error.type` quando a requisição termina em erro, e `http.request.resend_count`
  quando ela foi repetida. `url.full` não pode carregar credencial, e `error.type` deve ter
  baixa cardinalidade.
- **OWASP, Logging Cheat Sheet.** Registrar quando, onde, quem, o quê e o resultado, com um
  identificador que ligue os eventos de uma mesma interação. Nunca registrar senha, token de
  acesso, identificador de sessão, chave de criptografia ou string de conexão.

O registro do Connector segue os dois: hora de início e fim, Project, consumidor, operação,
nome do serviço, passo, tentativa, status HTTP, `status` do envelope e resultado, ligados pelo
`traceId` do Mastra. O registro não guarda URL, cabeçalho, corpo, mensagem nem código de erro
tirado do texto do provedor.

## O que as plataformas de integração fazem

Todas registram cada execução por padrão e tratam o conteúdo como uma questão separada.

- **Workato.** O histórico de jobs guarda entrada e saída de cada passo. Com mascaramento ligado
  num passo, a Workato não guarda nem mostra a entrada e a saída desse passo, e não as envia ao
  log de auditoria.
- **n8n.** Poda os dados de execução por padrão depois de 14 dias (336 horas) ou 10.000
  execuções. A redação, configurada por workflow ou imposta para toda a instância, esconde
  entrada, saída, binários e mensagens de erro, e mantém status, tempos, nomes dos nós e o tipo
  de erro com o status HTTP. Revelar um dado redigido fica no log de auditoria, com quem, quando
  e de onde.
- **Zapier.** Guarda o histórico de Zaps de 29 a 69 dias. No plano Enterprise o administrador
  reduz para 7 a 30 dias, e a própria Zapier apresenta essa retenção como controle de
  privacidade.
- **Airbyte.** Os logs de sincronização trazem detalhe operacional e erros, não os registros
  sincronizados.
- **Boomi, Nango, Merge.dev e Paragon.** Relatório de processos de 30 dias no Boomi e registro
  pesquisável de cada requisição de saída nos outros três. Estas quatro afirmações vêm da
  pesquisa de 2026-09-26 e não foram reconferidas nesta nota: a página de logs do Nango citada
  antes responde 404.

## O que o gateway do Sankhya devolve

- A tabela oficial de códigos de retorno mapeia um bearer inválido ou expirado para HTTP 403
  `GTW3403`. Vários HTTP 400 `GTWxxxx` indicam requisição malformada (`GTW2500`, `GTW2509`), erro
  de comunicação interna (`GTW2508`, `GTW3003`, `GTW3500`) e falha de login no ERP (`GTW3407`).
  Erros de regra de negócio chegam com HTTP 200 e uma mensagem `[CORE_Exxxxx]`.
- A página não documenta o formato JSON do corpo de erro nem os valores do `status` do envelope.
  O código só aparece no texto livre da resposta. Duas revisões independentes mostraram que
  qualquer leitura desse texto pode registrar uma credencial com formato de código que o provedor
  ecoe no erro, mesmo com a lista fechada dos doze códigos `GTW`: a tabela aceita `GTW3501` como
  valor de `xToken`, e o filtro por nome de campo não pega isso. Por isso o registro sempre ligado
  guarda só o status HTTP e o `status` do envelope, com passo e tentativa, que já separam um 400 de
  um envelope de erro. O código detalhado do provedor fica para a captura de conteúdo ligada por
  um administrador, por tempo limitado.
- O limite é de 1.000 requisições por minuto, em produção e em sandbox.

Um `GTW3407` num 400 logo depois de um token novo explicaria uma primeira leitura que falha e
leituras seguintes que dão certo. É uma hipótese. O registro novo mostra se a falha foi um 400 ou
um envelope de erro, em qual passo e em qual tentativa. Confirmar o código exige a captura de
conteúdo.

## O que a Mitra fazia

A pesquisa da Mitra ([estudo completo](mitra/full-study.md)) mostra registro por padrão e sem
redação. As tabelas nativas `INT_*` guardam o log de ações da plataforma no banco do projeto. O
`DataLoader` de integração tem um `executionLog`. A auditoria de dados (`db_action_log`) guarda
`old_values` e `new_values`. O projeto de orçamentos observado gravava cada importação em
`LOG_IMPORTACOES`, com `ETAPAS_JSON`, `DURACAO_MS`, `PARAMETROS` e o erro truncado, no sucesso e na
falha. Nada disso separa conteúdo de metadado.

## O que a decisão escolheu

Registro sempre ligado, nativo do Mastra e sem valores: os fatos que diagnosticam uma chamada
nunca precisam do conteúdo dela. Captura de conteúdo por tempo limitado, ligada por um
administrador e registrando quem ligou e quando, fica para quando um diagnóstico real precisar
dela, como a redação com revelação auditada do n8n. O código detalhado de erro do provedor também
só vem dessa captura. Credencial, token e chave nunca entram, nem
com captura.

A linha em stderr continua porque o log do piloto (`~/conexus-pilot-logs/hub.log`) é onde o
operador olha primeiro, e porque o armazenamento do Mastra descarta os spans enquanto a Factory
não terminou de subir. A linha sai de um exportador do Mastra sobre o mesmo span exportado,
depois dos filtros. Os dois são o mesmo registro.

## Fontes

Consultadas em 2026-09-26.

- OpenTelemetry, [HTTP client spans](https://opentelemetry.io/docs/specs/semconv/http/http-spans/).
- OWASP, [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
- Workato, [Data masking](https://docs.workato.com/features/data-masking.html).
- n8n, [Redact execution data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/redact-execution-data.md)
  e [Manage execution data](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data.md).
  O endereço citado na issue #313 (`workflows/executions/execution-data-redaction/`) não existe mais.
- Zapier, [Zap history retention](https://help.zapier.com/hc/en-us/articles/8496327478413).
- Airbyte, [Browsing output logs](https://docs.airbyte.com/platform/operator-guides/browsing-output-logs).
- Sankhya, [Códigos de retorno da API](https://developer.sankhya.com.br/reference/códigos-de-retorno-da-api)
  e [Boas práticas para integração](https://developer.sankhya.com.br/reference/boas-práticas-para-integração).
- Mastra, documentação embutida em `node_modules/@mastra/core/dist/docs/references/` e código de
  `node_modules/@mastra/observability/dist/`, nas versões acima.
