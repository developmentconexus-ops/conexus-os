# Recorded output

Captured on 2026-09-20 against trunk `0b7bca05`, Node v24.20.0. Ids are random per run.
Nothing here was edited except the removal of the scratch directory names, which change
on every run and carry no meaning.

## Conversations, two separate processes

`run.sh` starts a writer process, waits for it to exit, and then starts a reader process
that never saw the writer. Every line below was printed by the reader.

```
# node:  v24.20.0
# writer process exited, pid gone
PASS  [id persistence] both conversation ids written by a previous process are listed by a new one  (11 listed)
PASS  [metadata persistence] the title written by the previous process survives  (Conversa um)
PASS  [metadata persistence] a per-thread setting written by the previous process is read back  (probe-model-one)
PASS  [thread binding] switch binds the session to the named thread  (909df9f7-...)
PASS  [thread binding] switching again rebinds to the other thread  (cc213c2d-...)
PASS  [message persistence] both messages of the first conversation are recovered after process restart  (pergunta da conversa um | resposta da conversa um)
PASS  [message isolation] the second conversation carries only its own message  (pergunta da conversa dois)
PASS  [concurrent execution] all eight concurrently created threads are present after restart  (8 of 8)
PASS  [privacy] a session on another Project does not list this Project's conversations  (2 listed for beta)
PASS  [authorization] reading another Project's conversation by id from a foreign session  (refused: Thread not found: 909df9f7-...)
PASS  [authorization] binding a foreign Project's conversation from a session of another Project  (refused: Thread not found: 909df9f7-...)
PASS  [controller recreation] a second controller in the same process reads the same conversations  (11 listed)
```

The eleven threads are the two named conversations, the eight created concurrently, and one
the session opened for itself when it was created.

## Factory resolution against the versions the product already has

```
# installing @mastra/factory@0.15.0 with the Conexus core/libsql versions
# npm exit: 0
# duplicate @mastra/core copies in the tree: 1
1.67.0
@mastra/factory 0.15.0
@mastra/core 1.67.0
@mastra/libsql 1.23.0
```

One copy of `@mastra/core`, at the version the product already runs.

## Factory boot, self-hosted, no platform account

```
[factory:timing] prepare.storage.init 23ms
[factory:timing] prepare.controllerMount 90ms
constructed MastraFactory with auth disabled and a LibSQL factory storage
board ids shipped: work, review
prepare() returned Mastra args with keys: agentControllers, server, storage, workers
agentControllers: code
agents: none
apiRoutes declared: 79
```

## Factory Work domain, used on its own

```
PASS  [work item] a work item is created outside the Factory server, against a plain LibSQL file  (a561a18d-... rev 1)
PASS  [identity] the creating actor is recorded on the row  (user-operator)
PASS  [review transition] a transition to another stage commits and is accepted
PASS  [stage history] the stage history records who moved the item
PASS  [concurrency control] committing again against the stale revision does not silently repeat the move
PASS  [concurrency control] the item did not end up with a duplicated stage entry  (1 execute entries)
PASS  [tenancy] reading the same work item id under another orgId returns nothing  (null)
```

The stage history it produced:

```json
[{"stage":"intake","enteredAt":"2026-09-20T21:36:21.351Z","by":"user-operator",
  "exitedAt":"2026-09-20T21:36:21.353Z","exitedBy":"agent:probe-binding"},
 {"stage":"execute","enteredAt":"2026-09-20T21:36:21.353Z","by":"agent:probe-binding"}]
```
