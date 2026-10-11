import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Discord id').fill('123456789012345678')
  await page.getByRole('button', { name: 'Dev login' }).click()
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()
})

for (const [label, heading] of [
  ['Overview', 'Overview'],
  ['Chat', 'Chat'],
  ['Guild', 'Guild'],
  ['Lists', 'Lists'],
  ['Features', 'Features'],
  ['Settings', 'Accounts'],
  ['Audit', 'Audit']
] as const) {
  test(`${label} page loads`, async ({ page }) => {
    await page.getByRole('link', { name: label }).click()
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  })
}

test('saving relay settings round-trips', async ({ page }) => {
  await page.goto('/settings/relay')
  await page.getByRole('switch', { name: 'Officer' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved')).toBeVisible()
})

test('live chat shows the streamed line', async ({ page }) => {
  await page.goto('/chat')
  await expect(page.getByText('hello from the fake bridge')).toBeVisible()
})
