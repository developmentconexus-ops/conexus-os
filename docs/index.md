# Conexus OS documentation map

This file routes a reader to the owner of a question. [The roadmap](roadmap.md)
owns status and the next action. Start there.

## Start here

| Need | Owner |
| --- | --- |
| Status, what exists, what is next | [Roadmap](roadmap.md) |
| How to work on this repository | [`AGENTS.md`](../AGENTS.md) and [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| The approved product destination | [Product contract, section 12](product/contract.md#12-approved-destination) |
| What Q1 proved, and its boundaries | [Stage 2 Q1 evidence and verdict](evidence/stage2-q1/README.md#verdict), closed |
| The Stage 2 generated-application architecture and qualification map | [Stage 2 managed application platform](reference/stage2-managed-application-platform.md) |
| Pre-implementation research, SDK/library candidates and superseded alternatives (not execution authority) | [Stage 2 research memory, R01–R13](research/stage2/README.md) |
| The previous Factory adoption work | [Factory adoption](tasks/factory-adoption.md), closed |
| Why the Factory-centered composition was chosen | [Sessions and Work qualification](evidence/sessions-work-qualification/README.md), closed |
| What the Builder repair program delivered | [Builder repair program](tasks/builder-repair-program.md), closed |
| Context7 documentation tools for the Builder | [Builder Context7 qualification](tasks/builder-context7-qualification.md), awaiting verdict |
| How the Builder got faster on 2026-09-20 | [Builder throughput program](tasks/builder-throughput-program.md), historical |
| The Builder on its own harness: specs 0002 and 0003, the closure set and the ordered work | [Builder own harness task](tasks/stage2-builder-own-harness-qualification.md) |

## Product

| Need | Owner |
| --- | --- |
| Product meaning and journeys | [Product contract](product/contract.md) |
| Future vision: apps, agents and AI processes sharing company capabilities (not execution authority) | [Integrated enterprise platform vision](research/integrated-enterprise-platform-vision.md) |
| Who may do what | [Permission contract](product/permission-contract.md) |
| The fixed operation census | [Operation ledger](product/operation-ledger.md) |
| Wire shape and its rules | [Wire contract](product/wire-contract.md) |
| Human context and identity | [Human-context identity](product/human-context-identity-contract.md) |
| Decisions in force and how to reopen one | [Decision register](decisions/index.md) |

## Technical reference

| Need | Owner |
| --- | --- |
| How the Builder works | [C-020 Mastra-native Builder](reference/builder-c020-mastra-native.md) |
| How Stage 2 generated applications are shaped and qualified | [Stage 2 managed application platform](reference/stage2-managed-application-platform.md) |
| Project, data and persistence | [Data and persistence](reference/data-and-persistence.md) |
| Database roles and their capabilities | [Role register](reference/hub-database-roles.md) |
| Backing up the database and Git root, and proving a restore | [Backup and tested restore](reference/backup.md) |
| Running the pilot Hub and runner under systemd, and what a crash looks like | [Pilot supervision](reference/pilot-supervision.md) |
| Security and authority | [Security reference](reference/security-and-authority.md) |
| Who owns each concept, and where code runs | [Architecture](reference/architecture.md) |
| Which Mastra API Conexus uses where it once reached past Mastra | [Mastra boundary](reference/mastra/boundary.md) |
| Frontend surfaces | [Frontend reference](reference/frontend-and-product-surfaces.md) |
| Exact Mastra lookup | [Mastra reference](reference/mastra/index.md) and the repository Mastra skill |
| How Mitra builds apps, and what Conexus took from it | [Mitra research](research/mitra/index.md), reference evidence only |
| Functionality seen in other products, with a verdict for Conexus | [Functional references](research/functional-references/index.md), reference evidence only |
| What the Builder studies measured and proposed, behind specs 0002 and 0003 | [Builder research](research/builder/index.md), reference evidence only |

## Method

| Need | Owner |
| --- | --- |
| Engineering decisions and claim-relative proof | [Engineering method](development/engineering-method.md) |
| Lanes, approval, proof, merge, Git and CI | [Delivery rules](development/delivery.md) |
| What a reviewer checks on a pull request | [Review checklist](development/review-checklist.md) |
| How the pilot Hub and runner run, and how to deploy `main` to them | [Pilot](../infra/pilot/README.md) |
| How to measure a Builder change with an experiment, and read it in Mastra Studio | [Builder eval](development/builder-eval.md) |
| Frontend design, copy, verification and new surfaces | [`conexus-frontend` skill](../.agents/skills/conexus-frontend/SKILL.md) |

Evidence, tests, runtime output and Git history establish claim-specific facts.
They do not silently replace the product contract or the roadmap.
