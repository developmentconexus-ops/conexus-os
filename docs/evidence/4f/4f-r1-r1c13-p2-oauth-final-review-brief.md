# R1C13-P2 OAuth final independent review brief

> **Mode:** fresh isolated closure review
> **Candidate:** `qualification/4f/r1-project-cognition-admission/p2-oauth-candidate-result.json`
> **Reviewer effects:** read-only; no login, provider call, token read, edit or Git publication

## Authority bootstrap

Read `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`, the R1C-13 stage packet,
P0/P1 results and only the candidate-owned qualification files named by the
candidate manifest. Treat reviewer output as Evidence, not authority.

## Frozen protected claims

1. The exact catalog identity is Anthropic `claude-fable-5` at only
   `https://api.anthropic.com`; OAuth authorization is only at
   `https://claude.ai`, token exchange and callback are only at
   `https://console.anthropic.com`, and caller/base-URL/redirect substitution
   cannot receive a credential.
2. Authentication is PKCE OAuth Bearer with independent callback state, bounded
   token responses and no API-key fallback or surviving `x-api-key` header.
3. Access/refresh tokens stay only in the external regular non-symlink `0600`
   file under a `0700` directory; writes are atomic and refresh is single-flight.
4. Project-owned system content remains first. The exact provider-required
   Claude Code compatibility sentence is a fixed, non-caller-selectable suffix;
   it may not precede, replace or redefine Project authority.
5. The inherited P0 byte ceiling applies before provider parsing to success and
   error responses, and failures disclose no credential, prompt or body.
6. The HTTP observer fires on an isolated synthetic canary. The live proof then
   made exactly one observed manual-redirect request to `/v1/messages`,
   observed a nonempty response, saw zero unauthorized attempts and recorded
   neither response content nor token.
7. This is local personal-subscription qualification only. It grants no token
   pooling, redistribution, production/multi-user OAuth, S6/root dependency,
   commit, push, PR or merge authority.

## Falsifiers and proof reconstruction

Stop closure only for a reproducible false-PASS route affecting a protected
claim: state substitution, token endpoint/origin redirect, credential load
before egress denial, API-key survival, permissive/symlink custody, partial or
racing refresh writes, unbounded provider body, secret/body disclosure, mutable
model/fallback, Project-authority displacement by the compatibility suffix,
non-firing/evadable egress observation, fabricated live-attempt evidence or
unauthorized Product effect.

Reconstruct from source/tests/lock, the durable live receipt and the candidate
hashes. Do not read the external token file or execute any provider/model/login
command. Generic OAuth
framework improvements, commercial-policy preferences and broader recovery
features are non-blocking unless tied to a concrete protected-property breach.

## Output contract

Return one verdict: `CLEAR`, `REVISE`, or `STOP`. For every finding provide
classification (`METHOD FINDING`, `PRODUCT / PLAN GAP`, `LOCAL EXECUTION GAP`,
or `NO FINDING`), exact file/line, reproducible failure route, protected claim
affected and smallest correction. Explicitly identify non-blocking findings as
`DEFER SAFELY` with why-safe and revisit trigger. Do not propose another review
round unless a material correction would invalidate the property or proof you
reviewed.
