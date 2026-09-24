# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People inside one company, with equal weight for two groups:

- Staff who are not technical (operations, sales, people teams). They describe the internal app they need in Portuguese and watch it get built. They never have to read code.
- The company's developers. They use the same agent to go faster, and they read the code and the change of each run in the same place.

Both groups work in the same Project and the same conversation. A request from one is reviewable by the other.

## Product Purpose

Conexus OS lets a person in the company go from "I need an app that does X" to that app running, alone, without asking the IT team. Success for one session is a working internal app in the Preview, built from a conversation, that the person can use right away.

## Positioning

Every Project is a private repository in the company's own GitHub organization, and every change the agent makes is checked, built and admitted there before the Preview shows it. A non-technical person gets an app; the developers get real, reviewable source they own. The installation serves one company only and runs on the company's own accounts.

## Operating Context

- Sign-in through the company's Keycloak; one installation is one company.
- A Workspace holds Projects. A Project has conversations; each request is a run that edits source, runs the application check, builds, and updates the Preview.
- The build workspace ("Construir") has the conversation, the live Preview, and lenses on Code and Diff.
- Each person connects their own model accounts (subscription or API key); an installation administrator may share one with everyone.
- Settings live at three levels: personal, Workspace, and installation.

## Capabilities and Constraints

- The interface is in Portuguese.
- It is built over the Mastra Factory and Studio components (`@mastra/playground-ui`, React). The Factory owns conversations, model accounts, model packs and the SDLC; Conexus does not rebuild them.
- Tool calls wait for the person to approve or decline; the browser never changes tool policy.
- Model choice: installation defaults (administrators), personal defaults, and a switch per conversation for the build model. The thinking level is shown. A plan mode is not offered yet.
- No branch or pull request is shown to the person.
- Undecided: importing an existing repository (next), named-person sharing of model accounts (deferred), publish (out of scope).

## Brand Commitments

The name is Conexus (ecosystem domain `conexus.fun`). The visual identity is "Grafite e Ipê": the Conexus mark, graphite neutrals with one ipê gold accent, and Bricolage Grotesque, Hanken Grotesk and JetBrains Mono. `packages/brand` owns it and `DESIGN.md` describes it.

## Evidence on Hand

No customers, testimonials or metrics exist. The pilot runs inside one company. Do not invent any of them.

## Product Principles

1. The person gets an app, not a process. Branches, pull requests and pipeline steps stay out of sight.
2. The last good Preview never breaks. A failed run says what failed and keeps what worked.
3. One owner for each thing. What the Factory provides is used as the Factory provides it.
4. Built for both readers. Anything a non-technical person sees has a plain meaning, and a developer can always open the code behind it.
