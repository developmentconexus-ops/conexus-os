// The business concepts below (that a document number identifies a purchase order, that a purchase
// order has a header and a list of items, and the shape of a purchases follow-up) come from
// https://github.com/andressaolivi/sankhya-skills (MIT), read by task Q4.0's census
// (docs/evidence/stage2-q4/census.md). No table name, entity name or field name of that source, and no
// service name, host, URL or header name of the adapter that reads it, entered this text: everything
// below is stated only in the shape of this connector's own operation contracts, in product language for
// the person building a purchase-order follow-up app. The census's "checked table by table" condition
// therefore holds trivially for this file: there is no table or field name here to check.
export const SANKHYA_BUILDER_SKILL: string = [
  'Esta Skill cobre a operação de pedidos de compra concedida a este Project. Chame-a apenas por '
    + "`connectors.call(operationId, input)` a partir de um handler do servidor, com o identificador e a "
    + 'entrada exatos que as instruções desta execução listam. Não existe outra forma de chegar a esse '
    + 'sistema: não há endereço, credencial ou biblioteca cliente para um handler usar por conta própria, '
    + 'e nada disso deve ser pedido.',
  'O que ela devolve: uma lista de pedidos. Cada pedido traz número, data, fornecedor, situação '
    + '("pending", "in-progress", "confirmed" ou "other"), valor total e uma lista de itens; cada item traz '
    + 'sequência, código do produto, descrição, quantidade, unidade, preço unitário e total.',
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
  'A chamada nunca lança exceção: ela devolve `{ ok: true, value }` ou `{ ok: false, code }`. Mostre uma '
    + 'mensagem adequada para cada código, e nunca repita a chamada automaticamente sem que a pessoa peça '
    + 'de novo:',
  '- `OPERATION_UNKNOWN` ou `INPUT_REFUSED`: o pedido que o aplicativo enviou está malformado; corrija a '
    + 'entrada antes de chamar de novo.',
  '- `EFFECT_REFUSED` ou `SERVICE_REFUSED`: o aplicativo pediu algo que esta operação não faz; isso é um '
    + 'erro no próprio código do aplicativo, não algo que quem o usa possa corrigir.',
  '- `NOT_GRANTED`: este Project não tem mais essa operação concedida; avise que alguém que administra o '
    + 'Workspace precisa concedê-la de novo, sem sugerir que o aplicativo está quebrado.',
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
  'Nunca tente chegar a esse sistema de outra forma: nenhum endereço, credencial ou biblioteca cliente o '
    + 'alcança fora de `connectors.call` com um identificador de operação concedido.',
].join('\n\n')
