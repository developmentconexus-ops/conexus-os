# 4E-R1 — GitInfra and first-authority bounded correction

> **Status:** `OPERATOR APPROVED / INDEPENDENT CONVERGENCE CLEAR`
> **Scope:** `PRJ-03 SOURCE CUSTODY + F1 PLATFORM_OPERATOR + INITIAL R1 AUTHORITY`
> **Implementation/probe authority:** `0`

## 1. Root findings

Whole/global review found two real omissions in the otherwise coherent R1 flow:

1. `PRJ-03` promises a source-complete Project and names `GitInfra`, but R1 had
   no selected source-custody mechanism or firing claim.
2. bootstrap created an Account, but no owner derived the trusted
   `platform_operator` condition or enumerated the minimum initial authority
   needed to continue through R1.

Neither finding changes the 13 operations, Product meaning, owner census,
Permission vocabulary or runtime-family census.

## 2. GitInfra Global Maximum

```text
Project/RF-01 staged tree
→ owner-local GitInfra adapter
→ Hub-controlled owner-isolated bare repository per Project
→ temporary worktree/clone for admitted mutation
→ immutable commit object
→ atomic expected-old ref update
→ exact sourceRevision returned to Project
```

### NEW

- create the owner-isolated bare repository;
- stage the exact admitted initial scaffold/profile tree;
- create the initial commit;
- atomically create/update the canonical branch ref only if the expected prior
  ref state still matches;
- Project creation settles only after sourceRevision and initial grant settle.

### EXISTING_GIT

- caller supplies only the already admitted provider-neutral locator;
- GitInfra resolves server policy and credential custody;
- embedded credentials, arbitrary protocols/destinations and generic fetch are
  denied;
- import resolves one exact immutable commit into the local canonical bare
  repository before Project settlement;
- external remote identity never becomes Project authority.

### Recovery

The canonical repository is part of Project source recovery closure. A complete
Git bundle or equivalent verified repository backup must preserve all admitted
refs/reachable objects and restore to the same commit identities. Git data is
not a new Conexus durable record class.

## 3. Why no Git hosting platform

| Alternative | Disposition |
| --- | --- |
| local bare repository + Git CLI | `SELECTED SHAPE` |
| deploy Gitea/Forgejo/GitLab for R1 | `REJECT / NO CONSUMER` |
| external provider as canonical authority | `REJECT / custody and availability coupling` |
| embedded JS Git implementation | `REJECT FOR R1 / incomplete extra compatibility boundary` |

The accepted `GitInfra` seam permits later replacement without changing
Project semantics. No forge UI/API, collaboration service, webhook platform,
repository Product surface or provider breadth is needed now.

Current official Git/Context7 evidence supports bare repositories, complete
bundle backup and atomic compare-and-swap ref transactions through
`update-ref`. Git `2.55.0` is the current reference candidate observed on
`2026-08-30`, not an admitted implementation pin. The exact Linux executable,
source/provenance/image identity and negative probe are entry conditions of the
4F `PRJ-03` slice.

## 4. First authority closure

```text
exact configured bootstrap (issuer, subject)
→ TRUSTED_BOOTSTRAP_CONTEXT for IAM-03 self-provision only
→ normal Account mapping/session
→ same exact identity derives sole F1 platform_operator condition
→ WS-01 creates Workspace membership/access + project.create
→ PRJ-03 creates direct Project grant + project.read + project.manage
```

Keycloak role/group/Organization/token claim alone never satisfies the
condition. No durable role or new Permission is created. Later R2/RB authority
is added only at its first consumer and cannot be inferred from creator status.

## 5. Required firing claims

- `R1C-13 PROJECT_COGNITION`: stateless ProjectMastra profiles, closed catalog,
  telemetry off, stale settlement refusal and safe pin/response gate before the
  cognition implementation slice or first provider call.
- `R1C-14 GIT_SOURCE_CUSTODY`: exact Git pin/source, per-Project repository
  isolation, NEW/EXISTING_GIT completeness, immutable revision, CAS ref race,
  caller-credential/arbitrary-protocol denial and backup/bundle closure.

Both are bounded addenda to 4D-06. They do not invalidate the preserved
`R1C-01..12` result or claim implementation PASS.

## 6. Reopen triggers

Reopen on multi-host Git service need, external provider as canonical source,
multiple/transferable platform operators, a Product role/permission lifecycle,
or implementation Evidence that the selected local bare/CAS shape cannot
preserve PRJ-03 atomicity and recovery.
