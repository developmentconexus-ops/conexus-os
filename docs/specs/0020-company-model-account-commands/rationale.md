# 0020. Rationale: company model account commands and experience

## Context

Company access must remain with the installation when an administrator leaves. People should see
which account pays and consciously disconnect a refused personal account before company fallback.
The legacy owner/templates mixed wire, UI, provider state and incomplete refresh contracts; this
rewrite follows the joint study and the product/architecture guides, using the least new machinery.
No product code or pilot action is included. The original unsupported approval is removed.

## Options considered

| Mechanism | Complete options and cost | Recommendation with deciding reference |
| --- | --- | --- |
| Delivery | Keep drafts: lowest writing effort but observed broken contracts; combine: one approval but ten original units plus omitted contracts; two sequential complete waves: boundary/proof work but usable foundation; remove company: loses intent | Two waves, approved 2026-10-07; L limits, complete persistence belongs to 0017 |
| Ownership | Sharing human row: no migration but person tenure; separate company table: duplicate query origin; existing scoped table: one slot/constraints; delete company feature: intent lost | Scoped prerequisite, Factory base.ts:96-118, no new table |
| Selection | Keep independent policies: least immediate edits but contradictory payer; company-first: easier centralized default but violates personal intent; one personal-first selector: one owner/each-call reread; delete fallback: no company coverage | Personal-first, Factory base.ts:292-319 with org-first exception rejected |
| Refusal | Retry silently: fewer writes but false usable UI; unconditional persistent invalid: simple but races reconnect; generation/spent conditional fact: one existing store write; remove refusal UX: violates accepted truthful state | Guarded current fact, adapt cal.com VideoApiAdapter.ts:278-293 |
| Generation | Timestamp: no new column but demonstrated collisions; stable row+initial ciphertext plus advancing spent state: no column but two identity states/reconciliation; generated uuid column: one forward migration/brand; delete pooling/Google: loses scope or spawns duplicate processes | UUID changes only connect; Factory atomic row refresh informs guards but exact Google generation not found |
| Refresh | SDK generic exception: lower maintenance but no safe cause; message regex: cheap/unreliable; narrow copied requests: status/body classification + version drift cost; generic OAuth client/service: excess machinery; no refresh: loses subscriptions | Narrow installed1.8.3 request adaptation while SDK lacks structured errors; delete when native catches up |
| Attempts | Keep three maps: fewer edits but repeated owner/expiry; common small in-memory owner: one lifecycle/current admission; Factory durable sessions: restart recovery not required, adds secrets/table; remove subscription flows: product loss | Concrete native handles + existing job, reject durable base.ts:120-133,355-369 |
| Google capture | Stop-only: least code but loses long-running rotation; existing periodic jobs+response/stop capture: bounded added callback but best effort; durable write-through service: larger new owner/no verified native event; remove Google: reopens accepted scope | Existing pool/router/jobs, honest last-success record; no minute guarantee or second Hub |
| Screen | Four cards duplicated by scope: lowest initial code but repeats behavior; three concrete provider cards: matches product; generic renderer: framework for three cards; remove personal/company control: loses intent | Factory ProviderAccessSection.tsx:63-115, concrete flows only where repeated |
| Default writer | Keep no writer: fails approved amendment; general0008 settings slice2: broader build+memory migration/service; build-only writer existing table: one operation/query/control; remove existing default/read: breaks next-use behavior | Existing build row/company eligibility, 0008 index.md:227-236; personal/memory outside |
| Census | Keep old narrow scanner: false zero; second downstream scanner/framework: duplicate owner; extend0017 one scanner: small exact symbols/path checks; delete checks: loses C§11 objective recurrence | Extend actual foundation owner; compiler/CI own registry/event/type truth |

Every added mechanism names a examined reference or says not found. Removal is genuine: removing
company/Google/subscriptions/default/refusal requires changing accepted product outcomes, not a
builder shortcut. Existing helper wrappers/classes/maps are removable when their single owner can
represent the behavior directly. No service, distributed lock, queue, tenancy or workflow engine.

## Decision and why

Operator approved study objective/limits/end and **two sequential waves** on 2026-10-07. The study
amendment explicitly adds the installation Builder default writer on the same settings screen.
Firstmate authorized a spec-only second branch from the commands branch with its own review PR.
The guarded 0017 cutover was separately approved; 0020 consumes it without touching reset/key
configuration/pilot. No old approval line is authority for this rewritten spec.

Model-account.manage is a routine domain action added to the **merged** 0018 owner, matching Factory's
current admin checks. Existing action/role does not mean another action is admitted. No nominal
lookalike, role service or draft authorization implementation lives in this spec. Generation identity,
CAS/serialization and current release solve measured defects at one live Hub, which is the product's
actual stage. Replica correctness and hard crash windows would require more machinery and are not
claimed. Google real rotation/origin still need qualification and may falsify the premise.

### Three-proof verdicts

| Mechanism/verdict | Product/guide proof | Reference proof | Live code/runtime proof |
| --- | --- | --- | --- |
| Scoped row — KEEP | P company tenure, D lawful unique slot | Factory base.ts:96-118 | 0071 unmerged; actual PG17.10 main/head catalog replay PASS, no false delivered claim |
| Current write admission — KEEP/extend action | S administrator/current personal authority | Factory config.ts:766-777, oauth.ts:295-297/356-362/416-422; Documenso/Better Auth current checks | Actual0018 only admin/connection actions; proposed new action simulation explicit, no copied upstream engine; this wave owns the narrow provider-boundary classifier because 0019 defers vendor classification |
| Duplicate payer selectors — REPLACE | P personal first, A owner | Factory base.ts:292-319 | Current main personal/sharing differs schema branch; downstream consumes complete0017 outgoing module |
| Refusal fact — REPLACE | Truthful screen/failed source, H generated failures | cal.com Webex invalid fact:278-293 | Existing refused_at check; plain401/SDK message cannot prove origin, scope/generation/spent required |
| Timestamp generation — DELETE/REPLACE | C model identity, D data invariants | Exact Google reference not found; Factory base.ts:329-352 uses atomic row | 0071 precision3 and same-timestamp reconnect succeeds; generated uuid invariant test required |
| Post-run persist/current waiter — KEEP0017 | No lost rotated tokens/current caller, S/D | Factory atomic refresh/current-read | Actual write-back persists held row after run, revoked-waiter defect reproduced; not reimplemented downstream |
| SDK opaque refresh — REPLACE narrow edge | H classify causes, C no text guessing | Installed SDK1.8.3 requests at corrected lines | Fake400/401/500/network probes lack structured status/code, narrower adapter needed |
| Three private sign-in owners — REPLACE | A lifecycle/C one owner, all four kinds | Factory durable sessions rejected without restart need | Current private maps/expiry and no-request abandoned-process leak; existing platform jobs/close suffice |
| Native Google process/protocol — KEEP | C-027/native-first | Pinned existing CLIProxyAPI native adapter | Pool boot sweep/idle/close/file0600 already exist; no new service owner |
| Secret header/hash/write-back map — REPLACE | S no serialized credential routing, explicit generation | Exact ticket mechanism not found in examined sources | Existing router header carries record, pool hashes changing bytes; generation entry can own spent context |
| Minute/replica guarantee — DELETE | T measured claim, early single-Hub product | jobs.ts:16-35 schedules after settle; Factory atomic crossprocess refresh differs | Singleflight local, CAS after spend; existing lifecycle instance lock excludes second Hub |
| Four cards/generic renderer proposal — REPLACE/DELETE | V/H server facts and usable settings | Factory UI63-115 | Actual old card paths are -account.tsx; new three concrete cards, no actor id in wire |
| Build default — KEEP table/add writer | Approved study amendment/next use | 0008 AC23 company-offered requirement | Existing model.installation_default reader/no writer; preserve memory/personal interfaces |
| Historical blanket failure — DELETE with forward normalization | D applied history/valid stored rows, H one enum owner | Existing0053 normalization precedent | Actual RunRow accepts historical code now and rejects after enum removal; migration must precede enum cut |
| Duplicate census/shape previews — DELETE | C§11 one truth | Native TS/CI owner | Old scanner accepts moved parsers/retired APIs; direct upstream extraction and one extended checker |

## Evidence

Main `5efbc090c43176ca4e666688769d2a4ee09e1745`; commands base
`674f534896c720d2364175323c02bcb88c5bb019` product identical to main; schema
`885addee625db576de92de52d5e0e49aca086cc4` unmerged. Actual0018/0019 draft commits are
in index. 0071 must precede removal of its RLS helper; post0018 accepted catalog remains a gate.
Fresh PostgreSQL17.10:19 passed/0skipped, both main/head catalog snapshots PASS. Fresh native
provider/routes/thinking suites:71passed/0failed/one opt-in realGoogle skip. Skip is not qualification.

Joint rerunnable census and actual holds/envelope/SDK/RunRow probes are privately retained by
firstmate. Public reproduction: foundation census --at=<commit>; dependency shape compiler; current
named provider/PostgreSQL suites. Counts must be rerun on delivered foundation before U1; original
main counts do not pretend final module exists. Seven Caller/LoginState aliases are candidates, not
seven independent machines. Two timers include required bounded exit wait, which remains.

Native Google refresh rotation/error origin, actual rewritten lifecycle, real company/personal paid
turns, future migration/CI and post-upstream runtime are **not verified**. Qualification before merge
owns these proofs and separate operator authorization. Neither ticket design nor proxy-hop401 has
been observed to prove provider-origin refusal; no hidden hard minute promise.

### Audit disposition

| Finding | Fix/evidence in rewritten artifact |
| --- | --- |
| 0020 F1 unsupported approval | Draft status, choices distinguished from spec approval |
| F2 false schema/order | Exact unmerged prerequisite/main and schema-before0018 order in dependency gate |
| F3 timestamp collisions | Explicit generation UUID column/brand/migration; same timestamp case in U6, refreshed generation unchanged |
| F4 cross-Hub CAS overclaim | Single-Hub instance lock premise; current release inherited0017, CAS only stored bytes |
| F5 abandoned Google leak | Native close through attempt owner.jobs without request, U4 test; keep bounded exit timer |
| F6 stored enum retirement | Forward run-row normalization before removing BUILDER_MODEL_AUTH_FAILED, U5 real migration/parse case |
| F7 census holes | Reuse upstream AST scanner all providers/retired APIs; extend exact old runtime routes/header/cards, U7 defect cases |
| F8 incomplete budget | Actual intermediate/new paths with event/failure/Hub/job/UUID/historical migration/default writer owners; actual diff allowance, 51 paths, not final-name discount; runtime.ts old auth-code producer included |
| F9 constructor/actor/preview/persist | Full module deps/routes/jobs/close; only connectedByName/date in payload; foundation imports, working outgoing persist/reread consumed |
| F10 crash/origin/new ticket overclaim | Best-effort after-settle capture; no one-minute promise; real origin/rotation gate; tickets labeled new/no reference found |
| F11 overengineering/options | Full removal/cost options and three-proof verdicts; no generic model builders/renderer/checker/attempt store |

## References

All guides mapped by areas.json were read in full: C, A, P, D, H, S, V, T, L plus roadmap and
C-027/C-032 decision register. Exact used reference pins/lines are in index. Mastra fork
ce7e9c30c1fb22ca37936121d88336ccee1f955c; cal.com54343aa685ae8f33159d2f485ec4a57bad5c574a;
Documenso cd0cc5febcbb76ec7e5ecb75c0b8c65ab8432198; Better Auth0e1a9c8413ff048a617cad81ab67175933ca8c7a.
PostgREST d42ae9d55d12989cdc2f0fda8d551b07af4e6ab5, Supabase cb52c0f42565032ab3f1cfb9a48fe4c44aad381e
and Basejump7a1f95ccef74eb2e638d5e4233b66b6cbbe175e6 were comparisons in the joint study, not owners
copied by downstream. No company data or machine path belongs in public evidence.

## Independent rewrite review (2026-10-07)

Two independent read-only reviewers (gpt-6.1-sol and gpt-6-sol) found seven distinct contract issues:
generation introduced too late; nonexistent upstream vendor classifier/omitted runtime producer;
company-only offers/current-default read missing; contradictory Google acquire inputs; usable-surface
approval missing; sign-in start idempotency absent; and missing codec/selector census predicates.
All were corrected and both reviewers confirmed their material findings resolved. A final minor U6
manifest entry for the U2 migration was removed, avoiding an implied second edit of applied history.

U2 now delivers generation before refusal. Narrow provider-call classification belongs here and
runtime.ts's generic auth producer retires with the code; 0019 supplies Failure/Result only. The module
and wire carry explicit company offers/current-default availability. Google acquire takes one specialized
held snapshot. U2/U7 include their future clickable-structure approval and light/dark browser gate.
Start reuses platform/receipt.ts:83-125 and admission.receiptOf with IdempotencyKey, stores only a stable
loginId, and GET reads in-memory handoff. Retries create no second handle; after restart replay id reads
expired. Existing web/app/attempt-key.ts:8-25 supplies request-key retention. No new receipt table or
persisted URL/device challenge/verifier/native attempt. The selector checker proves named API/table
ownership, not semantic absence of arbitrary duplicate logic; the codec predicate names exact edges.

Spec artifacts compile against actual foundation a5068fba54c676c2104b642ff08fd54ad9df8890 and pinned
upstream sources with explicit planned action/code additions. Foundation/command census fixtures,
negative type cases and verify:quick validate artifacts/current repository, not future runtime or
Google qualification. Future unverified work remains in the index qualification contract.

Final validation after review corrections: shape compiler passed; command census clean plus six
defect fixtures passed (retired identity/API/expiry/card, extra codec and selector); git diff --check
and verify:quick passed. All tracked changes remain within this spec; no runtime proof is claimed.
