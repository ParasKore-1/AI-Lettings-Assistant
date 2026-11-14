import { lazy, memo, Suspense } from 'react';
import { cn } from '../../../lib/utils';

/**
 * The Markdown stack (react-markdown + remark-gfm + rehype-sanitize, ~55 KB
 * gzipped) is only needed once a conversation has replies, so it's a separate
 * chunk. It's preloaded when the browser is idle; until it arrives the text is
 * shown as plain pre-wrapped text in the same typography, so nothing jumps.
 */
const load = () => import('./Markdown');
const MarkdownImpl = lazy(() => load().then((m) => ({ default: m.Markdown })));

let preloaded = false;
function preloadMarkdown() {
  if (preloaded) return;
  preloaded = true;
  void load();
}

if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
  idle(() => preloadMarkdown());
}

export const Markdown = memo(function Markdown(props: { text: string; streaming?: boolean; className?: string }) {
  return (
    <Suspense fallback={<div className={cn('kr-md whitespace-pre-wrap', props.className)}>{props.text}</div>}>
      <MarkdownImpl {...props} />
    </Suspense>
  );
});
