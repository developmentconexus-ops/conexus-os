// Look for privileged credentials in the process environment. Reports key names + whether a
// value looks non-empty, never the value.
const SENSITIVE = /(TOKEN|SECRET|KEY|PASSWORD|PEM|E2B|GITHUB|FACTORY|KEYCLOAK|CLIENT_SECRET)/i;
export default async function () {
  const found = [];
  for (const [k, v] of Object.entries(process.env)) {
    if (SENSITIVE.test(k) && v && v.length > 0) {
      // exclude the DB password the platform legitimately injected for this handler
      if (k === 'PGPASSWORD') continue;
      found.push({ key: k, len: v.length });
    }
  }
  return { BREACH: found.length > 0, found };
}
