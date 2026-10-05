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
`WITH CHECK (true)` let an outsider plant rows and join a workspace (spike 3), so writes are bounded by
the same set. The Hub's `rootDir` refused files under `packages/` (spike 1), and of the three ways
around it only the committed `dist/` changed no script (spike 4).

What Option 1 costs is the per role write separation. It was already broken by the executor pool, and
the import law, the proof's scope and the write policies bound what a bug can touch. The operator
accepted that trade.

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
  `UPDATE (active)`. Workspace module 208 to 161 lines on a DML only role; the role was refused DDL and
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

## Not verified

- Query parameters, a 204, a `oneOf` body, the Mastra mount schemas, the bijection and the route ledger
  on the new emitter: part 0 and the first owner with each kind prove them.
- Policies for the installation administrator, grant holder, tombstone, invitation claim and system
  branches: built and proven by the part that adds each.
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
- Row Level Security as a backstop for tenant isolation, with transaction local settings
- Problem Details for HTTP APIs (RFC 9457)
- Strangler migration, one owner at a time
- Authorization in the application layer with the database for integrity (Documenso, cal.com, Better
  Auth, Mastra)

## The 118 functions

The full table is in [0015-function-map.md](0015-function-map.md), section 3.
