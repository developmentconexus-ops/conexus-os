# Backup and tested restore

Scripts back up one Hub database, the Conexus Git root, the sealing key files and the identity provider's
realm export, and prove the backup restores. A systemd timer runs them every day.

## Back up

```bash
scripts/conexus-backup.sh \
  --container conexus-branch-postgres --database conexus_branch \
  --git-root ~/conexus-branch-state/git --out-root ~/conexus-branch-state/backups \
  --password-file ~/conexus-branch-state/secrets/postgres-superuser \
  --key-file <sealing key file> [--key-file <previous key file> ...] \
  --keycloak-container <name> --keycloak-realm <realm>
```

`--user` defaults to `postgres`. The password file is read into `PGPASSWORD` inside the script and never
printed. The script runs `pg_dump` in the named container and does not write to the database.

`--key-file` is required and repeats: name `CONEXUS_FACTORY_SECRET_KEY_FILE` and every file in
`CONEXUS_FACTORY_PREVIOUS_SECRET_KEY_FILES`. Without them a restored database cannot unseal its secrets.
Key file names must differ.

It writes one folder named for the UTC time, `<out-root>/YYYYMMDDTHHMMSSZ`. The script sets
`umask 077`, so the folders are `0700` and the files are `0600`: owner-only, whatever the caller's umask.

- `database.dump` is a `pg_dump` custom-format dump.
- `git.tar.gz` is a tar of the Git root, which holds one bare repository per project.
- `keys/<name>` is a copy of each key file, mode `0600`.
- `identity-realm.json` is the whole Keycloak realm with its people and password hashes, written by
  `infra/keycloak/export-realm.sh` from a copy of the running container's database file. The container is not
  stopped or changed.
- `manifest.txt` lists the sha256 and byte size of every file above, and one `rows <schema.table> <count>` line per
  table.

The script opens one `REPEATABLE READ` session, exports its snapshot, records the row counts inside it,
and runs `pg_dump --snapshot` on the same snapshot. The session stays open until `pg_dump` finishes. So the
dump and the counts are one point in time, even while the Hub writes.

## Check the restore

```bash
scripts/conexus-restore-check.sh \
  --backup ~/conexus-branch-state/backups/<folder>
```

The script starts a scratch Postgres with `docker run --rm`, the image pinned by digest as everywhere else in the repository and
no published port. Every step runs through `docker exec`. It restores
the dump into it, extracts the tar into a scratch folder, and stops the scratch container with
`timeout 60 docker stop`. It exits 0 and prints `PASS tables=<n> repositories=<m>` when all of these hold.
Otherwise it prints `FAIL` and the differences, and exits 1. It never connects to the source, so it works
when the source has changed or is gone.

- Each file the manifest lists exists and matches its sha256, and each key file is mode `0600`.
- Every table has the same row count in the restored database as in the manifest.
- `git fsck --strict` passes on every restored repository.
- When the restored database has Projects, at least one repository is restored.
- `identity-realm.json` is JSON for the realm the manifest names.

Each problem is one line, `CODE detail`, after `FAIL`: `MISSING_FILE`, `CHECKSUM_MISMATCH`, `KEY_FILE_MODE`,
`RESTORE_FAILED`, `ROW_COUNTS_DIFFER`, `GIT_FSCK_FAILED`, `GIT_EMPTY_WITH_PROJECTS`, `IDENTITY_EXPORT_INVALID`.

## Schedule

There is a schedule. `scripts/conexus-backup-run.sh` takes the backup arguments, runs the backup, then the
restore check. On `PASS` it keeps the folder and deletes all but the newest 7 dated folders. On `FAIL` it renames
the new folder to `<name>.failed`, keeps every earlier good folder, keeps only the newest `.failed` folder, exits 1
and logs one line, `BACKUP_RUN code=<CODE> ...`. The code is `OK`, `BACKUP_FAILED` or `RESTORE_CHECK_FAILED`.
A backup that cannot start (a missing key file, an unreachable Keycloak container) is `BACKUP_FAILED` and the
log line ends with the error code the script printed.

`infra/backup/` holds the systemd user timer (every day at 03:00) and its service. `infra/backup/README.md`
says how to install it. The repository installs nothing.

## What this proves

The dump and the tar are complete and readable, and a clean Postgres restores the dump without errors.
The tables hold the rows the source held at the snapshot, and the Git objects are intact.

## What this does not prove

- The timer proves nothing when the machine is off at 03:00 beyond `Persistent=true` running it at next boot.
  Nobody is paged on a failed run. Read the log line.
- The restore check proves the key files are present and private. It does not prove they are the keys the
  database was sealed with. The realm export is checked as JSON for its realm, not restored into Keycloak.
- There is no off-machine copy. The backup sits on the same disk as the data.
- Counts do not compare row contents, sequences or roles. The restore uses `--no-owner --no-privileges`.
- The Git root is tarred after the dump, so it is not the same point in time as the database.
- An empty Git root passes, with `repositories=0`, and checks nothing on the Git side. On `main`, the Conexus Git
  root (`HUB_GIT_ROOT`) lives inside the E2B sandbox, not on the host. The Git half proves nothing until the
  Git root is on the host.
