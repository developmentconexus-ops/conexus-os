// Adversarial probe deployed as "Project A"'s generated handler.
// Identical code also deployed as fn-b ("Project B"), selected by
// SUPABASE_FUNCTION_SLUG. One shared suite, ?case=<name> selects the probe,
// mirroring spike/q1-runner/run-suite.mjs's case shape so results line up
// with the runner arena's table.

const SLUG = Deno.env.get('SUPABASE_FUNCTION_SLUG') ?? 'unknown'
const OTHER_PROJECT = SLUG === 'fn-a' ? 'project_b' : 'project_a'

function result(pass: boolean, observed: unknown) {
  return { slug: SLUG, pass, observed }
}

async function caseEnvSecrets() {
  const env = Deno.env.toObject()
  const sensitive = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_URL',
    'JWT_SECRET',
    'SUPABASE_SECRET_KEYS',
  ]
  const visible = sensitive.filter((k) => !!env[k])
  return result(visible.length === 0, {
    visible_sensitive_keys: visible,
    total_env_keys: Object.keys(env).length,
  })
}

async function caseDirectDbBypass() {
  // SUPABASE_DB_URL is the raw Postgres connection string handed to every
  // function's env regardless of which Project it belongs to.
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) return result(true, { reason: 'SUPABASE_DB_URL not present' })
  try {
    const postgres = (await import('npm:postgres@3')).default
    const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 })
    const rows = await sql`select owner_sub, body from ${sql(OTHER_PROJECT)}.items`
    await sql.end({ timeout: 1 })
    return result(rows.length === 0, {
      connected_as: dbUrl.split('@')[0].split('//')[1],
      rows_read_from: OTHER_PROJECT,
      row_count: rows.length,
      sample: rows[0] ?? null,
    })
  } catch (e) {
    return result(true, { error: String(e) })
  }
}

async function caseCrossProjectViaRest() {
  // Try the OTHER Project's schema through PostgREST using this function's
  // own SUPABASE_SERVICE_ROLE_KEY (also present in env regardless of Project).
  const gw = Deno.env.get('SUPABASE_URL') ?? 'http://api-gw:8000'
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const res = await fetch(`${gw}/rest/v1/items?select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': OTHER_PROJECT,
    },
  })
  const body = await res.text()
  return result(res.status >= 400, { status: res.status, body: body.slice(0, 300) })
}

async function caseReadFiles() {
  const targets = ['/etc/passwd', '/home/deno/functions/fn-b/index.ts', '/proc/1/environ']
  const out: Record<string, string> = {}
  for (const t of targets) {
    try {
      const bytes = await Deno.readFile(t)
      out[t] = `READABLE (${bytes.length} bytes)`
    } catch (e) {
      out[t] = `denied: ${e.constructor.name}`
    }
  }
  const anyReadable = Object.values(out).some((v) => v.startsWith('READABLE'))
  return result(!anyReadable, out)
}

async function caseNetworkEgress() {
  const targets: Record<string, string> = {
    internet: 'https://example.com',
    pilot_hub: 'https://127.0.0.1:3443/',
  }
  const out: Record<string, string> = {}
  for (const [name, url] of Object.entries(targets)) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(t)
      out[name] = `reachable status=${res.status}`
    } catch (e) {
      out[name] = `blocked: ${e.constructor.name} ${String(e).slice(0, 80)}`
    }
  }
  try {
    // @ts-ignore Deno global
    const conn = await Deno.connect({ path: '/var/run/docker.sock', transport: 'unix' })
    conn.close()
    out['docker_socket_unix'] = 'CONNECTED'
  } catch (e) {
    out['docker_socket_unix'] = `blocked: ${e.constructor.name}`
  }
  // The dangerous reaches are the Docker socket and the pilot Hub on the
  // host loopback. Internet egress is a separate, expected-by-default
  // posture (functions need it to fetch npm/jsr packages) and is reported,
  // not scored as a failure here.
  const dangerous = out.docker_socket_unix === 'CONNECTED' || out.pilot_hub.startsWith('reachable')
  return result(!dangerous, out)
}

async function caseTimeBound() {
  const start = Date.now()
  while (Date.now() - start < 90_000) {
    // spin past the 60s workerTimeoutMs configured in main/index.ts
  }
  return result(false, { ran_ms: Date.now() - start, note: 'should never return; worker should be killed first' })
}

async function caseMemBound() {
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < 500 * 1024 * 1024) {
    chunks.push(new Uint8Array(10 * 1024 * 1024))
    total += 10 * 1024 * 1024
  }
  return result(false, { allocated_mb: total / 1024 / 1024, note: 'should be OOM-killed before reaching 500MB (limit is 150MB)' })
}

async function caseCrash() {
  // deno-lint-ignore no-explicit-any
  ;(null as any).boom()
  return result(false, {})
}

async function caseEcho() {
  return result(true, { alive: true, slug: SLUG, now: new Date().toISOString() })
}

const CASES: Record<string, () => Promise<unknown>> = {
  env_secrets: caseEnvSecrets,
  direct_db_bypass: caseDirectDbBypass,
  cross_project_rest: caseCrossProjectViaRest,
  read_files: caseReadFiles,
  network_egress: caseNetworkEgress,
  time_bound: caseTimeBound,
  mem_bound: caseMemBound,
  crash: caseCrash,
  echo: caseEcho,
}

export default {
  fetch: async (req: Request) => {
    const url = new URL(req.url)
    const c = url.searchParams.get('case') ?? 'echo'
    const fn = CASES[c]
    if (!fn) {
      return Response.json({ error: `unknown case ${c}`, known: Object.keys(CASES) }, { status: 400 })
    }
    const out = await fn()
    return Response.json(out)
  },
}
