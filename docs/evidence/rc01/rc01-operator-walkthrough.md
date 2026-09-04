# RC-01 operator walkthrough

This walkthrough runs the exact committed R1 Hub and web frontend against an
owned ephemeral PostgreSQL 17.10 database. It uses a deterministic local session,
model and NEW-source custody fixture; it performs no network/provider call.

## Prerequisites

- WSL Ubuntu with Node `24.20.0`, npm `12.0.2`, Git and Docker.
- The exact candidate commit checked out cleanly.
- Dependencies installed with `npm ci`.
- A locally reachable PostgreSQL `17.10` admin database. The repository CI uses
  the pinned `postgres:17.10` image.
- Playwright Chromium installed for automated verification.

Example local dependency:

```bash
docker run --rm --name conexus-rc01-postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres -p 54329:5432 postgres:17.10
```

In a second WSL shell:

```bash
export CONEXUS_TEST_DB_HOST=127.0.0.1
export CONEXUS_TEST_DB_PORT=54329
export CONEXUS_TEST_DB_NAME=postgres
export CONEXUS_TEST_DB_USER=postgres
export CONEXUS_TEST_DB_PASSWORD=postgres
npm run r1:rc01:walkthrough
```

If Docker Desktop does not route the published localhost port back into WSL,
set `CONEXUS_TEST_DB_HOST` to the value printed by
`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' conexus-rc01-postgres`
and set `CONEXUS_TEST_DB_PORT=5432`.

The command prints JSON containing the exact random localhost URL and owned
ephemeral database. Open that URL. Press Ctrl+C when finished; the command
removes only that owned database and temporary build output.

## Browser path

1. Confirm `Olá, RC-01 Operator` and the explicit empty state `Crie seu primeiro
   Workspace`.
2. Select `Novo Workspace`, enter a name, create it, and confirm the server-owned
   Workspace context.
3. Select `Abrir Projects`; confirm `Nenhum Project divulgado`.
4. Select `Criar Project`, keep `Novo repositório`, name the Project and create
   it. Open its Project view.
5. Select `Iniciar Project Inception`, submit the intent, and run Inception.
6. Inspect the immutable Candidate text and its 64-character digest in the URL.
7. Ask a question in `Pergunta sobre este Candidate exato`; the deterministic
   answer states that approval remains human and governed by Conexus.
8. To inspect the denied/undisclosed state, open
   `/projects/00000000-0000-4000-8000-000000000000`; the UI must say
   `Project indisponível`. Empty Workspace and Project-list states were visible
   in steps 1 and 3. The Candidate view also carries explicit unavailable,
   unknown-outcome and refusal messages for its real route outcomes.

Automated reproduction of steps 1–8:

```bash
npm run r1:rc01:walkthrough:verify
```

## Truth boundary

Real: compiled repository frontend; Fastify Hub; generated route contracts;
Workspace and Project modules; PostgreSQL migrations, persistence and
authorization functions; Candidate custody and explanation paths.

Deterministic/fake: local session identity `RC-01 Operator`; OIDC adapter (it
refuses instead of calling Keycloak); cognition output; NEW-source Git custody.

Absent and not claimed: real Keycloak, Anthropic or other provider qualification,
Sankhya, E2B, streaming/SSE, Brain, Budget Analyzer success, Product Agents,
PAR/MAR/automations, Published App, Release, deployment or production readiness.
