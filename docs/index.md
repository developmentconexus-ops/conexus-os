# Conexus OS documentation map

This file routes a reader to the owner of a question. [The roadmap](roadmap.md) owns status and the
next action; [`AGENTS.md`](../AGENTS.md) is where an agent starts.

## The guides

Each guide owns one subject, and a rule lives in one of them.
[`areas.json`](development/review/areas.json) maps each path to its guides.

| Id | Guide | Owns |
| --- | --- | --- |
| C | [Code guide](development/codebase-principles.md) | The Google TypeScript Style Guide adapted: modules, classes, functions, data modeling, boundaries, errors, state, naming, redundancy |
| A | [Architecture](reference/architecture.md) | The twelve arc42 sections: goals, constraints, context, the core, blocks and owners, runtime, deployment, concepts, decisions, quality, debt, glossary |
| P | [Product contract](product/contract.md) | Purpose and capabilities, people, scope, concepts, journeys, what it never does |
| D | [Database guide](reference/database.md) | Evolutionary Database Design: stores, migrations, a database per developer, refactoring, access code, roles, row security, where a rule lives |
| H | [API guide](product/wire-contract.md) | The Zalando guidelines adapted: contract, URLs, methods, payload, errors, headers, pagination, compatibility |
| S | [Security guide](reference/security-and-authority.md) | OWASP ASVS level 2: trust zones, who may act, sign-in, sessions, browser boundary, secrets, egress, untrusted code, logging, recovery |
| V | [`DESIGN.md`](../DESIGN.md) | Look, motion, accessibility, icons, voice |
| T | [Testing guide](development/testing.md) | Microsoft playbook and Google test sizes: behavior, sizes, skips, doubles, generated output, negative cases, routes, screens, Builder proof |
| L | [Delivery guide](development/delivery.md) | Microsoft playbook, Google eng-practices and DORA: lanes, waves, review loop, Aprovo, stop rules, small batches, proof, merge gate, Git |

## Records and machine owners

| Need | Owner |
| --- | --- |
| Decisions in force and how to reopen one | [Decision register](decisions/index.md) |
| The operation census | `OPERATIONS` in `packages/contract`, and the emitted `contracts/api/product/openapi.json` |
| Which SQL function calls which | [Function callers](reference/function-callers.md), generated |
| Specs of waves not yet built or in progress | `docs/specs/` |

## Runbooks and references

| Need | Owner |
| --- | --- |
| Backing up the database and Git root, and proving a restore | [Backup and tested restore](reference/backup.md) |
| Running the pilot Hub and runner under systemd | [Pilot supervision](reference/pilot-supervision.md) and [Pilot](../infra/pilot/README.md) |
| Measuring a Builder change with an experiment | [Builder eval](development/builder-eval.md) |
| Mastra evidence: where the Hub meets Mastra beyond its plain API | [Mastra reference](reference/mastra/index.md) |
| Builder framework, planning and evaluation studies (not execution authority) | [Builder research](research/builder/index.md) |
| A study of a comparable product (not execution authority) | [Mitra](research/mitra/index.md) |
| Hosting and tenancy: putting Conexus online for several companies (not execution authority) | [Hosting study](research/hosting/study.md) |
| Database architecture: the unit of app data, the clusters and the stores for several companies (not execution authority) | [Database study](research/database/study.md) |
| The Builder as its own service, and where Mastra's data belongs (not execution authority) | [Builder service study](research/builder-service/study.md) |

Closed waves, their specs and their evidence are in Git history. Code, tests and runtime output may
challenge a guide; they do not silently replace it.
