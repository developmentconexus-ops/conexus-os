// Spike-only E2B template recipe: Postgres 17 added to the Builder's base image.
// Never touches the pilot's template (scripts/builder-e2b-template.mjs, name
// 'conexus-builder-c020'). This is a distinct name, built and torn down independently.
import { createHash } from 'node:crypto'

export const SPIKE_TEMPLATE_NAME = 'conexus-q2-sandbox-pg'
// Same base image as the pilot's Builder template, so the size delta measures Postgres 17 alone,
// not a different Debian base.
export const SPIKE_BASE_IMAGE = 'node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e'
export const SPIKE_AGENT_USER = 'conexus-agent'
export const SPIKE_PG_BIN = '/usr/lib/postgresql/17/bin'
export const SPIKE_PG_SEED = '/opt/conexus/pg-seed'
export const SPIKE_CPU_COUNT = 2
export const SPIKE_MEMORY_MB = 2_048

export const createSpikeTemplate = (Template) =>
  Template()
    .fromImage(SPIKE_BASE_IMAGE)
    .setUser('root')
    .runCmd([
      'apt-get update',
      'DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl gnupg',
    ].join(' && '))
    // PGDG apt repo: Debian bookworm ships Postgres 15, the task needs 17.
    .runCmd([
      'install -d /usr/share/postgresql-common/pgdg',
      'curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc',
      "echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list",
      'apt-get update',
      'DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-17',
      'rm -rf /var/lib/apt/lists/*',
    ].join(' && '))
    .runCmd(`useradd --create-home --uid 1500 --shell /bin/sh ${SPIKE_AGENT_USER}`)
    .makeDir('/workspace', { mode: 0o700 })
    .runCmd(`chown ${SPIKE_AGENT_USER}:${SPIKE_AGENT_USER} /workspace`)
    .setEnvs({ PATH: `${SPIKE_PG_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` })
    // Warm data directory baked at build time (measure 2, the "beats fresh initdb" question):
    // initdb as the unprivileged agent user into a seed dir; the runtime copies it to /tmp
    // instead of running initdb again.
    .makeDir('/opt/conexus', { mode: 0o755 })
    .runCmd(`chown ${SPIKE_AGENT_USER}:${SPIKE_AGENT_USER} /opt/conexus`)
    .setUser(SPIKE_AGENT_USER)
    .runCmd(`${SPIKE_PG_BIN}/initdb -D ${SPIKE_PG_SEED} -E UTF8 --auth=trust --no-instructions`)
    .setWorkdir('/workspace')
    .setReadyCmd([
      `test "$(id -un)" = "${SPIKE_AGENT_USER}"`,
      `test -x ${SPIKE_PG_BIN}/postgres`,
      `${SPIKE_PG_BIN}/postgres --version`,
      `test -f ${SPIKE_PG_SEED}/PG_VERSION`,
      'test "$(pwd)" = "/workspace"',
    ].join(' && '))

export const inspectSpikeTemplate = async (Template) => {
  const template = createSpikeTemplate(Template)
  const recipe = await Template.toJSON(template, true)
  const recipeSha256 = createHash('sha256').update(recipe).digest('hex')
  return Object.freeze({
    template,
    recipe,
    recipeSha256,
    buildName: `${SPIKE_TEMPLATE_NAME}:recipe-${recipeSha256.slice(0, 16)}`,
  })
}
