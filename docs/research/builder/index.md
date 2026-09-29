# Builder research

Studies behind the Builder on its own harness (spec 0002) and the app stack v2 (spec 0003). They
are reference evidence, never authority. The
[Builder own harness task](../../tasks/stage2-builder-own-harness-qualification.md) owns the order
of the work and its status, and the [decision register](../../decisions/index.md) owns decisions.

Each study is a read-only report written on the date it names, against the branch head it names.
Its file and line references hold at that head, not at later ones. The task cites the studies as
`S17:N` and `S20:N` to `S29:N`, where `N` is a line in the file below.

- [17-app-stack-decision.md](17-app-stack-decision.md) (2026-09-28): the app stack, the generated
  client, the design rules and `conexus_check`, with the probe app under the Prévia CSP. Basis of
  spec 0003 and C-033.
- [20-slice7-eval-plan.md](20-slice7-eval-plan.md) (2026-09-29): how the eval driver runs the three
  AC-27 cases on the new Builder, and why `erp/sales-dashboard` waits for the handler
  `connectors.fetch`.
- [21-remaining-work-census.md](21-remaining-work-census.md) (2026-09-29): every acceptance
  criterion of specs 0002 and 0003 at `40d9671d`, the Q4 closure items, and the pull request
  paperwork.
- [22-q6-handler-connectors-fetch.md](22-q6-handler-connectors-fetch.md) (2026-09-29): the design
  of the handler `connectors.fetch` (Q-6) and of a production or sandbox destination per
  Connection.
- [23-durable-agent-and-sandbox-reuse.md](23-durable-agent-and-sandbox-reuse.md) (2026-09-29): what
  a crash loses, the retry fix B0, and design B (a conversation owns its sandbox and its branch),
  with the operator's decisions 3 to 5 at its end.
- [24-stop-button-and-sandbox-lifecycle.md](24-stop-button-and-sandbox-lifecycle.md) (2026-09-29):
  the stop path today, the sandbox lifecycle it should have, and the operator's decision on work
  left after a stop.
- [25-builder-flow-and-performance-baseline.md](25-builder-flow-and-performance-baseline.md)
  (2026-09-29): where a run's time goes, what the person sees while waiting, and what the created
  apps look like, measured from the branch runs.
- [26-builder-chat-compact-ui.md](26-builder-chat-compact-ui.md) (2026-09-29): a smaller, clearer
  Builder chat, compared with the Factory UI and Mastra Code.
- [27-builder-root-cause-quote-app.md](27-builder-root-cause-quote-app.md) (2026-09-29): why the
  Builder built a weak quote analysis app, compared with a Claude Code run on the same request.
- [28-builder-context-audit.md](28-builder-context-audit.md) (2026-09-29): every piece of context
  the Builder reads, its duplicates and contradictions, and what each layer should own.
- [29-builder-improvement-plan.md](29-builder-improvement-plan.md) (2026-09-29): studies 27 and 28
  turned into two waves of changes and a control eval.

## How to read the paths

The studies were written on the operator's machine and scrubbed before they entered this public
repository. The scrub kept every line in place, so line citations still hold.

- `<worktree>` and "a branch worktree" are a local checkout of the branch the study names.
- `<branch-state>` is the branch Hub's local state folder: its `hub.env`, logs, Git root and proof
  screenshots. None of it is in this repository.
- `<mastra-clone>` is a local clone of the Mastra repository. `<home>` is the operator's home folder.
- A bare file name such as `decisions.tsv`, `eval-runs/` or `model-input-planejar.txt`, and studies
  01 to 19 other than 17, are in the operator's study notes, outside this repository.
- `<fator>`, `<N>`, `<número real>`, `<orçamento>` and `<pilot notebook Project id>` replace real
  company values: a pricing factor, a document's size, real document numbers, an operation type
  code and a pilot identifier.
