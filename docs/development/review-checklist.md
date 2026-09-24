# Review checklist

Check a Conexus OS pull request against these rules. The Factory reads this file from the base ref.
Request changes only for a failed rule or a correctness defect, never for preference. Each rule
comes from [the delivery rules](delivery.md) or the owner it links.

## Scope and lane

- [ ] The pull request links its issue and says what changes, for whom.
- [ ] The lane label matches the change. A `lane:fast` change has no Q trigger, fits one pull
      request, and stays inside accepted product meaning.
- [ ] `needs:aprovo` is present if the change migrates real data, touches security or
      authentication, or changes a screen the operator asked to see.
- [ ] The diff does only what the issue asks. Unrelated changes are in their own pull request.

## Authority and design

- [ ] No product meaning is invented in code. A new requirement, owner or trust boundary goes to
      its owning document or decision first.
- [ ] Each meaning has one owner. The change adds no second source of truth.
- [ ] A Mastra primitive is used where one exists. No Conexus mechanism mirrors Mastra's messages,
      states or lifecycles, and no wrapper exists only to hide Mastra.
- [ ] A new dependency comes with the evidence the technology rule asks for.

## Data, contracts and security

- [ ] A migration is a new, next-numbered file. No applied migration or the baseline is edited by
      hand, and the catalog snapshot is regenerated with `npm run db:catalog:snapshot`.
- [ ] A contract change and its operation-ledger change are in the same commit.
- [ ] No secret, token or credential appears in code, fixtures, logs or the pull request body.
- [ ] Generated application code does not run in the Hub process.

## Tests and proof

- [ ] Each new or changed test calls the code as its users do and asserts a literal expected value.
- [ ] No design was reshaped to keep a test passing. Tests whose subject is gone are deleted.
- [ ] Each claim about a real provider, model, E2B, Sankhya, browser or database has evidence from
      that dependency, not from a mock.
- [ ] CI `verify` is green on the exact head SHA.

## Documents

- [ ] Status and next actions live in the roadmap and GitHub, not in `AGENTS.md` or a skill.
- [ ] A rule has one home. Other files link to it instead of copying it.
