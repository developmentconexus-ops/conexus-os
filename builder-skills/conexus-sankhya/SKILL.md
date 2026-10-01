---
name: conexus-sankhya
description: Use before you read a Sankhya Conexão or write code that reads one. Covers the request format, the two read services, how to find where data lives with the data dictionary, paging, and the generated reader the app handler calls.
---

# Sankhya Conexões

Esta Skill cobre as Conexões Sankhya deste Project: como investigá-las com `connector_fetch` enquanto você constrói, e como o aplicativo as lê. A Conexão é o único caminho até o Sankhya.

A requisição. Toda leitura usa `method: 'POST'`, `path: '/gateway/v1/mge/service.sbr'`, `query: { serviceName, outputType: 'json' }` e `body: { serviceName, requestBody }`, com o mesmo `serviceName` nos dois lugares. Há dois serviços de leitura, a consulta SQL e o `loadRecords`, descritos abaixo; qualquer outro é recusado com `SERVICE_REFUSED`. O contrato de cada serviço está na referência oficial, https://developer.sankhya.com.br/reference (a página `get_loadrecords` descreve o `loadRecords`). Leia-a com `web_fetch` quando precisar de um detalhe que esta Skill não traz.

A consulta SQL é `DbExplorerSP.executeQuery`, com `requestBody: { sql }`. É com ela que você descobre onde cada dado mora e junta tabelas. Para cada coisa que a pessoa pediu:

1. Na primeira consulta, descubra o banco: `SELECT 1 FROM DUAL` responde no Oracle e falha no SQL Server. Escreva toda SQL nesse dialeto.

2. Procure a palavra da pessoa nos rótulos do dicionário de dados do Sankhya, que são os nomes que as telas do Sankhya mostram: `SELECT NOMETAB, NOMECAMPO, DESCRCAMPO FROM TDDCAM WHERE UPPER(DESCRCAMPO) LIKE '%<PALAVRA>%'`. Use a raiz da palavra da pessoa, em maiúsculas: para 'transportadora', procure `TRANSPORT`. Tente também os sinônimos e a forma sem acento, porque o rótulo da tela pode usar outra palavra.

3. Confirme que a coluna existe antes de usá-la, porque o dicionário lista campos que a tabela não tem. No Oracle: `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '<TABELA>'`; no SQL Server, `INFORMATION_SCHEMA.COLUMNS`.

4. Prove o campo com uma amostra parecida com o uso real: registros recentes e uma lista lida até o fim, porque uma amostra antiga ou pequena esconde listas com várias páginas, campos vazios e linhas repetidas. Conte quantas linhas da amostra têm o campo preenchido. Um campo que existe mas volta vazio não é fonte; procure outro.

5. Antes de juntar uma tabela, conte as linhas por chave. Se uma chave tem várias linhas, a tabela guarda histórico, uma linha por data ou por vigência. Escolha a linha certa para cada chave antes de juntar, por exemplo a mais recente até a data que importa, porque juntar todas multiplica as linhas do resultado.

A consulta SQL só lê. O Conexus recusa com `INPUT_REFUSED` (issue `/body/requestBody/sql`) toda SQL que não seja uma única instrução `SELECT` ou `WITH`, ou que traga, fora de comentários e de textos entre aspas, uma palavra como `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `EXEC`, `CALL` ou `INTO`. Um apelido de coluna com um desses nomes precisa de outro nome. Não contorne a recusa: reescreva a consulta como uma leitura.

A consulta não tem parâmetros: o valor vai escrito dentro da SQL. Por isso o handler só coloca na SQL um valor que ele mesmo validou antes: um número conferido com `Number.isInteger`, uma data conferida no formato `AAAA-MM-DD`, ou um código escolhido de uma lista fixa do próprio aplicativo. Nunca coloque na SQL um texto livre digitado pela pessoa. Quando a leitura cabe numa entidade só, prefira `loadRecords`, que leva o valor em `parameter`.

`CRUDServiceProvider.loadRecords` lê uma entidade pelo nome de instância: `requestBody: { dataSet: { rootEntity: '<Entidade>', includePresentationFields: 'N', offsetPage: '0', criteria: { expression: { $: 'this.<CHAVE> = ?' }, parameter: [{ $: '<valor>', type: 'I' }] }, entity: [{ path: '', fieldset: { list: '<CHAVE>,<CAMPO>' } }, { path: '<Relação>', fieldset: { list: '<CAMPO_DA_RELAÇÃO>' } }] } }`. Todo valor vai em `parameter`, com `?` na expressão (`type` `I` para número, `S` para texto). O primeiro item de `entity`, com `path` vazio, é a própria entidade; cada entidade relacionada é mais um item da lista, com o nome da relação em `path`, e não um campo dentro do primeiro item. O nome da entidade e o da relação vêm do dicionário ou de uma leitura; nunca os adivinhe.

O `loadRecords` responde `responseBody.entities`: `metadata.fields.field` lista o nome de cada coluna, na ordem, e cada linha de `entity` traz os valores como `f0`, `f1`, ... nessa ordem, no formato `{ $: 'valor' }`, ou `{}` quando vazio. `entity` é uma lista quando a página tem várias linhas e um objeto quando tem uma. Todo valor chega como texto. Cada resposta é uma página: `total` conta as linhas desta página, não da lista inteira, e `total: '0'` é nenhuma linha. A lista só termina quando `hasMoreResult` não é `'true'`; até lá, leia a página seguinte aumentando `offsetPage`.

A consulta SQL responde `responseBody.fieldsMetadata`, com o nome de cada coluna em `name`, na ordem, e `responseBody.rows`, uma lista de linhas em que cada linha é uma lista de valores nessa ordem. Monte cada linha como `{ NOME_DA_COLUNA: valor }`. Aqui um decimal chega como número JSON, que perde precisão, e uma data chega como texto `DDMMYYYY HH:MM:SS`. Converta os dois na própria SQL; no Oracle, `TO_CHAR(VALOR, 'FM999999999990.00')` dá o decimal com ponto, na escala do valor, e `TO_CHAR(DATA, 'YYYY-MM-DD')` dá a data. Sem um formato, o separador decimal da sessão pode ser a vírgula. Faça as contas com decimais na SQL, onde o banco calcula exato.

No aplicativo, o handler lê pelo leitor que o Conexus gera a cada verificação em `conexus/sankhya.gen.ts`: `import { loadAllRecords, queryRows } from '../sankhya.gen.ts'`. `loadAllRecords(connectors, '<Conexão>', dataSet)` lê a lista até o fim, página por página, e devolve cada linha como `{ CAMPO: texto ou null }`; `queryRows(connectors, '<Conexão>', sql)` devolve cada linha da consulta como `{ COLUNA: valor }`. Os dois respondem `{ ok: true, rows, complete }` ou `{ ok: false, code }`. Com `complete: false`, a lista passou do limite de páginas, e a tela avisa que ela está cortada. Use o `dataSet` ou a SQL que você testou no `connector_fetch` e o mesmo nome local da Conexão. O leitor chama `connectors.fetch`, e cada página gasta uma das chamadas que o handler tem. Decimais e datas seguem como texto até a tela.

Quando a pessoa digita um código para achar um registro (um número de documento, um documento de cadastro, um nome), a busca pode achar nenhum, um ou vários registros. Trate os três: nenhum tem uma mensagem, um só aparece direto, vários deixam a pessoa escolher. Nunca assuma que o primeiro resultado é o único. No Sankhya, o número de documento (`NUMNOTA`) se repete entre tipos de operação, empresas e séries, então filtre pelo tipo de operação que a pessoa quer.

## Sources and license

The note that one document number can match several documents comes from https://github.com/andressaolivi/sankhya-skills (MIT). The request format, the services and the table, entity and field names are generic Sankhya ones the connector's native rule admits, and the dictionary method follows the Sankhya developer reference. No company value, host, URL, header or credential name enters this text.
