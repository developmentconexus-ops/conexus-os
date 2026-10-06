# Conexus OS documentation map

This file routes a reader to the owner of a question. [The roadmap](roadmap.md) owns status and the
next action; [`AGENTS.md`](../AGENTS.md) is where an agent starts.

## The guides

Each guide owns one subject, and a rule lives in one of them.
[`areas.json`](development/review/areas.json) maps each path to its guides.

| Id | Guide | Owns |
| --- | --- | --- |
| C | [Codebase principles](development/codebase-principles.md) | What the code must look like, and the never-list |
| A | [Architecture](reference/architecture.md) | The parts, who owns each concept, native first, where code runs |
| P | [Product contract](product/contract.md) | Purpose and capabilities, people, scope, concepts, journeys, what it never does |
| D | [Database](reference/database.md) | Stores, roles, where a rule lives, migrations |
| H | [Wire contract](product/wire-contract.md) | Operations, parsing, errors, retries on the wire |
| S | [Security and authority](reference/security-and-authority.md) | Who may act, sign-in, sessions, secrets, egress |
| V | [`DESIGN.md`](../DESIGN.md) | Look, motion, accessibility, icons, voice |
| T | [Testing](development/testing.md) | What counts as proof |
| L | [Delivery](development/delivery.md) | Lanes, waves, specs, review, merge, Git and CI |

## Records and machine owners

| Need | Owner |
| --- | --- |
| Decisions in force and how to reopen one | [Decision register](decisions/index.md) |
| The operation census | [Operation ledger](product/operation-ledger.md) |
| Which SQL function calls which | [Function callers](reference/function-callers.md), generated |
| Specs of waves not yet built or in progress | `docs/tasks/specs/` |

## Runbooks and references

| Need | Owner |
| --- | --- |
| Backing up the database and Git root, and proving a restore | [Backup and tested restore](reference/backup.md) |
| Running the pilot Hub and runner under systemd | [Pilot supervision](reference/pilot-supervision.md) and [Pilot](../infra/pilot/README.md) |
| Measuring a Builder change with an experiment | [Builder eval](development/builder-eval.md) |
| Mastra evidence: where the Hub meets Mastra beyond its plain API | [Mastra reference](reference/mastra/index.md) |
| A study of a comparable product (not execution authority) | [Mitra](research/mitra/index.md) |

Closed waves, their specs and their evidence are in Git history. Code, tests and runtime output may
challenge a guide; they do not silently replace it.
