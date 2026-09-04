# 4D — R1 Foundation Pack A admission result

Status: **CLOSED / `R1F-A01` CORRECTED / PACK A PASS / P01+P02 GREEN**

Date: `2026-08-30`

The operator-approved probe grant opened only Pack A `R1F-P01/P02` first.
Durable executable Evidence lives under
[`qualification/4d/r1-foundation`](../../../qualification/4d/r1-foundation/README.md).

## Result

| Proof | Verdict | Deciding observation |
| --- | --- | --- |
| `R1F-P01` | `PASS` | exact Node/npm, 26 direct pins, 243-package lock, identical clean trees and all four dependency negatives fired |
| `R1F-P02` | `FAIL` | lifecycle policy and registry signatures passed, but the selected tree contains one HIGH advisory path |

Finding `R1F-A01`:

```text
ajv-cli 5.0.0
→ fast-json-patch <3.1.1
→ GHSA-8gh8-hqwg-xf34
→ prototype pollution / HIGH / CVSS 7.3
```

`ajv-cli 5.0.0` remains the latest published release. The upstream dependency
update PR has remained unmerged since 2023. Overriding the transitive dependency
would make Conexus own an unproven forked tree and would not be simpler than
removing the redundant CLI wrapper.

The current root verification also invokes `ajv-cli 5.0.0` transiently through
historical `npx --yes` commands. That is existing repository tooling, not an
admitted R1 dependency. This correction proposal does not authorize changing the
root manifest/scripts, but the same gate adapter must replace that invocation
before R1 admission; a green historical Verify does not waive `R1F-A01`.

## Smallest correction candidate

Reopen only `R1F-07` and replace `ajv-cli 5.0.0` with a bounded APP/qualification-
owned Node gate adapter over the already selected `Ajv 8.20.0` and
`ajv-formats 3.0.1`:

```text
schema path + data paths + exact Draft2020 options
→ Ajv 8.20.0 compile/validate
→ deterministic diagnostics + non-zero invalid exit
```

Why this leads:

- adds no dependency and removes the vulnerable/transitively stale CLI tree;
- uses the same admitted validator as runtime, reducing semantic drift;
- owns only gate mechanics, not schema/Product authority;
- its RED invalid-fixture and GREEN valid-fixture behavior is directly provable;
- it avoids adopting ajv-cli's unrelated migrate/JSON-patch feature surface.

Rejected without further prototype:

- `npm override fast-json-patch`: unsupported upstream composition becomes a
  Conexus-maintained fork and still retains unused ajv-cli surface;
- older/newer ajv-cli: no non-vulnerable current published candidate exists;
- waive advisory because build-only: violates the approved exact admission law;
- remove schema gate: loses an accepted proof property.

## Authority and correction decision

No Product owner, schema, profile, runtime boundary or other R1F row was
reopened. No P03–P12 probe ran before correction. The operator was presented:

```text
APPROVE R1F-A01 MINIMAL CORRECTION
REVISE <exact correction>
HOLD
```

Approval authorizes only repinning the candidate manifest/lock from `26` to `25`
direct npm packages, adding the bounded gate adapter qualification, rerunning
Pack A from clean state and returning Evidence. It still grants no Product
implementation, later probe pack, push, PR or merge.

## Operator adjudication

```text
APPROVE R1F-A01 MINIMAL CORRECTION / 2026-08-30
```

The correction authority is exactly the `26 → 25` repin, bounded adapter and
Pack A rerun above. Historical first-run FAIL Evidence remains immutable.

## Corrected rerun result

| Proof | Rerun verdict | Deciding observation |
| --- | --- | --- |
| `R1F-P01` | `PASS` | 25 exact direct pins, 224-package lock, identical 10788-record clean trees and all dependency negatives fired |
| `R1F-P02` | `PASS` | script policy, signatures, zero-vulnerability audit, license census and bounded Ajv adapter controls all passed |

Exact source tags, Keycloak Linux amd64 OCI manifest, Atlas Community binary
and Playwright browser/support archives are recorded in the machine pin
manifest. [Corrected executable summary](../../../qualification/4d/r1-foundation/evidence/rerun-summary.md).

`R1F-A01` is closed. Historical FAIL remains Evidence of the control firing;
the corrected result does not rewrite it. P03–P12 remain `NOT_PROVEN`.
