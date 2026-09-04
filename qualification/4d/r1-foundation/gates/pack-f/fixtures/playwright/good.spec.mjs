import { expect, test } from '@playwright/test'
test('green browser gate', async ({ page }) => {
  await page.setContent('<h1>green</h1>')
  await expect(page.getByRole('heading')).toHaveText('green')
})
