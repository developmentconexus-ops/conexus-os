---
name: conexus-sankhya
description: Investigates a company's Sankhya before reading it or writing code that reads it. Sankhya is configured per company, so the skill teaches how to find what each code and field means in this company's data, what to ask the person, and how to record each proven mapping in the Project memory. Also covers the request format, the two read services, paging and the generated reader the app handler calls.
---

# Sankhya Conexões

Every company configures its own Sankhya. The tables and columns are the same everywhere. What they mean is not: which operation types (TOP) are a sale, which date counts, which status means done, which custom fields and views carry the real rule. Find each of these in this company's data, ask the person what the data cannot settle, and record what you proved. Never take a code or a meaning from what you know of other companies, from public examples, or from a field's name alone.

The Conexão is the only way to Sankhya. Investigate with `connector_fetch` while you plan and build. The app reads through the generated reader, below.

## Generic and per company

Trust these as generic: the request format and services below, the standard table and column names, the data dictionary tables, and how documents, operation types and payment terms are versioned.

Discover these per company, every time:
- Which TOP codes exist, what their flags say, and which ones the person's word covers. Several TOPs can fit one word.
- Which documents are orders and which are notes, and whether one became the other.
- Which date the person means, and which status they treat as done.
- What each letter or code in a field means. The meanings live in the dictionary, and a company can add its own.
- Custom fields (`AD_` prefix), custom tables, views and reports that already define a number.
- Which companies and branches count, and how revenue and costs are classified.

## Before you start

Read the Project memory lines about this Conexão. A recorded mapping holds the query that proved it. Run that query again and compare the result with what the memory says before you rely on it. If it no longer matches, investigate that part again and update or delete the memory.

## Investigate in stages

Work through the stages for each thing the person asked for. Each ends when its "done when" holds. `references/topics.md` lists, per topic, the tables, the columns to check, what varies and what to ask. Read the topic's row before stage 3.

### 1. Name the concept

Write the person's word and the business concept behind it, such as a sale, a customer or a receivable. List the tables that may hold it. Use no codes yet.

Done when you have the concept and its candidate tables.

### 2. Find the engine

Run `SELECT 1 FROM DUAL` as the first query. It answers on Oracle and fails on SQL Server. Write every query in that dialect, and prefer portable SQL (`COALESCE`, `CASE`, `CAST`).

Done when you know the engine.

### 3. Read the dictionary

1. Search the person's word in the field labels the Sankhya screens show: `SELECT NOMETAB, NOMECAMPO, DESCRCAMPO FROM TDDCAM WHERE UPPER(DESCRCAMPO) LIKE '%<WORD>%'`. Use the root of the word in capitals, without accents, and try synonyms. For 'transportadora', search `TRANSPORT`.
2. Confirm each column exists before you use it, because the dictionary lists fields a table does not have. On Oracle: `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '<TABLE>'`. On SQL Server: `INFORMATION_SCHEMA.COLUMNS`.
3. For a field that holds a code or a letter, read what each value means in this company's option list, `TDDOPC`. A company can add its own options.
4. List the custom fields of each table you will use. Escape the underscore: `LIKE 'AD\_%' ESCAPE '\'`. Read their labels in `TDDCAM`.
5. A field marked as calculated in the dictionary is not a column. Do not select it in SQL.

Done when every column you plan to use exists, and you know what each of its codes means here.

### 4. Measure what is really used

The configuration says what is possible. The documents say what this company does.
1. Read the current configuration of what the concept depends on, such as the current version of each operation type with its flags.
2. Group recent documents by the fields that classify them (operation type, kind of movement, status, company) with their counts and totals. Use the last months, read to the end.
3. Count how many rows have each field you need filled. A field that exists but comes back empty is not a source. Find another.
4. Propose which codes the person's concept covers, from the flags and the real use together. A description is a hint, not proof.

Done when you have a proposal with the counts behind it.

### 5. Join and count safely

Wrong SQL here returns a number that looks right. Follow these rules exactly:
- Operation types (`TGFTOP`) and payment terms (`TGFTPV`) are versioned by `DHALTER`. A document stores the version it used, in `DHTIPOPER` and `DHTIPVENDA`. Join on the code and the version: `CAB.CODTIPOPER = TOP.CODTIPOPER AND CAB.DHTIPOPER = TOP.DHALTER`. A join on the code alone multiplies rows and gives old documents today's flags.
- Before you join any other table, count its rows per key. If a key has several rows, the table keeps history. Pick the right row per key first, such as the one valid on the date that matters.
- Orders and the notes made from them are separate documents. Count one or the other, never both. `TGFVAR` links a note to its origin.
- No status means cancelled. A company may keep a cancelled document elsewhere or delete it. Find which before you decide what a missing document means.
- Write the SQL in the engine's dialect. Convert decimals and dates in the SQL, as described below.
- Count and sum in SQL, and compare the total with the rows you read. A read can return fewer rows than exist.

Done when every join has a proven key and the totals match the row counts.

### 6. Settle or ask

Reconcile your result with a number the person already trusts, such as a report they use, when one exists. Ask for its definition, never for the data.

Ask the person only what the data cannot settle. Each question covers one decision. Write it in their business words, never a table, a field or a code. Build the options from what you found, such as the operation types with their descriptions and counts, and put your recommendation first, with its reason. While planning, put the question on the plan's open decisions list and let the plan's interview ask it. A meaning the person does not give stays open. Never guess it.

Done when each meaning is proven by the data, confirmed by the person, or open with what it leaves off.

### 7. Record the mapping

Save each mapping in the Project memory, `.conexus/memory/`, in the format the system prompt gives. Use `source` for a mapping the data proved and `rule` for one the person confirmed. The memory holds:
- the concept, in the person's words;
- the codes and fields it maps to here, such as the operation types that count and the date field;
- the query that proved it, with the counts it returned and the date you ran it;
- for a `rule`, what the person said.

Configuration codes, such as an operation type number, belong in this Project's memory. Data values, such as amounts, names or document numbers, never do.

Done when each mapping you rely on has a memory with its query.

## Reading Sankhya

Every read uses `method: 'POST'`, `path: '/gateway/v1/mge/service.sbr'`, `query: { serviceName, outputType: 'json' }` and `body: { serviceName, requestBody }`, with the same `serviceName` in both places. There are two read services, the SQL query and `loadRecords`. Any other is refused with `SERVICE_REFUSED`. The contract of each is in the official reference, https://developer.sankhya.com.br/reference (the page `get_loadrecords` covers `loadRecords`). Read it with `web_fetch` when you need a detail this skill does not give.

### SQL query

`DbExplorerSP.executeQuery`, with `requestBody: { sql }`. Use it to investigate and to join tables.

It only reads. Conexus refuses with `INPUT_REFUSED` (issue `/body/requestBody/sql`) any SQL that is not one `SELECT` or `WITH` statement, or that holds, outside comments and quoted text, a word such as `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `DROP`, `ALTER`, `EXEC`, `CALL` or `INTO`. A column alias with one of these names needs another name. Do not work around the refusal. Rewrite the query as a read.

The query takes no parameters, so a value goes inside the SQL. The handler puts in the SQL only a value it validated first: a number checked with `Number.isInteger`, a date checked as `YYYY-MM-DD`, or a code picked from a fixed list in the app. Never put free text the person typed in the SQL. When the read fits one entity, prefer `loadRecords`, which carries the value in `parameter`.

The response holds `responseBody.fieldsMetadata`, with each column's name in `name`, in order, and `responseBody.rows`, a list of rows where each row is a list of values in that order. Build each row as `{ COLUMN_NAME: value }`. A decimal arrives as a JSON number, which loses precision, and a date arrives as text `DDMMYYYY HH:MM:SS`. Convert both in the SQL. On Oracle, `TO_CHAR(VALUE, 'FM999999999990.00')` gives the decimal with a point, at the value's scale, and `TO_CHAR(DATE, 'YYYY-MM-DD')` gives the date. Without a format, the session's decimal separator may be a comma. Do arithmetic on decimals in the SQL, where the database computes it exactly.

### loadRecords

`CRUDServiceProvider.loadRecords` reads one entity by its instance name: `requestBody: { dataSet: { rootEntity: '<Entity>', includePresentationFields: 'N', offsetPage: '0', criteria: { expression: { $: 'this.<KEY> = ?' }, parameter: [{ $: '<value>', type: 'I' }] }, entity: [{ path: '', fieldset: { list: '<KEY>,<FIELD>' } }, { path: '<Relation>', fieldset: { list: '<RELATION_FIELD>' } }] } }`. Every value goes in `parameter`, with `?` in the expression (`type` `I` for a number, `S` for text). The first item of `entity`, with an empty `path`, is the entity itself. Each related entity is one more item in the list, with the relation's name in `path`, not a field inside the first item. The entity and relation names come from the dictionary (`TDDINS`) or from a read. Never guess them.

The response holds `responseBody.entities`. `metadata.fields.field` lists each column's name, in order, and each row of `entity` carries the values as `f0`, `f1`, ... in that order, as `{ $: 'value' }`, or `{}` when empty. `entity` is a list when the page has several rows and an object when it has one. Every value arrives as text. Each response is one page: `total` counts the rows of this page, not of the whole list, and `total: '0'` means no rows. The list ends only when `hasMoreResult` is not `'true'`. Until then, read the next page by increasing `offsetPage`.

### In the app

The handler reads through the reader Conexus generates on every check at `conexus/sankhya.gen.ts`: `import { loadAllRecords, queryRows } from '../sankhya.gen.ts'`. `loadAllRecords(connectors, '<Conexão>', dataSet)` reads the list to the end, page by page, and returns each row as `{ FIELD: text or null }`. `queryRows(connectors, '<Conexão>', sql)` returns each row of the query as `{ COLUMN: value }`. Both answer `{ ok: true, rows, complete }` or `{ ok: false, code }`. With `complete: false`, the list was cut, past the page limit or by Sankhya, and the screen says so. Use the `dataSet` or the SQL you tested with `connector_fetch`, and the same local name of the Conexão. The reader calls `connectors.fetch`, and each page spends one of the handler's calls. Past them, the read fails with `CALL_LIMIT`, so aggregate in SQL rather than reading many pages. Decimals and dates stay text up to the screen.

### Finding one record

When the person types a code to find a record (a document number, a registration number, a name), the search can find none, one or several records. Handle all three: none shows a message, one shows directly, several let the person choose. Never assume the first result is the only one. In Sankhya, the document number (`NUMNOTA`) repeats across operation types, companies and series, so filter by the operation types your recorded mapping settled.

## References

- `references/topics.md`: per topic, the tables, the columns to check, what varies per company and what to ask. Read the topic's row before stage 3.
- `references/traps.md`: mistakes that give a wrong number without an error. Read it before you write the SQL a screen will show, and again before you finish.

## Sources and license

The investigation method, the per-topic notes and the traps come from the Sankhya help center (https://ajuda.sankhya.com.br) and developer reference (https://developer.sankhya.com.br), and from https://github.com/andressaolivi/sankhya-skills (MIT), which also gave the note that one document number can match several documents. That repository's dictionary describes one company, so its custom fields are not generic, and some of its field names do not exist. No company value, host, URL, header or credential name enters this text.
