import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sendMessage, waitForReplyToFinish } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`,
  );
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('keyring:settings', JSON.stringify({ state: { theme: t }, version: 1 }));
      }, theme);
    });

    test('empty state has no axe violations', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
      await audit(page, `home (${theme})`);
    });

    test('a conversation with markdown, cards and actions has no axe violations', async ({ page }) => {
      await page.goto('/');
      await sendMessage(page, 'Book a viewing for Wrenfield Road');
      await waitForReplyToFinish(page);
      await audit(page, `chat (${theme})`);
    });

    test('playground (every component state) has no axe violations', async ({ page }) => {
      await page.goto('/playground');
      await expect(page.getByRole('heading', { name: 'Component playground' })).toBeVisible();
      await audit(page, `playground (${theme})`);
    });
  });
}
