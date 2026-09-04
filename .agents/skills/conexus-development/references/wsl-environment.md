# WSL Ubuntu local environment

Local Conexus implementation and deciding verification run in WSL Ubuntu. The
Windows process may locate the repository and launch WSL, but its Node/npm,
filesystem path semantics and command results are not deciding Evidence.

## Session entry

Resolve the Windows repository root, translate it with `wslpath`, then execute
the work in Ubuntu. Every non-interactive invocation must source NVM explicitly
because non-interactive shells do not reliably load `.bashrc`:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
cd /mnt/c/Users/leandro.theodoro/Documents/conexus-os
nvm use
node --version
npm --version
```

When PowerShell launches WSL, prevent it from consuming shell variables before
Bash receives them. On this workstation the robust non-interactive form uses
the admitted user's literal Linux paths:

```bash
wsl.exe -d Ubuntu -- bash -c 'source /home/leandrotheodoro/.nvm/nvm.sh; cd /mnt/c/Users/leandro.theodoro/Documents/conexus-os; nvm use; node --version; npm --version'
```

The required values come from `.nvmrc` and `package.json`, currently Node
`24.20.0` and npm `12.0.2`. Stop before installation or verification if either
differs. Do not fall through to Windows-interoperability `node`, `npm` or `npx`.

## Fresh bootstrap and proof

Within that same WSL shell:

```bash
npm run conexus:preflight
npm ci
npm run conexus:verify -- --scope <scope>
```

`scope final` is deciding only on Linux with the pinned versions. Windows may
use dry-run/status inspection, but a Windows result cannot close a proof or gate.

NVM installation or version changes mutate the developer host and therefore
require explicit operator authorization. Once authorized, install the exact
`.nvmrc` value, install the exact `package.json#engines.npm`, and set the NVM
default to the admitted Node version. Never replace repository pins with the
host's convenient versions.
