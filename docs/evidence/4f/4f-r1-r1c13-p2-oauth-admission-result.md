# R1C13-P2 Anthropic OAuth admission result

> **Disposition:** `CLOSED PASS`
> **Date:** `2026-09-02`
> **Product delta:** zero Product files and zero root dependencies

## Bounded outcome

The isolated qualification package binds Anthropic `claude-fable-5` through
personal OAuth PKCE with no API key. Authorization is pinned to `claude.ai`,
token exchange and callback to `console.anthropic.com`, and inference to
`api.anthropic.com`. The only requested scopes are `user:profile` and
`user:inference`.

The external credential is a regular owner-only `0600` WSL file under a
`0700` directory. Token writes are atomic; refresh is single-flight across
processes. No token, prompt or response bytes enter repository Evidence.

## Proof

- isolated P0+P1+P2 suite: `23/23 PASS`;
- targeted P2 suite: `8/8 PASS`;
- DNS/socket/HTTP observer synthetic canary: PASS;
- live request: one observed manual-redirect request to
  `https://api.anthropic.com/v1/messages`;
- unauthorized observed attempts: `0`;
- Fable 5 nonempty response observed: yes;
- response content recorded: no;
- credential recorded: no.

The provider-required Claude Code compatibility sentence follows Project-owned
system content. It is fixed transport compatibility input, not a
caller-selected or user-facing Product identity. Moving Project authority first
remained live provider-compatible.

The machine-readable candidate and receipt are
`qualification/4f/r1-project-cognition-admission/p2-oauth-candidate-result.json`
and
`qualification/4f/r1-project-cognition-admission/evidence/p2-live-oauth-receipt.json`.

## Independent closure

The first independent closure exposed material proof gaps in egress observation,
scope minimization, cross-process refresh, custody and durable Evidence. Those
properties changed materially and justified exactly one final isolated
Fable/AGY round. Fable found two bounded proof gaps: the missing joined Mastra
composition and the post-import observer window. Both are corrected and pass.
AGY timed out during response delivery and is recorded as such. Lead
adjudication is `CLEAR`; no third review is justified.

Production/multi-user OAuth and S6/root Product bytes remain outside this
result. The S6 packet must name its credential mechanism and owner before any
implementation.
