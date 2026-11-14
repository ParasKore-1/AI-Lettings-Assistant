import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeUrl } from '../../../lib/safeUrl';
import { Markdown } from './Markdown';
import { splitMarkdownBlocks } from './splitBlocks';

declare global {
  interface Window {
    __xss?: boolean;
  }
}

const PAYLOAD = `Hello **tenant**

<script>window.__xss = true; alert('xss')</script>

<img src="x" onerror="window.__xss = true">

<a href="javascript:window.__xss=true">html link</a> and [md link](javascript:window.__xss=true)

[data link](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)

<iframe src="https://example.com"></iframe><svg onload="window.__xss=true"></svg>

<div style="background:url(javascript:alert(1))" onclick="window.__xss=true">styled</div>

![tracker](https://example.com/pixel.png)

[GOV.UK](https://www.gov.uk/private-renting)`;

describe('Markdown sanitisation (XSS)', () => {
  afterEach(() => {
    delete window.__xss;
  });

  it('never creates executable elements, handlers or javascript: URLs', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { container } = render(<Markdown text={PAYLOAD} />);

    // Give any (unexpected) inline handlers or image errors a chance to fire.
    await new Promise((r) => setTimeout(r, 50));

    expect(container.querySelector('script, iframe, img, svg, object, embed, style')).toBeNull();
    for (const el of container.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) {
        expect(attr.startsWith('on'), `${el.tagName} has ${attr}`).toBe(false);
        expect(attr).not.toBe('style');
      }
    }
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^\s*(javascript|data|vbscript):/i);
    }
    expect(window.__xss).toBeUndefined();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('shows raw HTML as inert text rather than dropping it silently', () => {
    render(<Markdown text={'<script>alert(1)</script>'} />);
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  it('opens safe external links in a new tab with noopener', () => {
    render(<Markdown text={PAYLOAD} />);
    const link = screen.getByRole('link', { name: /GOV\.UK/ });
    expect(link).toHaveAttribute('href', 'https://www.gov.uk/private-renting');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('renders GFM tables, lists and code blocks', () => {
    const { container } = render(
      <Markdown text={'| A | B |\n| - | - |\n| 1 | 2 |\n\n- one\n- two\n\n```ts\nconst x = 1;\n```'} />,
    );
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument();
  });
});

describe('safeUrl', () => {
  it.each([
    ['https://a.b', 'https://a.b'],
    ['mailto:x@y.z', 'mailto:x@y.z'],
    ['#section', '#section'],
    ['/share/1', '/share/1'],
    ['javascript:alert(1)', ''],
    [' JaVaScRiPt:alert(1)', ''],
    ['data:text/html,hi', ''],
    ['//evil.example', ''],
  ])('%s → %s', (input, expected) => {
    expect(safeUrl(input)).toBe(expected);
  });
});

describe('splitMarkdownBlocks', () => {
  it('splits on blank lines but keeps fenced code (with blank lines) intact', () => {
    const md = 'para one\n\n```js\na\n\nb\n```\n\npara two';
    expect(splitMarkdownBlocks(md)).toEqual(['para one', '```js\na\n\nb\n```', 'para two']);
  });

  it('keeps indented continuation lines with their list', () => {
    const md = '1. item\n\n   continued\n2. next\n\nafter';
    expect(splitMarkdownBlocks(md)).toEqual(['1. item\n\n   continued\n2. next', 'after']);
  });

  it('treats an unterminated fence (mid-stream) as one block', () => {
    expect(splitMarkdownBlocks('intro\n\n```ts\nconst a = 1;\n\nconst b')).toEqual([
      'intro',
      '```ts\nconst a = 1;\n\nconst b',
    ]);
  });
});
