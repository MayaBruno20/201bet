import { expect, test } from '@playwright/test';

test.describe('201bet frontend smoke', () => {
  test('home loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page shows form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /entrar na plataforma/i })).toBeVisible();
    await expect(page.getByPlaceholder('E-mail')).toBeVisible();
  });

  test('apostas page loads board or message', async ({ page }) => {
    await page.goto('/apostas');
    await expect(page.locator('body')).toBeVisible();
  });
});
