const SAFE_URL = /^(https?:|mailto:|#|\/(?!\/))/i;

/**
 * Allow-list for URLs in model output: http(s), mailto, in-page anchors and
 * same-origin paths. Everything else (javascript:, data:, vbscript:,
 * protocol-relative //host…) becomes an empty string.
 */
export function safeUrl(url: string): string {
  const trimmed = url.trim();
  return SAFE_URL.test(trimmed) ? trimmed : '';
}
