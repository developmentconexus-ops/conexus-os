# RC-01 stage packet

## Authority and target invariant

The operator authorized one exclusive tranche: preserve the existing R1 local
implementation, form one exact Git candidate, prove it in a clean worktree,
publish a Draft PR, record CI and prepare an operator browser walkthrough. Merge,
RB-C0 continuation, R2+, external providers and production claims are excluded.

Target invariant:

```text
R1 exact candidate
= represented by Git
+ clean-worktree reproducible
+ 13 admitted operations only
+ exact candidate inventory + OwnershipManifest + GenerationReceipt
+ deterministic local walkthrough
+ Draft PR and CI evidence
+ not merged
```

## Revalidated starting state

- Repository: `C:/Users/leandro.theodoro/Documents/conexus-os`
- Prior branch: `codex/4c-p02-integrations-ux`
- Prior HEAD: `fd6f771be45102009f1887afaa9fc8a7e487e777`
- Base and `origin/main`: `1619f14d9caed172b6cada9430e6b49ff77a4316`
- Merge base: exact base above; prior branch was 3 ahead, 0 behind.
- Working tree before RC-01 mutation: 26 tracked modifications and 412
  untracked files, 438 total inventory entries.
- No PR existed for the prior or dedicated branch.
- Dedicated branch: `codex/r1-candidate-publication`, created at the prior HEAD
  without resetting, cleaning, stashing, discarding or rewriting any state.

The byte-level pre-change inventory is
`docs/evidence/rc01/rc01-prechange-inventory.json`.

## Decision

Include the already-authorized R1 implementation, generated projections,
contracts, fixtures, durable deciding Evidence and repository controls. Exclude
only enumerated intermediate review/stage history and local/unowned preview
state. Preserve every excluded file in place and bind its pre-change digest in
the inventory.

The only Product source-ownership classes are `GENERATED`,
`PLATFORM-CONTRACT`, and `APP-OWNED`. RC-01 introduces no fourth class. Test
files are `PLATFORM-CONTRACT`, not a Product ownership authority.

## Boundaries

- R1 operations: `IAM-01..03`, `WS-01/02`,
  `PRJ-01/02/03/07/08/09/23/24`.
- Budget Analyzer remains the current vertical target and is not yet realized.
- RB-C0 is frozen future planning; R2–R7 are not started.
- The walkthrough uses PostgreSQL and the actual Hub/frontend/module/routes.
  Authentication, model output and NEW-source custody are explicit deterministic
  local fixtures. They make no Keycloak/provider/production claim.
- No Product streaming/SSE, Brain, Sankhya, Product Agent, PAR, MAR,
  automation, external write, Release or Published App is introduced.
