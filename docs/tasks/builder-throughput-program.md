# Builder throughput program

A BUILD run takes 153 seconds on the pilot. The agent thinks for 12 of them. This plan removes the
other 141 without moving the pilot off Leandro's machine and without paying for anything.

## What the measurements say

`~/conexus-boundary-census.sh` measures one out-of-process boundary on the host, with no Conexus
code in the way. On the pilot, an empty `hello-world` container with no mounts and no work costs a
median of 12 seconds and up to 37. The hardened git image costs a median of 12 to 19 seconds. A
healthy Linux host does this in under half a second.

The cost is not in the container's work and not in our code. Splitting `docker run` shows `create`,
`start` and even `rm` each taking seconds. Meanwhile `docker version` answers in 16 ms, a warm
`docker ps` in 22 ms, and a systemd scope is created in 8 ms. `vmstat` during a slow start shows one
to three processes blocked with the CPU 75 to 90 percent idle, and sequential disk throughput is
1 to 3 GB/s. The host blocks on small random I/O against the WSL disk image while the processor
waits.

A BuilderRun crosses six of these boundaries: four OCI git containers and two E2B sandbox creates.
Four hardened container starts alone account for roughly half the run.

## Phase 0. The host, no code

Two changes, both free, both outside the repository.

The WSL virtual machine was capped at 4 processors and 8 GiB by `%USERPROFILE%\.wslconfig` while the
laptop has 16 logical processors and 23.7 GiB. Raised to 10 and 14 GiB. The previous file is kept at
`.wslconfig.before-census.bak`. This alone moved the hardened container median from 18.8 s to 12.5 s.

Windows real-time protection is on, and its exclusions cannot be read without an administrator
prompt. The blocked-on-I/O signature is the known interaction between Defender and the WSL disk
image. Leandro adds the exclusions himself, since changing security settings is his call: the WSL
`ext4.vhdx` under `%LOCALAPPDATA%\Packages\`, plus the `vmmem`, `vmmemWSL` and `wslservice.exe`
processes. Re-run the census afterwards. If container starts drop under a second, the rest of this
plan gets much smaller, and the phases below stay worth doing anyway because they remove work rather
than making it cheaper.

## Phase 1. One sandbox per run

Today the agent's sandbox finishes holding the working tree with the change already applied. It is
destroyed. The diff is pushed through a git container into the canonical repository, read back out
through two more git containers, and the same bytes are uploaded into a second sandbox to run vite.
The content makes a full round trip to arrive where it already was.

The agent's sandbox compiles what it just wrote, before it is destroyed. This removes one sandbox
lifecycle, two container starts and two large transfers, and it makes a compile failure honest
because the artifact comes from exactly the tree the agent produced.

What has to be resolved, in order:

1. The compiler template (`TEMPLATE_REF` in `application-artifact-runtime.ts`, a hardcoded ref) has a
   pre-baked `node_modules`. The agent template (`scripts/builder-e2b-template.mjs`) has only git and
   node. One template has to carry both. Extend the recipe, rebuild it with that script, and pin the
   new ref the way the current one is pinned.
2. The Preview must still correspond to the revision the custody boundary admitted, not to whatever
   the sandbox happened to contain. Assert `git status --porcelain` is empty after the agent's
   commit, so the compiled tree and the admitted commit are the same bytes by construction.
3. `prepareBuilderRunApplicationArtifact` stops reading source and starts receiving a compiled
   application. Its input rules (the `app/` prefix, 256 paths, 12 MiB) move to the point where the
   sandbox collects the tree, and keep the same refusal codes.
4. The compiler stops talking to the raw E2B SDK. It becomes another command on the `MastraSandbox`
   the agent already has, which is the standing rule about not hand-writing what Mastra provides.

The risk worth naming out loud. The agent's sandbox will have the pre-baked `node_modules` within
reach. The agent can already write every source file, and the compiled result is served to the
person who asked for it, so no new trust boundary is crossed. What changes is that a poisoned
`node_modules` would survive into the artifact, which the separate template made impossible. The
sandbox is created fresh per run, never reused, and has no network, so the poisoning would have to
come from the run's own agent, and that agent already controls the source.

## Phase 2. Start independent work together

`source.prepareProjectSource` and `Sandbox.create` do not depend on each other, and today the second
waits for the first. Start both and await both. The run saves whichever is shorter.

`setPhase('PREPARING')` is written twice per run, once in `service.ts` and again at the top of
`runtime.ts`. Delete the second.

## Phase 3. One git container per run, only if Phase 0 did not settle it

After Phase 1 a run starts two git containers, one to export the source bundle before the agent and
one to admit the result after it. They cannot merge without keeping a container alive across the
agent turn, which means mounting the repository read-write for minutes instead of read-only for
seconds. That trades a real isolation property for a number that Phase 0 may have already given
back. Measure after Phase 0 and Phase 1 before deciding, and do not start it as a foregone
conclusion.

## What this plan refuses

A long-lived git daemon or an in-process git would erase the container boundary entirely. That
boundary is what keeps a crafted result bundle from reaching git's parser with the repository
writable and the network open. The boundary is worth its cost once the host stops charging twenty
seconds for it.

## Expected result

Boundaries per run fall from six to three. With Phase 0 working, a run is roughly the agent's own
12 seconds, one sandbox create, a vite build of about 5 seconds, and two cheap container starts.

## How to check

Re-run `~/conexus-boundary-census.sh` after every host change, and `~/conexus-phase-timing.mjs
<projectId> <modelChoiceId> "<request>"` after every phase, which prints the wall clock of each
phase of one real run on the pilot.
