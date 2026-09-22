# Q1 runner arena — spike report

Throwaway spike. The code under `spike/q1-runner/` is a decision instrument, not shippable
runtime. It settles how the Q1 "application runner process outside the Hub" should be shaped, given
two facts the Q1 wording ignores: Hub secrets are files readable by the operator's OS user, and
several Projects sharing one Node process share memory and credentials.

## What was run

One shared adversarial suite (`run-suite.mjs <arm>`) against one shared Postgres substrate
(`provision.mjs`), through two process-isolation arms. Every case prints
`{case, expected, observed, pass}`; full JSON in `.out/arm-a.json` and `.out/arm-b.json`.

Substrate: a disposable `postgres:17` container `conexus-q1-arena` on port 55432, with a host-visible
unix socket. One application database `conexus_apps`, a stand-in `hub` database holding a secret
table, and per Project a `p_<id>_preview` schema. Per Project two roles: a runtime login role with
DML only on its own schema, and a migration login role. `REVOKE ALL ON SCHEMA public`,
`REVOKE CONNECT` on `hub` for both Project roles. The pilot cluster on 5433, the Hub, `~/wt-u2` and
Keycloak were never touched. No secret value was ever printed, logged or committed; the secret probe
reports readability and byte length only, and inside both sandboxes the secret paths resolve to
`ENOENT`.

## What needed root

Nothing. `sudo -n true` reported that sudo needs a password, so per the handoff STOP condition I did
not seek it. The handoff's Arm A sketch (dedicated OS user, nftables owner-match egress) needs root.
I replaced it with a rootless design that meets the same goals through unprivileged user namespaces,
and no adversarial case failed for lack of OS isolation. This is itself a finding: on this kernel a
credible per-Project boundary needs neither root, nor a dedicated OS uid, nor firewall rules.

## Arm A — supervisor forks a bubblewrap-sandboxed worker per invocation (rootless)

Each worker runs under `bwrap` with unprivileged user, pid, net, ipc and uts namespaces, an
allowlist root filesystem (the operator home is simply never bound in, so it is absent), a fresh
empty network namespace (no egress of any kind), the Project DB reached only over a bound-in unix
socket, a V8 heap cap, and an external wall-clock kill by the supervisor.

| case | expected | observed | pass |
|---|---|---|---|
| A_insert_legit | ok | ok (row id returned) | yes |
| B_list_legit | ok | ok | yes |
| A_list_legit | ok | ok | yes |
| cross_project_sql | refuse | select on B schema `42501`; `set role` `42501`; no rows read | yes |
| hub_db_read | refuse | dblink `42883` (absent); fresh connect to `hub` denied | yes |
| read_secrets | refuse | all three paths `ENOENT` (home not in sandbox) | yes |
| read_env | refuse | no privileged credential in env | yes |
| read_proc | refuse | 2 pids visible (own tree only); no foreign secret | yes |
| walk_fs | refuse | operator home absent; `/root` absent | yes |
| network_egress | refuse | example.com `EAI_AGAIN`; 127.0.0.1:3443 refused; docker.sock absent | yes |
| import_escape | refuse | spawn works but child sees no secret; module load outside root fails | yes |
| time_bound | terminate | killed by supervisor | yes |
| mem_bound | terminate | V8 heap OOM abort | yes |
| resp_size | refuse | platform rejects at 1 MiB response cap | yes |
| crash_worker | terminate | worker SIGKILL | yes |
| serves_after_crash | ok | next request served (supervisor survived) | yes |

Migration-role attacks (arm-invariant, pure Postgres privilege) are listed under Migrations below.

Measurements: supervisor cold start ~0 (the supervisor is the launching process, no long-lived
daemon). First-handler latency ~60 ms (Project A) and ~157 ms (Project B, first fork). Legitimate
list handler over 200 sequential calls p50 49 ms, p95 60 ms. Postgres connections: one per in-flight
invocation, released on worker exit, no pooling; 3 held during a 5-way concurrent burst.

Verdict: **ACCEPT_WITH_BOUNDARY**. Every falsifier is blocked. Two boundary conditions must become
durable. First, Arm A depends on unprivileged user namespaces being enabled
(`kernel.unprivileged_userns_clone` unset/enabled and `user.max_user_namespaces > 0` on this host);
a hardened kernel that disables them removes this arm's isolation, so the platform must assert this
at startup. Second, the DB credential is passed to the worker via `bwrap --setenv`, which places it
in the bwrap process argv and is therefore readable via `/proc/<pid>/cmdline` on the host by the
operator's own user. It never leaks across Projects (each worker gets only its own credential and the
sandbox hides other processes), but the durable runner must pass the credential over a pipe or a
bound file, not argv.

## Arm B — one long-lived container per Project, worker per invocation inside it

One container per Project from `node:24`, non-root user (65534), read-only root filesystem, tmpfs
`/tmp`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--memory 256m`, `--pids-limit 128`, no
host home mounted, handler bundles mounted read-only, on an `--internal` Docker network where only
the scratch Postgres is reachable. Runs on native docker-ce via the `docker` group, no root. The
supervisor forks a worker per invocation with `docker exec`.

The suite table is identical to Arm A: 24/24 pass, every falsifier blocked. Differences worth noting
in the observed detail: the child from `import_escape` runs as uid 65534 and sees no secret;
`walk_fs` sees only the container's own `/etc`, never the operator home; egress to example.com fails
because the network is internal.

Measurements: first-container start ~61 s once (a cold Docker daemon / first container on a fresh
internal network; the second container started in 182 ms, so this is warmup, not per-arm cost).
First-handler latency ~100 ms. Legitimate list handler over 200 sequential calls p50 91 ms, p95
110 ms, roughly double Arm A because each call pays `docker exec` process overhead. Connection model
identical to Arm A (the burst sampler read 0, an artifact of host sampling being faster than
`docker exec` startup, not a different model).

Verdict: **ACCEPT**. Every falsifier is blocked with widely understood container primitives and no
root beyond `docker` group membership. The cost is roughly 2x per-call latency versus Arm A and a
container image dependency.

## Arm C — one E2B sandbox per Project (paper only, not built)

E2B sandboxes execute in E2B's cloud. The pilot Postgres is a process on this laptop with no public
address. So an E2B-hosted handler cannot reach the Project DB unless the platform exposes Postgres to
the public internet (rejected: it would widen the very egress boundary Q1 protects) or runs a
per-installation outbound tunnel/relay from the laptop to E2B and back to Postgres. That relay
becomes a new trusted network component holding every Project's DB credential, and it reintroduces
the shared-secret-store problem this spike exists to remove. Arm C also adds per-invocation cloud
round-trip latency and a hard dependency on an external vendor for a boundary that Arm A and Arm B
enforce locally. Not recommended for Q1; revisit only if Conexus itself moves to hosted execution.

## Migrations (untested by the Q1 task; run under the migration role)

Builder-generated migrations run with schema-owner authority, which Q1 never probes. Results
(identical in both arms; this is pure Postgres privilege):

| attack | observed | pass | note |
|---|---|---|---|
| CREATE EXTENSION dblink | `42501` refused | yes | |
| CREATE FUNCTION ... SECURITY DEFINER | allowed, contained | yes | definer is the unprivileged migrator, not a superuser; grants nothing |
| COPY ... TO PROGRAM | `42501` refused | yes | |
| ALTER ROLE ... SUPERUSER | `42501` refused | yes | |
| GRANT USAGE on own schema to Project B | allowed, contained | yes | B still cannot read A's rows (`42501`); USAGE without table grant is inert |
| CREATE SCHEMA authorization migrator | `42501` refused | yes | |
| CREATE EXTENSION postgres_fdw | `42501` refused | yes | |
| UPDATE pg_authid | `42501` refused | yes | |

The two "allowed, contained" results expose a real design constraint. A migration role that owns the
objects it creates can always grant them, and can create SECURITY DEFINER functions owned by itself.
Here that is harmless only because the migration role is itself unprivileged and schema-scoped, so
what it can grant or define never exceeds its own authority, and a cross-Project USAGE grant does not
carry table rows. The durable rule is that generated DDL must run under a role that is unprivileged
and confined to its own Project schema, and the platform, not generated code, must own any grant that
crosses Projects. If Q2 ever needs generated migrations to not retain grant authority over their own
objects, the platform must reassign object ownership away from the migration role after each
migration; a separate login role alone does not achieve that.

## Recommended Q1 task edits

### Section 5 "Fixed hypothesis" — replacement wording

Replace "one separate application-runtime process, not code execution inside the Hub" with:

> The application runner is a supervisor that executes each Project's generated handlers in a
> **per-Project, per-invocation isolated worker** outside the Hub, never one shared process across
> Projects. The isolation boundary must, without trusting the language runtime, deny the worker: the
> operator's filesystem (so no Hub/model/Connector secret file is readable), all network egress
> except the Project's own Postgres, visibility of other processes, and any credential other than its
> own Project DB role. Two mechanisms qualify on the pilot host and were proven equivalent on the
> security suite: (A) a rootless bubblewrap sandbox using unprivileged user/pid/net namespaces, and
> (B) a per-Project container with `--cap-drop ALL`, `--security-opt no-new-privileges`, read-only
> root filesystem, no host home mount, and an internal network reaching only Postgres. A single
> shared runner process with in-process handlers is rejected: it cannot deny one Project the memory
> and credentials of another. The Project DB credential must reach the worker over a pipe or bound
> file, never process argv or a shared environment.

### Q1.7 adversarial list — add these falsifiers

Add to the existing list, each of which must visibly refuse or terminate:

> - read the operator's secret files (report readability and byte length only, never contents);
> - read `process.env` and `/proc/<other pid>/environ` and `/proc/*/cmdline` for a credential;
> - reach the Docker socket `/var/run/docker.sock` or any non-Postgres network destination
>   (`https://example.com`, a loopback Hub port);
> - `import()` a module outside the admitted handler root;
> - spawn a child process that gains forbidden reach (the child, not merely the spawn, is the test);
> - exceed the memory bound (heap allocation) and the response-size bound, in addition to the time
>   bound;
> - crash the worker and confirm the supervisor survives and serves the next request.

### Migrations — new subsection to add under Q1.7

> Builder-generated migrations run under the Project migration role. Each of the following must be
> refused by Postgres privileges, not by lint or Builder instruction: `CREATE EXTENSION`,
> `COPY ... TO PROGRAM`, `ALTER ROLE`, catalog writes, `CREATE SCHEMA` outside the Project's own,
> `postgres_fdw`/`dblink`. The migration role must be unprivileged, confined to its own Project
> schema, unable to reach `hub` or another Project's schema, and unable to grant another Project role
> access to its data in a way that carries rows. Owner-scoped operations that expose nothing beyond
> the role's own authority (a SECURITY DEFINER function owned by the unprivileged migrator, an inert
> cross-schema USAGE grant) are acceptable only while the migration role stays unprivileged.

## Overall verdict

Q1's "one shared runner process outside the Hub" is **REJECT** as literally worded: a shared process
cannot separate Projects' memory or credentials. The corrected shape, a supervisor plus a
per-Project isolated worker, is **ACCEPT** in the container form (Arm B) and
**ACCEPT_WITH_BOUNDARY** in the rootless bubblewrap form (Arm A, given the two durable conditions
above). Recommendation: adopt the per-Project worker model, default to Arm B for portability, keep
Arm A as the rootless option where Docker is unavailable, and add the migration-authority rule.

## Reproduce

Start the substrate if `conexus-q1-arena` is absent, then run each arm:

```
cd ~/wt-s2-runner/spike/q1-runner
node run-suite.mjs arm-a
node run-suite.mjs arm-b
```

Teardown: `docker rm -f conexus-q1-arena q1b_a q1b_b; docker network rm conexus-q1-net`.
