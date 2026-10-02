# 26. Builder chat: compact and clear

Read only study. Head read: `<worktree>` at `27d02d1d`. Paths below are under
`apps/web/src/features/builder` unless they start with `~`. Screenshots are in
`<branch-state>/proof/`.

## Short answer

Two facts change how to read Leandro's complaint.

1. The head already groups tool calls into one collapsed pill (34 px). The big cards come from
   the expanded group and from the older shots. In `int-17-expanded-tail.png` each row is a
   bordered card about 63 px tall. The installed Mastra row has no border and about 26 px
   (`px-1.5 py-1`). I could not find what draws the border. Nobody has a fresh shot of the
   expanded group at this head. That is the first thing to prove (section 4).
2. Two of the four baseline findings are already fixed at head. The composer overlap and the
   header overflow were fixed by `66198b67` on 2026-09-29 07:48. The newest shots
   (`sk-01`, `sk-03`, `sk-05`, 09:44 to 09:50) are clean. The 8 overlapping shots are all
   older (`int-*`, 2026-09-28 23:51).

What is still open and what the person notices most, in order: the Preview wait, the English
reasoning, the running tool group that says nothing, the plan block, the size of expanded rows.

## 1. How our screen renders today, and why it is big

**Tool calls.** `components/builder-conversation.tsx`.
- `renderPieces` (168 to 195) collects consecutive tool parts into one `ToolGroup` (99 to 112).
  Task tools are dropped (158) because the pinned checklist shows them.
- `ToolGroup` is a hand-made `<details>`. Closed by default, no `open` prop. The summary says
  "Executando 3 ações" or "5 ações concluídas" (101). It never says which action.
  CSS: `construir/construir.css:136-148`, height 34 px.
- A group of one action still gets the pill ("1 ação concluída", `int-15-build-19.png`). A
  pill for one action costs more than one line of text.
- Opening the group lists every call as a Mastra `ToolCall` (33 to 53) with the header
  `ToolCallPresentedHeader` (icon, sentence, path) and a body of arguments and output. Six
  edits are six rows. No height cap, so a long group pushes the chat down
  (`int-17-expanded-tail.png`).
- The sentence comes from `construir/tool-sentences.ts`: "Editou um arquivo" for every edit.
  The path is the only thing that tells rows apart, and it is truncated in the mono detail.

**Reasoning.** `builder-conversation.tsx:57-64`. A small "Raciocínio" or "Pensando" head
(`construir.css:110-111`), then the provider's own summary through `MarkdownRenderer`. The
summary is a bold English title such as "Planning order status handling and routing". The
Markdown renderer draws that title in body size and bold, so it looks like a heading.
Screens: `sk-01-plan-card.png`, `sk-03-settled.png`, `int-15-build-19.png`. Every reasoning
part stays on screen after it settles, so a long build leaves a column of English titles.

**Plan card.** `construir/pending-card.tsx:63-77`. A sentence, then `<details open>` holding
`<pre>{plan}</pre>` (68-70). The CSS is monospace, pre-wrap, 0.75 rem
(`construir.css:109`). So `## Para a pessoa` and `**Compras**` show as raw characters. The
plan for the eval also has a long "Para Construir" section with routes and manifest, and the
person is asked to approve all of it (baseline 25, section 3).

**Preview wait.** `construir/lens-preview.tsx:54-60`. While there is no lease and no ready
preview, it draws the mark and one line: "Gerando a primeira prévia…" whenever the run is
active. That line is the same in the planning phase, while the agent waits for the person's
answer, and while it builds. 265 to 911 s in the baseline runs. Yet Construir already holds
what would fill it: `view.step` (phase: "Preparando o ambiente", "Agente trabalhando",
"Verificando o app"; `construir/run-state.ts:17-23`), the live tasks (`turn.tasks`,
`live-turn.ts:25`, shown by `TaskListPt` at `construir.tsx:326`) and the elapsed time
(`construir.tsx:329`). `LensPreview` receives only `view`, so it can show the step but not
the tasks.

**Why it feels big, in one list.**
1. Expanded rows are cards, not lines (unproven cause, see section 4).
2. A group of one gets a pill.
3. The group hides what is running, so the person opens it to see, and opening is tall.
4. Every reasoning title stays, in a large bold English line.
5. Each assistant turn has a head row (mark, "Conexus", model chip) even when it holds only
   a tool group.
6. The checklist, the working line and the composer are stacked at the bottom, so the
   thread area is short (`sk-01-plan-card.png`: about 300 px of thread at 900 px height).

## 2. How the Factory UI and Mastra Code do it

**Factory UI**, `<mastra-clone>/mastracode/factory-ui/src/ui/domains/chat/components/`.
- Groups runs of 3 or more tool calls, and only those. `collectToolGroups`
  (`transcript-parts.ts:87-98`) joins consecutive tool parts. The Mastra threshold is
  `TOOL_GROUP_MIN = 3`. `ask_user`, `submit_plan` and `skill` never join
  (`UNGROUPABLE_TOOLS`, line 85). Task tools are dropped (line 56, `isTaskTool`), like ours.
- The group is Mastra's `ToolCallGroup` (`tool/ToolGroup.tsx`, whole file 24 lines).
  Header on one line: time, a fold icon, "N steps", the detail of the tool that is running
  now (path or command, mono), up to 4 small kind icons, a hairline rule, then a progress
  tail: "2/5" while running, "5 OK" or "1 failed" after. Closed by default. When open it is
  a scroll area capped at 18 rem that follows the tail while running
  (`<mastra-clone>/packages/playground-ui/src/ds/components/ai/tool-call/tool-call-group.tsx:41-61`).
- A single tool or a group of two renders as its own row. Each row is a `ToolCall`: a
  borderless trigger, `px-1.5 py-1`, caption size, icon, label, mono detail, chevron, shimmer
  while running (`tool-call.tsx` header, trigger). The body opens on click. For edits the
  body is a diff (`ToolCallArguments`), for commands a `$` line and trimmed output, cut at
  800 characters (`tool/ToolCard.tsx:20-58`).
- Reasoning uses Mastra's `ReasoningPartRenderer` (`MessageBubble.tsx:136`). Streaming with
  no text shows a shimmering "Reasoning..." line. With text it is a collapsible panel,
  closed. An empty settled part draws nothing. (`reasoning-part-renderer.d.ts`, installed
  55.0.0 doc comment.)
- Plan: `SubmitPlanCard.tsx` uses Mastra's `ai/plan` parts. Header, title, path, a
  collapsed-height body that renders the Markdown, an expand button that hides itself when
  nothing is clipped, then "Approve & build" and "Reject" in one control row.
- Waiting: `SessionPrepareSteps.tsx` shows named steps ("Preparing session", "Starting
  session") with the active one running. The agent-side wait is the shimmer on the running
  row plus the pinned task panel.

**Mastra Code TUI**, `<mastra-clone>/mastracode/tui/src/tui/components/tool-execution-enhanced.ts`.
Every tool is one summary line, `collapsedByDefault: true` (224, 227), with a short preview
of 2 to 3 lines for output (quiet preview, 831 to 967) and the last 15 lines while a shell
streams (399). A key toggles expanded (356). `multi-step-progress.ts` and `collapsible.ts`
carry progress and folding. Same idea as the Factory: one line, closed, latest output only.

**Mastra Code web** (`<mastra-clone>/mastracode/web/src`) has no chat UI. It holds only the
server (`mastra/index.ts`, `factory-dev/`). The web chat is the Factory UI above.

**Reusable in our app (installed `@mastra/playground-ui` 55.0.0).**

| Part | In 55.0.0 | Use for us |
|---|---|---|
| `ToolCall`, `ToolCallPresentedHeader`, `presentTool`, `toolEdit` | yes, already used | keep for rows |
| `ToolCallGroup` | yes (`tool-call.es.js` exports it) | its label ("N steps") and tail ("OK", "failed") are hardcoded English, and the skill says never fork and replace English text. Use its pieces (`ToolCallHeader`, `ToolCallIcon`, `ToolCallLabel`, `ToolCallDetail`, `ToolCallSpacer`, `ToolCallTrailing`, `ToolCallDisclosure`, `ScrollArea`) to build our own pt-BR group header. |
| `ReasoningStreamingLine`, `Reasoning`, `ReasoningPartRenderer` | yes (`domains/chat/messages`) | the streaming line is a spinner plus `Shimmer`; check its text is settable, else write our own line with `Shimmer` |
| `ai/plan` (`Plan`, `PlanContent`, `PlanExpandButton`, ...) | yes | not in the frontend skill's list of allowed parts (`components-map.md:12`). Adopting it needs a line added there. Otherwise reuse `MarkdownRenderer` with a `cx-` clamp. |
| `Shimmer`, `Steps` (`ProcessStepListItem`) | yes | shimmer for the running line, steps for the preview wait |
| Factory-only files (`ToolGroup.tsx`, `ToolCard.tsx`, `SubmitPlanCard.tsx`, `transcript-parts.ts`) | not a package | reference only. `SubmitPlanCard` reads the plan from a workspace file hook we do not have. Copy patterns, not files. |

## 3. Proposal, ranked by what the person notices

Each item is small. All keep our own structure and use Mastra parts, as the memory note and
the frontend skill require.

### P1. The Preview says what is happening, in Portuguese (effort M)

Before, for 4 to 15 minutes:

```
        [mark]
 Gerando a primeira prévia…
```

After:

```
        [mark, working]
 Construindo o app
 Tarefa 2 de 4: Montar lista, formulário e gráfico
   [x] Criar armazenamento e operações
   [>] Montar lista, formulário e gráfico
   [ ] Criar detalhe do pedido
   [ ] Concluir verificação da Prévia
 Há 7 min 13 s · a prévia aparece quando a primeira versão compilar
```

Rules, each from data the screen already has:
- Title from the phase and the mode. Mode is `turn.mode` (`live-turn.ts:41`).
  "Planejando o app" in plan mode, "Esperando sua resposta" while a question or plan is
  pending (`pending` list, `construir.tsx:298`), "Construindo o app" in the AGENT phase,
  and `view.step` for the other phases ("Verificando o app", "Gerando a prévia").
- Task lines from `turn.tasks`, the same list `TaskListPt` shows. When there are no tasks
  yet, show only the title and the elapsed time.
- Honest states rule: it never invents progress. No percent, no estimate. The elapsed time
  is real (`construir.tsx:329`).

Files: `construir/lens-preview.tsx` (new props `tasks`, `mode`, `pendingKind`, `elapsedMs`),
`construir/construir.tsx:263` (pass them), `construir/lens-surfaces.css` (one `cx-preview-wait`
block), `construir/builder-copy.ts` (the sentences). Reuse `Steps` or `TaskListStatusIcon`
for the marks. Test: a `LensPreview` render with tasks and asserting the literal task text.

This is the small version of baseline item B7 (draft Preview). It does not build a draft.

### P2. Reasoning: one quiet line, no English titles (effort XS)

Before (`sk-01-plan-card.png`):

```
(brain) Raciocínio
Planning schema validation with react-hook-form      <- bold, body size
(brain) Raciocínio
Implementing validated search with useForm ...
```

After, streaming: `(spinner) Pensando…` with the shimmer, one line. Settled: nothing in
the thread, or one closed disclosure "Raciocínio do agente" after the turn's last tool group,
holding the text for the curious. Never show the title in body size.

Why hide instead of translate: the summary language is the provider's. Asking the model to
write it in Portuguese is not proven (section 4), and machine translation in the browser
would be a fake of the model's words.

Files: `components/builder-conversation.tsx:57-64` and `construir.css:110-111`.

### P3. The tool group says what it is doing, and small groups are lines (effort S)

Before (running, closed): `( ) Executando 3 ações  v`. After it settles: `5 ações concluídas`.

After:

```
running:  ( ) Editando app/src/lib/format.ts        2/5   v
settled:  (v) Editou 4 arquivos, executou 1 comando       v
one call: (pencil) Editou um arquivo  app/src/lib/format.ts        (a row, no pill)
```

Rules:
- Group only 3 or more consecutive calls, as Mastra does (`TOOL_GROUP_MIN`). One or two
  render as their own rows. Keep `ask_user`, `submit_plan` and `skill` out of groups.
- Running header: the running call's detail (`presentTool(...).detail`, mono, truncated)
  plus "n/m". This is what `ToolCallGroup` does, in Portuguese.
- Settled header: a count by kind, built from the same table as the sentences. Group the
  keys of `tool-sentences.ts` into 6 kinds (ler, editar, executar, buscar, verificar,
  outros) and write "Editou 4 arquivos, executou 1 comando". Add plural forms to the table.
- Open body: cap at 18 rem and scroll, following the tail while running (Mastra
  `ScrollArea` with `autoScroll`).

Files: `components/builder-conversation.tsx:99-112` (the group and `renderPieces`),
`construir/tool-sentences.ts` (kind and plural), `construir/construir.css:136-148`.

### P4. Expanded rows are lines, not cards (effort XS to S, after proof)

Match the Factory: borderless trigger row, caption size. Bodies show the diff for edits and
the command plus at most 800 characters of output for shells, and arguments only for the
rest (`ToolCard.tsx:20-58`). Today we always show the raw arguments and the raw result
(`builder-conversation.tsx:47-50`), so a `write_file` shows the whole file twice.

First prove where the border and the 63 px come from (section 4). If it is a CSS
side effect, the fix is a `cx-` rule. If it is the older bundle, this item is already done
and only the body trimming remains. Files: `builder-conversation.tsx:33-53`,
`construir.css`.

### P5. The plan card renders Markdown, and shows the person's part first (effort S)

Before (`pending-card.tsx:65-77`):

```
O agente propõe um plano: <title>. Aprovar e construir?
v Plano
| ## Para a pessoa
| **Compras** ... ->
| ## Para Construir ... (routes, manifest, operations)
```

After:

```
Plano: <title>
  Para a pessoa                (rendered Markdown, clamped to about 12 lines)
  Ver plano inteiro  v         (the technical section, closed)
[Aprovar e construir]  [Pedir ajustes]
```

Use `MarkdownRenderer` (already in the chat) inside a `cx-plan` clamp with a "Ver plano
inteiro" toggle. Split at the heading that starts the technical part. That heading name
comes from the Builder prompt, so read it from one constant and fall back to "whole plan,
clamped" when it is absent. The approve and adjust buttons stay where they are.

Files: `construir/pending-card.tsx:63-77`, `construir/construir.css:106-109`, a small
`plan-sections.ts` to split. Test: the split against a literal plan string.

### P6. Smaller items (each XS)

- Skip the assistant head row (mark, "Conexus", model chip, `builder-conversation.tsx:123-132`)
  when the turn holds only tool rows. Show the model chip once per run instead of per turn.
- "Build passou" in the result card is English (`result-card.tsx`; baseline lists
  `p2-03-settled.png`, `sk-05-nao-encontrado.png`). One copy change: "A verificação passou".
- Re-take the composer shots at the narrowest chat width. `66198b67` added
  `.cx-composer-tools:first-child { flex: none }` (`composer.css:72`).

### Order and effort

| Rank | Change | Person notices | Effort |
|---|---|---|---|
| 1 | P1 Preview wait | the longest wait on screen | M |
| 2 | P2 reasoning line | English wall of titles | XS |
| 3 | P3 group header and small groups | the "too big" complaint, in the running state | S |
| 4 | P4 row size and trimmed bodies | the "too big" complaint, in the open state | XS to S |
| 5 | P5 plan card | the approval moment | S |
| 6 | P6 | polish | XS each |

P2 and P3 first is also a fine order if Leandro wants the chat to shrink before anything
else. They touch one file together (`builder-conversation.tsx`), so one worker should do both.

## 4. What must stay, and what is unproven

**Must stay (frozen or fixed by rule).**
- Structure blocks stay as they are: `AppShell`, `MainSidebar`, `ChatShell`, `new/settings`.
  Existing uses stay, no new screen adopts one (frontend skill, "Structure is ours"). All
  proposals live inside `ChatShell.Column` and the Preview pane.
- Basic and agent parts are used, never forked. Size and layout by `cx-*` classes next to the
  screen. English text a part brings is replaced. That is why P3 rebuilds the group header
  from its pieces and does not use `ToolCallGroup` whole.
- Colors are `var(--cx-*)` tokens only (`npm run web:style:check`). One accent, ipê, for the
  agent at work. Encaixe is the only authored motion and stops under reduced motion (the
  spinner already does, `construir.css:149-151`).
- pt-BR, sentence case, no emoji. Honest states: show only what the server says, never fake
  progress. This bounds P1.
- The task tools stay out of the thread (the pinned checklist owns them). The pinned
  checklist, the working line and the single "Parar" in the composer stay.
- Both themes and screenshots for every change (`references/verification.md`).

**Unproven.**
1. **What Leandro saw.** I did not drive a browser. The head's closed group is a 34 px pill.
   Either he opened a group, or he ran an older bundle (the pilot). Take one fresh shot of
   an expanded group at head before P4.
2. **The border and 63 px on expanded rows.** Read from `int-17-expanded-tail.png`. The
   installed 55.0.0 row source has no border and `px-1.5 py-1`. Something in the running
   app adds it. I found no rule in `construir.css` or `mastra-theme.css` and did not open the
   built CSS.
3. **Whether the model can write reasoning summaries in Portuguese.** Not tested. If the
   provider option exists, it would keep the titles. The Builder prompt asking for Portuguese
   is a cheap test (one run). Until then P2 hides them.
4. **Whether `ReasoningStreamingLine` accepts our own text.** Its type takes `text` and
   `Reasoning...` is baked in `ReasoningPartRenderer`. Check the props before reuse.
5. **The plan section heading.** "Para a pessoa" and "Para Construir" are in the eval's
   plan and the baseline screenshots. I did not check that the prompt always produces them.
6. **Factory look.** No Factory chat screenshot exists in `<home>/factory-ui-scan` (only the
   package tarball), `<home>/ux-parity`, `<home>/ux-shots-parity` or `<home>/ux-shots`. The screenshot
   `<home>/ux-shots/20-reference-initial.png` is our own design prototype. So section 2 comes
   from source and the doc comments in the installed package, not from pixels.
7. **Group thresholds.** Three or more comes from Mastra's constant. Whether 3 feels right
   for a Builder run of 30 to 60 calls is a taste call. Runs are long, so groups will be
   long, which is why the running detail line (P3) matters more than the count.
8. **`ai/plan` as an allowed part.** Not in the skill's table. Choosing it is a rule change,
   so P5 uses `MarkdownRenderer` and avoids the question.
