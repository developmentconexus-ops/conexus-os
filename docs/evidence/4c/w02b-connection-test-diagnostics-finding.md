# 4C-F10 — Connection test applicability and human diagnostics finding

> **Status:** `F10 = OPEN / MATERIAL W-02B P8 FINDING`
> **Block:** `W-02B — Connections`
> **Trigger:** operator walkthrough of the functional Connections P8.
> **Authority posture:** finding only; no Product implementation authority.

## 1. Human job exposed by P8

The operator needs to answer, in ordinary Product language:

```text
Is this Connection configured?
Can I test whether it works now?
If the test failed, why did it fail and what should I fix?
Did configuration or credential changes make an older test no longer applicable?
```

The existing P8 proved that exposing only `credentialConfigured`, `currentRevisionId`, raw `qualificationState` and `evidenceRefs` is too technical and does not close this human job.

## 2. Known current authority

```text
CON-03 ListConnections
→ scoped logical Connection browse

CON-04 GetConnection
→ exact current Connection detail
→ exact currentRevisionId
→ current non-secret configuration
→ credentialConfigured presence fact

CON-07 SetConnectionCredential
→ write-only secret ingress
→ no readback

CON-08 QualifyConnection
→ exact ConnectionRevision + environment
→ ConnectionQualification

CON-09 GetConnectionQualification
→ exact qualificationState + evidenceRefs
```

Connections already owns logical credential-handle/version facts separately from crypto-key version and transient access-token generation. `con.connection_qualification` is already an accepted durable record class.

## 3. Material gap

Current Product/wire does **not** guarantee:

```text
1. a small server-owned current test projection on Connection browse/detail;
2. applicability of an older qualification after configuration or logical credential change;
3. a stable human-facing outcome category suitable for Product UX;
4. a human-readable diagnostic/remediation for a failed or indeterminate qualification;
5. a test timestamp suitable for honest “last tested” language.
```

Therefore the frontend cannot truthfully render after refresh/re-entry:

```text
Last test passed
Last test failed
Needs retest
Not tested
Why it failed
What to fix
```

without inventing state, interpreting Evidence itself, or retaining browser-local history.

## 4. Root cause

The semantic owner is still **Connections**. The missing property is not a new test operation; it is missing read/result semantics around the already-admitted qualification operation and record.

```text
CON-08 already performs the real test/proof job
CON-09 already owns exact qualification detail
Connection already owns current configuration + logical credential facts
```

The gap is therefore a bounded Connections-owner read/result recompile.

## 5. Target invariant

```text
one current logical Connection
+ current exact ConnectionRevision
+ current logical credential generation
+ exact environment
+ existing ConnectionQualification facts
→ server can project whether the most relevant test is CURRENT, STALE or absent
→ frontend never infers applicability
```

A test that passed before either of these changes:

```text
current ConnectionRevision changes
OR logical credential generation changes
```

must never continue to look currently applicable.

## 6. Required human diagnostic property

An exact qualification must carry enough Connections-owned human-readable result meaning to explain a failure without browser interpretation of raw Evidence:

```text
stable human outcome category
human explanation
optional remediation guidance
evidenceRefs remain exact technical provenance
```

Human diagnostic text is presentation/result truth of the exact qualification. It is not secret material, provider credential readback, Project binding truth, runtime health or caller authorization.

## 7. Negative laws

```text
qualification passed -X-> generic Connected
qualification passed -X-> runtime healthy
qualification passed -X-> Project bound
qualification passed -X-> caller authorized
old qualification -X-> current after configuration change
old qualification -X-> current after credential change
frontend interpretation of evidenceRefs -X-> diagnostic authority
credential bytes -X-> diagnostic/read projection
```

Current law remains:

```text
configured != qualified != bound != healthy != caller-authorized
```

## 8. Reopen scope

Reopen only the smallest real owner:

```text
4A Connections qualification/read semantics
→ 4B Connections wire/checker
→ W-02B P8
```

Do not reopen owner topology, Project binding, Gateway runtime health, Permissions, durable record inventory or Product implementation.