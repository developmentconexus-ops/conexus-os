# Pilot supervision

Two user units, `conexus-hub.service` and `conexus-runner.service`, run `infra/pilot/hub.sh` and `infra/pilot/runner.sh` and bring them back
after a crash. The unit files live in [`infra/pilot/units/`](../../infra/pilot/units); [`infra/pilot/install-units.sh`](../../infra/pilot/install-units.sh) renders them with
the checkout, env file and log paths from [`infra/pilot/README.md`](../../infra/pilot/README.md) and enables them. The env files stay where they are,
and no secret is in a unit.

| Behavior | How |
| --- | --- |
| Restart after a crash | `Restart=on-failure`, 10 s apart. A `kill -9`, an OOM and a non-zero exit all count. |
| Stop on purpose | `systemctl --user stop` exits 0, which is not a failure, so nothing restarts it. |
| Start limit | Five failures inside 300 s leave the unit `failed` and stop restarting it. |
| Refused start | Exit 78 never restarts. The Hub exits 78 when another Hub holds the database (`HUB_ALREADY_RUNNING`) or the schema is behind the code (`HUB_SCHEMA_BEHIND`). |
| Recovery | Each Hub heartbeats the runs it works every 10 s. At boot and every 30 s it takes over each run whose heartbeat is older than 30 s and settles it, so a run the dead process left in flight ends INTERRUPTED with `HUB_RESTART`, or against main when it has a candidate. A run waiting on a question is taken over the same way, so its question ends with the restart. |

Install, once, after the operator's ok for the issue that names the pilot proof:

```bash
cd ~/conexus-pilot
infra/pilot/install-units.sh            # writes ~/.config/systemd/user/conexus-{hub,runner}.service and enables them
loginctl enable-linger "$USER"          # lets the units start at boot without a login
systemctl --user start conexus-hub.service conexus-runner.service
```

Run the script again after you change a path or a unit file. It is idempotent, and a running unit keeps running
until you restart it. Stop any Hub or runner you started by hand first, or the unit's Hub exits 78 on the held lock.

Daily use:

```bash
systemctl --user status conexus-hub.service conexus-runner.service
journalctl --user -u conexus-hub.service -n 50 --no-pager     # also in ~/conexus-pilot-logs/hub.log
systemctl --user stop conexus-hub.service                      # stop on purpose; it stays stopped
systemctl --user start conexus-hub.service
systemctl --user restart conexus-hub.service                   # a deploy: the Hub closes within 15 s
```

A unit stopped on purpose is `inactive (dead)`. It does not come back until you start it, or until the next boot
if it is enabled. `systemctl --user disable --now conexus-hub.service` stops it for good.

**Start-limit state.** After five crashes in 300 s the unit stays down and the status reads:

```text
× conexus-hub.service - Conexus pilot Hub
     Active: failed (Result: exit-code)
    Process: ExecStart=.../infra/pilot/hub.sh (code=exited, status=137)
```

`NRestarts` is 5, and the journal says `Start request repeated too quickly` and `Failed to start`. A manual
`start` inside the window gets the same refusal. After exit 78 the status reads `Active: failed (Result: exit-code)`
with `status=78/CONFIG`, `NRestarts` is 0, and the Hub logged `HUB_FATAL` with `HUB_SCHEMA_BEHIND` or
`HUB_ALREADY_RUNNING`. In both cases read the last lines of `hub.log` first. A Postgres that was not up yet at boot
is the common cause of the first. Fix the cause, then:

```bash
systemctl --user reset-failed conexus-hub.service
systemctl --user start conexus-hub.service
```

A deploy still follows [Deploy main](../../infra/pilot/README.md#deploy-main): stop the unit instead of killing the process, and start it
after the checkout moves.
