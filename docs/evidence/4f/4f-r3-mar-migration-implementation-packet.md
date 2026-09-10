# R3 — MAR migration implementation packet

> **Status:** IMPLEMENTED LOCALLY / CONTROLLED LIVE QUALIFICATION PENDING
> **Authority:** operator admission waiver, 2026-09-09
> **Independent review:** waived; no independent closure claim

This packet records the first bounded R3 implementation step admitted by the
operator waiver. It adds migration `024_mar_pg_boss_projection.sql` to the
ordered Hub migration lineage and keeps the work inside the accepted RF-05 /
RF-08 owner boundary.

The migration creates the existing `mar` owner schema, the MAR-owned
`mar.job_run` occurrence record and the exact pg-boss `12.26.3` private queue
substrate derived from the pinned vendor export. The vendor object body is
byte-identical between `CREATE TYPE mar.job_state` and the version marker; the
wrapper supplies the Hub transaction envelope, MAR roles, owner boundary and
runtime privilege closure. The runner pins the migration SHA-256 and verifies
the role, schema, table-owner, `job_run` key/constraint and runtime privilege
catalog after application.

Static implementation proof is green:

```text
npm run r3:mar:check
→ 4 tests passed; runner syntax passed
```

An ephemeral PostgreSQL `17.10` container then applied all 24 migrations
through the real runner and returned:

```text
verdict=PASS
versions=001..024
```

The same local session exercised the runtime role boundary in rolled-back
transactions: `SELECT` and `INSERT` on `mar.job_run`, and execution of
`mar.create_queue`, each failed with PostgreSQL `42501` (`insufficient_privilege`).
This is a local catalog/access proof only. The full RF-08 qualification,
owner-side admission function, controlled concurrency/recovery fixtures and
Product MAR admission remain pending. This packet does not execute a JobRun,
worker, provider/model, E2B, Sankhya/source read, deployment or Git
publication, and it does not claim R3 proof rows `R3-P1..R3-P7` green.

The remaining implementation route is to add the owner-side admission and
controlled recovery fixtures required by the waiver, then run the named
qualification checks. Any catalog mismatch, vendor incompatibility or
cross-owner semantic contradiction stops the packet and reopens the smallest
named owner.
