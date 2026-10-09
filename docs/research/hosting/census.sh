#!/usr/bin/env bash
# Hosting census: every mechanism that ties one Conexus installation to one machine, one host name
# or one company. Rerun from the repository root: bash docs/research/hosting/census.sh
set -euo pipefail
cd "${CONEXUS_OS:-$(git rev-parse --show-toplevel)}"  # CONEXUS_OS: a conexus-os checkout, when run from elsewhere
src='apps/hub/src'
product() { grep -rn --include='*.ts' --include='*.tsx' "$@" "$src" apps/web/src | grep -v '\.generated\.' || true; }
line() { printf '\n## %s  [%s]\n' "$1" "$(printf '%s' "$2" | grep -c . || true)"; printf '%s\n' "$2" | sed '/^$/d'; }

line 'H1 host names fixed to conexus.localhost in product code' "$(product -e "conexus\.localhost")"
line 'H2 listeners that terminate TLS in the Hub process' "$(grep -Hn 'https: {' "$src/hub.ts" || true)"
line 'H3 listeners bound to loopback' "$(grep -n "listen({ host: '127.0.0.1'" "$src/hub.ts" "$src/app-runner/"*.ts || true)"
line 'M1 host-local file, directory, socket or binary inputs (configuration names)' \
  "$(grep -rhoE "CONEXUS_[A-Z0-9_]*(_FILE|_FILES|_DIR|_ROOT|_SOCKET|_BIN)\b" "$src" | sort -u)"
line 'M2 session-level advisory locks (one live Hub per database)' "$(product -e 'pg_try_advisory_lock(' -e 'pg_advisory_lock_shared(')"
line 'M3 periodic jobs in the Hub process' "$(product -e 'everyMs: ' | grep -v 'everyMs: number' )"
line 'D1 cluster-global Hub roles in the role register' \
  "$(node -e 'const r=require("./contracts/technical/hub-database-roles.json");for(const k of ["roles","policyRoles","ownerRoles","transactionRoles"])for(const x of r[k]??[])console.log(k, typeof x==="string"?x:x.role)')"
line 'D2 CREATE ROLE statements in Hub migrations' "$(grep -n 'CREATE ROLE' apps/hub/migrations/*.sql || true)"
line 'D3 Applications cluster admits Project roles only by client certificate (pg_hba)' \
  "$(grep -n -e 'hostssl' -e 'clientcert' -e 'cert map' scripts/confine-application-cluster.mjs || true)"
line 'D4 superuser-only grants in Applications provisioning' \
  "$(grep -n -e 'SET ON PARAMETER' -e 'pg_use_reserved_connections' scripts/provision-application-database.mjs || true)"
line 'D5 company or tenant key in Hub schema (tenant_id, company_id, installation_id, organization_id)' \
  "$(grep -niE '\b(tenant|company|installation|organization)_id\b' apps/hub/migrations/*.sql || true)"
line 'D6 workspace_id columns in Hub schema (the widest scope inside one installation)' \
  "$(grep -niE '^\s+workspace_id\s' apps/hub/migrations/*.sql || true)"
line 'T1 reads that cross Workspaces: model accounts shared with everyone in the installation' \
  "$(grep -rn --include='*.ts' "sharing = 'everyone'" "$src" | grep -v '\.generated\.' || true)"
line 'T2 operations reserved to the installation administrator' \
  "$(grep -rn --include='*.ts' "admitInstallationAdministrator(gate, '" "$src" || true)"
line 'T3 installation-wide model default' "$(grep -n 'CREATE TABLE model.installation_default' apps/hub/migrations/*.sql || true)"
line 'X1 generated code isolation needs unprivileged user namespaces (bubblewrap)' "$(grep -n -e "'--unshare-user'" -e 'unprivileged_userns_clone' "$src/app-runner/sandbox.ts" || true)"
line 'K1 Keycloak runs in development mode on its file database (H2)' \
  "$(grep -Hn -e 'start-dev' infra/keycloak/provision.sh; grep -Hn 'keycloakdb.mv.db' infra/keycloak/export-realm.sh || true)"
line 'K2 the one realm and its redirect address fixed in the repository' "$(grep -Hn -e '"realm"' -e 'redirectUris' infra/keycloak/realm-conexus.json || true)"
line 'P1 container images shipped (Dockerfile, compose for the Hub)' "$(git ls-files | grep -iE '(^|/)(Dockerfile|Containerfile)$|compose\.ya?ml$' || true)"
line 'P2 systemd units shipped' "$(git ls-files 'infra/**/*.service' 'infra/**/*.timer' 'infra/**/units/*' || true)"
