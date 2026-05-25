import { expect, test } from '@playwright/test'

test.describe('authentication', () => {
  test('logs in, persists session across reload, logs out', async ({ page }) => {
    await page.goto('/')

    // Defaults are pre-filled to alice / password.
    await expect(page.getByLabel(/username/i)).toHaveValue('alice')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByText(/welcome back, alice anderson/i)).toBeVisible()
    // Hero balance — first .font-mono.text-4xl on the page; avoids matching the
    // opening-deposit tx row which is also $1250.00.
    await expect(page.locator('div.font-mono.text-4xl').first()).toHaveText('$1250.00')
    await expect(page.getByText('Opening deposit')).toBeVisible()

    // Reload: token persisted in localStorage.
    await page.reload()
    await expect(page.getByText(/welcome back, alice anderson/i)).toBeVisible()

    // Sign out → back to login.
    await page.getByRole('button', { name: /sign out/i }).click()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('shows an error for wrong credentials', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel(/password/i).fill('definitely-wrong')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid username or password/i)).toBeVisible()
  })
})
