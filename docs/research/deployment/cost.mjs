// Monthly cost model for the deployment study (study.md, section 10). Prices are vendor figures read on
// 2026-10-09 and cited in study.md section 4; sizes per scenario are assumptions stated below.
// Run: node docs/research/deployment/cost.mjs
const HOURS = 730
const BRL = 5.01 // PTAX sell rate, 2026-10-08

const price = {
  lightsail: { '4gb': 0.03225 * HOURS, '8gb': 0.05913 * HOURS, '16gb': 0.1129 * HOURS },
  gcp: { e2medium: 38.83, e2standard2: 77.65, diskPerGb: 0.15, ipv4: 3.65 },
  cloudSql: { g1small: 38.33, storagePerGb: 0.255 },
  neon: { cuHour: 0.106, storageGb: 0.35, historyGb: 0.2 },
  supabase: { pro: 25, smallExtra: 5, pitr7d: 100 },
  cloudRun: { vcpuSecond: 0.0000336, gibSecond: 0.0000035, idleVcpuSecond: 0.0000035, idleGibSecond: 0.0000035 },
  // Cloudflare Containers, on the Workers Paid plan already counted in shared(): memory and disk billed as provisioned
  // while awake, CPU only while active.
  containers: { gibSecond: 0.0000025, vcpuSecond: 0.00002, diskGbSecond: 0.00000007, includedGibHours: 25, includedVcpuMinutes: 375, includedDiskGbHours: 200 },
  wfp: 25, workersPaid: 5, wfpPerMillionRequests: 0.3,
  r2PerGb: 0.015, e2bHour: 0.1332, e2bPro: 150, resendPro: 20, sentryTeam: 26,
  domain: 40 / 12 / BRL, // .com.br at registro.br, R$40 a year
  homeServer: { hardwareBrl: 2300, months: 24, powerBrl: 8 },
  // Brazilian VPS in reais, converted. Hostinger VPS (São Paulo): renewal prices, the steady state after the
  // 24-month promotion (third-party listings; promo KVM 2 R$43.99). Magalu Cloud: pay as you go, no commitment,
  // block storage beyond the included disk not counted (its price was not verified).
  hostinger: { kvm2: 77.99 / BRL, kvm4: 149.99 / BRL, kvm8: 259.99 / BRL },
  magalu: { 'bv2-8-10': 119.99 / BRL, 'bv4-8-10': 149.99 / BRL, 'bv4-8-100': 219.99 / BRL },
}

// What each scenario assumes. Hub hours: the Hub keeps the control database awake (census E6, E7) unless the
// refactor lets it idle, in which case it is awake about 11 hours on 22 working days.
const scenarios = [
  { name: '4 companies', companies: 4, dbCu: 0.25, dbGb: 2, r2Gb: 5, e2bHours: 40, requestsM: 2, vmSelf: '8gb', vmApp: '4gb', mail: 0, errors: 0 },
  { name: '20 companies', companies: 20, dbCu: 0.5, dbGb: 10, r2Gb: 20, e2bHours: 200, requestsM: 10, vmSelf: '16gb', vmApp: '8gb', mail: 0, errors: 0 },
  { name: '100 companies', companies: 100, dbCu: 1.5, dbGb: 50, r2Gb: 100, e2bHours: 1000, requestsM: 50, vmSelf: '16gb', vmApp: '16gb', mail: price.resendPro, errors: price.sentryTeam },
]
const awakeHours = { always: HOURS, businessHours: 11 * 22 }

// Every topology pays these: Cloudflare (apps, DNS, Tunnel), backups to R2, E2B for the Builder, mail, errors, domain.
const shared = (s) => {
  const e2b = s.e2bHours * price.e2bHour + (s.companies > 20 ? price.e2bPro : 0)
  const wfp = price.wfp + price.workersPaid + Math.max(0, s.requestsM - 20) * price.wfpPerMillionRequests
  return { cloudflare: wfp, r2: Math.max(0, s.r2Gb - 10) * price.r2PerGb, e2b, mailAndErrors: s.mail + s.errors, domain: price.domain }
}
const neon = (s, hours) => s.dbCu * hours * price.neon.cuHour + s.dbGb * (price.neon.storageGb + price.neon.historyGb)

const topologies = {
  'T0 home server, PostgreSQL on it': (s) => s.companies > 20 ? null : ({
    compute: (price.homeServer.hardwareBrl / price.homeServer.months + price.homeServer.powerBrl) / BRL, database: 0 }),
  'T1 one VM (Lightsail), PostgreSQL on it, backups to R2': (s) => ({ compute: price.lightsail[s.vmSelf] * (s.companies > 20 ? 2 : 1), database: 0 }),
  'T2 one VM (Lightsail) + Neon Launch': (s) => ({ compute: price.lightsail[s.vmApp], database: neon(s, awakeHours.always) }),
  'T1h Hostinger VPS (São Paulo), PostgreSQL on it, backups to R2': (s) => ({
    compute: s.companies > 20 ? price.hostinger.kvm8 : s.companies > 4 ? price.hostinger.kvm4 : price.hostinger.kvm2, database: 0 }),
  'T2h Hostinger VPS (São Paulo) + Neon Launch': (s) => ({
    compute: s.companies > 20 ? price.hostinger.kvm4 : price.hostinger.kvm2, database: neon(s, awakeHours.always) }),
  'T2m Magalu Cloud VM + Neon Launch': (s) => ({
    compute: s.companies > 20 ? price.magalu['bv4-8-100'] : s.companies > 4 ? price.magalu['bv4-8-10'] : price.magalu['bv2-8-10'], database: neon(s, awakeHours.always) }),
  'T2b GCP VM + Cloud SQL (credits)': (s) => ({
    compute: (s.vmApp === '4gb' ? price.gcp.e2medium : price.gcp.e2standard2 * (s.vmApp === '16gb' ? 2 : 1)) + 40 * price.gcp.diskPerGb + price.gcp.ipv4,
    database: price.cloudSql.g1small * (s.companies > 20 ? 2 : 1) + s.dbGb * price.cloudSql.storagePerGb }),
  'T2c one VM (Lightsail) + Supabase Pro with PITR': (s) => ({
    compute: price.lightsail[s.vmApp], database: price.supabase.pro + price.supabase.smallExtra + price.supabase.pitr7d }),
  'T3 refactored to idle: Cloud Run + Neon, both asleep off hours': (s) => {
    const seconds = awakeHours.businessHours * 3600, vcpu = s.companies > 20 ? 4 : s.companies > 4 ? 2 : 1, gib = vcpu * 2
    const builderIdle = (HOURS - awakeHours.businessHours) * 3600 * (price.cloudRun.idleVcpuSecond + 2 * price.cloudRun.idleGibSecond)
    return { compute: seconds * (vcpu * price.cloudRun.vcpuSecond + gib * price.cloudRun.gibSecond) + builderIdle,
      database: neon(s, awakeHours.businessHours) }
  },
}

// T4 assumes the refactors of section 9 (a lease row, jobs started from outside, Builder sessions rebuilt from
// storage, Git off the local disk). Awake hours grow with companies; CPU is busy 10% of the awake time.
const containers = (s) => {
  const c = price.containers, hours = Math.min(HOURS, awakeHours.businessHours * (s.companies > 20 ? 3 : s.companies > 4 ? 1.5 : 1))
  const sets = s.companies > 20 ? 3 : 1 // Hub, Builder and data service: 1 vCPU / 4 GiB / 8 GB plus 0.25 vCPU / 1 GiB / 4 GB
  const gibHours = sets * 5 * hours, vcpuSeconds = sets * 1.25 * hours * 3600 * 0.1, diskGbHours = sets * 12 * hours
  return Math.max(0, gibHours - c.includedGibHours) * 3600 * c.gibSecond + Math.max(0, vcpuSeconds - c.includedVcpuMinutes * 60) * c.vcpuSecond
    + Math.max(0, diskGbHours - c.includedDiskGbHours) * 3600 * c.diskGbSecond
}
topologies['T4 refactored to idle: all on Cloudflare (Containers) + Neon'] = (s) => ({ compute: containers(s),
  database: neon(s, Math.min(HOURS, awakeHours.businessHours * (s.companies > 20 ? 3 : s.companies > 4 ? 1.5 : 1))) })

const usd = (n) => `$${n.toFixed(0)}`
for (const s of scenarios) {
  const common = shared(s), commonTotal = Object.values(common).reduce((a, b) => a + b, 0)
  console.log(`\n## ${s.name}  (shared: ${Object.entries(common).map(([k, v]) => `${k} ${usd(v)}`).join(', ')})`)
  console.log('| Topology | Compute | Database | Shared | Total / month | R$ / month | Per company |')
  console.log('| --- | --- | --- | --- | --- | --- | --- |')
  for (const [name, fn] of Object.entries(topologies)) {
    const t = fn(s)
    if (!t) { console.log(`| ${name} | not viable at this size | | | | | |`); continue }
    const total = t.compute + t.database + commonTotal
    console.log(`| ${name} | ${usd(t.compute)} | ${usd(t.database)} | ${usd(commonTotal)} | **${usd(total)}** | R$${(total * BRL).toFixed(0)} | ${usd(total / s.companies)} |`)
  }
}
