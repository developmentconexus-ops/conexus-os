# Codebase principles

What clean code means in Conexus OS. Every change, review and redesign wave is measured against these
twelve properties. Agents write most of this code and copy what surrounds them, so the codebase is
their prompt: a clean base is one where copying the neighbor gives the right result, and where the
wrong way does not compile or fails CI.

[`delivery.md`](delivery.md) owns how a change ships and [`engineering-method.md`](engineering-method.md)
owns how a decision is reached. This file owns what the code itself must look like. The decided shapes
and the shapes that must not appear are in
[`shapes.md`](../../.agents/skills/conexus-development/references/shapes.md).

1. **One fact, one owner.** Each type, state, contract, failure code and constant lives in one place.
   Everything else is generated or derived from it, never copied by hand.
2. **The domain is in the structure.** A lifecycle is a state machine. Variants are discriminated
   unions, not a bag of booleans. A table or registry replaces branching spread across files. Ids of
   different kinds are branded and do not mix. An illegal state cannot be written.
3. **Firm boundaries.** Data from outside (HTTP, database rows, environment, model output) is parsed
   once at the edge, with a schema, into a domain type. Inside, the type is trusted: no `as`, no
   `any`, no second validation. Business logic is pure functions; the framework shell (Fastify,
   React) is thin.
4. **Native first.** Mastra, PostgreSQL, Keycloak and E2B do what they already do. Conexus code exists
   only where the product differs. No state beside state Mastra already holds.
5. **Modules by subject, not by step.** A file knows one subject. No god file, no function that runs a
   whole lifecycle, no wrapper with one caller. A reader answers "where does this come from?" and
   "what changes it?" in under 30 seconds.
6. **One pattern per need.** One way to handle an error, run a transaction, schedule a job, call the
   Hub from the web app, and draw each UI part. A second way to do the same thing is a defect.
7. **Named failures.** Every failure has a code from one table, and its category is decided where it is
   raised. A platform failure is fixed in code, never offered to the person as "try again".
8. **Operations converge.** Every step can run again after a crash and reach the same end. One runner
   for periodic jobs and one reaper for what expires.
9. **Tests of behavior.** A test calls the code the way its user does and compares with a literal
   value. No test reads source text. Fake only what cannot run locally; a screen is proved in a browser
   against a real Hub.
10. **Observable.** Structured logs with a code and a trace id. Every error a person sees leaves a log
    line.
11. **Nothing dead.** No unused code, no compatibility layer for old shapes, no guard for a failure
    never seen, no comment that narrates the obvious. Each wave leaves the code smaller.
12. **Lessons become structure.** A rule that has to be repeated becomes a check that fails: a type,
    a lint, a CI ratchet. Text is ignored; a failing check is not.

A finding against one of these names the property by number, the file and line, and the owner that
fixes it: the change under review, or the roadmap wave that owns the shape.
