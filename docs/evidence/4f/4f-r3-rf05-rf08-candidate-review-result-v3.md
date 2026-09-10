# R3 — RF-05 / RF-08 V3 independent review result

> **Status:** REVIEW COMPLETE / MATERIAL CORRECTIONS REQUIRED / R3 NOT ADMITTED
> **Review mode:** third fresh read-only Opus + Gemini lanes
> **Candidate:** [`4f-r3-rf05-rf08-candidate-freeze.md`](4f-r3-rf05-rf08-candidate-freeze.md)

Both lanes independently reproduced the 23-row custody, manifest, migration
corpus and base. The raw receipt is
`/tmp/conexus-r3-rf05-rf08-review-v3/conexus-review-result.json`.

## Lane receipts

| Lane | Session | Verdict |
| --- | --- | --- |
| Opus / Claude 2.1.257 | `d6d2d812-f281-4411-942b-1244b482ee92` | `CORRECTIONS REQUIRED / R3 NOT ADMITTED` |
| Gemini / AGY 1.1.28 | `a83f877e-0699-4203-97fb-63af0421d6ea` | `NOT_PROVEN` |

## Material findings

1. **RF-08 vendor composition:** raw pg-boss DDL creates schema, privileges,
   functions, scheduler substrate and its own transaction envelope in ways that
   cannot be applied verbatim through the Conexus runner. The safe path is an
   owner/grant/privilege hardened Project wrapper around unchanged provider
   object definitions, followed by fresh requalification.
2. **Review-subject identity:** the freeze's own bytes were not externally
   attested; the manifest cannot include itself without a cycle.
3. **Custody scope:** the transaction-owning Hub source paths were outside the
   envelope; the named RF-05 falsifier was therefore not fully reproducible.
4. **Worktree identity:** the candidate is unpublished dirty state; the review
   needs an explicit external attestation and must not be described as a Git
   checkpoint.
5. **Routing precision:** the prior Package-D subset (`P1..P6`) was not R3-P7;
   the BLD-10 non-consumption proof belongs to the exact R3 source census, not
   the Package-D fixture receipt.
6. **Current-source route:** the transaction law needs an implementation
   enforcement mechanism and falsifier before R3 admission.

The lanes also observed roadmap/selection wording drift and a stale reference
artifact; these are handled as documentation corrections. They did not reopen
the accepted pg-boss candidate, Package-D isolation, native runner choice,
R3/R7 split, BLD-10 approved-Baseline meaning or 46-record architecture.

`VERDICT = R3 NOT ADMITTED; vendor-DDL realization, external candidate identity and RF-05 source custody require correction and a fresh independent review.`
