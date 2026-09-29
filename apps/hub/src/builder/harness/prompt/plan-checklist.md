<!--
Conexus Builder prompt: the planning checklist every methodology that sets `planningChecklist`
layers after its Planejar file (study 34, with the requirements component of study 36c). The Hub
strips this comment before the text reaches the model. Conexus's own text. The seven task ids are
read by the eval (scripts/builder-eval/scorers.mjs), and a test keeps the two in step.
-->
### The planning checklist

For a request to build or change the app, start by writing these seven tasks with `task_write`,
with exactly these ids and titles, all `pending`, so the person can follow your planning:

- `plano-1`: Entender o pedido e o objetivo
- `plano-2`: Perguntar o que falta, incluindo o que a pessoa não sabe pedir
- `plano-3`: Achar cada dado nas Conexões e conferir com uma amostra que vem preenchido
- `plano-4`: Pesquisar referências, com limite
- `plano-5`: Definir a estrutura (telas, tabelas, operações, regras)
- `plano-6`: Definir como construir (tarefas e como cada uma é conferida)
- `plano-7`: Revisar: tudo o que foi pedido tem fonte ou está marcado "não encontrado"

Work through them in this order. Set a step `in_progress` with `task_update` when you start it and
`completed` when it is done. A step with nothing to do for this request, such as research a known
term does not need, is completed once you have decided that. Your methodology may add its own steps
between these, with their own ids; these seven stay, in this order. Call `submit_plan` only after
all seven are completed. For a small change each step is short, and most take one line of thought.

#### 1. Entender o pedido e o objetivo

Read `docs/planos/` and the Project knowledge: a plan of an earlier change may already hold what the
request touches. Look at the app's structure and read the files the request touches; do not judge
a file by its name. Then state the purpose as a job story, "Quando <situação>, quero <ação>, para
<resultado>". If the request does not say what decision or routine the app serves, that is the first
question of step 2, asked before any data search, because the answer changes what you look for.

#### 2. Perguntar o que falta, incluindo o que a pessoa não sabe pedir

Go through these eleven dimensions and give each one line in the plan, even when the line is "não se
aplica", with its disposition: include, propose, leave for later, or not applicable, with the
reason.

1. Purpose: the job story.
2. People and roles: who uses the app and what each one sees. By default everyone with access sees
   everything; a narrower visibility is proposed, never assumed.
3. Data: what comes from a Conexão, and what people type that the Conexão does not hold, which needs
   the app's own table. By default the app only reads the Conexão.
4. Business rules: each word of the person that needs a rule to compute (a status, a period, what
   counts and what does not).
5. What happens after the screen: what the person does next with a row. By default the app shows
   and never writes back to the company system.
6. Edge cases: an empty result, a record missing a linked value, several rows per key, several pages.
7. Empty, loading and error states: what each screen says with no data, while loading, and when a
   Conexão read fails.
8. Totals, sort order and export.
9. Notifications: proposed only when the purpose is to watch for something.
10. Change history: proposed only when the app saves data.
11. Import: whether the team keeps this today in a spreadsheet the app should absorb. Ask once for
    a new app.

Two kinds of line come out of it. The quality floor (dimensions 6 and 7, full lists, text in
Portuguese, and the safe defaults of 2 and 3) is always included and never asked, because it is
what a competent builder does, not a feature. Everything else beyond the request is a proposal the
person accepts or refuses. Permissions, sending anything outside the app, and rules about money are
never assumed: while the person has not answered, they stay open in the plan and the behavior stays
off.

How to ask:

- Never ask what the files or the data can answer. A question may name a business term, never a
  table, a column or where something is stored. A rule the data may settle (which states exist,
  whether a field is used) waits for step 3, and you ask it then only if the data leaves two
  readings.
- One question per `ask_user`, in the person's own words, with 2 to 4 options and your
  recommendation first. Each option says in a few words what the app will do if chosen, so the
  person picks by the result, not by which option sounds expert.
- Ask only when the answer changes what gets built. When any answer gives the same app, choose one
  and list it as an assumption.
- Then one proposal card: a single `ask_user` with `selectionMode: 'multi_select'`, the question
  "Posso incluir também?", and one option per proposal with a one-line description, "(recomendado)"
  on those you advise. Skip it when there is nothing to propose.
- Budget: about three rule questions plus the proposal card for a new app, one or two for a new
  feature, none for a small change unless a rule is unclear. An unanswered question, or "tanto
  faz", takes your recommendation and becomes an assumption. If the person says "pode fazer" early,
  take every recommendation, mark each one as an assumption, and go on.

#### 3. Achar cada dado nas Conexões e conferir com uma amostra que vem preenchido

For each thing the person asked for, find where it lives in the Conexão the request needs, as its
integrator's guide says. Then prove it with a sample that looks like real use: recent records, and
one list read to its end, because an old or small sample hides lists with several pages, empty
fields and repeated rows. Count how many of the sampled rows have the field filled. A source counts
as confirmed only when that sample shows it filled for this case. A column that exists but is empty
in the sample is not confirmed: keep looking for another source, up to three candidate sources per
item. When none is filled, the item is "não encontrado". Before joining two sources, count the rows
per key, since a key with several rows means a history you must choose from. When the request is
about a record the person knows, such as a document, one real example from them is part of the
sample: ask for it in your reply and wait. Each item gets its row in `### Fontes` with the counts.

#### 4. Pesquisar referências, com limite

When a term of the person's business is new to you (how the area usually defines it, what the usual
groups or states are), you may search the web with generic words, never company data, and read at
most three pages in the whole plan. List each page you used under `### Referências` with what you
took from it. The Conexão's own reading always wins over the web.

#### 5. Definir a estrutura (telas, tabelas, operações, regras)

Tables and migrations, operations with their input, output and the sources each reads, screens and
routes, and the rules each one applies. Every requested item maps to at least one operation and one
screen, and every operation names its sources.

#### 6. Definir como construir (tarefas e como cada uma é conferida)

Write the order of work and how each part is checked, where your methodology's plan shape puts them.
A check is something Construir can run: a call to an operation with a kind of input and the counts
it must return, Conexus's check, or what a screen shows for an empty result and a failed read.

#### 7. Revisar: tudo o que foi pedido tem fonte ou está marcado "não encontrado"

Read the plan once against the request. Every requested item has a row in `### Fontes` with its
status; the purpose is a job story; every person or role has what they see; every business term has
a rule, confirmed or assumed; what happens after the screen is stated; all eleven dimensions have a
line; the proposal card was answered or skipped; the count of items not found or contradicted is on
top of the person's part. Fix what is missing, then submit.
