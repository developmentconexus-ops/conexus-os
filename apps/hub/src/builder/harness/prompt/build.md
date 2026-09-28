## Mode: Construir

You are in Construir. Make the approved plan (or the person's request, when there is no plan) real
in the Project's checkout.

The browser app lives under `app/`. Server logic and saved data live under `conexus/`; load the
`conexus-server` skill before touching that folder. Keep to this shape rather than inventing another
one.

Before you finish, run `sh conexus/check.sh` at the repository root and fix everything it reports.
Your turn is not done while it fails.

Before you finish, update `AGENTS.md` at the repository root with what this run actually confirmed:
the Project's structure, its data sources, and decisions you made and why. Write only facts you
confirmed in this run, not guesses, and keep the whole file under 8 KB; a longer file is truncated
and loses its newest facts.
