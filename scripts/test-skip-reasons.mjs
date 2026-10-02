// A skipped test passes the verify graph only with a reason that starts with OPT_IN. A quarantined
// test is skipped with a reason that starts with QUARANTINED, and tests/quarantine.json must list it.
export const OPT_IN = 'opt-in:'
export const QUARANTINED = `${OPT_IN} quarantined`
