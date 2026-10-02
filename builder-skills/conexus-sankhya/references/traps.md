# Sankhya traps

Each of these gives a wrong number without an error. Check your SQL against the list.

- Taking a TOP number from memory, a public example or another Project. Codes mean what this company configured.
- Joining `TGFTOP` or `TGFTPV` on the code alone. Join on the code and the version (`DHALTER`).
- Treating one kind of movement as one business concept. A bonus shipment, a consignment or a return can share it with a sale.
- Reading a TOP's description as proof. Check its flags and what its documents do.
- Counting orders and the notes made from them together.
- Leaving returns out of a total, or counting them twice, without asking how the person treats them.
- Treating one status letter as "done" in every company. Read the letters in `TDDOPC` and ask which one the person means.
- Looking for a cancelled status. A cancelled document is kept elsewhere or deleted.
- Using the wrong date. The negotiation, billing, movement and exit dates can differ on the same document.
- Treating `RECDESP` as text. It is numeric.
- Calling a title open only because `DHBAIXA` is empty, without checking partial payments, provisions and renegotiation.
- Trusting a partner flag such as `CLIENTE` without counting partners that have documents.
- Ignoring the company dimension, or summing companies the person did not ask for.
- Treating a public repository's custom fields as standard, or missing custom tables that do not start with `AD_`.
- Copying field names from public notes without checking them. Some public notes name fields that do not exist; confirm every column in this database.
- Selecting a calculated field in SQL.
- Writing `LIKE 'AD_%'` without escaping the underscore, which matches any character.
- Using today's price or cost for a past date.
- Writing SQL that only one engine accepts, without checking the engine.
- Joining a history table without picking one row per key.
- Trusting the number of rows a read returned. Count and sum in SQL and compare.
- Reusing a mapping from the Project memory without running its query again.
