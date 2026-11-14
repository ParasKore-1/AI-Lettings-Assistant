import { expect, type Page } from '@playwright/test';

export const API = 'http://localhost:8788';

export async function setDebug(page: Page, mode: string) {
  const res = await page.request.post(`${API}/api/debug`, { data: { mode, once: true } });
  expect(res.ok()).toBeTruthy();
}

export function composer(page: Page) {
  return page.getByRole('textbox', { name: 'Message Keyring' });
}

export async function sendMessage(page: Page, text: string) {
  const box = composer(page);
  await box.fill(text);
  await box.press('Enter');
}

/** The newest assistant reply in the visible thread. */
export function lastReply(page: Page) {
  return page.getByRole('article', { name: 'Keyring' }).last();
}

export async function waitForReplyToFinish(page: Page) {
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
}
