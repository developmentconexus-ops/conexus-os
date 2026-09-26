# Review: Connectors

## Scope

Code that reaches a system Conexus does not own or holds its credential: the application data plane
and its PostgreSQL relay, the GitHub App installation, model accounts, Google AI Pro, E2B, and the
Applications PostgreSQL cluster. [`areas.json`](areas.json) owns the paths.

## What to check

- [ ] A credential the Hub holds for an external system never reaches the sandbox, the browser, a
      log or the pull request. Owner: [Credentials](../../reference/security-and-authority.md#5-credentials).
- [ ] Secrets at rest use the Factory's `secret-encryption`. A secret file is read through
      `apps/hub/src/platform/secrets.ts`, which refuses a file other users can read.
- [ ] Model accounts stay whole in the Factory, per C-025 in the
      [decision register](../../decisions/index.md). Conexus adds no grant list and no parallel
      resolver.
- [ ] When the Hub passes on an upstream catalog (models, repositories, installations), it keeps
      its own authorization filter on top.
- [ ] A Project database role cannot lift its own bounds. Its isolation rests on a credential or
      privilege it cannot mint or change from its own session. Owner:
      [Database topology](../../reference/stage2-managed-application-platform.md#database-topology).
- [ ] A privilege granted to a `NOINHERIT` role says `WITH INHERIT TRUE` or is used through
      `SET ROLE`. A bare grant gives membership, not the privilege.
- [ ] A change to egress or to what the sandbox can reach states its effect under
      [Egress](../../reference/security-and-authority.md#3-egress).
- [ ] A security or authentication change carries `needs:aprovo`.

## Proof required

- A claim about GitHub, a model provider, Google AI Pro, E2B or Sankhya has evidence from that
  provider. A mock proves only the mocked boundary. Owner:
  [Proof and verification](../delivery.md#proof-and-verification).
- A live provider run needs explicit authority for that proof. A green repository gate never
  implies it.
- A data plane change shows the refusal on the direct path (a Project role logging in without the
  relay, a session raising its own limit), not only success on the intended path.
- The `application-data-postgres`, `application-runner-sandbox` and `model-accounts-postgres`
  leaves the change touches ran at the head SHA with zero skipped cases.

## Traps from history

- Project database roles authenticated with a password, so a Project role could set its own
  password and connect around the relay. Fixed in review rounds of #196 (`b90c54f7`): roles take
  `PASSWORD NULL VALID UNTIL '-infinity'` and log in only with the runner's client certificate. Now
  at `apps/hub/src/app-runner/data-plane.ts:53` and `scripts/confine-application-cluster.mjs`.
- `pg_use_reserved_connections` was granted to the `NOINHERIT` provisioner without
  `WITH INHERIT TRUE`, so it held membership but not the privilege. Fixed in #196 (`b90c54f7`). Now
  at `scripts/provision-application-database.mjs:90`.
- A Project session could raise its own temporary-file limit and fill the shared disk. Fixed in
  #196 (`b90c54f7`), which sets `temp_file_limit` per role and grants `SET` on it only to the
  provisioner. Now at `apps/hub/src/app-runner/data-plane.ts:79-87` and
  `scripts/provision-application-database.mjs:86-87`.
- Proxying the Factory's model list straight through removed the Hub's credential gate, so every
  caller saw Google AI Pro models they could not run. Fixed by the second commit of #198
  (`4e0c89ee`). Now at `apps/hub/src/builder/model-accounts.ts:126-128`.
- The Applications cluster's storage guard compared device numbers and a marker file, which a
  copied data directory could pass on Docker's own restart path. Fixed in #196 (`b90c54f7`), which
  reads the live mount table. Now at `scripts/run-application-cluster.sh:58-63`.
- The live-mount-table guard above still compared the raw `/dev/loopN` path, which a host reboot can
  renumber for the same backing image, crash-looping the cluster with
  `APPLICATION_CLUSTER_STORAGE_UNMOUNTED` on every boot. Fixed in #283, which resolves a loop source
  to its backing file before comparing. Now at `scripts/run-application-cluster.sh:51-72`.

## Principles

- **Boundary Discipline.** The external system is the boundary. Parse its answer, check authority
  on it, and keep its credential on the Hub's side.
- **Prove It Works.** A provider claim needs that provider's evidence, and a refusal claim needs
  the direct path tried.
- **Make Operations Idempotent.** Provisioning and installation scripts converge when run twice or
  after a crash.
- **Separate Before Serializing Shared State.** Each Project gets its own role and schema. A shared
  cluster bound is enforced by a privilege, not by convention.
- **Laziness Protocol.** Use the provider's own mechanism (Factory credentials, GitHub App tokens)
  before adding a Conexus one.
