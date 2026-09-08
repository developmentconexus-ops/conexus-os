# Delegation and independent-review routing

## Lead and advisor routing

Use `gpt-5.6-sol` at medium effort as the default Lead for execution and
integration. Use `gpt-6-astra` only as a bounded advisor for a difficult
blocker, a credible structural improvement, or unresolved material design; the
Lead retains ownership and adjudication. Model availability never expands the
operator grant.

## Luna implementation lane

Use a Luna subagent at `xhigh` when all of these are true:

- the task is concrete, bounded and independently executable;
- authority, allowed files, expected behavior and proof are already known;
- it does not decide Product semantics, architecture ownership, a gate verdict,
  or an external/irreversible action;
- shared-file overlap with another active writer is absent or explicitly
  coordinated.

Give each Luna writer the repository path, required bootstrap owners, exact
disjoint file envelope, acceptance tests, forbidden effects and reporting
contract. Name one integrator before work begins. Prefer no history or only the
minimum recent turns; repository authority must be reconstructed. Writers do
not commit, publish, or edit another lane's files unless the integrator changes
the envelope explicitly. The Lead/integrator reviews all diffs and runs deciding
verification. Do not delegate merely to avoid resolving a material unknown.

Good uses include a small script plus focused test, a named adapter, a bounded
migration part, or mechanical fixtures. Keep authority/adjudication, cross-owner
design and unsafe actions with the Lead.

## When Fable and Gemini are justified

Independent dual review is required before every `S` stage closes and whenever
the named subject:

- creates or moves authority or a trust boundary;
- changes cross-owner architecture or a structural database/runtime/service
  boundary;
- has an external, production, security-sensitive or hard-to-reverse effect;
- closes a gate whose owner requires independent convergence;
- presents a material contradiction, competing credible structures, or a
  Global-Maximum question that local proof cannot settle.

Ordinary bounded code, naming, local refactors and already-specified mechanics
use targeted tests and Lead review. Do not call a reviewer for every file or
every `P`. A second independent round over the same
checkpoint is warranted only when a material correction changed the reviewed
property enough that the prior challenge no longer covers it.

## Council modes and termination

Use two distinct modes; never blur their claims:

- **collaborative challenge** at a material design or material-diff checkpoint
  may expose alternatives and counterarguments to the Lead, but is not
  independent convergence Evidence;
- **independent closure** uses isolated fresh lanes over one frozen candidate,
  brief, protected-claim census and blocker census.

Independent closure reviewers must not have authored the candidate or received
another lane's output. Use fresh sessions. One integrator freezes the candidate
and adjudicates both results; collaborative subagents are not independent proof.

The normal council checkpoints are: a materially uncertain stage packet, the
first material vertical diff, a trust/authority or structural-boundary change,
an external effect, and every `S`/gate closure. Do not invoke the council for
each file, test, receipt field or documentation correction.

Before independent closure, state the exact claims whose failure would stop the
stage. A finding about method, review machinery, recoverability or Evidence
shape is blocking only when it shows a reproducible route to a false PASS,
false STOP, protected-property violation, unauthorized effect, or correctness-
critical missing authority for those claims. Otherwise adjudicate and defer it
with the Engineering Method's why-safe, revisit-trigger and later-owner fields.

There is no automatic review rerun. The Lead first adjudicates the complete
round and applies only surviving corrections. Rerun independent lanes only if a
material correction changed the challenged property or reliability of deciding
proof. If another call cannot name that invalidation, make no further
provider/model call until a delivery-stall review has narrowed the subject,
reopened the smallest falsified owner, or declared `STOP / SPLIT
PREREQUISITE`. Review persistence must improve decision quality, not replace
delivery.

## Independent lanes

Create one neutral review brief using Blueprint Harness sections 10.4–10.6. It
must identify the exact candidate, authority bootstrap, protected properties,
falsifiers, proof reconstruction, output contract and non-goals without asking
for a preferred verdict.

Run the two lanes independently; do not reveal one output to the other before
both finish:

- Claude Code: model alias `fable`, effort `xhigh`, plan/read-only permissions.
  Retain the compatibility lane key `opus` where existing Evidence schemas
  require it, but record the actual CLI version, requested alias, resolved
  canonical model and session ID.
- AGY: actual model `gemini-3.1-pro-high`, effort `high`, plan mode plus sandbox.
  Record AGY version, model and conversation ID.

Use `npm run conexus:review -- --brief <path> --lane both` to inspect the exact
commands without spending model quota. Add `--execute` only for an authorized,
meaningful checkpoint. Resume a session/conversation only when continuity is
part of the Evidence contract; otherwise prefer fresh context.

Reviewer output is Evidence, not authority. Classify each finding as `METHOD
FINDING`, `PRODUCT / PLAN GAP`, `LOCAL EXECUTION GAP`, or `NO FINDING`. The Lead
adjudicates each finding against current owners through the Engineering Method,
routes only surviving corrections, and the operator retains required acceptance
and execution authority.
