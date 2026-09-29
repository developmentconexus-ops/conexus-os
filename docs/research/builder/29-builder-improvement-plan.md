# Builder improvement plan from the quote app (synthesis of studies 27 and 28)

Evidence: 27 (root cause of run dd54e404 vs the Claude Code run in <home>/cmp-2026-09-29-orcamentos),
28 (jm-audit of the Builder's context). Model of the run: gpt-6-luna medium (spans), Hub 04d06b49
(loadRecords only). Main weight is on the harness: the guide, the tools and the check; the model is
secondary and its share is measured by the control eval (E).

## Wave 1: instructions, removal first
A. Sankhya guide becomes a discovery method, under its own heading above Project knowledge
   (27 P1, 28 P1, P3). Map the person's words to columns through the data dictionary (TDDCAM by label,
   confirm columns exist), read lists to the end (hasMoreResult), relations syntax by example, the
   call budget stated. Remove the purchase order recipe and the real example number. Fix the wrong
   `total` sentence (skill.ts:23 region) and the paging advice.
B. One contract, one place per rule (28 P4, P5). The typed operation (`Input<op>`, `Output<op>`) is
   the only example; one rule for how expected failures reach the screen; `lib/errors.ts` and
   `lib/format.ts` ship in the starter. Remove the zod in handlers and float advice, the 7
   contradictions, and the repeated rules.
C. Honest plan (27 P3, P5). Explore with a sample that looks like real use and ask for one real
   example number; the plan lists each requested item as confirmed or not found; ask_user keeps a
   free text answer beside the options.

## Wave 2: one mechanism, one helper
D. A Construir tool that runs one app operation with real data in the Preview runner and returns
   shape and counts only, never values (27 P2, 28 P7); the proof step becomes "call each read once".
   A tested helper that reads a Sankhya list to the end and decodes rows (27 P4).
F. The starter AGENTS.md becomes a domain map: Termos e fontes, Regras confirmadas, Armadilhas,
   Em aberto, Como conferir (28 P2).

## Proof
E. Control eval: replay the quote request (with the "<fator> × custo" answer) after wave 1, once on
   gpt-6-luna and once on Opus in the Builder; pass when the plan names a source for all four
   metrics and, after wave 2, the app shows <N> items for the test quote with real costs, prices,
   promotions and stock. Same request later in Claude Code for the comparison Leandro wants.
