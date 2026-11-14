import { Check, Copy } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { cn, copyText } from '../../../lib/utils';
import { highlight, resolveLanguage } from './highlighter';

/**
 * Fenced code with a language label and copy button. While the parent reply
 * is still streaming we render plain text (cheap, and the code is still
 * changing); highlighting runs once the block is final.
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  lang,
  streaming = false,
}: {
  code: string;
  lang?: string | undefined;
  streaming?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const known = resolveLanguage(lang) !== null;

  useEffect(() => {
    if (streaming || !known) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    highlight(code, lang)
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, streaming, known]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="kr-code group/code my-3 overflow-hidden rounded-xl border border-border bg-code">
      <div className="flex h-9 items-center justify-between border-b border-border pr-1.5 pl-3.5">
        <span className="font-mono text-xs text-fg-subtle">{lang || 'text'}</span>
        <button
          type="button"
          onClick={async () => setCopied(await copyText(code))}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg"
          aria-label={copied ? 'Copied code' : 'Copy code'}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {html ? (
        <div
          className="kr-shiki kr-scroll overflow-x-auto px-4 py-3 font-mono text-[0.84rem] leading-relaxed [&_pre]:!bg-transparent"
          // Shiki output: escaped code wrapped in <pre>/<span style>. See DECISIONS.md (XSS).
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className={cn('kr-scroll overflow-x-auto px-4 py-3 font-mono text-[0.84rem] leading-relaxed')}>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});
