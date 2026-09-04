# 4F(R1) S3-P6 — Project disclosure and W-01 create/browse result

> **Verdict:** `CLOSED PASS`
> **Product operation delta:** `+2 generated operations (PRJ-01/PRJ-02); PRJ-03 preserved`
> **Stage result:** `S3 CLOSED PASS`
> **Next boundary:** `S4 PACKET NEXT`; no S4 Product byte is authorized

## Delivered vertical outcome

P6 realizes generated `PRJ-01 ListProjects` and `PRJ-02 GetProject` beside the
closed P5 `PRJ-03 CreateProject`. In R1, disclosure is admitted only by current
Workspace membership plus a direct current `project.read` grant. The accepted
alternate `workspace.access.manage` summary route remains unrealized rather
than simulated.

Immutable migration `007` introduces the execute-only `hub_s3_read` role and
four owner-local functions. The role has no table, mutation, sequence, role-
membership or P5 command authority. List and detail use read-only transactions;
list returns exact `ProjectSummary[]`, detail returns exact
`ProjectRepresentation`, and undisclosed exact identities remain non-oracular.

The generated same-origin client and bounded W-01 browser slice now support the
current Workspace Projects collection, local name/archive filters, explicit
Open with a fresh PRJ-02 check, and source-complete NEW/EXISTING_GIT creation
through PRJ-03. Loading, empty, authentication, undisclosed, dependency and
command-refusal states remain distinct. At narrow width cards reflow to one
column without horizontal scrolling. No Inception, Baseline, final global
shell, provider, generic Git or production-custody surface was added.

## Exact implementation identities

| Class | Path | SHA-256 |
| --- | --- | --- |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/007_project_read_disclosure.sql` | `d68caa47710295c28bcdf82ca102d8318779ae0033a9c62debd7f22d72a68975` |
| `PLATFORM-CONTRACT` | `apps/hub/migrations/atlas.sum` | `5da240779cfbbc2b904c8e81334ff6b097d911c33b0db5b0c60355bfe43a45e2` |
| `GENERATED` | `apps/hub/src/generated/s3-routes.ts` | `35ed052c25beb440f1d6278a0c56b99dbf8ef9760a6da23c87674aa7a4841b97` |
| `GENERATED` | `apps/web/src/generated/project-client.ts` | `a4e91ac0391392dee3d04ce9826a62285f578bdeeb628e9c89a1e6acba08ed3d` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/store.ts` | `ea42a51dd2e880774207f259f61273217b48c33a42839248c27aec0d93eb0cb2` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/routes.ts` | `89f19570e4031cc5f29a98472a9c45924e99bb04a7e526b24f97570ae3a27124` |
| `PLATFORM-CONTRACT` | `apps/hub/src/project/module.ts` | `baa4001a33e3122b34b0c60ab03958fa331c75643b54aaa340594947d8a128da` |
| `PLATFORM-CONTRACT` | `apps/hub/src/platform/config.ts` | `71803be5de4c06545aa59b99a06036978da29d7d117a71553e45dc19a885c4cb` |
| `PLATFORM-CONTRACT` | `scripts/generate-r1-s3-contracts.mjs` | `0fd6ee2f3f10012255360e0593bd493a1707920de5f0f3e2bfc80c943c754165` |
| `PLATFORM-CONTRACT` | `scripts/run-hub-migrations.mjs` | `780513645b15ed855c95b0b5bcab0c0bf046c1d2ecb52d87a1e0be7fe1ba1db7` |
| `PLATFORM-CONTRACT` | `scripts/record-r1c14-native-readmission-receipt.mjs` | `a725ed9deb7e31004350587f2a0306363119ff38afb1e844a6bc08b4da40d5f5` |
| `GENERATED-UI` | `apps/web/src/features/project/api.ts` | `6efe608ba96487c7a14b78f9a752224dc7b55bf9f174de7c259a79e6b567fa05` |
| `GENERATED-UI` | `apps/web/src/features/project/components/project-list.tsx` | `f99ac09b5cfa221f2dcb6a0a32055f034d1412e449f5432e5b0fe677440b9e37` |
| `GENERATED-UI` | `apps/web/src/features/project/components/project-create-form.tsx` | `c418d4e21f7b76789d602e8bebdd277a327d7557083bd3da5dbe0ba20574b917` |
| `GENERATED-UI` | `apps/web/src/features/project/components/project-detail.tsx` | `006f96f0beb63800cc9e45863e0c1a27e005d069ec9e6a82e831ad29693e9254` |
| `GENERATED-UI` | `apps/web/src/app/router.tsx` | `d62f05e7da1dda687c662896957eb4721b18e2f8d8e603b419719441b0ea8677` |
| `GENERATED-UI` | `apps/web/src/routes/index.tsx` | `785e4cd32719b740086817a1bd58c11c7d09438a9ae3a4682aeb7b44e9f63350` |
| `GENERATED-UI` | `apps/web/src/routes/workspace-projects.tsx` | `bbc90c2f0c1e35c0eda3f39d8fdbe05662d1423a6c882ec29b7975556e25d004` |
| `GENERATED-UI` | `apps/web/src/routes/workspace-project-new.tsx` | `86e0a3013db8e544b765be9a60c8e242c53993eed265c8682b3f80ec1a0ddc23` |
| `GENERATED-UI` | `apps/web/src/routes/project-detail.tsx` | `92fa6229d3299e7cc133e4cfc443fc622342e49e9a4c2af05356dea4bc0b0031` |
| `GENERATED-UI` | `apps/web/src/styles.css` | `1a816abe1b3303dd702a4e928213b89e6bbfdb72540b6f7a55aff2dc8a637af9` |
| `TEST` | `tests/implementation/r1-s3-project-disclosure.test.mjs` | `40365b9caae908e1914d2fec2d4a17631043b19b77b0cc230cf6030ba2731a0c` |
| `TEST` | `tests/implementation/r1-s3-project-browser.test.mjs` | `705cd6bd937c084b5f4ad6968493e603d3f904ebd046f74e97ef9c73d0fd19ed` |
| `TEST` | `tests/implementation/r1-s3-project-command.test.mjs` | `e0f8f71c01482bca2bbb2e1dd9eb18e15c3320f341ac4293b594784ec2a754e7` |
| `TEST` | `tests/implementation/r1-s3-postgres.test.mjs` | `070ff9573dc79db0026f7a4202ad7f489a17c65bc1d59300149ba2149cf4d63f` |
| `PLATFORM-CONTRACT` | `package.json` | `3b0dfd03c5fec06ca451d84deca34dbf07084683d3d2962d8be3326a6d76fa7c` |

The accepted Product OpenAPI digest remains
`67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3`.
The exact three-route S3 projection digest is
`9750816573401de3df9bc3fd70007376aa3532242d48a2fbb766feabbacc53f5`.

## Deciding proof

```text
P6 targeted generated/server/browser proof
  PASS / 17 active / 1 unchanged P5 live canary skipped
  PRJ-01/02/03 census / HTTP honest states / Hub+Web typecheck

real Chromium
  PASS / 5 of 5 total browser tests
  wide+narrow / local filters / EXISTING_GIT draft / create→detail
  known empty / dependency failure / no horizontal-scroll dependence

real PostgreSQL 17.10
  PASS / P6 direct proof 1 of 1
  membership + direct project.read / sibling+cross-Workspace refusal
  immediate grant revocation / execute-only role / no table access

live source-complete composition
  PASS / 1 of 1
  NEW + synthetic admitted EXISTING_GIT / exact Git OCI / PRJ-01/02
  terminal replay / secret non-disclosure / all fixtures removed

import law + native successor
  PASS / 26 of 26
  PASS / 31 of 31 / manifest 17 of 17
  historical result SHA-256 d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6

npm ci + npm run verify
  PASS / 191 added / 192 audited / 0 vulnerabilities / verify exit 0
```

The live proof used PostgreSQL
`docker.io/library/postgres@sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`
and Git OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.
The Git identity was not replaced by host Git, a tag or another platform
manifest. Chromium was Playwright `1.62.1` Chromium build `1234`. All proof
containers, networks and repository build artifacts were removed.

## Proportional adjudication

No accepted implementation correction changed a protected Product property or
its deciding proof after the packet was frozen. The PostgreSQL harness split a
multi-statement prepared query, the native receipt declared exact inherited P6
transitions, and the WSL Playwright runtime received its missing browser/system
dependencies; these were proof-environment corrections, not Product changes.
Under Engineering Method 1.1 and the frozen P6 no-recursive-review rule, no new
Fable/AGY call was justified. Prior P5 independent convergence remains intact.

The complete adaptive scope rail and final visual hardening remain S5. Broader
access-admin disclosure remains later IAM work. Both are `DEFER SAFELY` because
the present R1 path neither claims nor simulates them.

## Remaining boundary

S3-P6 and S3 are `CLOSED PASS`. S4 remains packet-gated and may begin only by
freezing the exact PRJ-23 immutable candidate reload, PRJ-09 digest-bound
approval and PRJ-08 approved Baseline read vertical. Its test-only candidate
injection must be absent from production composition. Cognition/R1C-13,
provider calls, production/external custody, generic Git/argv/shell access,
external publication, local commit, push, PR and merge remain blocked.
