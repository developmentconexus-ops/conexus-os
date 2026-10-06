# 0017. Rationale: company model accounts

## Context

The product contract promises that "an AI account a person or the installation connects" pays for a person's Builder runs (`docs/product/contract.md:45,106`), and two screens promise that a shared account covers whoever has not connected one (`models-screen.tsx:11`, `admins-screen.tsx:62`). No route creates such an account. Since #380 nothing writes the `sharing` column, and its history table has no writer (`0033:27,45`, `0044`). Part 5 of S1 kept both for "the part that adds the command" (`docs/specs/0015-checked-boundaries/0015-part-model.md:270`). This wave is that part.

The operator wants the Mastra Factory's behavior: a personal account and an organization account, where Conexus's organization is the installation (C-024). In the Factory, one table holds both. A nullable `user_id` marks the organization row, and two partial unique indexes keep one row per user and provider and one per organization and provider (`mastracode/factory/src/storage/domains/credentials/base.ts:96-118`). Only an organization administrator writes the organization row (`factory/src/routes/config.ts:766-777`, `oauth.ts:295-297`). Keys and subscriptions both work. The Factory has three defects to avoid:
- the screen picks the user's credential first while runs pick the organization's first (`base.ts:292-319` against `start-coordinator.ts:173-185`);
- a failed organization refresh is silent (`tenant-credentials.ts:138-156`);
- "no credential" is red text with no link (`model.ts:234-238`).

Before designing, the operator asked for a critical audit of today's model account code against the guides, the S1 standard and the Factory. The audit found the data access at the S1 bar: the split wall, the sealed secrets, the held read and the typed executor proof. It found the domain model, the module shape and the failure handling below it. It traced six root causes:
1. The company account is one person's row with a flag (`owner_account_id NOT NULL`, `0033:23`).
2. Each provider is its own folder repeating the sign-in, the credential and the card (`anthropic/login.ts:16-74`, `openai-codex/login.ts:19-81`, four card files).
3. Five places compute which account pays (`accounts.ts:72-80`, `model-accounts.ts:128-129`, the four cards, the test fake).
4. One failure word covers five causes, and the row keeps no sign-in state (`BUILDER_MODEL_NOT_SELECTED` at `model-routing.ts:70,76`, `oauth-holds.ts:29,33,43`, `google-ai-pro/route.ts:63`, `run/turn.ts:49`).
5. Process memory holds facts of the row (`oauth-holds.ts:25`, `google-ai-pro/write-back.ts:14`).
6. Model accounts live inside the Builder, against A's core list (`architecture.md:136,390`).

Two more forces:
- The Hub's envelope seals every secret with AES-256-GCM but binds no associated data (`platform/factory-secret-encryption.ts:66-77`). Any sealed value of the installation opens on any row. With one company row that every person's run opens, a value moved to the wrong row would silently bill the wrong account and, with a subscription, put the company's prompts in a person's provider history.
- The local data is reset after S1, and the repository keeps no backward compatibility in development. A schema change with no data path is free now and expensive after the pilot.

## Options considered

### Option 1: Give the flag its writer

An administrator command that sets `sharing = 'everyone'` on the administrator's own row, plus the history writer.

**Pros**:
- The smallest diff.
- Today's tables and tests stay.

**Cons**:
- The company account belongs to one person: when that administrator leaves, it goes with them. This contradicts decision 2.
- An installation account owned by a person stays representable.
- The five copies of the precedence rule, the three sign-in copies and the silent refresh stay. The company scope would be added three times.

### Option 2: A separate installation table

`model.installation_model_account (provider PK, kind, secret, connected_by, connected_at)` beside the personal table.

**Pros**:
- Each table is simple, and no CHECK ties owner to scope.

**Cons**:
- Every reader joins two tables to answer "which account pays".
- The run's record (`builder.builder_run_model_account`) points to two origins.
- The sign-in, the refresh and the custody context are written twice.
- The Factory, cal.com and better-auth all keep one credential table.

### Option 3: One owner module, a checked scope, the row as home of every sign-in fact (chosen)

One table with `scope` as a sum the database checks. One pure account-in-use rule read by every reader. One registry with each kind's flow and codec. One sign-in module, a refusal state and compare and swap on the row, one failure code per cause. The module moves to the core. The envelope binds each value to its row.

**Pros**:
- The six root causes go by structure.
- The company scope enters once.
- The screen and the run cannot disagree.
- A moved secret fails loudly.

**Cons**:
- A large wave, about 60 product files.
- A schema with no data path.
- Part 6's session code is edited right after it lands.
- `connected_at` carries two meanings.

## Rationale

Option 3 is the only shape where decision 2 (the account belongs to the installation) is a fact of the table, not of the code, and where decision 3 (own first, the same on screen and in runs) has a single owner. The audit shows that options 1 and 2 keep the defect the operator chose the Factory to avoid: two readers computing the same rule differently.

Doing the realignment and the company scope in one wave follows "fix the root, never adapt". The scope has to enter every sign-in attempt, every card and every precedence read. Each of those is today written three to five times. Adding the scope first would write it three to five times; unifying first writes it once (laziness-protocol, subtract-before-you-add).

The AAD binding follows the cost asymmetry. Today it is 12 call sites with no data to reseal. After the pilot it needs a re-encryption job the Hub does not have (D9, A 11). It uses the AEAD the Hub already runs as intended: Tink binds a cell to its column and row id, and AWS KMS puts the table and primary key in the encryption context. It goes past both references the Factory and cal.com offer: the Factory binds nothing, and cal.com binds only the credential type (`calcom/packages/lib/crypto/keyring.ts:90,121`, `CredentialDataService.ts:26-32`). The binding is the row's natural key, not its surrogate id. The upsert keeps the id when a sign-in changes the kind, and a remove then reconnect mints a new id for the same slot.

### Why one wave

Guide L asks a plan over 70 product files, or a spec over 800 lines, to say why it does not split. This plan is about 60 files. One wave holds because the six root causes and the company scope touch the same files: the sign-in module, the card, the store and the rule. Two waves would rewrite those files twice and leave a middle state where the screen and the run use different rules.

## Synthesis (architect arena, 2026-10-06)

Two runners on different models answered the same brief, and a cross-judge scored them. Opus scored 27 and Sonnet 23 over fidelity, root causes, depth, types, concurrency and buildability. The base is the Opus candidate:
- It leaves no root cause standing. Sonnet keeps a Google bearer to row map and a join from the module into the Builder's table.
- It keeps `platform/` free of domain fields, because each owner builds a string binding.
- Its build order is green at each step. Sonnet's first step seals with `scope` before the column exists.

Both runners converged on the brand per owner, the derived credential, the one rule, the refusal column with compare and swap, the five codes and the generation keyed Google pool.

Three grafts from Sonnet:
1. The sign-in flow's `begin()` returns a closure that owns the vendor state, so the module holds no `unknown`.
2. A row is marked refused only on a dead grant: 400 `invalid_grant` or 401 at refresh, and 401 at call time (not 403, which can mean a model the plan lacks).
3. The migration stops when `model.model_account` has rows.

Rejected from Sonnet at first, then taken after the spec review:
- the run port (`openRun`). The arena first kept the registry's rule that the caller passes its proof. Both spec reviewers showed that a refresh runs after the call's transaction ended, so only a port keeps today's guarantee that a deactivated person or an ended run cannot reread a secret.

Rejected from Sonnet:
- the Builder table join;
- the five minute Google capture (one minute here);
- the migration deleting sessions and handoffs, which the reset covers.

## Evidence

**Spike 1, run.**
- A value sealed under one context opens under it.
- It fails under another owner, provider, kind, or scope.
- A value sealed without associated data opens under no context.
- A stale value of the same row still opens, so the compare and swap stays.
- A retired key still opens.
- A throwaway PostgreSQL 17 refused every illegal row with its SQLSTATE: 23514 for scope, owner, pair, provider and prefix; 23505 for duplicates; 23503 for an unknown owner. It accepted every legal row.

**Spec review (interrogate, Opus and Sonnet, 2026-10-06).** 27 findings, three critical on both sides, all taken:
- a refusal mark written inside the run's transaction rolled back with the failure, so `markRefused` gets its own committed system transaction;
- the live name through `iam.account` exposed the whole account row, `email` included, so the name is copied to the row;
- a Google ticket deleted per request turned an SDK retry into a 401 that would refuse the company row, so the ticket lives with the generation and the router never answers 401 for its own faults.

Also taken:
- each model call picks its account again (today's rule, `0038:3-6`), which corrects the mid run cases inferred in the design conversation;
- an OAuth 401 forces one refresh before marking;
- a missing key id is a configuration fault, not a custody loss;
- the migration guard covers connections, and sessions are deleted;
- the attempt key includes scope;
- a remove needs `scope`.

**Spike 2, run against the installed packages, no network.**
- A 401 and a 403 reach a `wrapLanguageModel` middleware as `APICallError` with `statusCode` on all four model kinds, with no retry. A 500 and a dropped connection are retried twice.
- Mastra's Anthropic refresh carries the status only in its message.
- The Codex refresh throws one message for every cause.
- Neither takes a `fetch`, and their constants are private, so the refresher is our own call.

## References

**Project sources**:
- The study notebook, audit, Factory trace, arena candidates, judge and spikes. These are study files kept outside this repository.
- Guides C, P, A, D, S, H, V, T, L.
- Decisions C-024, C-026, C-027, C-032.
- `0015-part-model.md` (part 5).
- The part 6 target.
- `docs/roadmap.md:89`.

**Practices & standards**:
- Associated data binding for authenticated encryption.
- Compare and swap on a row instead of a lock held across a vendor call.
- Make illegal states unrepresentable.
- Parse at the boundary.

**Links** (checked in the design conversation):
- Tink, "I want to bind ciphertext to its context": https://developers.google.com/tink/bind-ciphertext
- AWS KMS, least privilege and encryption context: https://docs.aws.amazon.com/kms/latest/developerguide/least-privilege.md
- Google Cloud KMS, additional authenticated data: https://docs.cloud.google.com/kms/docs/additional-authenticated-data
