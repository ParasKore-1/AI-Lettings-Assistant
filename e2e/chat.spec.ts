import { expect, test } from '@playwright/test';
import { composer, lastReply, sendMessage, setDebug, waitForReplyToFinish } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(composer(page)).toBeVisible();
});

test('send → streamed reply → stop → continue → regenerate', async ({ page }) => {
  await sendMessage(page, 'Explain the renting journey in detail');

  // URL switches to the new conversation immediately (optimistic create).
  await expect(page).toHaveURL(/\/c\/c_[0-9a-f]+$/);
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  await expect(lastReply(page)).toContainText('The renting journey');

  // Stop mid-stream: partial text stays, status shows "Stopped".
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(lastReply(page).getByText('Stopped')).toBeVisible();
  const partial = await lastReply(page).innerText();
  expect(partial.length).toBeGreaterThan(20);
  await expect(composer(page)).toBeFocused();

  // Continue resumes the same reply where it stopped.
  await lastReply(page).getByRole('button', { name: 'Continue' }).click();
  await waitForReplyToFinish(page);
  await expect(lastReply(page)).toContainText('Which stage are you at?');

  // Regenerate creates a sibling reply and shows the branch switcher.
  await lastReply(page).hover();
  await lastReply(page).getByRole('button', { name: 'Regenerate reply' }).click();
  await waitForReplyToFinish(page);
  await expect(lastReply(page).getByRole('group', { name: 'Response' })).toContainText('2 / 2');
  await lastReply(page).getByRole('button', { name: 'Previous response' }).click();
  await expect(lastReply(page).getByRole('group', { name: 'Response' })).toContainText('1 / 2');

  // Sidebar got the auto-generated title.
  await expect(page.getByRole('navigation', { name: 'Chats' }).getByRole('link', { name: /Explain the renting journey/ })).toBeVisible();
});

test('network drop mid-stream keeps partial text and Retry resumes it', async ({ page }) => {
  await setDebug(page, 'fail_mid_stream');
  await sendMessage(page, 'What deposit protection rules apply?');

  const alert = page.getByRole('alert').filter({ hasText: 'Connection lost mid-reply' });
  await expect(alert).toBeVisible();
  const partial = await lastReply(page).locator('.kr-md').first().innerText();
  expect(partial.length).toBeGreaterThan(10);

  await alert.getByRole('button', { name: 'Retry' }).click();
  await waitForReplyToFinish(page);
  await expect(alert).toBeHidden();
  await expect(lastReply(page)).toContainText('Quick worked example');
  // The resumed reply still starts with the text received before the drop.
  expect((await lastReply(page).innerText()).replace(/\s+/g, ' ')).toContain(partial.replace(/\s+/g, ' ').slice(0, 40));
});

test('rate limiting shows a countdown before retry is allowed', async ({ page }) => {
  await setDebug(page, 'rate_limit');
  await sendMessage(page, 'Hello');
  const alert = page.getByRole('alert').filter({ hasText: 'Slow down a little' });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: /Retry in \d+s/ })).toBeDisabled();
});

test('edit-and-resend branches the conversation', async ({ page }) => {
  await sendMessage(page, 'Hello');
  await waitForReplyToFinish(page);
  const userMsg = page.getByRole('article', { name: 'You' }).last();
  await userMsg.hover();
  await userMsg.getByRole('button', { name: 'Edit message' }).click();
  const editor = page.getByRole('textbox', { name: 'Edit your message' });
  await editor.fill('What deposit protection rules apply?');
  await editor.press('Enter');
  await waitForReplyToFinish(page);
  await expect(lastReply(page)).toContainText('Tenancy deposit protection');
  await expect(page.getByRole('article', { name: 'You' }).last().getByRole('group', { name: 'Edit' })).toContainText('2 / 2');
});

test('model output containing HTML/JS is rendered inert', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await sendMessage(page, 'Show me raw HTML with an XSS script tag');
  await waitForReplyToFinish(page);
  await expect(lastReply(page)).toContainText('<script>');
  expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
  expect(dialogs).toEqual([]);
  await expect(lastReply(page).locator('script, iframe, img[onerror]')).toHaveCount(0);
  const safe = lastReply(page).getByRole('link', { name: /GOV\.UK renting guidance/ });
  await expect(safe).toHaveAttribute('target', '_blank');
  await expect(safe).toHaveAttribute('rel', /noopener/);
});

test('tool cards render and "Book viewing" sends a follow-up', async ({ page }) => {
  await sendMessage(page, 'Find me a 2-bed flat in Bristol');
  await waitForReplyToFinish(page);
  const cards = lastReply(page).getByRole('article', { name: /per month/ });
  await expect(cards.first()).toBeVisible();
  await cards.first().getByRole('button', { name: 'Book viewing' }).click();
  await waitForReplyToFinish(page);
  const picker = lastReply(page).getByRole('radiogroup');
  await expect(picker).toBeVisible();
  await picker.getByRole('radio', { disabled: false }).first().click();
  await lastReply(page).getByRole('button', { name: 'Request this time' }).click();
  await waitForReplyToFinish(page);
  await expect(page.getByRole('article', { name: 'You' }).last()).toContainText('Please request the viewing');
});

test('rename and delete with undo from the sidebar', async ({ page }) => {
  await sendMessage(page, 'What deposit protection rules apply?');
  await waitForReplyToFinish(page);
  const nav = page.getByRole('navigation', { name: 'Chats' });
  const item = nav.getByRole('link', { name: 'Deposit protection rules' }).first();
  await expect(item).toBeVisible();

  await nav.getByRole('button', { name: 'Options for Deposit protection rules' }).first().click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = nav.getByRole('textbox', { name: 'Rename chat' });
  await input.fill('My deposit question');
  await input.press('Enter');
  await expect(nav.getByRole('link', { name: 'My deposit question' })).toBeVisible();

  await nav.getByRole('button', { name: 'Options for My deposit question' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(nav.getByRole('link', { name: 'My deposit question' })).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(nav.getByRole('link', { name: 'My deposit question' })).toBeVisible();

  // Survives a reload (restored on the server, not just in the cache).
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Chats' }).getByRole('link', { name: 'My deposit question' })).toBeVisible();
});

test('keyboard: Cmd/Ctrl+K focuses search, shortcuts dialog opens with ?', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('searchbox', { name: 'Search chats' })).toBeFocused();
  await page.locator('body').click();
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).click();
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
});
