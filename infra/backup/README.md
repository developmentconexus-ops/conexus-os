# Backup schedule

The unit files here run `scripts/conexus-backup-run.sh` every day at 03:00 as a systemd user timer. They are
not installed by the repository. The operator installs them once, after the pull request merges.

## Install

1. Open `conexus-backup.service` and replace each `CHANGE-ME` value: the sealing key file (add one
   `--key-file` line per key, including every file named in `CONEXUS_PREVIOUS_SECRET_KEY_FILES`) and
   the Keycloak container name. Confirm the container, database and paths match the pilot.
2. Copy both files, with `%h/conexus-os` pointing at a checkout of `main`:

   ```bash
   mkdir -p ~/.config/systemd/user
   cp infra/backup/conexus-backup.service infra/backup/conexus-backup.timer ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now conexus-backup.timer
   loginctl enable-linger "$USER"
   ```

3. Run once by hand and read the log line:

   ```bash
   systemctl --user start conexus-backup.service
   journalctl --user -u conexus-backup.service -n 5
   ```

   A good run logs `BACKUP_RUN code=OK` and the restore check's `PASS`. A bad run logs `BACKUP_RUN code=<CODE>`
   with the codes `docs/reference/backup.md` lists.

A Docker that is not ready when the timer fires at boot shows up as `BACKUP_FAILED`. The next day's run is
unaffected.

## Remove

```bash
systemctl --user disable --now conexus-backup.timer
rm ~/.config/systemd/user/conexus-backup.{service,timer}
```
