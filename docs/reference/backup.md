# Backup and tested restore

Two scripts back up one Hub database and the Conexus Git root, and prove the backup restores. They cover
spec 0002 AC-31.

## Back up

```bash
scripts/conexus-backup.sh \
  --container conexus-branch-postgres --database conexus_branch \
  --git-root ~/conexus-branch-state/git --out-root ~/conexus-branch-state/backups \
  --password-file ~/conexus-branch-state/secrets/postgres-superuser
```

`--user` defaults to `postgres`. The password file is read into `PGPASSWORD` inside the script and never
printed. The script runs `pg_dump` in the named container and does not write to the database.

It writes one folder named for the UTC time, `<out-root>/YYYYMMDDTHHMMSSZ`, with three files.

- `database.dump` is a `pg_dump` custom-format dump.
- `git.tar.gz` is a tar of the Git root, which holds one bare repository per project.
- `manifest.txt` lists the sha256 and byte size of each file.

## Check the restore

```bash
scripts/conexus-restore-check.sh \
  --backup ~/conexus-branch-state/backups/<folder> \
  --source-container conexus-branch-postgres --source-database conexus_branch \
  --password-file ~/conexus-branch-state/secrets/postgres-superuser
```

The script starts a scratch `postgres:17.10-bookworm` with `docker run --rm` on a free local port, restores
the dump into it, extracts the tar into a scratch folder, and stops the scratch container with
`timeout 60 docker stop`. It exits 0 and prints `PASS tables=<n> repositories=<m>` when all of these hold.
Otherwise it prints `FAIL` and the differences, and exits 1.

- Each file matches the sha256 in the manifest.
- Every table has the same row count in the restored database as in the source database now.
- `git fsck --strict` passes on every restored repository.

## What this proves

The dump and the tar are complete and readable, and a clean Postgres restores the dump without errors.
The tables hold the rows the source holds, and the Git objects are intact.

## What this does not prove

- There is no schedule. Someone runs the backup by hand.
- There is no off-machine copy. The backup sits on the same disk as the data.
- Row counts are compared with the live source. A write between the backup and the check shows as a
  difference. Rerun the backup and the check when the source is busy.
- Counts do not compare row contents, sequences or roles. The restore uses `--no-owner --no-privileges`.
- The dump and the Git root are taken one after the other, so they are not one point in time.
