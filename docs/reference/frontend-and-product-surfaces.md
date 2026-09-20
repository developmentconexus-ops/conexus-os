# Frontend and Product Surfaces

This file owns detailed frontend meaning. For the Builder,
[C-020](builder-c020-mastra-native.md) owns technical meaning and the
[repair program](../tasks/builder-repair-program.md) owns delivery sequence.
[The roadmap](../roadmap.md) owns status. Section 33.4 lists every surface that
exists; this file describes those and nothing beyond them.

## 33. Scaffold and frontend architecture

The paved road remains React, strict TypeScript, Vite SPA, and TanStack
Router/Query. Replacing that stack requires a real failure class.

## 33.1 Versioned deterministic scaffold

The scaffold carries platform-controlled auth, API, error/loading, security,
contract, and build/test mechanics. Application-specific needs do not silently
waive those contracts.

## 33.2 Three ownership layers

GENERATED source is reproducible from platform definitions.
PLATFORM-CONTRACT source exposes controlled seams that apps cannot weaken.
APP-OWNED source is legitimately editable by the Project. Regeneration must
not overwrite app-owned work.

## 33.3 First-build conformance

The Product delivery exercises the applicable build/frontend/security contracts.
Scaffold or prototype existence is not implementation proof. Do not import
unrelated historical gates into the pilot.

## 33.4 The surfaces that exist

These are the routes, and there are no others.

```text
/                                        the person's Workspaces
/workspaces/new                          create a Workspace
/workspaces/$workspaceId/projects        the Workspace's Projects
/workspaces/$workspaceId/projects/new    create a Project
/workspaces/$workspaceId/members         the roster: members and pending invitations
/projects/$projectId                     Project detail
/projects/$projectId/build               the Build surface
/settings                                model connections
/setup                                   first-run Account provisioning
```

Model connections live in Settings and in the Build surface, reached through the
same flow from either. There is no Agents, Brain, Data, Capabilities,
Integrations, Versions or Activity surface, and none is planned. Do not add
navigation for one because a shell looks empty without it.

## 33.6 Build surface

The operator approved `conexus_builder_interativo.html` on 2026-09-17 as the
functional reference and explicitly excluded colors and visual polish as current
acceptance gates. The app-first composition, the contextual right-hand chat and
read-only inspection remain. Specialized Agent Studio lenses are not reopened.

### 33.6.1 Approved artifact identity

- Original attachment: `conexus_builder_interativo.html`, 106309 bytes.
- SHA-256: `465ffcabf3974f2f227c825c5288916f9dfbad5d1c8b736c6aaca81f62d62665`.
- Git blob: `731b36f6da30426b5e12cb9d439dd02192911851`.

Those bytes are in Git history. Its JavaScript, scripted events, fake models,
local state authority, and demo controls are not production implementation. The
functional contract below is what survives. Do not regenerate a similar mockup or
ask for another color review.

### 33.6.2 Functional contract

| Interaction | Required behavior / source of truth |
| --- | --- |
| Workspace | Dominant Preview and contextual Conexus chat. Resize, expand/collapse, and narrow-screen switching remain usable; neither panel loses state when hidden. |
| Composer | Multiline input, Enter to send, Shift+Enter for newline, IME-safe behavior, clear sending/stopping feedback, keyboard/focus operation. |
| Connection | Connect from chat or Settings through the same flow. Provider sign-in and pasted temporary code; safe status, explicit disconnect/reconnect. No tokens in browser storage. |
| Model | Search choices supplied by the authorized Hub. Show the choice for the next request and the model actually admitted for each existing run. A choice change never changes an active run. |
| Tool restriction | Friendly Edit and Read-only labels map to the BUILD and PLAN tool sets. They are a tool restriction on the run, not an approval workflow. |
| Conversation | Persistent native Thread messages with ordered safe parts and streaming native activity. Scroll follows only when the user remains at the tail. |
| Progress | Preparation, agent work, compilation and Preview opening reflect actual facts. Missing facts are not fabricated percentages or timers. |
| Preview | The actual authorized application remains usable while new work runs. Old launch responses cannot replace newer identity. A grant or iframe load is not proof of a working app. |
| Second request | Uses current source and the same Project conversation. Changing model does not reset the code or Thread. |
| Failure and correction | Failed admitted source stays current; last-good Preview remains. Safe diagnostic is available to the user and the next explicit correction. No automatic repair loop. |
| Stop | User requests actual run cancellation; UI waits for confirmed outcome. Detaching observation or closing chat is not cancellation. |
| Code and Changes | Authorized, read-only content. Diff uses a run's base/result, not working source versus equal last-good. No second editor authority. |
| Run history/details | Actual runs and measured/redacted native traces. Show missing metrics as unavailable. Never fake token counts or internal reasoning time. |
| Reload | Reconcile server conversation, run, source and Preview. Local preferences remain preferences, not authoritative execution state. |

The quotation application is an example for proof with fictitious data. Builder
source continuity does not imply transparent migration of every generated app's
in-memory form state across incompatible versions. Do not add a generic app-state
bridge because the simulation transfers a fixture between frames.

### 33.6.3 Excluded simulation and styling features

Do not ship scenario selectors, Simulate run, playback speed, pause presentation,
seeded assistant replies, demonstration login codes, or fake trace bars.
The Product Stop button cancels real work; it is not demo playback pause.
Prototype model labels are examples, not an entitlement catalogue.

Color palette, font choice, dark/light theme parity, spacing polish and animations
are non-blocking. Maintain basic legibility and accessibility. Do not defer the
functional chat/Preview composition under the label of visual polish.

## 33.7 Honest client projection

Frontend/cache is projection only. Preserve loading, empty, failed, partial,
source/freshness, and release/serving distinctions. Client retry and preference
state never create server authority. Use safe Markdown without executable raw
HTML. Tool presentation does not imply raw arguments/output are public.

The Preview states only what the browser can observe. A grant resolved, and then a
frame that navigated. It never states that the application loaded: the frame is
cross-origin and its load event fires for a refusal as readily as for a working page.
Whether the application actually boots is answered before the artifact is retained, not
by the client.

A run whose build or boot failed keeps its source and says so, and the last good Preview
stays on screen beside it.

### 33.7.1 Several conversations, not yet built

C-021 approved that a Project offers several persistent conversations under a `SHARED`
or `PER_USER` policy, with one principal agent and no specialist chooser. The Build
surface today is one conversation subordinate to a run. Do not design a replacement UI
ahead of [the Sessions and Work qualification](../tasks/sessions-work-qualification.md),
and do not surface a privacy control before the policy and its default are approved.

## 33.8 Contextual inspectability

Current run details are a bounded, authorized projection of Product and native
Mastra facts. The pilot does not expose a complete Studio, raw trace API, or
agent-execution bypass. Technical IDs stay behind useful labels unless an
explicitly authorized diagnostic requires them.

What a person may inspect is the Project source at an exact revision, the run
list, and a run's safe native trace. Nothing else is inspectable because nothing
else exists.
