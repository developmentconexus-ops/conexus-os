// A skipped test passes the verify graph only with a reason that starts with OPT_IN. A quarantined
// test is skipped with a reason that starts with QUARANTINED, and only tests/quarantine.json decides
// which tests are quarantined: tests/support/quarantine.mjs derives the skip from it, and
// scripts/check-test-skips.mjs refuses a quarantined skip that has no live entry.
export const OPT_IN = 'opt-in:'
export const QUARANTINED = `${OPT_IN} quarantined`

// today is YYYY-MM-DD. The reason of the live entry for "<file>:<name>", or false when there is none.
export const quarantineReason = (entries, file, name, today) => {
  const entry = entries.find((candidate) => candidate.test === `${file}:${name}` && candidate.until >= today)
  return entry ? `${QUARANTINED}, see #${entry.issue} until ${entry.until}` : false
}
