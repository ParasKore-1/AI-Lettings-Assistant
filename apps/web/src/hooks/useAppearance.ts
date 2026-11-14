import { useEffect } from 'react';
import { resolveTheme, useSettings } from '../stores/settings';

/** Applies theme / font size / motion preferences to <html>, following the OS when set to "system". */
export function useAppearance() {
  const theme = useSettings((s) => s.theme);
  const fontSize = useSettings((s) => s.fontSize);
  const motion = useSettings((s) => s.motion);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved = resolveTheme(theme);
      root.dataset.theme = resolved;
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((m) => (m.content = resolved === 'dark' ? '#121413' : '#f7f7f5'));
    };
    apply();
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);
}

/**
 * Mobile keyboards shrink the *visual* viewport but not the layout viewport on
 * iOS. Mirroring visualViewport.height into --kr-vvh keeps the composer above
 * the keyboard; the root element is sized with it (see index.css).
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--kr-vvh', `${Math.round(vv.height)}px`);
        // iOS scrolls the layout viewport when focusing inputs; pin it back.
        if (window.scrollY !== 0 && vv.height < window.innerHeight) window.scrollTo(0, 0);
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kr-vvh');
    };
  }, []);
}
