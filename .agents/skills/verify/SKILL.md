---
name: verify
description: Drive the real Conexus app the way a person does, to prove a change works. Launches an isolated Hub built from this checkout, with its own PostgreSQL, Keycloak and headless Chromium, then drives the web UI (sign-in, Projects, Construir, Settings) and captures screenshots, ARIA snapshots, DB rows and logs. Use to verify UI or Hub behavior end to end, to reproduce a bug on the real surface, or when asked to "verify", "prove it in the browser" or "run Conexus and check".
---

# Verify Conexus

`scripts/control.mjs` runs one disposable Conexus and drives it. No Hub route is stubbed: the browser talks to the real Hub, which talks to a real PostgreSQL and a real Keycloak. Two external boundaries are replaced, and a proof must say so:

- **Model.** The Hub's Google AI Pro proxy binary is `scripts/fake-cliproxy.mjs`. It streams a fixed reasoning line and answer. No provider is called and no real credential exists.
- **E2B.** The Hub's E2B SDK points at a closed loopback port. A Builder turn opens its sandbox before the model's first token, so every turn ends with `BUILDER_PREPARATION_FAILED`. The streamed answer can't be proven here yet. See [the Construir feature](features/construir.md).

Never drive another instance: the branch Hub, the pilot (port 3443), the operator's Chromium (CDP 9333 and 9334), the Factory (port 5873), or the `conexus-keycloak` container. Each run has its own ports, containers named `conexus-verify-*-<run>`, and state in `~/.cache/conexus-verify/<run>/`.

## Launch

Run from the worktree root in WSL. Docker must be running. Launch builds the working tree as it is, uncommitted changes included.

```bash
source "$HOME/.nvm/nvm.sh" && nvm use
C=".agents/skills/verify/scripts/control.mjs"
node $C launch    # 3 to 5 minutes; prints runId, origin and the evidence directory
```

Launch starts a throwaway CA, PostgreSQL 17 with the migrations and the nine Hub roles, Keycloak with the repository realm and one test person, then the Hub and Chromium. It is ready when it prints JSON. On failure, read `hub.log` in the evidence directory and run cleanup. Run one launch per worktree, because the Hub build writes `apps/hub/public`. `node $C list` shows every run and its state.

## Doctor

`node $C doctor` is read-only. It checks that both containers run, that the Hub process is ours and serves this run's certificate, that the Hub's E2B is closed, that the Keycloak issuer matches, that CDP answers, and that the checkout HEAD still equals the launched one. If any check fails, clean up and launch again. `CONEXUS_VERIFY_RUN=<runId>` selects a run; the default is the newest.

## Drive

Start every drive with `node $C sign-in`. It submits Keycloak's form for the run's person. On the first sign-in it also creates the account at `/setup`. Then use these commands:

| Command | Does |
| --- | --- |
| `browser goto <path>` | open a path on the Hub origin |
| `browser click\|fill\|wait\|text\|attr <locator>` | act on `--role R --name N`, `--label L`, `--text T` or `--css S`; add `--exact`, `--value V`, `--attr A`, `--gone`, `--timeout ms` |
| `browser focus <locator>`, `browser press --key K` | focus an element, press a key |
| `browser screenshot <name>`, `browser snapshot <name>` | save a PNG or an ARIA snapshot to the evidence directory |
| `browser pages`, `browser close-page [--page N]` | list tabs; close one, or every tab off the Hub origin. Every command takes `--page N`; the default is the first Hub tab |
| `db "<sql>" [--save name]` | read-only query in the run's database |
| `seed-model-defaults [--model id]` | set the build and memory defaults, which no screen sets yet |

Prefer roles and accessible names. The pt-BR names are in each feature file. [`features/README.md`](features/README.md) is the map: read it, pick the feature, follow its recipe.

## Evidence

Each run writes to `~/conexus-study/verify-evidence/<local date>/<runId>/`. Set `CONEXUS_VERIFY_EVIDENCE` to change the root. The directory holds `actions.log` (every command), `hub.log`, `browser.log` (page console), `keycloak.log`, `diagnostics/` (the Hub's heap snapshot or fatal-error report, if any), `screens/`, `aria/`, `db/`, `run.json` and, after cleanup, `cleanup.json`.

A proof drives the user path, never an API call or internal setter for the feature under test. It captures the action and the resulting screen, and reads the side effect back from the database. It names the boundary that was replaced. A console error in `browser.log` that no feature file lists as expected is a finding.

## Cleanup

`node $C cleanup` stops the Hub, the browser and both containers (`docker stop`; they were started with `--rm`). It deletes the Hub build directory this run created, by the name it recorded, and the run's state directory, which holds the secrets, profile and Conexus Git. It keeps the evidence. It kills only the PIDs it recorded at launch and is safe to repeat. Run it after every failed launch too.

## Keep the map honest

When a screen or handle changes, update the feature file in the same pull request. `/maintain-verification-skill` audits the map against the source.
