# Sankhya topics

Each topic lists the tables, the columns to check, what varies per company, how to discover it and what to ask. Column names here are candidates. Confirm each one exists in this company's database (stage 3) before you use it. Codes and letters mean what this company's `TDDOPC` and its documents say, never what this page or a public example says.

## Operation types (TOP)

- Tables: `TGFTOP`, versioned by `CODTIPOPER` plus `DHALTER`.
- Columns to check: `TIPMOV` (kind of movement), `ATUALEST` (moves stock), `ATUALFIN` and `TIPATUALFIN` (makes financial titles), `PENDENTE`, `GOLSINAL`, `GOLDEV` (a return), `ANALISEGIRO`, `BONIFICACAO`, `NAOINCCONF`, `CODTIPOPERDESTINO`, `EXIGELIB`, `EXIGECONF`, `PRECIFICA`, `NFE`, `GRUPO`, `DESCROPER`.
- Varies: the codes, their descriptions and flags. Several TOPs can fit one business word, such as a normal sale, a bonus shipment, a consignment, a shipment to a branch or an online channel. One kind of movement does not equal one business concept.
- Discover: the current version of each TOP (the latest `DHALTER` per code). What documents really use, grouped by TOP, kind of movement and status, with counts and totals. The version history of a TOP you rely on. The meaning of each `TIPMOV` letter in `TDDOPC`.
- Ask: which of the operation types you found count for the person's concept, shown by their descriptions, with your recommendation. Keep the counts for your own check; they never go in a message or in memory.

## Document header and items

- Tables: `TGFCAB` (header, key `NUNOTA`), `TGFITE` (items, `NUNOTA` plus `SEQUENCIA`), `TGFVAR` (which document came from which).
- Columns to check: `CODTIPOPER`, `DHTIPOPER`, `CODTIPVENDA`, `DHTIPVENDA`, `STATUSNOTA`, `PENDENTE` (on header and items), `APROVADO`, `TIPLIBERACAO`, `STATUSNFE`, `NUMNOTA`, `SERIENOTA`, `CODEMP`, `CODPARC`, `CODVEND`, and the dates `DTNEG`, `DTFATUR`, `DTMOV`, `DTENTSAI`.
- Varies: which TOPs make orders and which make notes. Whether notes are born approved. Which date the company reports by. Whether cancelled documents are kept (look for `TGFCAN`) or deleted (look for `TGFCAB_EXC` and `TGFITE_EXC`).
- Discover: group recent documents by TOP and `STATUSNOTA` and read the letters in `TDDOPC`. For a TOP that makes orders, check in `TGFVAR` whether its documents became notes. Compare the date fields on the same documents to see which ones differ.
- Ask: when something happens for the person, such as when the order is placed, when the note is issued or when the goods leave. Whether a cancelled document should show anywhere.

## Finance

- Tables: the financial titles table (find it in `TDDTAB` by its description) and `TGFTIT` (title types).
- Columns to check: `RECDESP` (numeric: 1 receivable, -1 payable, not text), `PROVISAO`, `DTVENC`, `DHBAIXA`, `VLRBAIXA`, `VLRDESDOB`, `ORIGEM`, `NUNOTA`, `CODTIPTIT`, `CODNAT`, `CODCENCUS`, `CODPROJ`, `CODVEND`, `CODEMP`, `NURENEG`.
- Varies: the title types, whether the company uses provisions, manual titles without a document, renegotiation.
- Discover: group titles by `RECDESP`, `PROVISAO`, `CODTIPTIT` and `ORIGEM` with counts. A title is linked to its document by `NUNOTA` in some setups and by `NUMNOTA` plus `SERIENOTA` in others. Test both on known documents and keep the one that matches.
- Ask: which payment forms count, what "em aberto" means for the person, and whether planned titles count.

## Partners and products

- Tables: `TGFPAR` (partners), the products table (find it in `TDDTAB` by its description), `TGFGRU` (product groups).
- Columns to check: on `TGFPAR`, `CLIENTE`, `FORNECEDOR`, `VENDEDOR`, `TRANSPORTADORA`, `ATIVO`, `CODVEND`. On the products table, `USOPROD`, `CODGRUPOPROD`, `ATIVO`. On `TGFGRU`, `CODGRUPAI`, `GRAU`, `ANALITICO`.
- Varies: the partner flags are independent, and a company may not keep them up to date. One partner can be customer and supplier. How `USOPROD` and the group tree are used. Code masks live in `TSIPAR`.
- Discover: count partners with documents of the concept against partners with the flag set. Walk the group tree from the root to see its levels.
- Ask: how the person groups products, and whether a partner with no flag but with documents counts.

## Companies and branches

- Tables: `TSIEMP`, with `CODEMPMATRIZ`. On `TGFCAB`, `CODEMP` and `CODEMPNEGOC`.
- Varies: which companies issue what, whether cost, stock and price are kept per company (parameters such as `CUSTOPOREMP` in `TSIPAR`), sales between the group's own companies.
- Discover: group documents of the concept by `CODEMP` and by `CODEMPNEGOC`. Check whether the partner of some documents is one of the group's companies.
- Ask: which companies the person wants, whether to show them together or apart, and whether sales between the group's companies count.

## Classifications

- Tables: `TGFNAT` (natures, with `ANALITICA`, `TIPNAT`, `INCRESULT`), `TSICUS` (cost centers), `TCSPRJ` (projects), `TGFVEN` (salespeople, with `TIPVEND`), `TGFRAT` (apportionment).
- Varies: the whole plan of accounts. Only analytic entries take postings. A posting can be split across several entries in `TGFRAT`.
- Discover: read the tree of each classification the concept uses, and count postings per entry.
- Ask: how the person separates revenue or cost, which dimensions they use, and who counts as a salesperson.

## Payment terms (tipo de negociação)

- Tables: `TGFTPV`, versioned by `CODTIPVENDA` plus `DHALTER`, like the TOP.
- Columns to check: `SUBTIPOVENDA`, `DESCRTIPVENDA`, the link to title types.
- Discover: the terms documents really use, grouped with counts, joined on code and version.
- Ask: which terms matter for the person's question, and whether any term marks a channel.

## Parameters

- Tables: `TSIPAR`, keyed by `CHAVE`, with the value in the column its `TIPO` names. History in `TSIPARLGT`.
- Discover: read only the parameters that change the concept, such as cost per company.
- Ask about consequences, never about a parameter's name.

## Custom extensions

- Custom fields start with `AD_` and are in the dictionary. Custom screens create tables named `AD_<name>`. Add-ons may use other prefixes, so also list tables in `TDDTAB` that are not standard.
- Dictionary tables: `TDDTAB` (tables), `TDDCAM` (fields), `TDDOPC` (options of a field), `TDDINS` (instance names for `loadRecords`), `TDDLIG` (relations), `TDDPCO` (field properties).
- Database comments are usually empty. The meaning lives in `TDDCAM` labels and `TDDOPC` options.
- A field marked as calculated (`CALCULADO`) is not a column.
- Varies: everything. A public repository's custom fields describe that one company.
- Ask: what a custom field or screen you found means, when its label and options do not settle it.

## Views and stored definitions

- Companies add views, triggers, procedures, BI queries and formulas. A view may already define the person's concept.
- Discover: on Oracle, list views with `USER_VIEWS`. On SQL Server, `INFORMATION_SCHEMA.VIEWS`. Read the ones whose names match the concept.
- Ask: for a report the person already trusts and how it defines the number. Ask for the definition, never the data.

## Option values (TDDOPC)

`TDDOPC` is the source of truth for what a letter or code in a field means, the company's own options included. Read it for every coded field before you filter by it.

## Oracle and SQL Server

Detect the engine with `SELECT 1 FROM DUAL` (Oracle) or `SELECT @@VERSION` (SQL Server). Prefer portable SQL: `COALESCE`, `CASE`, `CAST`. Dates, string concatenation, row limits and `LIKE` escapes differ between them. When a read fits one entity, `loadRecords` with typed parameters avoids the dialect.

## Validity and versions

- Price tables: `TGFTAB` (`NUTAB`, `CODTAB`, `DTVIGOR`) with prices in `TGFEXC`. Cost: the cost table (find it in `TDDTAB`), by its update date.
- Use the version valid on the date of interest, not the latest one.
- Ask: which price or cost counts, and on which date.
