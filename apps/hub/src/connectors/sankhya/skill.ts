// The business concepts below (that a document number identifies a purchase order, that a purchase
// order has a header and a list of items, and the shape of a purchases follow-up) come from
// https://github.com/andressaolivi/sankhya-skills (MIT). The native request format and the service,
// entity and field names are the ones this connector's gateway already
// sends (C-030 lets a consumer name them); `purchase-order.ts` marks which of them the first real read
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
  'No aplicativo. O handler do servidor lê o Sankhya com `connectors.fetch(requisição)`, com a mesma requisição nativa '
    + 'que você testou no `connector_fetch` e o mesmo nome local da Conexão. A resposta é `{ ok: true, status, bytes, body }`, '
    + 'com o JSON do Sankhya em `body`, ou `{ ok: false, code }`. O handler decodifica `body.responseBody.entities` como '
    + 'descrito acima: os nomes em `metadata.fields.field`, os valores em `f0`, `f1`, ..., `entity` como objeto ou lista, e '
    + "`total: '0'` como nenhuma linha. Depois devolve só os campos que a tela mostra. O navegador recebe apenas o que o "
    + 'handler devolve: nunca devolva `body` nem a resposta inteira. Cada execução do handler faz no máximo 8 chamadas e '
    + 'termina em 5 segundos, então peça numa leitura só os campos e as linhas de que a tela precisa. Se `hasMoreResult` '
    + "vier `'true'`, há mais páginas; leia a próxima com `offsetPage` só se a tela precisar dela.",
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
  'A chamada `connectors.fetch` nunca lança exceção. Mostre uma mensagem adequada para cada código, e nunca repita a '
    + 'chamada automaticamente sem que a pessoa peça de novo:',
  '- `INPUT_REFUSED` ou `SERVICE_REFUSED`: a requisição do handler está errada (`issues` diz onde); é um erro no código '
    + 'do aplicativo, não algo que quem o usa possa corrigir.',
  '- `NOT_GRANTED`: este Project não tem mais essa Conexão; avise que alguém que administra o Workspace precisa '
    + 'vinculá-la de novo, sem sugerir que o aplicativo está quebrado.',
  '- `CONNECTOR_UNCONFIGURED`: a integração não está configurada nesta instalação; avise que isso não depende deste '
    + 'Project.',
  '- `CREDENTIAL_REFUSED`: a integração foi recusada do outro lado; ela precisa de atenção de quem a administra.',
  '- `PROVIDER_TIMEOUT` ou `PROVIDER_UNAVAILABLE`: o Sankhya não respondeu a tempo; convide a pessoa a tentar de novo '
    + 'em instantes.',
  '- `PROVIDER_ERROR` (com `vendorStatus` quando o erro é do próprio Sankhya) ou `RESPONSE_REFUSED`: avise que a leitura '
    + 'não pôde ser concluída agora.',
  '- `RESPONSE_TOO_LARGE`: a resposta passou de 256 KiB; o código deve pedir menos campos ou menos linhas.',
  '- `CALL_LIMIT`: o handler passou de 8 chamadas numa execução; junte as leituras.',
].join('\n\n')
