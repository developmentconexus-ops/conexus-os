# WSL Ubuntu local environment

Local Conexus implementation and deciding verification run in WSL Ubuntu. The
Windows process may locate the repository and launch WSL, but its Node/npm,
filesystem path semantics and command results are not deciding Evidence.

## Session entry

Execute local work in Ubuntu. Every non-interactive invocation must source NVM
explicitly because non-interactive shells do not reliably load `.bashrc`:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
cd /home/leandrotheodoro/conexus-os
nvm use
node --version
npm --version
```

When PowerShell launches WSL, keep the repository on the Linux filesystem and
prevent PowerShell from consuming shell variables before Bash receives them:

```bash
wsl.exe -d Ubuntu -- bash -c 'source /home/leandrotheodoro/.nvm/nvm.sh; cd /home/leandrotheodoro/conexus-os; nvm use; node --version; npm --version'
```

The required values come from `.nvmrc` and `package.json`, currently Node
`24.20.0` and npm `12.0.2`. Stop before installation or verification if either
differs. Do not fall through to Windows-interoperability `node`, `npm` or `npx`.

## Fresh bootstrap and proof

Within that same WSL shell:

```bash
npm run conexus:preflight
npm ci
npx --no-install playwright install chromium
npm run conexus:verify -- --scope <scope>
```

The final candidate profile includes real PostgreSQL leaves and does not
silently skip them. Before `scope final` or root `npm run verify`, provide one
complete `CONEXUS_TEST_DB_*` set or run the disposable PostgreSQL service pinned
in `.github/workflows/verify.yml`; a partial set fails before execution.

`scope final` is deciding only on Linux with the pinned versions. Windows may
use dry-run/status inspection, but a Windows result cannot close a proof or gate.

NVM installation or version changes mutate the developer host and therefore
require explicit operator authorization. Once authorized, install the exact
`.nvmrc` value, install the exact `package.json#engines.npm`, and set the NVM
default to the admitted Node version. Never replace repository pins with the
host's convenient versions.
