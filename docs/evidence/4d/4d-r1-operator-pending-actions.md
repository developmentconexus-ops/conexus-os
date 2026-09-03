# 4D(R1) — Operator-pending actions

> **Status:** `OPERATIONAL PENDING / NOT AUTHORITY`
> **Current status owner:** `docs/roadmap.md`
> **Observed:** `2026-09-01`

This record contains only actions that require authority or external state the
autonomous execution grant does not provide. It does not block safe local proof
or create Product meaning.

## Durable repository custody

The G0/S1/A0/S2 and R1C-14 proof chain remains untracked in the local worktree.
The historical R1C-14 protocol already had to be recovered from a tool-owned,
garbage-collectable capture ref, proving that working-tree-only custody is not a
durable close condition.

An Evidence-only local checkpoint commit is the narrowest durable correction.
It must preserve all unrelated/unowned paths and must not imply push, PR, merge
or Product-provider authority. The current roadmap expressly blocks local
commit, so no commit will be created without a separate operator grant that
names the exact owned path envelope.

## External image custody

The admitted OCI index currently exists only in the native WSL Docker daemon.
Export to an OCI archive or registry would create a new external/local artifact
and custody boundary. No export or publication is authorized yet. S3 may use
the exact local immutable digest only after the native successor closes; durable
image publication remains a separate operator decision.

This deferral is safe only while the deciding WSL daemon resolves that exact
index and S3 fails closed when it does not. Reopen external image custody before
any host/daemon handoff, reset, prune, replacement, restore or remote CI/runtime
use that can lose or require the image, and immediately if `docker image inspect`
cannot resolve the admitted index. The later owner is the operator-controlled
external image-custody boundary before the triggering transition; recurrence
does not authorize an automatic rebuild, export or publication.

The retained local BuildKit metadata is unsigned, reports an empty builder ID,
`reproducible: false` and `completeness.materials: false`. The consumer proves
exact equality for the five materials that metadata records; it does not claim
that an unsigned local attester proved universal material completeness. Stronger
attestation/signing belongs to the same future external image-custody decision.

## External build-input custody

The exact Git archive and detached signature, the byte-pinned Ubuntu keyserver
export and the resolved `docker/dockerfile:1.7` frontend are currently verified
by digest but not retained as durable local or external artifacts. The keyserver
response and mutable frontend tag can change while correctly causing a future
rebuild to fail closed. Retaining or externally archiving these exact inputs is
a separate operator custody decision; this record does not grant network upload,
registry mutation, commit or publication authority.

## Still blocked

- cognition/R1C-13 and live Product provider/model calls;
- local commit, push, PR and merge;
- production effects or irreversible external publication.
