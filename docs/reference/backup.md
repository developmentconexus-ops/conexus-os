# Backup and tested restore

Two scripts back up one Hub database and the Conexus Git root, and prove the backup restores.

## Back up

```bash
scripts/conexus-backup.sh \
  --container conexus-branch-postgres --database conexus_branch \
  --git-root ~/conexus-branch-state/git --out-root ~/conexus-branch-state/backups \
  --password-file ~/conexus-branch-state/secrets/postgres-superuser
```

`--user` defaults to `postgres`. The password file is read into `PGPASSWORD` inside the script and never
printed. The script runs `pg_dump` in the named container and does not write to the database.

It writes one folder named for the UTC time, `<out-root>/YYYYMMDDTHHMMSSZ`, with three files. The script sets
`umask 077`, so the folder is `0700` and the files are `0600`: owner-only, whatever the caller's umask.

- `database.dump` is a `pg_dump` custom-format dump.
- `git.tar.gz` is a tar of the Git root, which holds one bare repository per project.
- `manifest.txt` lists the sha256 and byte size of each file, and one `rows <schema.table> <count>` line per
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

- Each file the manifest lists exists and matches its sha256. A missing file prints `FAIL` and exits 1.
- Every table has the same row count in the restored database as in the manifest.
- `git fsck --strict` passes on every restored repository.

## What this proves

The dump and the tar are complete and readable, and a clean Postgres restores the dump without errors.
The tables hold the rows the source held at the snapshot, and the Git objects are intact.

## What this does not prove

- There is no schedule. Someone runs the backup by hand.
- There is no off-machine copy. The backup sits on the same disk as the data.
- Counts do not compare row contents, sequences or roles. The restore uses `--no-owner --no-privileges`.
- The Git root is tarred after the dump, so it is not the same point in time as the database.
- An empty Git root passes, with `repositories=0`, and checks nothing on the Git side. On `main`, the Conexus Git
  root (`HUB_GIT_ROOT`) lives inside the E2B sandbox, not on the host. The Git half proves nothing until the
  Git root is on the host.
