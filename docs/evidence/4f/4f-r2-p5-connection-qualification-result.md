# 4F(R2) — P5 Connection qualification wiring result

**Date:** `2026-09-07`

**Disposition:** `CLOSED PASS`

**Packet commit:** `595aa0c`

**Implementation commit:** `282883b`

**Proof-completion commit:** `91b2408`

## Implemented result

Normal `CON-08` now uses one Connections-owned production qualifier. It selects
the already admitted response parser only from the immutable reserved
configuration and only for `sankhya-om@1.0.0`, `PRODUCTION`, company `1` or
company `2`. Every other configuration settles
`PROVIDER_SCHEMA_UNPROVEN / INDETERMINATE` before credential materialization or
HTTP egress.

The low-level qualifier still requires explicit response admission. The
configured module exposes only a private constructor-time `fetchImpl` seam for
controlled local proof; runtime configuration and public HTTP input cannot
select transport, origin, company or parser. Qualification performs only OAuth
authentication and the exact company read. The P4 fixed key-conformance
aggregate remains a separate Gateway/Brain-owned observation.

No schema, service, Product operation, Permission, dependency, generic Gateway
surface, deployment or real-provider call was added by P5.

## Deciding proof

- focused compiled qualification proof passed `5/5`: exact company `1`/`2`
  selection, zero-materialization/zero-egress refusal, reserved-basis
  precedence, settled replay and explicit low-level admission;
- P3 Connection regression passed `6/6`, with its separately configured real
  PostgreSQL case skipped by the local command;
- local P5 passed `13/13`, with only its exact composed external case gated;
- the gated composition passed `1/1` in `287.4 s` through PostgreSQL `17`, the
  restricted `hub_r2_connections` role, encrypted temporary credentials, the
  admitted OCI Git executor and a controlled local HTTP Sankhya stand-in;
- that composition proved a mismatched `SANDBOX` request against a reserved
  `PRODUCTION` revision returns `422` with zero requests, both companies create
  persisted `PROVIDER_CONFIRMED / PASSED` qualifications, settled replay creates
  no second attempt, and PRJ-11 subsequently uses the company-1 qualification;
- the exact provider-shaped sequence was authentication + company-1 read,
  authentication + company-2 read, then a separate authentication + fixed P4
  aggregate. No credential, bearer, business row or aggregate result entered
  Evidence.

The closure floor passed on the final candidate: `npm ci`, `npm run verify`,
`npm run repository:check:extended`, and
`npm run r1:r1c14:native:check`.

## Independent review and Lead adjudication

The independent Claude Code lane used CLI `2.1.257`, alias `fable`, resolved
model `claude-fable-5-1`, effort `xhigh`, plan/read-only mode and session
`cbc0bbc7-37c3-44c6-828d-24c948e9943f`. It returned `PASS` on
`595aa0c..282883b`, then `PASS` on the narrow proof correction
`282883b..91b2408`.

The independent AGY lane used CLI `1.1.27`, model
`gemini-3.1-pro-high`, effort `high`, plan+sandbox mode and conversation
`04916534-000d-4b36-9d8b-a89a48a9a747`. It returned `PASS` on both the material
diff and narrow proof correction, with no material finding. No temporary
`command(*)` permission remained after review.

Lead accepts both verdicts. The GPT-6 Astra advisory selected the closed
Connections-owned selector over a new catalog, P4-catalog coupling or global
parser injection. That choice avoided a new lifecycle and the cyclic error of
making Connection qualification depend on Brain/query registration.

Review observations are adjudicated as follows:

1. real-seam environment mismatch and both-company persisted qualification were
   corrected and independently re-reviewed `PASS`;
2. the production wrong-company decoder branch retains the P3 outcome-algebra
   proof; a new exact live mismatch remains P7 recovery/error proof, not a P5
   reason to call the provider;
3. the constructor-only fetch seam is absent from Hub configuration and
   `server.ts`; reopen if a future composition/configuration change makes it
   externally selectable;
4. connector identity/version is enforced by the single adopted connector and
   its reserved revision lifecycle; a second connector or version reopens the
   selector contract rather than silently inheriting admission;
5. company codes are installation-relative. This closes only the current
   operator-authorized installation envelope, never arbitrary customers.

Blocker census is zero. P5 is closed without a live qualification claim. P6 is
next for the locked W-02A/W-02B/P-02 Control Plane journey over the existing 20
routes. P7 retains any additional real Sankhya execution and whole-R2 closure.
