# The integrated Factory run, recorded

One run of `bash code-sdk-turn.sh`'s sibling harness, `integrated-factory.mjs`, on
2026-09-20 against the disposable private repository
`developmentconexus-ops/conexus-factory-integration-probe`. Every line below comes from that
single run, with uuids shortened to their first segment and nothing else edited.

The composition under test is the real `MastraFactory` with the real `GithubIntegration`,
authenticated by the GitHub App the operator created. Model turns are answered by a loopback
stub, so the run costs nothing; that is the one thing in it that is not production-shaped,
and it is what makes the tool path observable without a provider.

The run ends with a negative control in a separate invocation
(`node integrated-factory.mjs --negative-control`), which asserts two things that are false
on purpose and exits non-zero.

```
PASS  [setup] the App private key parses as a PEM  (parsed)
PASS  [setup] the run has an App, an installation and one repository to act on  (app conexus-factory-integration-probe, repo developmentconexus-ops/conexus-factory-integration-probe)
[factory:timing] prepare.storage.init 19ms
[factory:timing] prepare.controllerMount 69ms
[factory:timing] finalize.controller 62ms
[factory:timing] finalize.reconcileBoundThreads 0ms
PASS  [stage A] the Factory booted with the real GitHub integration registered  (code, 87 routes)
PASS  [stage A] the installation GitHub issued is registered  (row e2557880)
PASS  [stage A] the repository is linked to that installation  (row a49824ba)
PASS  [stage A] GitHub issues an installation token for that repository  (clone url resolved, token withheld from this log)
PASS  [stage A] a Factory project exists  (project d15d34a6)
PASS  [stage A] the project is connected to the installation  (connection 15d4ebdc)
PASS  [stage A] the repository is linked to the project  (link f93e9ed9)
PASS  [stage A] the Factory creates a source-backed session for that repository  (session f8a08dec on factory-probe/910f4980)
PASS  [stage A] an interactive session opens on that source session  (opened)
PASS  [stage A] the session resolves a workspace over the real repository  (Workspace)
[factory:timing] repository clone attempt=1 exit=0 1283ms
[factory:timing] workspace.materialize 1311ms
[factory:timing] branch checkout remote attempt=1 exit=0 5ms
[factory:timing] branch checkout attempt=1 exit=0 682ms
[factory:timing] workspace.checkout 707ms
[factory:timing] workspace.onStart(created) 2411ms
PASS  [stage A] the repository is materialized in the sandbox at the revision it was cloned from  (908cfa907e1967318a5113b82874df0a7be09ade)
PASS  [stage A] the checkout points at the probe repository  (https://github.com/developmentconexus-ops/conexus-factory-integration-probe.git)
PASS  [stage B] the session runs on a local provider, so no paid call is possible  (model local-stub/stub-model-1)
PASS  [stage B] the turn ran through the Factory session without an error event
PASS  [stage B] the session edited the real checkout  ("export const counter = 0" -> "export const counter = 1")
PASS  [stage B] the Factory ran the tool under its own approval policy, which asks for nothing by default  (0 approval(s) requested; session.permissions is where a host changes that)
PASS  [stage B] git sees the change against the revision it started from  ("M app/counter.js")
PASS  [stage B] a second conversation opens in the same Factory session  (thread 345a76b5)
PASS  [stage B] the second conversation starts with none of the first one's messages  (0 messages)
PASS  [stage B] both conversations are listed for the Factory session  (2 threads)
PASS  [stage C] a source session exists for the Work branch  (session 5e7d5ffa on factory-work/453af237)
PASS  [stage C] the Factory coordinator starts Work on the same project  (work item ba9ac295, binding b7e50eed, kickoff sent)
PASS  [stage C] the work item carries the session the coordinator bound to it  (["execute"])
PASS  [stage C] the Factory engine moved the item through its own lifecycle  (intake:accepted, triage:accepted, planning:accepted, execute:accepted, review:accepted; stage review)
PASS  [stage C] the branch is pushed to the real repository with the installation token  (pushed)
PASS  [stage C] the Factory opens a pull request for the candidate  (pull request #4)
PASS  [stage C] the Factory records a review on that pull request  (review 5262427031)
PASS  [stage D] nothing merged and nothing deployed by itself  (the pull request is left open for the operator)
# scratch at /tmp/integrated-factory-KgFIbZ
```

## What each stage established

**Stage A, the Factory over a real repository.** The App minted an installation token, the
Factory registered the installation and the repository, created its project, connection and
repository link, created a source-backed session, and materialized the repository in a local
sandbox: `repository clone attempt=1 exit=0 1283ms`, then a branch checkout. The checkout
sits at `908cfa907e1967318a5113b82874df0a7be09ade`, which is the repository's initial commit,
and its origin is the probe repository.

**Stage B, interactive coding.** A turn through the Factory's own session changed
`app/counter.js` from `counter = 0` to `counter = 1` in that checkout, and git reports
`M app/counter.js`. A second conversation opened in the same session and started empty, and
both are listed. The Factory ran the tool without stopping for approval, which is its
default; `session.permissions` is where a host changes that, and this run did not.

**Stage C, Work.** `FactoryStartCoordinator` started a work item bound to its own source
session, and the kickoff was sent. The engine then moved the item through `intake`, `triage`,
`planning`, `execute` and `review`, accepting each move on its own board policy. The branch
was pushed to GitHub with the installation token, a pull request was opened through the
`VersionControl` capability, and a review was recorded on it.

**Stage D, nothing published.** The pull request is left open. Nothing merged, nothing
deployed, and the repository has no workflow that could deploy.

## What this run is not

The model is a stub, so nothing here says how a real model behaves, how good its edit would
be, or whether an agent would drive the same lifecycle unattended. The lifecycle moves were
requested by the harness and judged by the Factory; a fully autonomous run would have the
dispatcher request them from a bound agent instead. The approval policy was left at its
default rather than exercised.
