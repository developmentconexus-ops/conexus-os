# Several conversations per Project: what was run

This directory holds the probes behind
[the first increment](../../tasks/project-conversations-first-increment.md). They establish the
two things the increment rests on that no amount of reading the framework could settle: that a
Project's conversations are the Mastra session's own threads and survive a process restart, and
that with the Conexus model subsystem out of the path a session arrives holding no model until the
operator chooses one.

Run them with `bash docs/evidence/project-conversations/run.sh` from the repository root, after
the repository's dependencies are installed. The script prints the three `@mastra` versions it
resolved, runs both probes, and ends with a negative control whose claim is false on purpose. Every
assertion exits non-zero when it is false, so a run that ends green is also evidence that the
harness can fail.

## What `conversations.mjs` establishes

It mounts the controller the way `apps/hub/src/builder/module.ts` mounts it, over a `LibSQLStore`
the Hub owns, and then:

- A Project holds several conversations at once, and opening one for the first time yields exactly
  one rather than none: a session binds a thread on creation.
- Creating a second conversation does not disturb the first, and renaming one does not touch the
  other.
- Both survive the process ending. Pass 2 is a separate process reading the same file, and it finds
  every conversation with its title, newest first.
- Another Project lists none of them, and a session on another Project is refused their messages
  with `Thread not found`.

One framework property is recorded here because it constrains what the Hub may expose:
`thread.getById` is **not** resource-scoped and will return another resource's thread row.
Nothing Conexus exposes calls it. The message read, which is scoped, is what keeps a Project's
conversations unreadable from another Project.

## What `model-selection.mjs` establishes

With the Builder's own modes and instructions, and no Conexus model connection anywhere in the
path:

- The mounted agent carries Mastra Code's own tools, `write_file` among them, not the core
  workspace tool names the Builder used to name.
- The credential store is Mastra Code's own, and it holds the provider the operator signed in to.
- A session arrives with **no model selected**. `effectiveDefaults` is empty and `hasSelection()`
  is false. This is why the Builder screen offers Mastra's own model list and refuses to send until
  one is chosen, and why a run with none is refused as `BUILDER_MODEL_NOT_SELECTED` rather than
  guessing what the operator pays for.
- Saving a model for a mode persists it for the Project without moving the session that saved it,
  which also needs `set()`. A run opened afterwards in the same Project inherits the choice, and
  another Project does not.

## The product proof

The probes exercise the composition. `product-project.mjs`, `product-messages.mjs` and
`product-proof.mjs` exercise the product: they drive the real Hub through a real browser as the
local test operator, against the pilot database with migration `0008` applied. They are recorded
here rather than run from here, because they need the pilot's environment, an E2B sandbox and a
model the operator pays for.

The run on 2026-09-21, on a Project the test operator created on this code:

- Opening the Project showed one conversation. Two more were created and named from the screen,
  and the list showed all three, newest first.
- Switching between them left the Project's working source revision and its last good Preview
  exactly as they were.
- A real message was sent in each of the two named conversations, each a real BuilderRun on
  `openai/gpt-5.5` through Mastra Code's own credential. Both settled `SUCCEEDED`, and each run
  recorded the conversation it spoke in.
- The Hub process was stopped and started. Every conversation was still there with its title, and
  `Conversa A` showed its own exchange while `Conversa B` showed its own.
- The `builder-session` payload carried neither a single thread id nor a Conexus model offer.

Two things that run found, which the product now accounts for:

- `switchModel` with `scope: 'global'` persists nothing. Thread scope is the only one the
  controller writes, so a model choice belongs to a conversation.
- Switching a session to another thread keeps the previous model in memory without writing it, so
  a conversation the operator had never chosen for would look ready and then refuse the run. The
  screen therefore writes the operator's current choice onto the conversation it opens.
