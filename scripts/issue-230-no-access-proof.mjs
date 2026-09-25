// Signs one disposable Keycloak user into an application on the pilot and records where the browser
// lands: every main-frame navigation request on the way (redirects included), the final URL, and the
// page's heading and text. It also records whether the user's email, username or Keycloak subject
// appears in any of those URLs or in the page.
//
//   PILOT230_PASSWORD=… node scripts/issue-230-no-access-proof.mjs \
//     --case <name> --username <user> --email <email> --subject <keycloak id> --app <slug> --out <record.json>
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const APPLICATION_PORT = 3445
const WAIT_MS = 60 * 1000

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

// A URL with every query value blanked except `reason`, so the record keeps no state, code or handoff.
const shape = (href) => {
  const url = new URL(href)
  const query = [...url.searchParams].map(([key, value]) => (key === 'reason' ? `${key}=${value}` : `${key}=…`)).join('&')
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`
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
  const leaks = [email, username, subject].flatMap((value) => [
    ...navigations.filter((url) => url.toLowerCase().includes(value.toLowerCase())).map((url) => ({ value, in: url })),
    ...(html.toLowerCase().includes(value.toLowerCase()) ? [{ value, in: 'page' }] : []),
  ])
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
