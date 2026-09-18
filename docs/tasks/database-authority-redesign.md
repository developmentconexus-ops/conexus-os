# Database authority redesign

A proposal, not an authorized task. It exists because the C-006 reopen trigger was met on
2026-09-18. The operator decides whether it becomes current work.

## Protected result

A Conexus Account can never read or write another Account's data, and the database refuses
the attempt rather than the application avoiding it. The Hub reaches data only through
admitted functions. One process holds one credential.

## The evidence that reopened C-006

C-006 states the invariant `Physical roles and stores enforce owner boundaries`, with the
reopen trigger `New topology or version evidence changes the invariant`. Measured against
the running pilot database `conexus_s7` on 2026-09-18:

| Measure | Value |
| --- | --- |
| Tables | 34 |
| Tables with row level security enabled | 0 |
| Row level security policies | 0 |
| Functions `SECURITY DEFINER` | 147 |
| Functions `SECURITY INVOKER` | 1 |
| `hub_*` LOGIN roles | 16 |
| Hub connection pools | 17 across 5 files, 13 distinct roles |

The roles partition which **operations** a connection may invoke. Nothing in the database
bounds which **owner** a connection may reach. Account, Workspace and Project scoping lives
inside the 147 definer functions, as arguments the Hub supplies. A caller that passes the
wrong `accountId` is executing a permitted operation, so the grant system sees nothing
wrong and the function returns another owner's rows.

Every role carries `NOBYPASSRLS`. With zero policies there is nothing to bypass.

So the invariant is half true. Physical roles enforce an operation boundary. They do not
enforce the owner boundary C-006 names, and no other database mechanism does either.

## What is already right and must survive

Not everything here is legacy. Two properties would be designed the same way from scratch.

Function-only access. `REVOKE ALL ON ALL TABLES` plus `GRANT EXECUTE` on named functions
means the Hub never writes a table directly. A SQL bug cannot reach a column the function
did not expose.

Distinct stores. Hub control data and Project business data live apart, which is the part
of C-006 that stands unchallenged.

## What is wrong

**A database role models a principal. The Builder is a code path.** `hub_rb_ingress` and
`hub_rb_executor` divide one process into two identities that share one address space, one
secret directory and one blast radius. The split bounds a logic bug, which is real but
small, and the TypeScript store boundary already bounds most of those. It buys sixteen
credentials to provision.

**The owner boundary is enforced by discipline, not by the database.** This is the material
defect. A governed platform that asks the application to pass the right owner id has no
governance at the layer that matters.

**One role breaks the rule the others follow.** `hub_iam_runtime` holds direct `SELECT`,
`INSERT` and `UPDATE` on the `iam` tables from `001_iam_foundation.sql:77-79`, and
`identity-access/store.ts` issues raw DML at seventeen sites. It is the only role with
table grants, and it covers identity and sessions.

**Sixteen credentials is an operational failure mode, and it has fired twice.** Nothing in
the repository provisions them; migration `019` creates roles with `LOGIN` and no password.

## Target shape

One login role per deployable process. The Hub is one process today, so one credential. A
future executor worker would be a second process and would earn a second credential, at
which point the ingress and executor split becomes a real boundary rather than two
variables declared three lines apart.

Capability as `SET ROLE`, not as credential. The sixteen capability roles become `NOLOGIN`
groups. Grants, ownership and migrations `001` through `050` are unchanged. Each pool
adopts its capability on connect. `pg_stat_activity` then shows both `session_user` and
`current_user`, which is more than it shows today. The repository already uses this pattern
in `qualification/4f/r3-root-tuple/run.mjs:170-195`.

Owner boundary in the database. The session declares the current Account and Workspace,
tables carry policies, and the database refuses a row belonging to another owner even when
the application asks for it. This is the part that does not exist today in any form.

Identity behind functions. `hub_iam_runtime` loses its table grants and `identity-access`
moves to definer functions like every other module.

## Ordered work

1. Consolidate credentials. Capability roles to `NOLOGIN`, one login role, `SET ROLE` per
   pool. No grant changes. Reversible by reverting one migration.
2. Move identity behind functions. Replace the seventeen raw DML sites, then remove the
   table grants from `hub_iam_runtime`.
3. Introduce owner policies, one owner at a time, starting with a single table whose access
   pattern is fully understood. Prove refusal before widening.
4. Widen across the remaining tables.

## Non-goals

Renaming roles. The names are wrong and the rename is cheap in Postgres, but
`scripts/run-hub-migrations.mjs` hardcodes `rolcanlogin` for every `hub_*` role across 22
conditional families, so the rename costs a proof this oracle imposes. Reduce the oracle
first, then rename in one migration.

Changing what any grant permits. This moves where a capability is held, never its meaning.

Touching Project business data topology. C-006's distinct-stores half is not in question.

## Falsifiers

Owner policies are the whole point, so the falsifier is a test that asks for another
Account's row through a legitimate function with a wrong `accountId` and gets rows back. If
that still succeeds after step 3, step 3 did not land.

For step 1, a falsifier is any pool that authenticates with a capability credential after
the consolidation, or any `pg_stat_activity` row whose `current_user` equals its
`session_user` where it should not.

## What this costs, honestly

Step 1 is one migration and a connect hook. Steps 3 and 4 touch 34 tables and 147
functions, and every one of them needs its access pattern understood before a policy is
written. A policy that is subtly wrong denies legitimate reads in production, which is a
worse failure than the one it prevents.

This is why the ordering puts consolidation first. It delivers the credential reduction the
operator asked for, on its own, without waiting for the larger change.

## Stop law

Existing Product data is never destroyed. The pilot database holds real work. A step that
would require dropping, truncating or recreating it returns to the operator.

A policy that cannot be written without guessing an access pattern stops and asks. The
correct answer to an unclear owner boundary is a question, not a permissive policy.

## Owner reconciliation

C-006's invariant wording needs correction whatever the operator decides, because it
currently claims an enforcement that does not exist. That correction is owed even if this
proposal is rejected.
