# 0015. Rationale

## Context

The Hub has three boundaries where data enters code: the HTTP request, the database row and, on the
web side, the Hub's answer. At each one the type is asserted, not checked. 79 row reads take a generic
argument instead of a schema. The generated web clients return a raw `Response`, and 26 call sites
write `response.json() as T`. 18 routes the web calls have no contract operation at all, and seven
Builder operations have hand written types on both sides. 97 `noUnsafeTypeAssertion` suppressions are
marked as debt. 40 kinds of ids travel as plain strings, and 46 web and 122 Hub functions take two or
more of them side by side.

The contract lives in YAML, projected into TypeScript by four generators and a schema converter. The
Hub does not check what it sends; the web does not check what it receives; the YAML can disagree with
both, and the study found four operations where it does.

Authorization and most business rules live in 118 SQL functions, 115 of them `SECURITY DEFINER`, each
reached through a capability role and its own pool (ten pools over nine roles). The code recognizes
their refusals by message text in five places. 57 of the 59 migrations redefine a function, because a
rule change is a function change. One pool, the executor's, is handed to the application host, which
crosses the trust boundary the role model was meant to draw. The model was chosen to make "a SQL bug in
module X cannot write schema Y" true; the functions then accreted the rules the same decision had
placed in code.

Without a decision, every new operation, read and rule repeats these shapes, and each census only
grows. The forces: a solo team that must read and change rules quickly; a public repository whose
review must catch a missing permission check; a pilot running from a local checkout (no image build);
PostgreSQL 17 and Fastify 5 already in place; Zod 4 already installed with native JSON Schema output;
and the operator's rule that development keeps no backward compatibility.

## Options considered

### Option 1: the operation in Zod, rows parsed in one module, a typed proof for commands, read policies, rules in TypeScript (chosen)

Each operation is a Zod declaration in a shared package; the Hub registers it through the S3 definer
and checks input and output with it; the web parses with it; the OpenAPI is emitted and committed. One
data module owns `pg` and parses every row. Commands take a nominal proof made by an admission that
locks its rows in the same transaction. Reads run under policies keyed to the acting account. The
functions move to TypeScript, part by part; PostgreSQL keeps integrity.

**Pros**:
- One source per fact: the declaration for the wire, `ROLE_ALLOWS` for roles, the schema for rows.
- A forgotten check fails to compile; a forgotten filter returns nothing it should not.
- Rules change in code with ordinary tests, without redefining functions.
- It is how Documenso, cal.com, Better Auth and Mastra place authorization: in the application, with
  the database for integrity.

**Cons**:
- The largest change of the four: every owner moves, in eight parts.
- Gives up the per role write separation between owners.
- Adds read policies, a policy helper role and a per row cost.

### Option 2: keep the functions, generate TypeScript bindings, contract in Zod

Keep the 118 functions and the capability roles; generate a typed binding per function; move only the
contract to Zod.

**Pros**:
- The smallest diff on the database side; no change to the role model.
- The per role write separation stays.

**Cons**:
- Rules stay split between two languages, and a rule change stays a function redefinition.
- Refusals still cross as SQL errors, and a binding's types are as true as the generator's reading of
  the function, not checked at runtime.
- The executor pool leak and the accretion that caused it remain.

### Option 3: a query builder typed from the schema (the Prisma or Kysely route)

Generate row types from the database schema with a query builder, keep or drop the functions.

**Pros**:
- Row types follow the schema without hand written row schemas.
- A popular, documented path (Documenso uses Prisma).

**Cons**:
- A dependency and a second row type beside the Zod schema the wire already needs.
- Types from a generator are compile time only; a drifted database is not caught at the edge.
- Does not answer authorization or the functions.

### Option 4: fix in place

Keep the YAML and its generators, add a parse at each row read and each web call, keep the functions.

**Pros**:
- Each change is local and small.

**Cons**:
- The YAML, the generators and the hand written handler generics stay as a second source.
- Authorization stays in functions reached as text.
- Every census falls only by discipline, which is how it grew.

## Rationale

The operator decided the direction before this spec: the contract source is Zod in code, and the
rules and authorization move to TypeScript with a typed proof, one runtime role and integrity in
PostgreSQL, with Row Level Security if a spike showed that an unchecked list read compiles. This spec
designs inside those decisions; what follows is why the shape holds.

The force that decides most of it is that the team is one person who must trust what review cannot
re read every time. A check that compiles away or runs at an edge removes a whole class of review
question. Option 2 keeps the rule in a language the team reads less often and keeps refusals as text.
Option 3 types rows from a generator but checks nothing at runtime and adds a dependency beside Zod.
Option 4 keeps the second source of every fact. Only Option 1 makes the forgotten check a compile error
and the drifted row a runtime error at the edge.

The spikes then moved three decisions inside Option 1. A list read that ignores its proof compiled and
returned another workspace's project (spike 2), so reads get policies, the condition the operator set.
`WITH CHECK (true)` let an outsider plant rows and join a workspace (spike 3), so revision 4 bounded
writes by the same set. Revision 5 reverses that last decision for commands: the outsider of spike 3
is now refused by its proof before any write, the founding guard refuses an occupied workspace, and
composite keys and column grants hold what a policy held. The section "Revision 5: the split wall"
gives the reasons. The Hub's `rootDir` refused files under `packages/` (spike 1), and of the three ways
around it only the committed `dist/` changed no script (spike 4).

What Option 1 costs is the per role write separation. It was already broken by the executor pool, and
the import law, the proof's scope, the gate, the composite keys, the column grants and the write lint
bound what a bug can touch. The operator accepted that trade.

## Evidence from the spikes

- **Spike 1, contract.** WS-01 and WS-02 in Zod in a shared package, registered by the S3 definer with a
  31 line method; a wrong return and a misspelled header failed `tsc`; Zod per route validation; 126 of
  126 tests. `z.toJSONSchema` emitted what the YAML says (pattern, minLength, const, null, oneOf); brands
  do not appear; `reused: 'ref'` across separate conversions collided names, so `.meta({ id })` is used.
  `call` in 23 lines parsed answers and problems with Zod running without `eval`. A uuid path param
  turned today's 404 into a 400, hence `malformed`.
- **Spike 2, data.** `platform/db.ts` on PostgreSQL 17: a wrong row throws, a failed rollback does not
  hide the error, a dead client is discarded, the `error` listener is required. The proof as a class with
  a `#private` field refused literal, spread, `undefined`, wrong scope and wrong action; a symbol keyed
  object did not. A list read that ignores its proof compiled and leaked. The revoke race kept today's
  outcomes in both orders. `FOR SHARE` in READ ONLY: 25006. `FOR SHARE` on `iam.account` needs
  `UPDATE (active)` (revision 5.2 uses `UPDATE (created_at)`, a column with no rule on it). Workspace module 208 to 161 lines on a DML only role; the role was refused DDL and
  `factory`.
- **Spike 3, read policies.** The leaking read returned only the acting account's project; no account
  set returned nothing. `WITH CHECK (true)` let an outsider plant a row and join a workspace; the stricter
  check refused both and kept WS-01 working with the empty workspace branch. A membership policy reading
  itself failed 42P17; a NOLOGIN `iam_rls` owning the helper fixed it without `BYPASSRLS`.
  `set_config(..., false)` leaked to the next transaction on a pooled client; `true` did not, after
  commit, rollback or a throw. The revoke race held with policies on. Cost under 1.5 ms on 12 thousand
  projects. An unported definer function under `FORCE` returned nothing silently; a `legacy_owner`
  bridge for the owner roles kept it working. The catalog lint caught a table without RLS, without
  `FORCE` or with a read only policy; 25 tables start on the list.
- **Spike 4, package.** No Dockerfile; the pilot builds from the checkout. Committed `dist/` by relative
  path, project references, and an npm workspace package all passed typecheck, build, boot and the
  suite. Project references served a stale build silently; the workspace package changed six scripts
  and the lockfile; the committed `dist/` changed none.

## Evidence from the review

Three candidate designs were compared on surface, security, types, ownership of facts, subtraction,
fit with what exists, and principles. The chosen base was the only one that followed all spike results
(nominal proof, read policies, no lock in READ ONLY, `malformed`, `dist/` without moving `rootDir`) and
deleted more than it added. Grafted from the others: the lock order (aggregate row first, `FOR UPDATE`
on rows the command changes, the tombstone through the parent row); PRJ-03 as reserve, Git outside the
transaction, then complete with a second admission; the disposition of all 118 functions; the brand
disposition by census name; status, code and failure table in agreement; `parseForeign` for the
Mastra mount; censuses by resolved symbol with fixtures; the trigger parity test. Rejected: validating
input twice (Ajv then Zod), a proof forgeable by spread, `FOR SHARE` in a read only transaction, a
malformed id as an unsaid 400, per query session settings holding sets of admitted ids, and admission
views owned by a `BYPASSRLS` role (the catalog check refuses `BYPASSRLS`).

WS-02 was kept by one candidate on the ground that a published operation needs more than "no caller" to
be removed. This spec deletes it: no web caller, no external client, and the repository keeps no
backward compatibility in development.

## Evidence from the adversarial review

Three reviewers on different models read revision 2 against the source and the spikes. What they found
and what revision 3 changed:

- The transaction mode was a phantom type parameter, so a read proof passed where a write proof was
  due (one reviewer compiled it). Now `ReadTx` and `WriteTx` differ in structure, and `mode` is a
  runtime field the admission reads.
- Taking the admission's share lock before the owner set inverted today's order, so two owners removing
  each other would deadlock. Now the admission takes today's locks in today's order, the owner set
  first, and the owners it locked travel in the proof.
- The single receipt dropped the workspace from PRJ-03's key, could not hold the bootstrap receipt
  (no account yet) and would have replayed a stale Builder run. Now the key is the proof's authority,
  the bootstrap has its own authority, and BLD keeps its run row key.
- Functions call across owners (project to builder, the five purges, registry to builder), so the
  parts were not disjoint. Now a script derives the caller graph, project merges second, and a ported
  owner calls an unported one through SQL until that owner's part turns the call into a port.
- `hub_owner` failed the role invariant; it is `conexus_owner`. The migration connection is the
  superuser and bypasses policies, so the rule for migrations was deleted.
- Brands live only in the output type, so input types are the schema's output on both sides.
- Two success statuses and cookie effects had no place in the declaration; they do now.
- The emitted OpenAPI could not stay in bijection while YAML owners remain; the emitter bundles them
  until part 6.
- The account policy hid application grantees and the connector broker had no account; both now have
  policy branches, and the broker reads as the grant holder.
- The founding branch let anyone take over an emptied workspace; the workspace now records its creator.

## Evidence from the cross check

A fourth model read revision 3, explained the design back, and compared it with Documenso, cal.com,
Better Auth and Mastra. It confirmed the transaction modes now differ (it compiled them) and that the
references keep authorization in the application, pass one transaction through related changes, and
reserve an idempotent effect before running it. It found 17 more gaps. Most were in the policies of
later parts: the bootstrap and the application login before any account, what a grantee may use
versus administer, the project tombstone and administrative deletion, model account sharing, and
columns some child tables do not have. That was the second round finding holes in the same premise,
that every later part's policies could be written up front without reading each function body. So
revision 4 stops doing that: this spec fixes the mechanism, the rules every policy follows and part 0
completely, and each later part writes its policies in its own child spec from the bodies it ports,
with the questions the reviews raised listed as what it must answer. The other fixes: the action
decides the lock mode of the resource row at its first read; the executor settles a run it owns under
the system entry; `RunOwner` is today's `owner_id`; the locked owner set is typed in the proof; refusal
codes come from one table keyed by action; the contract forbids `.default()`; `Success` cannot be
empty; a policy that reads and writes different rows is split per command, and every branch but the
system one needs an account.

## Revision 5: the split wall

### Why reads and commands get different walls

Revision 4 assumed that one policy per table could speak for every actor. Six child drafts, two
amendments and three review rounds tested that premise, and each round found holes in the same place.
The child drafts hold 113 policy table rows: part 1 has 20, part 2 has 8, part 3 has 8, part 4 has
12, part 5 has 5 and part 6 has 60 (a grep of the `| table | command |` rows of
`s1-build/part*/0015-part-*.md`). Counted as policies, since a row can carry a write and a lock
policy, the designer's census found 136: 25, 8, 9, 15, 5 and 74, and of part 6's 74, 28 are bound to a
credential and 10 exist only to permit a lock (`authz-redesign/opus-design.md`). Only 29 of the 113
rows are `SELECT`. The holes sat in the other branches. Amendment A needed a widened grantee helper
and a system wrapper for the administrator. Amendment A+ needed a credential setting and six more
helper shapes, and its review found three High findings, all in credential branches: authentication
saw an account's whole application inventory, the handoff credential lost its browser binding, and a
claim could not lock an invitation (`s1-build/amendment/astra-aplus-findings.md:5,15,25`). The
person's list reads held in every part.

PostgreSQL's own lock semantics explain why. Under READ COMMITTED a row locked `FOR SHARE` after a
wait is returned as it now is, but the policy's subqueries used the statement's snapshot, so the
policy is not rechecked against what changed during the wait. `FOR SHARE` and `FOR UPDATE` need an
`UPDATE` policy, so every command that locks needs a write branch even when it writes nothing
(Supabase states the related rule that an `UPDATE` needs a `SELECT` policy,
`refs/postgrest-supabase-basejump.md`, E4). The admission already rereads after the wait. So on the
command side a policy was costly, weak where it mattered and redundant where it held. On the read side
none of this applies: a read takes no lock, runs READ ONLY, and a forgotten filter is exactly what a
policy catches.

So revision 5 asks the database for what it does well on each side. A read runs as `hub_reader`, which
holds only `SELECT` and sees what the person policy shows. A command runs as `hub_command`, whose
policy is `true`; the proof decides, and the database holds the integrity a write must keep (tenant
keys, immutable columns, a visible `WHERE`).

### The design space

- **Code only, one role** (cal.com, Documenso, Better Auth, Cerbos `PlanResources`): the smallest
  build. Rejected because spike 2 compiled a list read that ignored its proof and leaked; the reader
  policy exists for that read.
- **Policies for every actor, with fact helpers** (revision 4 with amendments A and A+, the Supabase
  style): about 136 policies, ten or more helpers, and a branch per flow that can leak or refuse. Even
  Supabase runs administrator work on `service_role`, which skips every policy.
- **One relation table read by every policy** (Zanzibar, OpenFGA, SpiceDB, Keycloak authorization): a
  second source of truth for three object types and two roles, or a rewrite of `iam`; it does not
  remove the lock, credential or system problems. Mastra's FGA provider (`@mastra/core` 1.71.0, under
  its `ee` license) governs Mastra resources and has no Hub row mechanism.
- **Policies on member rows only, everything else on one runtime role** (the second designer's
  recommendation): keeps the built write policies and drops the credential ones. It keeps the lock
  and recheck weakness on every command and the `UPDATE` policies locks need.
- **Per audience views** (`security_barrier` views per grantee list): kept for a future grantee facing
  list; no such list exists today.
- **The split wall** (chosen): a reader role under person policies, a command role under the proof,
  composite tenant keys and column grants as the write wall. Both designers agreed independently that
  only member reads are a row question.

### What each element rests on

| Element | Evidence |
| --- | --- |
| One `NOINHERIT` login, `SET LOCAL ROLE` as the first statement | PostgREST does exactly this (`postgrest/docs/references/auth.rst:17,23,60-72`, `src/library/PostgREST/Query/PreQuery.hs:44-55`); the split spike measured that it fails closed on a pooled client after a commit, a rollback and an error (`authz-redesign/spike/spike.md:56-58`). PostgREST picks the role from a token claim; we pick it in code per entry, which is stricter |
| Identity as a transaction local setting read by policies | PostgREST (`PreQuery.hs:52`, `SqlFragment.hs:604-607`), Supabase (`auth.uid()`), Basejump |
| A person's reads filtered by policy | PostgREST, Supabase and Basejump (`basejump-accounts.sql:328-334`); cal.com, Documenso and Mastra filter in code, and Mastra's optional `resourceId` filter (`stores/pg/src/storage/domains/memory/index.ts:497-503`) is the hole this closes |
| A person's writes on a role without row filtering, guarded by code | cal.com, Documenso, Better Auth and Mastra check then write (`update-team-settings.ts:75-87,153`, `crud-org.ts:450-460`); Basejump does it for membership writes in definer functions (`basejump-accounts.sql:420-468`) |
| Administrator commands on a privileged role after a check | Supabase `service_role` (`api-keys.mdx:88,107`), cal.com and Documenso admin procedures (`trpc.ts:304-316`) |
| Authentication by digest on a privileged role | supabase/auth places auth in code on its own role and hashes one time tokens; Documenso hashes sessions; our digest rule is stricter than every reference |
| Composite tenant keys as the write wall | no precedent in any reference; it does for a role without a row filter what `WITH CHECK` does in PostgREST and Supabase |
| Definer helpers in a private schema, pinned path, narrow `EXECUTE` | Supabase recommends all three (`row-level-security.mdx:641-657`, `securing-your-api.mdx:207`); Basejump grants to `authenticated` with `search_path = public`, which we do not copy |
| Immutable tenant and owner columns | Basejump's `protect_account_fields` trigger (`basejump-accounts.sql:82-96`); we use column grants instead of a trigger |

The full citations are in `authz-redesign/refs/postgrest-supabase-basejump.md` and
`authz-redesign/refs/calcom-documenso-betterauth-mastra.md`.

**Where we depart.** PostgREST and Supabase judge every write by policy (`db_authz.rst:35-41`,
`row-level-security.mdx:279-311`), and Supabase tests allow and deny for all four commands. Revision 5
does not. Their reason is that they have no application layer between the client and the database,
so a policy is the only guard. We have one, with a compiler checked proof made in the same transaction
as the write and holding its locks, which none of the code first references does (they leave a time
of check gap). Nobody splits a reader and a command role in one login; that combination, and the
composite keys, are ours.

### What stays weaker

A command whose `WHERE` names the wrong row inside its admitted scope is not stopped by the database.
The proof bounds which scope it acts in; the composite keys stop a row that points at two tenants; the
column grants stop a row moving between tenants; the write lint stops a write with no visible filter;
the gate stops a statement before admission; the per operation cross tenant test stops an operation
that reads or writes by another tenant's id. A wrong but present filter inside the admitted scope is
left to review and to the store tests with literal expected values. The founding of a workspace is held by
`grantCreatorMembership`'s "no membership yet" guard instead of a `created_by` column and a policy,
so an emptied workspace could be founded again by a buggy caller; the last owner rule keeps a
workspace from being emptied today. Until part 6, `hub_runtime` keeps direct grants on the tables no
part has split, so the fail closed fact holds per split table and holds whole only at the end.
Until part 6, sign in reads `iam.account` through `unportedPool` behind a `legacy_runtime` bridge, the
exposure `hub_runtime` has on it today; `hub_reader` reads it only under its reader policy.
`iam.workspace_membership` has no unported reader and no bridge. The `RawToken` brand is an accident guard: it exists only at compile
time, so a token cast or read back as a plain string reaches the tag. The `sql` tag's run time text
refusal stops a role switch or a `conexus` setting the code writes by accident; it does not stop a
compromised process, which holds the login and can switch roles on the client directly, and it does
not stop our own code written to evade it (the threat model, below).

### Revision 5.1: the two interrogations

Two reviewers on different models read revision 5 against the built code and the split spike
(`authz-redesign/interrogate/opus-findings.md`, `authz-redesign/interrogate/sonnet-findings.md`).
Neither proposed leaving the split wall. HQ counted eight gaps that both reports name: the
purge guard removed on a false premise, `admitApplication` with no tombstone rule and no project
lock, a gate that was structural and an account that travelled twice, the reader's grants on
`iam.account` and `iam.workspace_membership` with no policy, a write lint blind to case, CTEs and
constant filters, a cross tenant test that passed with `USING (false)`, definer functions granted to
the reader that trusted their account argument, and a `RawToken` wording that claimed a wall. HQ
decided each point (`authz-redesign/rev51-hq-decisions.md`); the admission child, section 11, lists
what changed and where.

Two findings attacked the design rather than its details, and both held. The split spike had
measured that `SET LOCAL ROLE` to the command role works inside a reader transaction, and the second
reviewer read that as an escape: the login is a member of both roles, so a text lint was the only
thing between a read and the command role. Revision 5.1 moves
that check into the `sql` tag at run time and keeps one login, since a second login and pool for the
reader would double the connections for a risk the tag closes. The same reviewer showed that revision
5's census counted policy branches, not reads by exact id, and that revision 5 moved those reads to a
role with no filter without naming a check. Revision 5.1 names the rule (every command read filters
by a scope column from the proof) and proves it per operation, not per table, because the risk is in
the statement a command writes.

The first reviewer found the one place where the gate's promise was overstated: it forces some
admission before any statement, but the proof's scope type is what forces the right one. The text now
says so. It also found that PostgreSQL 16 and later record inheritance per membership, so `NOINHERIT`
on the login role alone does not prove that a membership grants nothing until a switch; the role
invariants now check `pg_auth_members`.

### Revision 5.2: the confirmation

A Sonnet reviewer read revision 5.1 against the built code and PostgreSQL 17.10
(`authz-redesign/interrogate/sonnet-confirm-51.md`). It found 29 of 30 findings closed and one open.
The tag of 5.1 matched forbidden substrings, and three spellings passed: `set local conexus .job =
'project-purge'` (the space before the dot passed the purge guard), `set local u&"r\006fle" to
hub_command` (a Unicode escape that switched the role inside a READ ONLY transaction), and a `DO` block
that builds its `EXECUTE` by concatenation. HQ did not add three more spellings to the list. A list of
forbidden spellings loses to the next spelling, so revision 5.2 allows only the statements a command
needs (`select`, `insert`, `update`, `delete`, `with`) and refuses the bare word `conexus`,
`session_authorization`, `u&`, `set_config` and `current_setting`.

**Threat model.** The Hub's SQL is written only by our code; generated apps run on their own
databases. So the database walls and the tag guard against accidents, not against our own code
written to evade them. Code review and the lints own deliberate evasion. There are no anti tamper
rounds: a person who can write the Hub's SQL can also edit the tag, the roles and the policies, so a
tighter tag would add reading load and no wall.

The other findings were small. The reach list of rule 4 named `project.project`, whose policy shows an
administrator no row outside its workspaces, so the list is now literal (four tables). Only
`iam.account` has an unported reader, so `iam.workspace_membership` loses its `legacy_runtime` bridge
and its `hub_runtime` grants. The row lock on `iam.account` moves from `UPDATE (active)`, which let a
command deactivate an account, to `UPDATE (created_at)`, and so does the membership; part 6 adds `UPDATE (role)` with the
command that writes it. The reader grant on `iam.account` is the columns a person reads, `account_id`,
`display_name` and `email`. Reader policies are named `reader` and `reader_admin`. One finding was accepted as
it stands: `register_project_repository` can be called on any project, because its one caller is a
person's command, and on another tenant's project its inserts change nothing (admission child,
section 6).

### Not verified by revision 5.1

- `iam.lock_administrators()` taking the table lock as `hub_command` (the test of part 0b proves it).
- The `sql` tag's first keyword rule and refused words against the three proved bypasses and the
  plain `SET`, `DO` and `CALL` (the fixtures of revision 5.2 prove them in part 0b); it is an accident
  guard, so no full SQL grammar is claimed.
- The `legacy_runtime` bridge on `iam.account` keeping sign in working on the local Conexus (part 0b's AC-15 check).
- The cost of two role statements per transaction on the local Conexus under load.
- The composite keys of part 6 against existing rows of `iam.host_session` and `iam.handoff`.
- Whether parts 2 and 6 restate their reader policies without a fourth helper.
- `SET LOCAL ROLE` inside the real `db.ts` lifecycle with its discard path; the spike used the same
  shape with `spk_*` names on a disposable cluster.

## Not verified

- Query parameters, a 204, a `oneOf` body, the Mastra mount schemas, the bijection and the route ledger
  on the new emitter: part 0 and the first owner with each kind prove them.
- The reader policies of each later part, with their `ADMIN` branch where rule 4 of the admission
  child allows one: built and proven by the part that adds each.
- The non locking read proof type: part 0's negative fixtures prove it.
- Policy cost on large tables and on accounts with many workspaces.
- The lock order of the other set changing commands (connections, application grants) against their
  functions: each part derives it from the function body it ports.
- Response encode cost on large answers (`source/tree`, `source/file`).

## References

**Project sources**:
- `docs/development/codebase-principles.md` (principles 1, 2, 3, 6, 7 and their "Enforced by" lines)
- `.agents/skills/conexus-development/references/shapes.md` (decided shapes, the class rule, the reaper line)
- spec 0014 (the access kinds, the definer, the route ledger), spec 0013 (the job executor), spec 0009
  (the failure table)
- `docs/reference/security-and-authority.md`, `docs/reference/hub-database-roles.md`,
  `contracts/technical/hub-database-roles.json`
- `scripts/hub-catalog.mjs` (`assertRoleInvariants`, the `BYPASSRLS` refusal, the catalog snapshot)

**Practices & standards**:
- Parse, don't validate: parse external data at the boundary into domain types
- Make illegal states unrepresentable; nominal types for capabilities
- Row Level Security as a backstop for tenant isolation of reads, with transaction local settings and
  a role switched per transaction (PostgREST, Supabase)
- Least privilege by role and column grant; composite foreign keys for tenant integrity
- Problem Details for HTTP APIs (RFC 9457)
- Strangler migration, one owner at a time
- Authorization in the application layer with the database for integrity (Documenso, cal.com, Better
  Auth, Mastra)

## The 118 functions

The full table is in [0015-function-map.md](0015-function-map.md), section 3.
