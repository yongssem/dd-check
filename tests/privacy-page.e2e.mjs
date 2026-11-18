import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const base = process.env.PRIVACY_TEST_URL || 'http://127.0.0.1:4193'
let browser
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }) })
after(async () => { await browser?.close() })
test('public privacy notice is readable without app storage, login or external requests', async () => {
  const context = await browser.newContext()
  const external = []
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(base).origin) { external.push(route.request().url()); return route.abort() }
    return route.continue()
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(window, key, { get() { throw Error('privacy notice read private storage') } })
    window.fetch = () => { throw Error('privacy notice sent an API request') }
  })
  const response = await page.goto(base + '/privacy.html')
  assert.equal(response.status(), 200, 'public notice must exist as its own page')
  await page.waitForLoadState('networkidle')
  assert.match((await page.locator('h1').allTextContents()).join(' '), /뚝딱체크.*개인정보/, 'privacy title must not be a SPA login fallback')
  assert.equal(await page.locator('script').count(), 0)
  assert.equal(await page.locator('main').count(), 1)
  assert.ok(await page.locator('h2').count() >= 9)
  assert.equal(await page.locator('input,form').count(), 0)
  assert.equal(external.length, 0, 'reading the notice never calls an external service')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  if (process.env.PRIVACY_SCREENSHOT_DIR) {
    await mkdir(process.env.PRIVACY_SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(process.env.PRIVACY_SCREENSHOT_DIR, 'check-privacy-mobile.png'), fullPage: true })
  }
  await context.close()
})
test('privacy link opens separately and leaves the existing app controls and stored fixture unchanged', async () => {
  const context = await browser.newContext()
  if ('check' === 'check') {
    const { emptyData } = await import('../js/core.mjs')
    const seed = emptyData()
    seed.students.push({ id: 'privacy-virtual', number: 1, name: '가상학생' })
    await context.addInitScript(seed => { if (!localStorage.getItem('ddcheck_data')) localStorage.setItem('ddcheck_data', JSON.stringify(seed)) }, seed)
  }
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.goto(base + ('check' === 'vacation' ? '/today?demo=1' : '/'))
  await page.waitForLoadState('networkidle')
  const controls = await page.locator('button').allTextContents()
  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))
  const url = page.url()
  const link = page.locator('footer a[href="/privacy.html"]')
  assert.equal(await link.count(), 1, 'existing footer needs one separate privacy link')
  const opened = context.waitForEvent('page')
  await link.click()
  const notice = await opened
  await notice.waitForLoadState('networkidle')
  assert.match((await notice.locator('h1').allTextContents()).join(' '), /뚝딱체크.*개인정보/)
  await notice.close()
  assert.equal(page.url(), url)
  assert.deepEqual(await page.locator('button').allTextContents(), controls)
  assert.equal(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))), stored)
  if ('check' === 'vacation') {
    await page.goto(base + '/?demo=0')
    await page.waitForLoadState('networkidle')
    assert.equal(await page.locator('footer a[href="/privacy.html"]').count(), 1, 'public landing also exposes the notice')
  }
  await context.close()
})
