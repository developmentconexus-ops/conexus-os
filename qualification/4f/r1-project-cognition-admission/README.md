# R1C13 Project cognition admission

This isolated qualification package proves the bounded Mastra Project gateway,
the pre-parse response ceiling, and the Anthropic personal OAuth transport. It
is not a Product runtime package and is not installed at the repository root.

## Verification

Run in WSL Ubuntu with the repository Node version:

```bash
source /home/leandrotheodoro/.nvm/nvm.sh
cd qualification/4f/r1-project-cognition-admission
npm test
```

The live proof is separately authorized and requires an existing external
personal OAuth login:

```bash
npm run qualify:live -- --receipt evidence/p2-live-oauth-receipt.json
```

The credential remains outside the repository at
`~/.config/conexus/credentials/anthropic-oauth.json`. Never read, copy, log or
commit that file. The live receipt records only origins, counts, model identity,
custody assertions and disclosure booleans; it records no prompt, response or
credential bytes.

## Scope

- exact model: Anthropic `claude-fable-5`;
- inference origin: `https://api.anthropic.com`;
- OAuth authorize origin: `https://claude.ai`;
- OAuth token and redirect origin: `https://console.anthropic.com`;
- scopes: `user:profile user:inference`;
- no API-key fallback;
- local personal-subscription qualification only;
- no production, multi-user, pooled-token, Product/S6, publication or Git
  authority.
