Live proof for the task-checklist and native AskUser change (PR feat/builder-task-checklist).

`build-hub-local.mjs` has no port override, and a second live Hub beside the pilot needs its own
database, Keycloak client and TLS wiring (`apps/hub/src/platform/config.ts` ties `CONEXUS_PORT`,
`CONEXUS_PREVIEW_PORT` and `CONEXUS_ORIGIN` together). Disproportionate to this diff, so these were
captured with a Playwright script driving the real `Construir` component in a headless Chromium
page, the same harness `tests/implementation/builder-browser.test.mjs` already uses for this screen,
fed by recorded `AgentController` event shapes verified against the installed `@mastra/core` schema.

- `before.png`: a live run with a `display_state_changed` task list (1 of 3 done, one in progress)
  and a suspended `ask_user` call with options, rendered by playground-ui's `AskUser`.
- `after.png`: the same screen right after choosing "Azul" (`AskUser`'s own submitting state).
