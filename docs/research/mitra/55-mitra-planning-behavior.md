# 55. How Mitra behaved before it built

Read-only study, 2026-09-30. Question: before Mitra's app builder wrote code, did it plan, what did it ask, what did it propose on its own, and how did it show the plan and get approval?

## 1. Short answer

No full transcript of a Mitra app-building conversation exists in the places searched. What exists is our own notes from Aug 2026, with a few short verbatim quotes from the agent. Correction from the operator, who used Mitra (2026-10-01): Mitra builds with one main agent the person talks to. The scoping agent (Escopo) is an optional, separate tool at another URL that helps a person write the first prompt; it is not part of the build flow and most use skips it. Read every "scoping agent" passage below as that optional tool, not as Mitra's design. What the notes show about the main agent: it reads the real data and the code first and decides a lot by itself.

## 2. Sources found

Searched only the named places. Nothing was searched outside them.

The sources were the Mitra influence register, full study and historical observation notes.
They contain summaries and short quotations, not full conversation transcripts. Captured UI cards
prove their own layout only. Later planning studies add no new conversation evidence.

Gap to close. the operator remembers several saved conversations. They are not in any of these places. If he has the real chats, they are probably in the Mitra Studio itself (the task history of each project) or in a folder not on my list. I did not look further, as instructed. The one thing worth asking him for is an export or screenshots of the first turns of two or three Mitra projects.

All customer names, codes and values are left out below. The notes already replace them with placeholders.

## 3. What Mitra did, conversation by conversation

### 3.1 Scoping chat in Mitra Escopo (sales follow-up app)

Source: `influence-on-conexus.md` section 14.1, prompt in 13.3. This is the best evidence of "asking before building".

Request. A long manifesto of 23 sections. It had principles such as "no mock data", gates, high autonomy, a data contract, a deterministic score and a "next best action".

What Mitra did, in order.
1. It did not write a scope. Turn 1 was five clarifying questions. They covered who sees what, how a "won" sale is defined, the scoring rule, how feedback behaves, and what triggers a next best action. The notes say it also offered to infer the answers if the person preferred.
2. The person answered by asking it to recommend. Quote of the request, as noted: "me recomende a solução Global Maximum".
3. Turn 2 was a full scope document of ten sections: cover, goal, actors, preconditions, glossary, business rules, main flow, alternative flows, acceptance criteria (12), open points.
4. It invented concrete values to close the gaps. Examples from the notes: a score formula with weights of 0.40, 0.40 and 0.20 and worked numbers, a rule for how a quote links to an invoice, a row-level rule tying seller to user, and a 24 hour snooze.
5. It closed with a completion marker and the buttons "Copiar Documento", "Pedir Alterações", "Nova Conversa".

The system prompt behind it (verbatim from the bundle, in `influence-on-conexus.md` 13.3):

> "Faça perguntas para entender completamente o projeto do usuário"
> "Não gere o escopo final até ter informações suficientes sobre: objetivo do sistema, personas/atores, regras de negócio principais, fluxos esperados"
> "Quando você considerar que tem informações suficientes para gerar o escopo completo, PERGUNTE ao usuário se ele deseja que você gere o documento de escopo"

So the approval step is one question: "may I write the document?" The plan itself is the document, shown after the person says yes. The person then reviews it and can press "Pedir Alterações".

What the data later said. The build agent checked the invented values against the real ERP. The field used for the quote link did not exist. The score premise was contradicted by the data. The build agent did not fix the rule alone. It listed the point as an open decision and blocked the work. The notes count seven blocking open points and five resolved ones.

### 3.2 Build chat, second pass with planted gaps (service order app)

Source: `influence-on-conexus.md` section 14.2.

Request, second message: each order needs a value and a priority, add a revenue KPI, and record quotes per customer before they become orders. The person did not define the priority scale, what "revenue" means, or the currency.

What Mitra did.
1. It synced with the team first ("nothing new from the team").
2. It read the existing code with 17 tool calls before touching anything.
3. It asked nothing. No question card appeared for any of the three gaps.
4. It chose an additive migration: "Migration aditiva … sem tocar no que já existe."
5. It modeled priority as a lookup table and quote status as a lookup table, copying the existing status table.
6. It extracted shared parts (currency input, date picker, KPI card) and widened the cross-filter from two to three dimensions.
7. It ran its usual QA, a final review against the prompt, and shared the result.

This is the "it thinks more and brings some things already" behavior. The extra tables, the shared parts and the third filter dimension were not asked for.

### 3.3 Build chat, first brief with business words only (marketplace hub)

Source: `observation-log.md` OBS-29 and OBS-26 to OBS-28, `maintenance-probe.md`.

Request. A 2,167 character brief with business only and no architecture, sent on purpose that way.

What Mitra did, before the first line of code.
1. It first ran a read only discovery turn against the ERP and wrote a findings file. It refused to create tables, functions or screens in that turn: "sem criar tabelas, funções, telas ou código ativo de pedido".
2. In the build turn it ran its own checklist of design steps, all closed before code: "Planejar feature e arquitetura", "Definir referência visual profissional", "Definir UX", "Definir design".
3. It chose the architecture without being asked: a local copy of ERP data, an importer that can run twice without duplicates, runtime logic in SQL, customers derived from orders, drafts kept in their own tables that "nunca acionarão a integração externa".
4. It repeated three safety limits from earlier turns without being reminded.
5. It stated the look it chose: "grafite, aço e âmbar queimado... densa o suficiente para operação diária, sem aparência de landing page".
6. It gave its own phase numbers ("Fase 2, Decisão de arquitetura" and so on). They collided with the operator's numbers. It did not warn about it.

Approval. The notes show no step where the person approved the architecture. The plan appears as a live checklist and as narration, and the work continues.

### 3.4 First narrations of a build (chat analytics app)

Source: `full-study.md` section 3.7, with the brief in `build-bi-observation.txt`.

In order: sync done, survey of the project, "projeto novo (só template)", parallel installs, then it created `tasks.md` with an ordered plan of 18 items. It then probed the platform before deciding the design ("MySQL 8.3 ... Arquitetura definida"), wrote planning documents, then built the backend. The full study reconstructs eight phases from these files: discovery, architecture, alignment, checkpoint, planning, build, test, review. The checkpoint phase says the contract is approved before coding. I found no verbatim chat that shows that approval happening. Treat it as a reconstruction.

### 3.5 When it did ask: a blocking question

Source: `agent-question.html`, OBS-01, OBS-02.

When a credential was ambiguous, it showed a card with two grouped questions. Each question had a short tag, a one line question, and two or three options, each with a label and a description. The last option was always "Outro". One submit button sent all answers. Then the turn ended with a line saying it was waiting. The rule the notes derive: it asks on a material blocker, not on a design doubt.

## 4. The pattern across the conversations

When it planned. Two places. Before the build, in a separate scoping agent (3.1). And at the start of each build turn, as a checklist and planning files (3.3, 3.4). It planned the same way on a first turn and on a later turn.

How long. The scoping chat took two turns. The build planning was part of the same turn as the build. No long planning phase was seen.

What it inferred. A lot. The scoping agent invented values to close fast. The build agent chose tables, lookups, shared parts, architecture and visual style unasked.

What it asked. Little, and in two forms. The scoping agent asked five questions in one batch, in business terms, on four fixed axes: goal, people, rules, flows. The build agent asked only on a material blocker, with option cards. It did not ask about design.

How it presented the plan. As a document (scoping) and as a live checklist plus narration (build). Open points were a fixed section of the document, so the agent said what it did not know. Not as a form with approve and reject buttons for the plan.

How it got approval. One question before writing the scope document. The build had no approval step for the plan. The only mechanical gate is tool approval (allow once, allow for the session, deny), which is about actions, not about the plan.

Weak spots seen. The scoping stage invented rules that looked like facts. Only a second stage that read the real data caught them. Question and approval for questions were by prompt convention, not by runtime.

## 5. Side by side with our Builder, run b1

Our run. Source: historical test messages and summary of 2026-09-30. Model Opus 5.5.

Request, in full: "Adicione notas de acompanhamento a um pedido de compra. Eu informo o número do pedido, escrevo uma nota e salvo. As notas ficam guardadas para toda a equipe de compras: quem abrir o app, em qualquer computador, vê as mesmas notas, e elas continuam lá depois de recarregar a página. Mantenha a interface simples."

What it did, from the messages.
1. First line: "Vou ler o app e as orientações de construção antes de começar."
2. Loaded four skills: `conexus-build`, `conexus-server`, `conexus-app-code`, `conexus-app-ui`. It never loaded `conexus-plan`.
3. Listed and read the app files and two reference screens.
4. One line of plan, said while working: "Vou criar uma tela única: campo do número do pedido, lista de notas desse pedido e um campo para escrever e salvar uma nova nota, guardadas no banco do app."
5. Asked nothing. Decided the note shape alone: id, order number as text, body, author id, author name, created at, and an index.
6. Wrote the migration, the operation manifest, the handler, the screen and the router. Deleted the home route.
7. Ran the check. It could not run the operation against a database, because the app database only exists after the version is saved. It said so.
8. Saved the decisions to app memory, then wrote the final message.

Its final message listed what it decided and left it for the person to confirm after the build: the order number is not checked against any system because no Connection exists, any number up to 40 characters is accepted, notes cannot be edited or deleted, and each note is limited to 2,000 characters.

Comparison.

| Point | Mitra | Our Builder, b1 |
| --- | --- | --- |
| Separate planning step | Yes, a scoping agent with its own model and prompt | No. Same agent, no plan skill loaded |
| Questions before building | Five in one batch, on four axes, in the scoping chat. None in the build agent for design gaps | None |
| Things it proposed unasked | Many: score weights, lookups, shared parts, architecture, look | Few: author name and time on each note, link with the order in the address, limits |
| Plan shown | Scope document with open points. Live checklist in build | One sentence while working |
| Approval | One yes/no to "write the scope?". None for the build plan | None. The person confirms after the build |
| Does it say what it does not know | Yes, "Pontos em Aberto" and later blocking points | Yes, but only after building, in the final message |
| Checks the plan against real data | Yes. A second stage read the ERP and blocked the work | Not applicable here. No Connection existed |

Honest read. For this small, clear request, building directly is defensible, and the manual check in Chromium found the app works (summary, findings 1 and 5). The gap is not that it skipped a plan. The gap is that the choices (who may edit, what a note holds, whether to validate the order number) were made without the person seeing them first. Mitra's scoping agent would have asked those in one batch, and its build agent would have shown a checklist before coding.

## 6. What to take from Mitra

Each item names its source line in the Mitra notes.

1. **Ask in one batch, in business words, on fixed axes.** Five questions in turn 1, covering who, rules, flows and triggers. Source: `influence-on-conexus.md` 14.1 item 1. Our b1 asked none.
2. **Use a sufficiency rule, not a question count.** Do not write the plan until goal, people, rules and flows are known. Source: scoping prompt, `influence-on-conexus.md` 13.3.
3. **Ask permission once to write the document, then show the document.** The yes/no is cheap and the document is what the person reviews. Source: 13.3 and 13.4 step 3.
4. **Offer a recommendation when the person has no answer.** In 14.1 the person said "me recomende" and the agent supplied a full proposal. Our questions should carry a recommended answer, which matches our project rule.
5. **Mark every invented value as a hypothesis.** Mitra's scoping agent stated invented numbers as facts. Source: 14.1 "Divergência crítica". This is the one thing not to copy as is.
6. **Keep a fixed section for what is not known.** "Pontos em Aberto" with an id for each point and a status of blocking, resolved or residual. Sources: OBS-08 in `observation-log.md`, `influence-on-conexus.md` 15.6.
7. **Check the plan against real data before it becomes the contract.** The second stage found a missing field and a broken premise, and blocked instead of guessing. Source: 15.5 and `full-study.md` section 07 table.
8. **Ask only on material blockers during the build.** A credential or a fact that cannot be inferred, never a design doubt. Source: OBS-02 and 14.2 item 2. This fits a manager who cannot answer design questions.
9. **Show the plan as a live checklist.** A todo list that turns to done as work goes. Source: OBS-11. Our Builder showed one sentence.
10. **Read the existing app before changing it, and prefer additive changes.** 17 reads before an edit, additive migration. Source: 14.2 items 1 and 3.
11. **Keep question cards structured.** Grouped questions, short tag, options with a description, an "Outro" option, one submit. Source: `agent-question.html`, OBS-01 and OBS-09. Use a stable id per question, not the question text as key (OBS-09 note R1).
12. **Put the pause for questions in the runtime, not the prompt.** Mitra's approval has a mechanical gate and its questions do not. Source: OBS-10, `full-study.md` line 256.

Where our Builder is already ahead or should not follow. Mitra shows no approval of the build plan, and its two stages used two different vendors' models, which our model rule does not allow. Take the behavior, not the setup.

## 7. Open points

1. Real Mitra transcripts were not found. Ask the operator where they live, then redo section 3 with exact quotes.
2. The body of Mitra's scoping method (its skill text) was never extracted. We have the system prompt and the observed output only ([study 36b](../builder/36b-elicitation-astra.md) says the same).
3. Whether Mitra's build agent shows its checklist before or during work is not clear from the notes. It is a live checklist, so before the first edit is likely but unproven.
