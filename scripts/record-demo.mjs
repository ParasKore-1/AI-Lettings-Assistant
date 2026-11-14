/**
 * Records docs/demo.gif from the running app (no ffmpeg needed):
 *   1. pnpm dev            (API on :8787 with seeded data, web on :5173)
 *   2. node scripts/record-demo.mjs [baseUrl]
 *
 * Drives a real conversation with Playwright, screenshots frames while the
 * reply streams, and encodes them with gifenc (pure JS).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const BASE = process.argv[2] ?? 'http://localhost:5173';
const WIDTH = 1000;
const HEIGHT = 640;
const FRAME_MS = 90;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme: 'light' });
await page.goto(BASE + '/');
await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).waitFor();

const frames = [];
const grab = async (repeat = 1) => {
  const png = PNG.sync.read(await page.screenshot());
  for (let i = 0; i < repeat; i++) frames.push(png);
};

await grab(10); // hold on the empty state
const box = page.getByRole('textbox', { name: 'Message Keyring' });
for (const ch of 'Book a viewing for Wrenfield Road') {
  await box.press(ch === ' ' ? 'Space' : ch);
  if (Math.random() < 0.5) await grab();
}
await box.press('Enter');

// Capture while the reply streams (Stop button visible), then hold the final frame.
const stop = page.getByRole('button', { name: 'Stop generating' });
await stop.waitFor({ timeout: 10_000 });
const started = Date.now();
while ((await stop.isVisible()) && Date.now() - started < 20_000) {
  await grab();
  await page.waitForTimeout(FRAME_MS);
}
await page.waitForTimeout(300);
await grab(18);
await browser.close();

const gif = GIFEncoder();
for (const frame of frames) {
  const palette = quantize(frame.data, 128);
  const index = applyPalette(frame.data, palette);
  gif.writeFrame(index, frame.width, frame.height, { palette, delay: FRAME_MS });
}
gif.finish();
mkdirSync('docs', { recursive: true });
writeFileSync('docs/demo.gif', gif.bytes());
console.info(`docs/demo.gif written: ${frames.length} frames, ${(gif.bytes().length / 1024 / 1024).toFixed(1)} MB`);
