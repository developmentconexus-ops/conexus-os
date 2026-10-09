# Backup and tested restore

Scripts back up the Hub database, the separate Applications database and its global roles, the Conexus
Git root, sealing key files and identity realm. A restore check tests both databases in separate scratch
clusters. The systemd timer template runs the checked backup every day when installed.

## Back up

```bash
scripts/conexus-backup.sh \
  --container conexus-branch-postgres --database conexus_branch \
  --applications-container <Applications container> --applications-database conexus_apps \
  --applications-password-file <Applications installation password file> \
  --git-root ~/conexus-branch-state/git --out-root ~/conexus-branch-state/backups \
  --password-file ~/conexus-branch-state/secrets/postgres-superuser \
  --key-file <sealing key file> [--key-file <previous key file> ...] \
  --keycloak-container <name> --keycloak-realm <realm>
```

`--user` defaults to `postgres`. The password file is read into `PGPASSWORD` inside the script and never
printed. The script runs `pg_dump` in the named container and does not write to the database.

Applications arguments are required. Its container must differ from the Hub container. Its database
name follows `CONEXUS_APP_DB_NAME` and cannot be `postgres`, `template0` or `template1`.
`--applications-user` defaults to `postgres` and names `CONEXUS_APP_DB_INSTALL_USER`.
`--applications-password-file` names `CONEXUS_APP_DB_INSTALL_PASSWORD_FILE`. Each cluster receives only
its own password. Applications backup needs installation authority to read every schema and global role;
the runner's `app_provisioner` credentials do not suffice. No new environment variables are introduced.

`--key-file` is required and repeats: name `CONEXUS_SECRET_KEY_FILE` and every file in
`CONEXUS_PREVIOUS_SECRET_KEY_FILES`. Without them a restored database cannot unseal its secrets.
Key file names must differ.

It writes one folder named for the UTC time, `<out-root>/YYYYMMDDTHHMMSSZ`, built as `.partial` first and renamed when complete (`--partial` leaves the rename to the caller). The script sets
`umask 077`, so the folders are `0700` and the files are `0600`: owner-only, whatever the caller's umask.

- `database.dump` is a `pg_dump` custom-format dump.
- `applications.dump` is a custom-format dump with database creation, owners, ACLs, default privileges,
  sequences, extensions, row policies and per-database role settings.
- `applications-globals.sql` is a `pg_dumpall --globals-only --no-role-passwords --no-tablespaces` export
  of roles, their attributes and memberships, and parameter privileges. It contains no role password hashes.
- `git.tar.gz` is a tar of the Git root, which holds one bare repository per project.
- `keys/<name>` is a copy of each key file, mode `0600`.
- `identity-realm.json` is the whole Keycloak realm with its people and password hashes, written by
  `infra/keycloak/export-realm.sh` from a copy of the running container's database file. The container is not
  stopped or changed.
- `manifest.txt` lists the sha256 and byte size of every file above, and one `rows <schema.table> <count>` line per
  Hub table. `applications-rows <schema.table> <count>` records Applications tables. Required
  `# applications-database <name>` and `# applications-tables <count>` records identify that database and
  its table count, including a database with no tables. Both Applications files must have manifest entries.

The script opens one `REPEATABLE READ` session, exports its snapshot, records the row counts inside it,
and runs `pg_dump --snapshot` on the same snapshot. The session stays open until `pg_dump` finishes. So the
dump and the counts are one point in time, even while tables receive writes. The same procedure runs
separately for Applications. Its backup sessions disable statement, transaction and idle transaction
timeouts, because the snapshot holder must stay open throughout the dump.

Provisioning, role changes, grants and schema changes must be quiescent during the backup window.
The globals export cannot share a database snapshot. Hub and Applications snapshots are sequential;
they do not provide an atomic cutoff across clusters.

## Check the restore

```bash
scripts/conexus-restore-check.sh \
  --backup ~/conexus-branch-state/backups/<folder>
```

The script starts two scratch PostgreSQL clusters with `docker run --rm`, using the repository's pinned
image and no published ports. Every step runs through `docker exec`. Hub restoration keeps its
`--no-owner --no-privileges` contract. Applications globals restore first, then its archive restores with
`--create` and ownership and privileges intact. The scratch bootstrap already has `postgres`, so only
the exact `CREATE ROLE postgres;` statement is skipped. Its `ALTER` and grants still run; other SQL errors
fail the check. The script extracts Git into a scratch folder and stops both containers with
`timeout 60 docker stop`. It exits 0 and prints `PASS tables=<n> repositories=<m> applications-tables=<a>` when all of these hold.
Otherwise it prints `FAIL` and the differences, and exits 1. It never connects to the source, so it works
when the source has changed or is gone.

- Required artifacts have manifest entries. Each listed file exists and matches its sha256 and size,
  and each key file is mode `0600`.
- Every table in each restored database has the row count its manifest records.
- `git fsck --strict` passes on every restored repository.
- When the restored database has Projects, at least one repository is restored.
- `identity-realm.json` is JSON for the realm the manifest names.

Each problem is one line, `CODE detail`, after `FAIL`: `MISSING_FILE`, `CHECKSUM_MISMATCH`, `KEY_FILE_MODE`,
`SIZE_MISMATCH`, `MANIFEST_INVALID`, `MANIFEST_MISSING_FILE`, `RESTORE_FAILED`, `ROW_COUNTS_DIFFER`,
`APPLICATIONS_GLOBALS_RESTORE_FAILED`, `APPLICATIONS_RESTORE_FAILED`, `APPLICATIONS_ROW_COUNTS_DIFFER`,
`GIT_FSCK_FAILED`, `GIT_EMPTY_WITH_PROJECTS`, `IDENTITY_EXPORT_INVALID`.

## Recover an installation

The restore check is a disposable proof, not a command that restores an existing installation.
Before serving restored Applications data, provision its dedicated storage, server settings, TLS
certificates and `pg_hba` confinement through the existing
[Applications installation scripts](../../scripts/run-application-cluster.sh) and
[database provisioning owner](../../scripts/provision-application-database.mjs). These are installation
operations, not part of the check. Role passwords are absent from the globals export. Supply installation
and provisioner credentials through their existing password-file configuration and provision them again.
Project roles keep their password-free certificate authentication and expired password validity.
The `pg_stat_statements` preload and extension in maintenance database `postgres` remain installation
responsibilities. Extensions in `conexus_apps` restore only when their binaries exist in the target image.
Custom tablespaces are not supported by this backup.

## Schedule

There is a schedule. `scripts/conexus-backup-run.sh` takes the backup arguments. It writes the backup into
`<stamp>.partial`, runs the restore check on it, and renames it to `<stamp>` only when the check passes. A
dated folder with a `manifest.txt` is therefore always a verified backup. Retention keeps the newest 7 of them
and deletes the older ones. At the start of each run it deletes any `.partial` folder an earlier run left behind (the run was killed, so the
folder was never verified and holds secrets) and logs `BACKUP_RUN code=PARTIAL_REMOVED folder=<path>`. Any failure
of this run, before or after its folder exists, renames that run's own partial folder to
`<stamp>.failed`, keeps every verified folder, keeps only the newest `.failed` folder, exits 1 and logs one line,
`BACKUP_RUN code=<CODE> ...`. The code is `OK`, `BACKUP_FAILED` (the backup did not finish, such as a missing key
file, an unreachable Keycloak container, a `pg_dump` error or a full disk; the line ends with the last message)
or `RESTORE_CHECK_FAILED` (the line carries the first coded problem).

`infra/backup/` holds the systemd user timer (every day at 03:00) and its service. `infra/backup/README.md`
says how to install it. The repository installs nothing.

## What this proves

Both database archives and the tar are complete and readable. Separate clean PostgreSQL clusters restore
them without errors, including Applications owners and grants. Counts match each database snapshot, and
Git objects are intact. The synthetic backup suite additionally exercises exact data, sequence state,
default grants, role settings and ledger admission after restoration.

## What this does not prove

- The timer proves nothing when the machine is off at 03:00 beyond `Persistent=true` running it at next boot.
  Nobody is paged on a failed run. Read the log line.
- The restore check proves the key files are present and private. It does not prove they are the keys the
  database was sealed with. The realm export is checked as JSON for its realm, not restored into Keycloak.
- There is no off-machine copy. The backup sits on the same disk as the data.
- The routine check compares counts, not row contents or every sequence and privilege behavior.
  Hub restoration still uses `--no-owner --no-privileges`.
- Database snapshots are independent. Globals, Git and realm do not share either snapshot. A successful
  check does not establish cross-cluster consistency, application health or TLS authentication.
- The Git root is tarred after the dump, so it is not the same point in time as the database.
- An empty Git root passes, with `repositories=0`, and checks nothing on the Git side. On `main`, the Conexus Git
  root (`HUB_GIT_ROOT`) lives inside the E2B sandbox, not on the host. The Git half proves nothing until the
  Git root is on the host.
