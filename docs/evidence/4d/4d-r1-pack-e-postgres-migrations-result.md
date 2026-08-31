# 4D — R1 Foundation Pack E PostgreSQL/migrations result

Status: **CLOSED / PACK E PASS / `R1F-P09/P10` GREEN / `R1F-E01` CORRECTED / OTHER PACKS NOT PROVEN**

Date: `2026-08-30`

Pack E executed against exact local PostgreSQL `17.10`, `pg 8.23.0` and Atlas
Community `1.3.0` under the approved probe grant.
[Executable Evidence](../../../qualification/4d/r1-foundation/evidence/pack-e-summary.md).

## Result

| Proof | Verdict | Deciding observation |
| --- | --- | --- |
| `R1F-P09` | `PASS` | physical database CONNECT separation plus owner/runtime privilege controls fired; CR-1 absent |
| `R1F-P10` | `PASS` | Atlas checksum/real apply plus Conexus order/role/schema drift admission fired |

Example:

```text
iam_runtime to identity_store = allowed
iam_runtime to project_store = PostgreSQL 42501
iam_runtime SET ROLE identity_owner = PostgreSQL 42501
```

## `R1F-E01` correction

`atlas.sum` proves file integrity, not temporal order after an intentional
rehash. Atlas accepted a directory containing a newly inserted older migration.
Conexus therefore adds one narrow admission check:

```text
applied versions from Atlas revision table
plus ordered migration filenames
then any new version below maximum applied = STOP before apply
```

This does not create a second migration engine. Atlas still owns checksum,
validation, status and apply mechanics; Conexus enforces its accepted linear
Release law.

## Claim boundary

The probe does not implement production schemas, backup/restore, CR-1,
concurrency narrowing, Release promotion or production migration execution. It
proves only owner/store isolation and migration admission mechanics.

All synthetic state was destroyed. Product implementation, push, PR and merge
remain unauthorized.
