# 27. Why the Builder built a weak quote analysis app

Date: 2026-09-29. Read only investigation. Values from the company ERP are never written here. Field
names, shapes and counts only.

## Answer first

The Builder delivered a shell. The app finds a TOP <orçamento> quote by its document number and lists the first
page of its items. Four of the six things the request asked for (average cost without ICMS, variable
cost, promotional price, stock) show "Não disponível" on every line. The Claude Code run (B) found all
four in the ERP and verified 1313 item values against raw data.

The model is not the main cause. The Builder never learned where those four concepts live in the ERP,
because nothing it had could tell it: the only read was `loadRecords` by entity name, and the Sankhya
guide names only the purchase order entities. It then had no way to run its own handlers against real
data, so the page limit bug and a broken selection flow shipped under a green check. It also explored
with the guide's example document, an old quote with 3 lines, so no edge case ever appeared.

Five root causes, ranked by impact, are in section 3. Proposals are in section 5.

## 1. Evidence read

| Source | What it gave |
| --- | --- |
| `builder.builder_run` (branch Postgres) | 5 runs, their threads, request text, digests, states |
| `builder.builder_run_model_account` and `model.model_account` | all 5 runs on account `1ccffa41`, provider `openai-codex`, kind `oauth` |
| `factory.mastra_messages` | 31 messages in 3 threads (tool args there are stored as a field list projection, not values) |
| `factory.mastra_ai_spans` | 577 spans. Model, tools offered, system prompt, and the full connector inputs and outputs the model saw |
| `<branch-state>/logs/hub.log` | Hub restarts, connector spans (agent and handler), check results |
| Bare repo `dd54e404...git`, `main` at `6cf12fd` | the admitted app |
| `<worktree>` at `04d06b49` (the Hub the run used) and `27d02d1d` (head) | prompt, guide, tool, limits |
| `<home>/cmp-2026-09-29-orcamentos` | B's BRIEF.md, WORKLOG.md, server and screen |
| `<mastra-clone>/mastracode/sdk/src/agents/prompts/{plan,build}.ts`, `sdk/src/evals/scorers/outcome.ts` | how Mastra Code handles planning, verification and outcome scoring |

Facts that correct the unit brief:

- The model spans record `gpt-6-luna` through `openai.responses` on the Codex OAuth account, at
  Mastra Code's default reasoning effort (medium). The brief said gpt 5.6 Sol. The span is the record.
- The run started 13:26 on the Hub that restarted at 13:21 with head `04d06b49`. The next restart, at
  13:42, brought `27d02d1d`, which added SQL (`89a33b0e`). So run A had `loadRecords` only. Confirmed.
- `model-input-planejar.txt` and `model-input-construir.txt` are a capture from another worktree
  (`wt-night-input`). Their Project knowledge is the conexus-os AGENTS.md and their Sankhya section
  teaches `connectors.call`. The prompt this run really got is the first system message of its model
  spans. It differs in those two places and matches the files elsewhere. This study quotes the span.

## 2. Timeline of run A

Three conversations. Only the last one built.

### Conversation 1 (`f0cf79dd`), runs 8c6592ae and 8622591d

| Time | Step | Result |
| --- | --- | --- |
| 13:06:10 | Person sends the first sentence of the request only | |
| 13:06:14 | Lists files, loads `conexus-app-code` and `conexus-app-ui` | |
| 13:06:26 | Replies that the Project has no Sankhya Conexão | Right. None was bound |
| 13:06:49 | Person: "Vinculei" | |
| 13:07:03 | `connector_fetch` with `CabecalhoNota`, TOP <orçamento> and `TIPMOV = 'P'` | `SERVICE_REFUSED` (the Hub at that time still refused this) |
| 13:07:12 | Says the read was refused and only purchase orders can be read | Honest given the refusal |

### Conversation 2 (`22910420`), runs 2c3319d8 and de1eaca7

| Time | Step | Result |
| --- | --- | --- |
| 13:22:17 | Full request (647 characters) | |
| 13:22:22 | Task list: explore, define rules, plan | |
| 13:22:32 | Read 1. `CabecalhoNota` by `NUMNOTA` and TOP <orçamento>, with a `path: 'Produto'` inside the single entity | `PROVIDER_ERROR`, relation not found on the header |
| 13:22:43 | Read 2. Same header, 7 fields, no relation. The number is the guide's own example number | 2 rows, `total: '2'`, `hasMoreResult: 'false'` |
| 13:23:11 | `web_fetch` to a consulting site for "references" | timeout |
| 13:23:31 | Read 3. `ItemNota` with `path: 'Produto'` | `PROVIDER_ERROR`, vendor NPE |
| 13:23:36 | Read 4. `ItemNota` by `NUNOTA`, 7 fields | 3 rows, one page |
| 13:23:52 | `ask_user`: how to read markup <fator>? Options "Custo × <fator> (recomendado)", "Margem de <x>%", "Outra regra" | Person picks "Outra regra" |
| 13:25:22 | Person presses stop | run cancelled |
| 13:25:44 | Person: "Parei para te falar que é <fator> * Custo não outra regras" (run de1eaca7) | cancelled after 5 s, reason `USER_CANCELLED`, no step ran |

### Conversation 3 (`afd30fe1`), run 4f2c0807, the build

The person opened a new conversation and resent the original request. Its request digest equals run
2c3319d8's. The clarification never reached this thread, and the Project knowledge said "None yet".

| Time | Step | Result |
| --- | --- | --- |
| 13:26:02 | Same 647 character request | |
| 13:26:07 | Task list: understand app, validate Sankhya fields, define rules, plan | |
| 13:26:15 | Read 1. `CabecalhoNota` root with `path: 'ItemNota'` inside the single entity | `PROVIDER_ERROR`, vendor NPE |
| 13:26:36 | Read 2. `CabecalhoNota` where `CODTIPOPER = <TOP de orçamento>`, 7 fields, page 0 | 50 rows, `total: '50'`, `hasMoreResult: 'true'`. The oldest quotes, about twenty years old |
| 13:27:04 | Read 3. Header by the guide's example number and TOP <orçamento> | 2 rows |
| 13:27:22 | Read 4. `ItemNota` of the first match | 3 rows, one page |
| 13:27:38 | Read 5. `ItemNota` with `path: 'Produto'` and the item fields | `PROVIDER_ERROR`, invalid field descriptor |
| 13:27:49 | `ask_user`: where does the promotional price come from? | "Preço promocional do cadastro" |
| 13:28:07 | `ask_user`: what is "custo variável"? | "Custo variável do Sankhya" |
| 13:34:24 | `ask_user`: which stock counts? | "Disponível na empresa" |
| 13:35:24 | Writes `.conexus/plans/analise-orcamentos.md` and calls `submit_plan` | approved by 13:36:10 |
| 13:36:21 | Loads `conexus-server`, `conexus-app-code`, `conexus-app-ui` | |
| 13:36 to 13:38 | Writes `conexus/manifest.json` (2 operations), `conexus/handlers/quotes.ts`, `app/src/routes/home.tsx`, `AGENTS.md` | no further `connector_fetch` |
| 13:39:08 | `conexus_check` | typecheck fails, TS1131 in the handler |
| 13:39 | Three edits to the handler types | |
| 13:40:1x | `conexus_check` | all 5 steps pass, 2 operations, 0 migrations |
| 13:40:40 | `task_check` 4 of 4, final message | Says cost, promo and stock were not confirmed and show as unavailable |

Totals for run 4f2c0807: 15 minutes wall clock. About 2 minutes exploring (5 reads, 3 useful), about 7
minutes waiting on the person (3 questions and approval), about 4.5 minutes building. 5 of the 50
connector calls in the run budget were spent.

After the build, the Preview handler made 18 reads between 13:59 and 14:13. All were header reads
(14 answers of one row, 4 of none). No item read ever reached the ERP.

### The plan (shape, no values)

The person-facing part promised every metric "quando esses dados estiverem acessíveis". The Construir
part said plainly: "A entidade/campo exatos desses quatro dados não foram confirmados na leitura da
Conexão. Antes de implementá-los, validar os campos reais via leitura Sankhya". It listed markup as
"custo unitário × <fator>" as an assumption.

### The code admitted

- `analyzeQuote({ documentNumber })` reads `CabecalhoNota` by `NUMNOTA` and `CODTIPOPER = <TOP de orçamento>`, page 0,
  returns up to 50 headers.
- `quoteItems({ documentId })` reads `ItemNota` by `NUNOTA`, page 0 only, 6 fields, no product
  description.
- The screen shows a native `select` whose first option is "Selecione um orçamento", even when there
  is one match. Items load only after a pick. Four columns print "Não disponível" on every row.
  Markup shows as a static "<fator>×" card with no computation.

### Decision scorecard against B

| Decision | A | B | Verdict for A |
| --- | --- | --- | --- |
| Quote key | `NUMNOTA` with TOP <orçamento> | `NUMNOTA` with TOP <orçamento>, `NUNOTA` fallback | Right |
| Duplicate matches | lists them, never takes the first | lists them, chooser | Right in intent. Wrong in effect: one match still needs a pick, and the Preview log shows no item read ever |
| TOP <orçamento> | filter in every header read | same, and checked `TGFTOP` versions | Right |
| Items pagination | page 0 only. Saw `hasMoreResult: 'true'` on the header list and ignored it for items | pages until `hasMoreResult` is not `'true'` (full pages of 50, then a shorter last page, for the test quote) | Wrong. A <N> line quote shows 50 |
| `total` meaning | follows the guide ("quantas linhas existem") | page row count, not the grand total | Guide wrong, A never tested it |
| Average cost without ICMS | never read | `TGFCUS.CUSSEMICM`, latest `DTATUAL` per product and company | Missing |
| Variable cost | never read | `TGFCUS.CUSVARIAVEL`, cross-checked with `TGFITE.CUSTO` | Missing |
| Sale price | quote line `VLRUNIT` only | net line price and current table price (`TGFTAB` plus `TGFEXC`, per local) | Partial |
| Promotional price | never read, asked the person where it lives | `TGFDES` rules by product or group, formula proven on one line | Missing |
| Stock | never read, asked the person which stock | `TGFEST`, available per lot floored at 0, at the line's company and local | Missing |
| Markup <fator> × cost | assumed, never computed | computed in Oracle for both cost bases | Right rule, no result |
| Decimals | kept as strings from `loadRecords` | computed in Oracle, returned as fixed scale text, NLS separator forced | Right for what it did |
| Product description | two failed relation attempts, then dropped | joined | Missing |
| Verification | typecheck, build, boot with minimal values | own server end to end, 1313 field checks, 3 quotes, headless UI check | Missing |

## 3. Root causes, ranked by impact

### RC1. The Builder had no way to find where a business concept lives in the ERP

Impact: four of six requested metrics absent. This alone makes the app useless for its purpose.

Why chain:

1. Why no cost, promo or stock? It never read any entity other than `CabecalhoNota` and `ItemNota`.
2. Why? It did not know which entity holds them. Its plan says so in those words. 45 calls were left.
3. Why not try names? The only read was `loadRecords`, which needs the entity's instance name. Nothing
   listed instance names. The prompt forbids guessing: "Never guess paths, names or signatures"
   (`harness/prompt/v2/conexus.md:130`), and the plan says "não inventar nomes".
4. Why did the guide not tell it? The Sankhya guide is a recipe for one case. Its only data paragraph
   is "Para pedidos de compra: o cabeçalho é `CabecalhoNota` ... os itens são `ItemNota` ... e a
   descrição em `Produto`". It has no method to find any other concept.
5. Why a recipe? It was written to prove the pilot's purchase order read. The guide encodes the answer
   for one app, not the method for any app. That is the root.

Layer: tool (no SQL, no dictionary at the time) and skill (guide is case shaped). Model is not the
owner: B found every source through the data dictionary `TDDCAM` searched by label, then confirmed
physical columns with `USER_TAB_COLUMNS`. Both need SQL. Head `27d02d1d` now admits a read only SQL
consult, which removes the tool half. The guide at head still teaches no discovery. It never mentions
`TDDCAM`, the dictionary, or how to map a person's word to a column.

What nothing taught: that an ERP has a data dictionary, and that searching it by the person's own label
("Custo Variável", "Descontos/Promoções") is how to find a concept.

### RC2. Nothing runs the app's handlers with real data before the person sees it

Impact: every behavior defect shipped silently. The item page limit (50 of <N> lines), the one match
that still needs a manual pick (no item read in 18 Preview calls), and the missing product description.

Why chain:

1. Why did the page limit ship? The handler reads `offsetPage: '0'` only.
2. Why was it not caught? The check "does not run handlers, touch data or click through features"
   (`harness/prompt/v2/build.md:44`). The `conexus-server` skill says the same: "It does not run the
   handlers or migrations, so a handler's logic is proven only when the Prévia calls it."
3. Why did the model not prove it another way? The prompt's proof step is reading: "walk each promise
   and acceptance check of the plan to the code that does it". There is no tool that calls an operation
   with a real input and returns what the screen would get.
4. Root: the Builder's definition of done is "compiles and opens". Proof by running is not possible in
   the harness, so the prompt settled for proof by reading.

Layer: check and stack, then prompt. Mastra Code's build prompt says the opposite: "Verify. Test that
it works. Don't assume, actually run it." (`sdk/src/agents/prompts/build.ts:52`). B wrote
`verify.mjs` and `ui-check.mjs` and found its own page limit bug that way ("My first verify run read
only page 0 and reported 50 lines").

### RC3. Exploration used an unrepresentative sample

Impact: the edge cases that shape the code never appeared. Pagination, repeated products, lots, zero
costs, reservations above stock. B met all of them on the first real quote.

Why chain:

1. Why no edge case? Every item read was of one quote with 3 lines. The header list was the 50 oldest
   TOP <orçamento> quotes.
2. Why that quote? Its number is the example number printed in the guide:
   `parameter: [{ $: '<example>', type: 'I' }]` in the investigation paragraph. It happens to be a real
   TOP <orçamento> quote in this ERP. Both conversations used it as the test input.
3. Why not a recent quote, or the person's own? The prompt says "read a small sample with
   `connector_fetch`, so the plan names real fields" (`harness/prompt/v2/plan.md:37`). It asks for
   field names, not for representative rows. Nothing says to ask the person for one real example when
   the request is about one record, although the request itself said "o número do orçamento que já
   aparece aqui". B's brief handed it a real test quote. That is a confounder in B's favor, and it is
   one question away for A.
4. Root: the prompt treats exploration as schema discovery. It never states that the sample must
   exercise the shape the app will meet.

Layer: prompt and skill. Model shares some blame. It saw `hasMoreResult: 'true'` on the 50 row header
page and still wrote a single page item read.

### RC4. The guide states wrong or ambiguous facts, and nothing tests them

Impact: 4 failed reads across two conversations, no product description, and a pagination rule that
invites the bug.

- "`total` diz quantas linhas existem". B measured `total` as the rows on the page (50 on each full page, fewer on the last). Still in
  `skill.ts:23` at head.
- "leia a próxima com `offsetPage` só se a tela precisar dela" (`skill.ts:62`). A quote screen always
  needs every line, but the sentence reads as "paging is optional".
- "Uma entidade relacionada entra como outro item de `entity`" is prose only. The one full example
  shows `entity` as a single object. The model put `path` inside that single object four times and got
  a vendor error each time. It gave up on the description.

Root: the guide is prose that no test runs against a real or recorded answer. A wrong sentence costs
every future run and nobody notices.

Layer: skill.

### RC5. The flow lost the person's correction and approved a plan that could not deliver

Impact: medium. The markup rule came out right only because the model's own default matched. The
larger cost is that approval went through with four of six metrics unconfirmed.

Why chain:

1. The markup question's recommended option was the correct rule. The person picked "Outra regra",
   which carries no text, then pressed stop to type the rule.
2. The follow-up run was cancelled after 5 seconds. The person then opened a new conversation and
   resent the original request. Memory is per thread, and the cancelled runs wrote nothing to
   `AGENTS.md`, so the correction was lost.
3. In the new thread the model asked three questions. Two of them ask the person where data lives
   ("de onde o gerente espera obter esse preço no Sankhya?", "Como devo interpretar custo variável?").
   The plan prompt forbids that: "Never ask what the files or the data can answer"
   (`plan.md:39`). The model asked because RC1 left it unable to answer from the data.
4. The plan's person-facing part softened the gap to "quando esses dados estiverem acessíveis". The
   plan prompt asks for "Where each piece of data comes from" but not for "what is not found yet".
5. Construir then followed "finish every part that does not depend on it" (`build.md:24`) and shipped
   the shell. It did not attempt the validation its own plan required.

Layer: flow and prompt. Root: the plan format has no place where an unconfirmed source blocks or
visibly flags the approval, and the stop path invites a restart that drops context.

## 4. Confounders

| Confounder | Evidence | Weight |
| --- | --- | --- |
| Model (gpt-6-luna medium vs Opus) | A got right what its inputs allowed: `NUMNOTA` plus TOP <orçamento>, duplicates, decimals as text, no invented data, an honest final message. Its model-owned misses: ignoring `hasMoreResult: 'true'`, the one match select, repeating the same relation mistake, not trying entity names with 45 calls left | Secondary. No run yet isolates it (proposal P6) |
| Tools and limits | Only `loadRecords` (confirmed on `04d06b49`). Run budget 50 calls, 5 spent, so `CALL_LIMIT` never applied. Largest answer 8 KB, far under 256 KiB. No SQL, no `TDDCAM` | Primary for RC1. The budget and caps did not matter |
| Request and interview | The request gave no quote number. A never asked for one. B's brief gave one. A asked 3 questions, 2 of them data questions it should have answered itself | Material for RC3 |
| Stack and check | Check runs generate, typecheck, build, server, boot with minimal values. No handler runs with data | Primary for RC2 |
| Prompt and skills | Teach reading real data first, but only "a small sample", only "names", only purchase orders, proof by reading code | Primary for RC3 and RC4 |
| Flow | Stop, cancelled follow-up, new conversation, empty Project knowledge, approval of a plan with 4 of 6 sources unconfirmed | RC5 |

## 5. What B had, and what A could have done anyway

B had SQL (`executeQuery`), which gave it the dictionary, physical columns, joins, window functions and
exact Oracle arithmetic. It had a real test quote from its brief, no call budget, a Node process it
could run, and a headless browser. It spent its first 5 minutes on discovery and its last 4 on proof.

A, with only what it had, could still have:

1. Asked the person for one real quote number, as the request invited.
2. Filtered headers by recent `DTNEG` instead of reading the oldest page.
3. Paged `ItemNota` after seeing `hasMoreResult: 'true'` on the header list.
4. Tried the relation as a second `entity` item, as the guide's prose says.
5. Shown the single match directly, as the guide says ("o pedido único quando vier com um item").
6. Spent some of its 45 remaining calls on likely instance names for stock and cost. Whether
   `loadRecords` would have reached `TGFCUS`, `TGFEXC` or `TGFDES` by instance name is unproven.

## 6. Proposals

Each one helps any app on any Conexão, not only this quote app. Removals come first.

### P1. Replace the guide's recipe with a discovery method (skill, subtract then add)

Change. In `connectors/sankhya/skill.ts`, delete the purchase order paragraph and its follow-up notes
paragraph (they belong to one app). Delete the real example document number and use a placeholder.
Fix `total`. Replace the paging sentence with "a leitura de uma lista termina quando `hasMoreResult`
não é `'true'`". Add one short method: find the database dialect first, map the person's words to
columns through the data dictionary (`TDDCAM` by `DESCRCAMPO`), confirm physical columns in the
session schema, then read a sample. Show the related entity as a two item `entity` array.

Why general. Every Sankhya app starts with "where does X live". The recipe answers that only for
purchase orders. The method answers it for any concept, and the net text barely grows.

Proof. Replay this request on a Hub with SQL. Pass when the plan names a source column for each of the
four metrics. Add it as an eval case (`quote-analysis`) beside the slice 7 cases.

Cost. One guide edit and one eval case. Mastra has nothing for this. Mastra Code's plan prompt says
"Trace data flow" for code only.

### P2. Give Construir a way to run an operation with real data (check and tool)

Change. A Construir tool that invokes one manifest operation in the Preview runner, with a real input,
through the same handler port and connector scope the Preview uses. It returns the output's shape and
counts to the model (arrays with lengths, which fields are empty), not the values. Then the build
prompt's proof step changes from "walk each promise to the code" to "call each read operation once with
a real input and compare the counts with what `connector_fetch` showed".

Why general. The check proves every app builds. Only a run with data proves that a list is complete,
that a join works, that an empty answer is handled. That gap caused every defect in RC2.

Proof. Replay this request. The tool's answer for the test quote must show <N> items, so a single page
handler fails the comparison. Also useful for the `sales-dashboard` eval case.

Cost. Medium. The runner, the handler port and the preview scope exist (study 22). New are the tool,
the shape projection, and a per-run cap. Mastra Code solves the same need with "actually run it" plus
a shell. Our sandbox has no connector, so the Preview runner is the right place, not the sandbox.

### P3. Make exploration representative (prompt, one sentence changed)

Change. In `plan.md:37`, replace "read a small sample ... so the plan names real fields" with "read a
sample that exercises the app: a recent record and a large one, and page to the end once. When the
request is about one record the person knows, ask them for one real example first."

Why general. Every connector app meets pagination, empty values and repeats. A sample of three rows
shows none of them.

Proof. Replay. Pass when the run reads at least one list to `hasMoreResult: 'false'` or asks for an
example number. A Mastra scorer (`createScorer` from `@mastra/core/evals`, as Mastra Code's
`outcome.ts` does over tool calls) can grade that from the run's messages.

Cost. One line. No mechanism.

### P4. Put paging and decoding in the stack, not in each app (stack)

Change. Ship one tested platform helper for handlers that reads a Sankhya list to the end (or to a
row cap) and decodes `metadata.fields` plus `f0..fN` into objects, for both object and array `entity`.
The guide then says "use it" instead of explaining the format.

Why general. Every Sankhya handler rewrites the same decode and gets paging wrong the same way. One
helper removes the class of bug and a paragraph of guide text.

Proof. A unit test on recorded answers: one page, three pages, last page as a single object, zero
rows. Then the replay from P2 shows <N> items.

Cost. Small. The decode already exists inside this app's handler and in B's verify. It fits the
"handlers import only `conexus/`" rule if it ships as a generated file like `types.gen.ts`.

### P5. Make the plan show what is unconfirmed, and keep corrections (flow)

Change. In `plan.md` "Write the plan", require a line per requested item with its source status:
confirmed field, or not found. The approval card shows the count of not found items above "Aprovar e
construir". For `ask_user`, keep a free text answer beside the options, so "Outra regra" carries the
rule and nobody needs to stop the run.

Why general. A person approving a plan must see what it cannot deliver. A choice that needs a stop to
explain loses context in any conversation.

Proof. Replay run 4f2c0807's inputs. The plan must list four "not found" lines. For `ask_user`, a
browser check that the free text reaches the tool result.

Cost. Prompt lines plus one UI element. Check the Mastra `ask_user` suspension schema and the Factory
UI before building our own free text field, since Mastra Code already ships an `ask_user` tool.

### P6. Separate the model from the harness with one control run (eval)

Change. Replay this request twice on the same Hub build with P1 to P3 in place. One run on gpt-6-luna,
one on Opus through the Builder.

Why general. It settles how much of any future gap belongs to the model, before we tune prompts for
one model.

Proof. Same scorecard as section 2 for both runs.

Cost. Two runs and a scorecard.

## 7. Unproven

- Whether `loadRecords` can reach the cost, price table, promotion and stock tables by instance name.
- Why run de1eaca7 was cancelled after 5 seconds. The row says `USER_CANCELLED`. The log says only
  `aborted`.
- Whether the person tried to pick the single match in the Preview. The log shows only that no item
  read reached the ERP.
- How gpt-6-luna would do with SQL and P1 to P3. P6 answers it.
