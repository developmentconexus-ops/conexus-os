#!/bin/bash
# Writes docker/.env override pairs. Run as a file (not inlined) because
# double quotes get stripped when complex commands cross the git-bash ->
# wsl.exe argv boundary from the Windows side.
set -euo pipefail

B=/home/leandrotheodoro/spike-supabase

{
  printf 'JWT_JWKS=%s\n' "$(cat "$B/keys/keycloak-stub-jwks.compact.json")"
  echo 'PGRST_DB_SCHEMAS=public,project_a,project_b,graphql_public'
  echo 'POSTGRES_PORT=5442'
  echo 'POOLER_PROXY_PORT_TRANSACTION=6549'
  echo 'API_GW_HTTP_PORT=8000'
  echo 'SUPABASE_PUBLIC_URL=http://localhost:8000'
  echo 'API_EXTERNAL_URL=http://localhost:8000/auth/v1'
  echo 'SITE_URL=http://localhost:8000'
} > "$B/scripts/pairs.env"

cat "$B/scripts/pairs.env"
