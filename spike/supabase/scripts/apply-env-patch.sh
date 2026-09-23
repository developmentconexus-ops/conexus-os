#!/bin/bash
set -euo pipefail
python3 /home/leandrotheodoro/spike-supabase/scripts/patch-env.py \
  /home/leandrotheodoro/spike-supabase/supabase-src/docker/.env \
  /home/leandrotheodoro/spike-supabase/scripts/pairs.env
grep -E '^(JWT_JWKS|PGRST_DB_SCHEMAS|POSTGRES_PORT|POOLER_PROXY_PORT_TRANSACTION|API_GW_HTTP_PORT|SUPABASE_PUBLIC_URL|API_EXTERNAL_URL|SITE_URL)=' \
  /home/leandrotheodoro/spike-supabase/supabase-src/docker/.env
