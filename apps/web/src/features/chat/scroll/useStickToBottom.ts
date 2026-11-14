import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { distanceFromBottom, nextPinned, SCROLL_KEYS, USER_INTENT_WINDOW_MS } from './stickToBottom';

/**
 * Keeps a scroll container stuck to the bottom while its content grows, but
 * only if the user is already near the bottom. Content growth is observed with
 * a ResizeObserver on the inner element, so it works with virtualised lists
 * whose height changes as rows are measured.
 */
export function useStickToBottom(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  resetKey: string,
) {
  const [pinned, setPinnedState] = useState(true);
  const pinnedRef = useRef(true);
  const lastIntent = useRef(0);

  const setPinned = useCallback((value: boolean) => {
    pinnedRef.current = value;
    setPinnedState(value);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current;
      if (!el) return;
      setPinned(true);
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [scrollRef, setPinned],
  );

  // New conversation → start pinned at the bottom.
  useLayoutEffect(() => {
    setPinned(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [resetKey, scrollRef, setPinned]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const markIntent = () => {
      lastIntent.current = performance.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key) && e.target === el) markIntent();
    };
    const onScroll = () => {
      const userInitiated = performance.now() - lastIntent.current < USER_INTENT_WINDOW_MS;
      const next = nextPinned({ pinned: pinnedRef.current, distance: distanceFromBottom(el), userInitiated });
      if (next !== pinnedRef.current) setPinned(next);
    };
    el.addEventListener('wheel', markIntent, { passive: true });
    el.addEventListener('touchmove', markIntent, { passive: true });
    el.addEventListener('pointerdown', markIntent, { passive: true }); // scrollbar drags
    el.addEventListener('keydown', onKey);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', markIntent);
      el.removeEventListener('touchmove', markIntent);
      el.removeEventListener('pointerdown', markIntent);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef, setPinned]);

  // Follow content growth while pinned.
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el) return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    ro.observe(el); // viewport resizes too (mobile keyboard, window resize)
    return () => ro.disconnect();
  }, [contentRef, scrollRef]);

  return { pinned, scrollToBottom, pinnedRef };
}
