# R1 Foundation Pack E summary

Status: **PASS / P09+P10 GREEN / REAL POSTGRESQL+ATLAS**

Two runtime roles used separate `identity_store` and `project_store` databases.
`CONNECT`, object creation, `SET ROLE`, ownership, superuser, role/database
creation, inheritance and BYPASSRLS boundaries all failed closed. No non-system
`SECURITY DEFINER` function existed, so R1 did not instantiate CR-1 early.

Atlas Community `1.3.0` validated the exact `atlas.sum` and SQL semantics on a
real validation database, applied the versioned migration to a separate target
and reported status. Checksum edits failed. Schema and table-owner drift failed
the Conexus target-shape admission.

Finding `R1F-E01`: after rehashing the directory, Atlas did not itself reject a
new migration whose version was older than the maximum already applied. The
bounded Conexus admission now reads
`atlas_schema_revisions.atlas_schema_revisions` and rejects an unapplied version
below the maximum applied before invoking Atlas apply.

All containers, databases, roles, temporary passwords, installs and migration
copies were removed. Exact PostgreSQL and Atlas caches remain with removal
commands. This is qualification Evidence, not Product persistence implementation.
