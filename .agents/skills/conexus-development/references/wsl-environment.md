# WSL Ubuntu local environment

Local Conexus implementation and deciding verification run in WSL Ubuntu. The Windows process may locate the repository and launch WSL, but its Node, npm, path semantics and command results are not deciding evidence.

## Enter the environment

Run every command inside Ubuntu, in a worktree on the Linux filesystem. A non-interactive shell does not reliably load `.bashrc`, so select and verify the pinned toolchain explicitly:

```bash
cd "$HOME/<worktree>"
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use
fi
case "$(command -v node):$(command -v npm)" in *"/mnt/"*|*".exe"*) echo "Use Linux Node and npm, not Windows binaries" >&2; exit 1;; esac
test "$(node -p 'process.platform')" = linux || { echo "Linux Node is required" >&2; exit 1; }
test "$(node --version)" = "v$(tr -d '\r\n' < .nvmrc)" || { echo "Node does not match .nvmrc" >&2; exit 1; }
expected_npm=$(node -p "require('./package.json').engines.npm")
test "$(npm --version)" = "$expected_npm" || { echo "npm does not match package.json#engines.npm" >&2; exit 1; }
npm run conexus:preflight
```

The version checks stop before preflight on a mismatch. Without NVM, they use the pinned Linux `node` and `npm` already on PATH; Windows-interoperability binaries are rejected.

Installing NVM or changing its versions changes the operator's host, so it needs the operator's authorization. Once authorized, install the exact `.nvmrc` Node and the exact `package.json#engines.npm`, and make that Node the NVM default. Never replace the repository pins with the host's versions.

## Call WSL from Windows

A command string from Windows crosses the Windows shell before Bash sees it, and it breaks in ways that look like product failures:

- A variable assigned in the same command expands to empty. `$HOME` and other inherited variables still work.
- `2>&1`, `$(( ))`, `$(...)` and `$$`-quoted SQL get mangled or rejected.
- A process started with `&` inside an inline command vanishes without a log.
- Backticks in a `--body` argument run as command substitution.

So:

1. Write the logic to a `.sh` file with the editor tool. Never pass an inline `$(...)` through `wsl.exe`.
2. Run it by path: `wsl.exe -d Ubuntu -- bash /mnt/c/<path>/<file>.sh`. From Git Bash, prefix `MSYS_NO_PATHCONV=1`. Never pipe a script into `bash`.
3. Select the pinned Node and npm inside the script using the NVM-or-verified-PATH procedure above.
4. Write commit messages and pull request bodies to a file. Pass them with `git commit -F <file>` and `gh pr create --body-file <file>`.
5. Capture output with `tee` and check the exit status separately, because `cmd | tail` returns the status of `tail`.

## Keep worktrees intact

The repository lives in WSL. `~/conexus-os.git` is a bare repository on ext4 and the Git common directory of every worktree, such as `~/conexus-os` and `~/wt-*`. No Windows path holds Conexus source or Git state. Create a worktree with `git -C ~/conexus-os.git worktree add ~/wt-<name> -b <branch> origin/main`.

Remove worktrees only with `npm run worktree:reap`. It prints what it would remove and why it keeps the rest, and `npm run worktree:reap -- --apply` removes. It removes a worktree only when its pull request is closed or merged, its HEAD is that pull request's head commit, and it holds nothing but regenerable build output. Never run `git worktree prune` or `git worktree remove --force`.

Build and test only in WSL. The `node_modules` of a WSL worktree is a Linux install, and Vite fails on Windows with a missing `rolldown-binding.win32-x64-msvc.node`. Edit WSL files from Windows tools through `\\wsl.localhost\Ubuntu\home\...`.

## Keep the disk from filling

The Ubuntu disk is `D:\WSL\Ubuntu\ext4.vhdx`. It only grows. Deleting files inside WSL returns no space to D:. When D: fills, the ext4 file system turns read-only and Ubuntu refuses to start.

- Before work that pulls Docker images, runs `npm ci` in a new worktree, or builds templates, check D: from PowerShell with `(Get-Volume -DriveLetter D).SizeRemaining`. Below 20 GB, stop and tell the operator.
- When a pull request merges, run `npm run worktree:reap`. Each worktree's `node_modules` takes about 1.5 GB.
- To return space to D:, the operator compacts the disk as administrator: `wsl --shutdown`, then in `diskpart` run `select vdisk file=D:\WSL\Ubuntu\ext4.vhdx`, `attach vdisk readonly`, `compact vdisk`, and `detach vdisk`.
- Do not force a sparse disk with `wsl --manage Ubuntu --set-sparse true --allow-unsafe`. WSL refuses it because of possible data corruption.
- If Conexus feels slow, measure the disk before blaming the code.

## Bootstrap a worktree

Within that same WSL shell:

```bash
npm run conexus:preflight
npm ci
npx --no-install playwright install chromium
```

Then run only the checks the change touches, such as `npm run repository:check`, one test file, or `npm run conexus:verify -- --scope <scope>` with a focused scope. A check with PostgreSQL leaves needs one complete `CONEXUS_TEST_DB_*` set or the disposable PostgreSQL service pinned in `.github/workflows/verify.yml`. A partial set fails before execution. CI runs the whole graph at the exact head SHA, and only that run decides the merge gate. A Windows result decides nothing.

## Piloto

The pilot is the operator's laptop install of the real Hub and application runner. It holds the operator's working state. Touch it only when the issue or task names a pilot proof.

- The pilot Hub and runner run from one checkout of `main` with the start scripts in `infra/pilot/`. [`infra/pilot/README.md`](../../../../infra/pilot/README.md) owns where they live and how to deploy `main`.
- Run each launcher in the foreground in its own terminal tab. A Hub started with `&` from a `wsl.exe` call dies when that call ends. Never wrap the Hub in `timeout`.
- The Hub serves `https://hub.conexus.localhost:3443`. A Hub left over from an earlier call can still hold the port, and the new one then fails with `EADDRINUSE`.
- `scripts/run-hub-migrations.mjs` applies the Hub migrations. They are forward-only, so running it against the pilot from a branch with a later migration changes the pilot for good. That needs the operator's Aprovo.
- The environment files and secrets live outside the repository. Never print them.
- Never type the operator's password. Sign in as described in the frontend skill's [verification reference](../../conexus-frontend/references/verification.md#see-it-in-a-real-browser).
