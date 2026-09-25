// Signs one disposable Keycloak user into an application on the pilot and records where the browser
// lands: every main-frame navigation request on the way (redirects included), the final URL, and the
// page's heading and text. It also records whether the user's email, username or Keycloak subject
// appears in any of those URLs or in the page.
//
//   PILOT230_PASSWORD=… node scripts/issue-230-no-access-proof.mjs \
//     --case <name> --username <user> --email <email> --subject <keycloak id> --app <slug> --out <record.json>
//   node scripts/issue-230-no-access-proof.mjs --self-check
import { deepStrictEqual } from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const APPLICATION_PORT = 3445
const WAIT_MS = 60 * 1000

// A URL with every query value blanked except `reason`, so the record keeps no state, code or handoff.
const shape = (href) => {
  const url = new URL(href)
  const query = [...url.searchParams].map(([key, value]) => (key === 'reason' ? `${key}=${value}` : `${key}=…`)).join('&')
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`
}

// Percent-decodes until stable, so an identifier nested in an encoded redirect URL is still found.
const decoded = (href) => {
  let current = href
  for (let round = 0; round < 3; round += 1) {
    let next
    try { next = decodeURIComponent(current) } catch { return current }
    if (next === current) return current
    current = next
  }
  return current
}

const findLeaks = ({ values, navigations, html }) => values.flatMap((value) => [
  ...navigations.filter((url) => decoded(url).toLowerCase().includes(value.toLowerCase())).map((url) => ({ value, in: shape(url) })),
  ...(html.toLowerCase().includes(value.toLowerCase()) ? [{ value, in: 'page' }] : []),
])

if (process.argv.includes('--self-check')) {
  const email = 'someone@example.invalid'
  deepStrictEqual(findLeaks({
    values: [email],
    navigations: [
      'https://hub.example/callback?code=secret-code&state=secret-state&login_hint=someone%40example.invalid',
      'https://hub.example/auth?redirect_uri=https%3A%2F%2Fapp.example%2Fcb%3Fu%3Dsomeone%2540example.invalid',
      'https://app.example/__conexus/no-access?reason=EMAIL_NOT_VERIFIED',
      'https://app.example/%E0%A4%A',
    ],
    html: '<p>Contact someone@example.invalid</p>',
  }), [
    { value: email, in: 'https://hub.example/callback?code=…&state=…&login_hint=…' },
    { value: email, in: 'https://hub.example/auth?redirect_uri=…' },
    { value: email, in: 'page' },
  ])
  console.log('self-check passed')
  process.exit(0)
}

const argument = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
const [name, username, email, subject, slug, out] =
  ['--case', '--username', '--email', '--subject', '--app', '--out'].map(argument)
const password = process.env.PILOT230_PASSWORD
if (!name || !username || !email || !subject || !slug || !out || !password) {
  console.error('usage: PILOT230_PASSWORD=… issue-230-no-access-proof.mjs --case <name> --username <user> --email <email> --subject <id> --app <slug> --out <record.json>')
  process.exit(2)
}

const origin = `https://${slug}.conexus.localhost:${APPLICATION_PORT}`
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const navigations = []
page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url()) })
let noAccessStatus
page.on('response', (response) => {
  if (response.request().isNavigationRequest() && new URL(response.url()).pathname === '/__conexus/no-access') noAccessStatus = response.status()
})

try {
  await page.goto(`${origin}/`)
  await page.waitForSelector('input[name="username"]', { timeout: WAIT_MS })
  await page.fill('input[name="username"]', username)
  await page.fill('input[name="password"]', password)
  await page.locator('input[name="password"]').press('Enter')
  await page.waitForURL((url) => url.origin === origin && url.pathname === '/__conexus/no-access', { timeout: WAIT_MS })
  const heading = (await page.locator('h1').innerText()).trim()
  const text = (await page.locator('main p').innerText()).trim()
  const html = await page.content()
  const finalUrl = page.url()
  const leaks = findLeaks({ values: [email, username, subject], navigations, html })
  const record = {
    case: name,
    at: new Date().toISOString(),
    finalUrl,
    status: noAccessStatus,
    heading,
    text,
    navigations: navigations.map(shape),
    leaks,
  }
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`)
  console.log(JSON.stringify(record, null, 2))
  if (leaks.length > 0) process.exitCode = 1
} finally {
  await browser.close()
}
