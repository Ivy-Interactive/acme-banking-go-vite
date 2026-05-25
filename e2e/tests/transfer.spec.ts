import { expect, test } from '@playwright/test'

const BOB_ACCOUNT = 'ACME-1001-4521'

async function login(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/')
  await page.getByLabel(/username/i).fill(username)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
}

async function logout(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /sign out/i }).click()
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
}

test('transfer from alice → bob debits sender, credits recipient, both ledgers recorded', async ({
  page,
}) => {
  // 1) Alice sends $100 to bob's account.
  await login(page, 'alice', 'password')
  await expect(page.getByText(/welcome back, alice anderson/i)).toBeVisible()
  const aliceBefore = await readBalance(page)

  await page.getByRole('button', { name: /^transfer$/i }).click()
  await page.getByLabel(/recipient account/i).fill(BOB_ACCOUNT)
  await page.getByLabel(/amount/i).fill('100')
  await page.getByLabel(/description/i).fill('e2e transfer')
  await page.getByRole('button', { name: /send transfer/i }).click()

  await expect(page.getByText(/sent \$100 to bob bennett/i)).toBeVisible()

  const aliceAfter = await readBalance(page)
  expect(aliceBefore - aliceAfter).toBe(10000)

  await expect(page.getByText('e2e transfer').first()).toBeVisible()
  await expect(page.getByText(/^Transfer out · Bob Bennett/).first()).toBeVisible()
  await expect(page.getByText('-$100.00').first()).toBeVisible()

  // 2) Switch to bob and verify the paired transfer_in row.
  await logout(page)
  await login(page, 'bob', 'password')
  await expect(page.getByText(/welcome back, bob bennett/i)).toBeVisible()

  await expect(page.getByText('e2e transfer').first()).toBeVisible()
  await expect(page.getByText(/^Transfer in · Alice Anderson/).first()).toBeVisible()
  await expect(page.getByText('+$100.00').first()).toBeVisible()
})

async function readBalance(page: import('@playwright/test').Page): Promise<number> {
  const raw = await page.locator('div.font-mono.text-4xl').first().innerText()
  const cleaned = raw.replace(/[$,\s]/g, '')
  const cents = Math.round(parseFloat(cleaned) * 100)
  if (!Number.isFinite(cents)) throw new Error(`could not parse balance from ${JSON.stringify(raw)}`)
  return cents
}
