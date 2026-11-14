import type { HighlighterCore, LanguageInput } from 'shiki/core';

/**
 * Fine-grained Shiki: core + the JavaScript regex engine (no WASM) + a handful
 * of grammars, each loaded on first use. Everything here is a lazy chunk, so
 * none of it is in the initial bundle.
 */
const LANG_LOADERS: Record<string, () => LanguageInput> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  csv: () => import('shiki/langs/csv.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
};

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  md: 'markdown',
  py: 'python',
};

export function resolveLanguage(lang: string | undefined): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase();
  const id = ALIASES[key] ?? key;
  return id in LANG_LOADERS ? id : null;
}

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]);
    return createHighlighterCore({
      // The *-default variants keep every token ≥ 4.5:1 on our code backgrounds (checked with axe).
      themes: [import('shiki/themes/github-light-default.mjs'), import('shiki/themes/github-dark-default.mjs')],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  })();
  return highlighter;
}

const cache = new Map<string, string>();

/**
 * Returns Shiki HTML for `code`, or null for unknown languages. Shiki escapes
 * the code text itself; its output contains only <pre>/<code>/<span> with
 * style attributes, which is why this is the one place we inject HTML.
 */
export async function highlight(code: string, lang: string | undefined): Promise<string | null> {
  const id = resolveLanguage(lang);
  if (!id) return null;
  const key = `${id}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = await getHighlighter();
  if (!h.getLoadedLanguages().includes(id)) await h.loadLanguage(LANG_LOADERS[id]!());
  const html = h.codeToHtml(code, {
    lang: id,
    themes: { light: 'github-light-default', dark: 'github-dark-default' },
    defaultColor: false,
  });
  if (cache.size > 200) cache.clear();
  cache.set(key, html);
  return html;
}
