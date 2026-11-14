import { expect, test } from '@playwright/test';
import { composer, lastReply, waitForReplyToFinish } from './helpers';

test('mobile: suggestion → streamed reply → drawer navigation', async ({ page }) => {
  await page.goto('/');

  // Sidebar is a drawer on small screens.
  await expect(page.getByRole('navigation', { name: 'Chats' })).toBeHidden();

  await page.getByRole('button', { name: 'What deposit protection rules apply?' }).click();
  await expect(page).toHaveURL(/\/c\//);
  await waitForReplyToFinish(page);
  await expect(lastReply(page)).toContainText('Tenancy deposit protection');

  // No horizontal overflow at phone width (tables scroll inside their own wrapper).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Composer stays reachable and usable.
  await expect(composer(page)).toBeInViewport();

  await page.getByRole('button', { name: 'Open chats menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Chats menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Deposit protection rules' }).first()).toBeVisible();
  await drawer.getByRole('button', { name: /^New chat/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog', { name: 'Chats menu' })).toBeHidden();
});
