import { test, expect } from '@playwright/test'

test('API health check', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.status).toBe('ok')
})

test('SPA index loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/COMS/)
})
