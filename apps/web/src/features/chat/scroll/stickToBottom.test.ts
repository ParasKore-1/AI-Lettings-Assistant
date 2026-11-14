import { describe, expect, it } from 'vitest';
import { distanceFromBottom, NEAR_BOTTOM_PX, nextPinned } from './stickToBottom';

describe('distanceFromBottom', () => {
  it('measures the gap below the viewport', () => {
    expect(distanceFromBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(0);
    expect(distanceFromBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 400 })).toBe(500);
  });
});

describe('nextPinned', () => {
  it('re-pins whenever the viewport is near the bottom', () => {
    expect(nextPinned({ pinned: false, distance: NEAR_BOTTOM_PX, userInitiated: true })).toBe(true);
    expect(nextPinned({ pinned: false, distance: 0, userInitiated: false })).toBe(true);
  });

  it('unpins when the user scrolls up away from the bottom', () => {
    expect(nextPinned({ pinned: true, distance: 400, userInitiated: true })).toBe(false);
  });

  it('stays pinned when content grows (layout-driven scroll, no user input)', () => {
    // Streaming text added 300px below the fold; the scroll event came from layout.
    expect(nextPinned({ pinned: true, distance: 300, userInitiated: false })).toBe(true);
  });

  it('stays unpinned while the user reads history even as new tokens arrive', () => {
    expect(nextPinned({ pinned: false, distance: 1200, userInitiated: false })).toBe(false);
  });
});
