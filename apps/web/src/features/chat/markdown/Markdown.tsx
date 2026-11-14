import { memo, useMemo, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { safeUrl } from '../../../lib/safeUrl';
import { cn } from '../../../lib/utils';
import { CodeBlock } from './CodeBlock';
import { splitMarkdownBlocks } from './splitBlocks';

/*
 * XSS model (see DECISIONS.md):
 * 1. Raw HTML is never parsed into elements (no rehype-raw); a remark plugin
 *    turns it into text so `<script>` / `<img onerror>` are shown verbatim.
 * 2. rehype-sanitize (GitHub's schema, tightened) runs anyway as defence in depth.
 * 3. URLs pass through react-markdown's urlTransform, which drops `javascript:`,
 *    `vbscript:` and `data:` schemes; we additionally only allow http(s)/mailto/#.
 * 4. Links open in a new tab with rel="noopener noreferrer nofollow".
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => !['img', 'picture', 'source', 'input'].includes(t)),
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'] },
};


type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };

function textOf(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function makeComponents(streaming: boolean): Components {
  return {
    a: ({ href, children, node: _node, ...rest }) => {
      const url = safeUrl(href ?? '');
      if (!url) return <span className="text-fg-muted">{children}</span>;
      const external = !url.startsWith('#') && !url.startsWith('/');
      return (
        <a
          {...rest}
          href={url}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        >
          {children}
          {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      );
    },
    pre: ({ node }) => {
      const codeEl = (node as HastNode | undefined)?.children?.find((c) => c.tagName === 'code');
      const className = codeEl?.properties?.['className'];
      const classes = Array.isArray(className) ? className.map(String) : [];
      const lang = classes.find((c) => c.startsWith('language-'))?.slice('language-'.length);
      const code = textOf(codeEl).replace(/\n$/, '');
      return <CodeBlock code={code} lang={lang} streaming={streaming} />;
    },
    table: ({ node: _node, ...rest }) => (
      <div className="kr-scroll my-3 overflow-x-auto rounded-xl border border-border">
        <table {...rest} />
      </div>
    ),
    img: () => null,
  };
}

const STATIC_COMPONENTS = makeComponents(false);
const STREAMING_COMPONENTS = makeComponents(true);
type MdNode = { type: string; value?: string; children?: MdNode[] };

/** Turns raw HTML in model output into plain text nodes: shown verbatim, never parsed. */
function remarkHtmlAsText() {
  const walk = (node: MdNode) => {
    if (node.type === 'html') node.type = 'text';
    node.children?.forEach(walk);
  };
  return (tree: MdNode) => walk(tree);
}

const REMARK = [remarkGfm, remarkHtmlAsText];
const REHYPE: ComponentProps<typeof ReactMarkdown>['rehypePlugins'] = [[rehypeSanitize, sanitizeSchema]];

const MarkdownBlock = memo(function MarkdownBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK}
      rehypePlugins={REHYPE}
      components={streaming ? STREAMING_COMPONENTS : STATIC_COMPONENTS}
      urlTransform={safeUrl}
    >
      {text}
    </ReactMarkdown>
  );
});

/**
 * Renders model Markdown safely. Blocks are memoised individually: while a
 * reply streams, only the last block re-renders.
 */
export const Markdown = memo(function Markdown({
  text,
  streaming = false,
  className,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  const blocks = useMemo(() => splitMarkdownBlocks(text), [text]);
  return (
    <div className={cn('kr-md', className)}>
      {blocks.map((block, i) => (
        // Only the last block can still be growing; earlier ones are final.
        <MarkdownBlock key={i} text={block} streaming={streaming && i === blocks.length - 1} />
      ))}
    </div>
  );
});
