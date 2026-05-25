import { expect, test } from '@playwright/test'

async function loginAsAlice(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/welcome back, alice anderson/i)).toBeVisible()
}

test.describe('deposit / withdraw', () => {
  test('deposit increases balance and appears at top of activity', async ({ page }) => {
    await loginAsAlice(page)

    const before = await readBalance(page)

    await page.getByLabel(/amount/i).fill('25.50')
    await page.getByLabel(/description/i).fill('e2e deposit')
    await page.getByRole('button', { name: /deposit funds/i }).click()

    await expect(page.getByText(/deposited \$25\.50/i)).toBeVisible()

    const after = await readBalance(page)
    expect(after - before).toBe(2550)

    // New row at the top of Recent activity.
    await expect(page.getByText('e2e deposit')).toBeVisible()
    await expect(page.getByText('+$25.50').first()).toBeVisible()
  })

  test('withdraw decreases balance', async ({ page }) => {
    await loginAsAlice(page)
    const before = await readBalance(page)

    await page.getByRole('button', { name: /^withdraw$/i }).click()
    await page.getByLabel(/amount/i).fill('10')
    await page.getByRole('button', { name: /withdraw funds/i }).click()

    await expect(page.getByText(/withdrew \$10/i)).toBeVisible()

    const after = await readBalance(page)
    expect(before - after).toBe(1000)
  })

  test('withdrawing more than the balance shows insufficient funds and leaves balance intact', async ({
    page,
  }) => {
    await loginAsAlice(page)
    const before = await readBalance(page)

    await page.getByRole('button', { name: /^withdraw$/i }).click()
    await page.getByLabel(/amount/i).fill('999999')
    await page.getByRole('button', { name: /withdraw funds/i }).click()

    await expect(page.getByText(/insufficient funds/i)).toBeVisible()

    const after = await readBalance(page)
    expect(after).toBe(before)
  })
})

// Reads the headline balance and returns it as integer cents.
async function readBalance(page: import('@playwright/test').Page): Promise<number> {
  // The balance node sits inside the gradient hero "$<balance_formatted>" — first
  // dollar-prefixed monospace block on the page.
  const raw = await page
    .locator('div.font-mono.text-4xl')
    .first()
    .innerText()
  // raw is like "$1250.00" or "$1,275.50"
  const cleaned = raw.replace(/[$,\s]/g, '')
  const cents = Math.round(parseFloat(cleaned) * 100)
  if (!Number.isFinite(cents)) throw new Error(`could not parse balance from ${JSON.stringify(raw)}`)
  return cents
}
