// The business concepts below (that a document number identifies a purchase order, that a purchase
// order has a header and a list of items, and the shape of a purchases follow-up) come from
// https://github.com/andressaolivi/sankhya-skills (MIT). The native request format and the service,
// entity and field names are the ones this connector's gateway and purchase-order operation already
// send (C-030 lets a consumer name them); `purchase-order.ts` marks which of them the first real read
// still has to confirm. No host, URL, header or credential name enters this text.
export const SANKHYA_BUILDER_SKILL: string = [
  'Esta Skill cobre as Conexões Sankhya deste Project: como investigá-las com a ferramenta `connector_fetch` enquanto '
    + 'você constrói, e como o aplicativo as lê em produção. Não existe outra forma de chegar ao Sankhya: não há endereço, '
    + 'credencial ou biblioteca cliente para usar por conta própria, e nada disso deve ser pedido.',
  'Investigação com `connector_fetch`. Antes de escrever código que dependa do Sankhya, leia os dados reais. A ferramenta '
    + "recebe a requisição nativa do gateway: `connection` com o nome local da Conexão, `method: 'POST'`, "
    + "`path: '/gateway/v1/mge/service.sbr'`, `query: { serviceName: 'CRUDServiceProvider.loadRecords', outputType: 'json' }` "
    + "e um `body` `{ serviceName: 'CRUDServiceProvider.loadRecords', requestBody: { dataSet: { rootEntity, "
    + "includePresentationFields: 'N', offsetPage: '0', criteria: { expression: { $: \"this.NUMNOTA = ?\" }, parameter: "
    + "[{ $: '22790', type: 'I' }] }, entity: { fieldset: { list: 'NUNOTA,NUMNOTA' } } } } }`. Só esse serviço de leitura "
    + 'existe; qualquer outro é recusado com `SERVICE_REFUSED` antes de chegar ao Sankhya.',
  'Coloque todo valor em `parameter`, com `?` na expressão (`type` `I` para número, `S` para texto); nunca escreva um valor '
    + 'dentro da expressão. Uma entidade relacionada entra como outro item de `entity`, por exemplo '
    + "`{ path: 'Parceiro', fieldset: { list: 'NOMEPARC' } }`, e seus campos voltam como `Parceiro_NOMEPARC`.",
  'A resposta traz `responseBody.entities`: `metadata.fields.field` lista o nome de cada coluna, na ordem; cada linha de '
    + '`entity` (um objeto quando há uma só linha, uma lista quando há várias) traz os valores como `f0`, `f1`, ... nessa mesma '
    + "ordem, cada um no formato `{ $: 'valor' }`, e `{}` quando o valor está vazio. `total` diz quantas linhas existem e "
    + "`hasMoreResult: 'true'` diz que há mais páginas.",
  'Para pedidos de compra: o cabeçalho é `CabecalhoNota`, com `NUNOTA` (chave interna), `NUMNOTA` (número do documento), '
    + "`DTNEG`, `STATUSNOTA`, `VLRNOTA` e `TIPMOV = 'O'` para compras; os itens são `ItemNota`, ligados ao cabeçalho pelo "
    + '`NUNOTA`, com `SEQUENCIA`, `CODPROD`, `QTDNEG`, `CODVOL`, `VLRUNIT` e `VLRTOT`, e a descrição em `Produto` '
    + '(`DESCRPROD`). Confirme esses nomes e o formato dos valores na primeira leitura, antes de escrever o aplicativo.',
  'Se a leitura responder `RESPONSE_TOO_LARGE`, ela passou do limite de tamanho: leia de novo pedindo menos campos em '
    + '`fieldset.list`, filtrando mais em `criteria` (por número, data ou situação), ou uma página por vez com `offsetPage`. '
    + 'Nunca repita a mesma leitura sem mudá-la. `CALL_LIMIT` quer dizer que as leituras desta execução acabaram. '
    + '`PROVIDER_ERROR` com `vendorStatus` é um erro do próprio Sankhya, por exemplo um campo ou entidade que não existe: '
    + 'corrija a requisição.',
  'No aplicativo. O handler do servidor lê pelo `connectors.call(operationId, input)`, com o identificador e a entrada '
    + 'exatos que as instruções desta execução listam como operação concedida. O que ela devolve: uma lista de pedidos. Cada '
    + 'pedido traz número, data, fornecedor, situação ("pending", "in-progress", "confirmed" ou "other"), valor total e uma '
    + 'lista de itens; cada item traz sequência, código do produto, descrição, quantidade, unidade, preço unitário e total.',
  'Um número de documento pode não bater com nenhum pedido, bater com exatamente um, ou bater com vários '
    + '(o mesmo número pode se repetir em séries diferentes). Mostre de acordo: "nenhum pedido encontrado" '
    + 'quando a lista vier vazia, o pedido único quando vier com um item, e todos quando vier com mais de '
    + 'um. Nunca assuma que o primeiro resultado é o único.',
  'Notas de acompanhamento e qualquer status que a equipe controle (por exemplo "em contato com o '
    + 'fornecedor", "aguardando entrega") não existem nesse sistema externo e não podem ser gravados nele. '
    + 'Guarde-os em uma tabela própria deste Project, criada por uma migração, com uma coluna para o '
    + 'número do documento, para que a nota se ligue de volta ao pedido a que se refere.',
  'Toda quantidade, preço unitário e valor total chega como texto decimal (por exemplo "1234.50"), nunca '
    + 'como número binário. Formate esse texto para exibição. Nunca use `parseFloat` nele para somar vários '
    + 'valores como números de ponto flutuante: o arredondamento pode sair errado. Some textos decimais '
    + 'com uma biblioteca decimal, ou mantenha a soma como texto e converta só na exibição final.',
  'A chamada do handler nunca lança exceção: ela devolve `{ ok: true, value }` ou `{ ok: false, code }`. Mostre uma '
    + 'mensagem adequada para cada código, e nunca repita a chamada automaticamente sem que a pessoa peça '
    + 'de novo:',
  '- `OPERATION_UNKNOWN` ou `INPUT_REFUSED`: o pedido que o aplicativo enviou está malformado; corrija a '
    + 'entrada antes de chamar de novo.',
  '- `EFFECT_REFUSED` ou `SERVICE_REFUSED`: o aplicativo pediu algo que esta operação não faz; isso é um '
    + 'erro no próprio código do aplicativo, não algo que quem o usa possa corrigir.',
  '- `NOT_GRANTED`: este Project não tem mais essa Conexão; avise que alguém que administra o '
    + 'Workspace precisa ligá-la de novo, sem sugerir que o aplicativo está quebrado.',
  '- `CONNECTOR_UNCONFIGURED`: a integração ainda não foi configurada; avise que isso não depende deste '
    + 'Project.',
  '- `CREDENTIAL_REFUSED`: a integração foi recusada do outro lado; avise que ela precisa de atenção de '
    + 'quem a administra, não deste aplicativo.',
  '- `PROVIDER_TIMEOUT` ou `PROVIDER_UNAVAILABLE`: o sistema externo não respondeu a tempo; convide a '
    + 'pessoa a tentar de novo em instantes.',
  '- `PROVIDER_ERROR` ou `RESPONSE_REFUSED`: o sistema externo respondeu algo que esta integração não '
    + 'conseguiu ler com segurança; avise que a leitura não pôde ser concluída agora.',
  '- `CALL_LIMIT`: o aplicativo fez chamadas demais nesta execução; espace as chamadas, ou avise a pessoa '
    + 'para tentar de novo um pouco depois.',
].join('\n\n')
