# Recorded output

One run of `bash capture.sh` on 2026-09-20, against trunk `0b7bca05` and Node v24.20.0.
Every line below comes from that single run.

Sanitization, in full: uuids and scratch directory names are shortened to their first
segment so the lines fit. Nothing else is edited, and no result is removed. Those ids
differ on every execution, so a reproduction shows different ones and the same verdicts.

Every probe exits non-zero when an assertion fails, and the run ends with a negative
control whose claim is false on purpose. A run where the negative control passes is a
failed run, because it would mean the harness cannot fail.

```
===== conversations probe, two processes, from this checkout =====
# node:        v24.20.0
# modules:     /home/leandrotheodoro/wt-stream/node_modules
# @mastra/core: 1.67.0
# @mastra/memory: 1.30.0
# @mastra/libsql: 1.23.0
# store:       /tmp/conexus-qual-OeypOuLe
PASS  [write phase] two distinct conversations were created  (0a390799 vs bb84ad06)
PASS  [write phase] three messages were accepted by the store  (3 saved)
PASS  [concurrent execution] eight concurrent creations produce eight distinct ids  (8 distinct)
# writer process exited 0, pid gone
PASS  [id persistence] both conversation ids written by a previous process are listed by a new one  (11 listed)
PASS  [metadata persistence] the title written by the previous process survives  (Conversa um)
PASS  [metadata persistence] a per-thread setting written by the previous process is read back  (probe-model-one)
PASS  [thread binding] switch binds the session to the named thread  (0a390799)
PASS  [thread binding] switching again rebinds to the other thread  (bb84ad06)
PASS  [message persistence] both messages of the first conversation are recovered after process restart  (pergunta da conversa um | resposta da conversa um)
PASS  [message isolation] the second conversation carries only its own message  (pergunta da conversa dois)
PASS  [concurrent execution] all eight concurrently created threads are present after restart  (8 of 8)
PASS  [isolation between Projects] a session on another Project does not list this Project's conversations  (2 listed for beta)
PASS  [isolation between Projects] reading another Project's conversation by id is refused  (Thread not found: 0a390799)
PASS  [isolation between Projects] binding another Project's conversation by id is refused  (Thread not found: 0a390799)
PASS  [privacy within a Project] a second session on the same Project does see the first person's conversations  (11 listed, so per-person privacy is not provided by resourceId scoping)
PASS  [controller recreation] a second controller in the same process reads the same conversations  (11 listed)
FAIL  [negative control] a thread that was just created is absent from the listing  (this claim is false on purpose)
# negative control failed as required, so a false claim does exit non-zero

===== factory resolution against the versions the product already has =====
# scratch:     /tmp/factory-compat-RVvMDWoc
# installing  @mastra/factory@0.15.0 with @mastra/core@1.67.0 and @mastra/libsql@1.23.0
# @mastra/core copies in the tree: 1
# resolved     @mastra/factory 0.15.0
# resolved     @mastra/core 1.67.0
# resolved     @mastra/libsql 1.23.0

===== factory boot through prepare, finalize and shutdown =====
[factory:timing] prepare.storage.init 19ms
[factory:timing] prepare.controllerMount 65ms
[factory:timing] finalize.controller 64ms
[factory:timing] finalize.reconcileBoundThreads 0ms
PASS  [lifecycle] prepare() returns constructor arguments for a Mastra instance  (keys: agentControllers, server, storage, workers)
PASS  [composition] the Factory mounts its own agent controller  (controllers: code)
PASS  [composition] the Factory brings its own HTTP surface  (79 api routes)
PASS  [lifecycle] finalize() completes after the Mastra instance is constructed, which is what starts the workers  (completed)
PASS  [composition] the mounted controller is reachable from the constructed Mastra instance  (code)
PASS  [lifecycle] shutdown() stops the Factory-owned background dispatch  (completed)

===== factory work engine =====
PASS  [work item] a work item is created outside the Factory server, against a scratch LibSQL file  (0f73449e rev 1 stage intake)
PASS  [identity] the creating actor is recorded on the row  (user-operator)
PASS  [evaluation] the Factory accepts a legal move and reports the stage and revision it committed  (status accepted stage triage revision 2)
PASS  [evaluation] the accepted move advanced the row exactly one revision and changed its stage  (rev 1 -> 2, stage intake -> triage)
PASS  [evaluation] the accepted move carried the Factory's own decisions rather than the caller's  ([{"type":"sendMessage","idempotencyKey":"factory-stage:a10f36c4","role":"triage","message":"This work was moved from the intake stag)
PASS  [identity] the stage history names who left intake and who entered triage  ([{"stage":"intake","enteredAt":"2026-09-21T00:22:33.732Z","by":"user-operator","exitedAt":"2026-09-21T00:22:33.737Z","exitedBy":"user-operator"},{"stage":"triage","enteredAt":"2026-09-21T00:22:33.737Z","by":"user-operator"}])
PASS  [evaluation] the Factory rejects a stage its board does not define, with a code and a reason  (status rejected code invalid_transition reason The Work board does not allow moving from triage to nao-existe-nesta-board.)
PASS  [evaluation] the rejected move left the revision and the stage exactly as they were  (rev 2 -> 2, stage triage -> triage)
PASS  [evaluation] the Factory refuses to move an item under a board it does not belong to  (status rejected reason The work item belongs to board "work", not "review".)
PASS  [concurrency control] a move against a stale revision is rejected rather than applied  (status rejected code stale reason The work item changed before this transition committed.)
PASS  [concurrency control] the stale move changed nothing  (rev 2 -> 2)
PASS  [idempotency] a second request under an ingress identity already seen replays the first answer  (first planning/68e6029c, replay planning/68e6029c)
PASS  [idempotency] the replayed request did not move the item a second time  (stage planning rev 3)
PASS  [isolation between tenants] reading the same work item id under another orgId returns nothing  (null)
PASS  [privacy within a project] listing work items takes no user, so every member of a project sees them all  (WorkItemsStorage.list({orgId, factoryProjectId}) has no userId parameter)

===== factory conversations and the step that starts Work =====
[factory:timing] prepare.storage.init 21ms
[factory:timing] prepare.controllerMount 65ms
[factory:timing] finalize.controller 71ms
[factory:timing] finalize.reconcileBoundThreads 0ms
PASS  [project] a Factory project is created with no repository attached  (56933918 keys 11)
PASS  [conversations under the Factory] the Factory's own controller opens two conversations for a project with no repository and no sandbox  (86d59501 and e57d054f)
PASS  [conversations under the Factory] such a session has no workspace and does not fail for the lack of one  (completed: undefined)
PASS  [conversations under the Factory] the host chose the resourceId, so its own Project identity is what the session is keyed on  (resourceId conexus-project:56933918)
PASS  [starting Work] starting Work without a source-control handle is refused by the Factory itself  (Factory source control storage is unavailable)

===== interactive coding over a source the host owns =====
PASS  [conversation] a conversation is created for the Project resource the host chose  (c3a353f0 on conexus-project:alpha)
PASS  [authorization] the tool call stopped for approval before it touched the source  (1 approval(s) requested)
PASS  [code tools] the session ran its own workspace tool and the file on disk changed  ("export const counter = 0\n" -> "export const counter = 1\n")
PASS  [code tools] the run reached the tool and then ended  (agent_start,display_state_changed,message_start,message_end,tool_input_start,tool_input_delta,tool_input_end,tool_start,message_update,tool_approval_required,tool_end,usage_update,agent_end)
PASS  [source identity] the change is visible to the Project's own git custody as an uncommitted change  (base d74e9fd5, status "M app/counter.js")
PASS  [conversation] the turn is recorded in the conversation that ran it  (3 messages)
PASS  [context separation] a second conversation in the same Project starts with none of the first one's messages  (0 messages)
PASS  [conversation] switching back to the first conversation finds its messages again  (3 messages)

===== the code-sdk mount the Factory itself uses, with a host workspace =====
PASS  [mount] the code-sdk controller mount accepts a host-supplied workspace and storage  (controllers: conexus-code)
PASS  [conversation] a conversation is created on the mounted controller for the host's own Project resource  (a91f12e6 on conexus-project:alpha)
PASS  [workspace] the session resolves the workspace the host supplied, with no forge and no source-control row  (Workspace)
PASS  [limit of this probe] driving a turn through the mount needs a model its own resolver accepts  (refused: No model selected. Use /models to select a model first.)

===== the whole Factory with its real GitHub integration, up to the gate =====
[factory:timing] prepare.storage.init 21ms
[factory:timing] prepare.storage.init 18ms
[factory:timing] prepare.controllerMount 78ms
GitHub reconcile worker started { pullRequestIntervalMs: 3600000, issueIntervalMs: 3600000 }
[factory:timing] finalize.controller 78ms
[factory:timing] finalize.reconcileBoundThreads 0ms
PASS  [credentials] the published integration refuses partial GitHub App credentials  (GithubIntegration: missing required config field(s): privateKey, clientId, clientSecret. Provide the full GitHub App credentials (appId, privateKey, clientId, clientSecret, slug) or omit the integration to disable GitHub-backed repositories.)
PASS  [composition] the real integration class constructs with a complete credential set  (id github)
PASS  [composition] registering the GitHub integration without a stable state secret is refused  (MastraFactory: integration 'github' signs OAuth state and requires a replica-stable state secret, but none is configured. Set 'stateSecret' on the factory config.)
PASS  [composition] the whole Factory boots with the real GitHub integration registered  (code, 87 routes)
PASS  [local lookup] the run path asks its own storage for the repository, and finds none registered  (Version-control repository not found.)

===== the GitHub gate, negative control =====
FAIL  [negative control] the storage lookup found a repository nobody registered  (this claim is false on purpose)
negative control failed as required

===== a full turn through the code-sdk mount, against a local stub provider =====
# local stub on 127.0.0.1:34345, project at /tmp/code-sdk-turn-MzpV3sAW/project
APPROVALS: 1
FINAL_CONTENT: "export const counter = 1\n"
ASSERT_FALSE_MODE: false
PASS
--- the stub's own request log ---
STUB_LISTENING port=34345
[stub] call #1 model=stub-model-1 messages=6
[stub] call #2 model=stub-model-1 messages=7

===== the code-sdk turn, negative control =====
FAIL
negative control failed as required

===== interactive coding, negative control =====
FAIL  [negative control] the file on disk was left unchanged  (this claim is false on purpose)
negative control failed as required

===== factory work engine, negative control =====
FAIL  [negative control] the rejected move was reported as accepted  (this claim is false on purpose)
negative control failed as required

===== verdict =====
every probe passed and every negative control failed
scratch install kept at /tmp/factory-compat-RVvMDWoc
```

## What the last three sections add

The interactive coding section is the path that had never been run. It uses the
deterministic fixture in `fixture-model.mjs`, so it proves the wiring from a message to a
tool call to a file on disk, and proves nothing about a real model's behaviour. Its tool
approval is granted unconditionally, where a product would have a person or a policy decide.

The `code-sdk` mount section runs the composition the Factory itself mounts, with a
workspace the host supplies, and stops at model selection, which is where that mount stops
without a provider.

The full-turn section closes that gap without spending anything. A local HTTP server speaks
just enough of the OpenAI Chat Completions streaming API to answer two calls, the mount
resolves it as a custom provider, and the turn runs to the file changing on disk. The
stub's own log is printed, so the two model calls are visible rather than asserted.

## Three things this transcript corrects

The first version of the Work probe called `storage.commitTransition()` and handed it an
`evaluation` of `accepted` that the probe itself wrote. That demonstrated nothing about the
Factory's judgement. The probe now drives `FactoryTransitionService`, which reads the
installed board and produces the verdict, and the rejections above are the Factory's own
words.

The first version also reused one `ingress.identity` across several requests and read the
replies as if they were separate decisions. They were not. The engine keys idempotency on
the ingress identity per organization and project, so the second and third requests were
answered with the first request's result. That is why the probe now varies the identity,
and why one assertion deliberately reuses it to show the replay.

The boot probe stopped at `prepare()` while the report said the Factory "boots". It now
runs `prepare()`, constructs the Mastra instance, calls `finalize()`, which is what starts
the workers, and calls `shutdown()`, after which the process exits on its own.
