# PLAN.md — Keyring delivery phases

Status legend: ☐ todo · ◐ in progress · ☑ done. Each phase ends with typecheck + lint +
tests green and a short "what changed / what's next" note at the bottom of this file.

## Phase 0 — Foundations ☑
- CONTRIBUTING.md, PLAN.md, DECISIONS.md, folder skeleton.

## Phase 1 — Monorepo, shared schemas, server + MockProvider, CI skeleton ☑
- Root `package.json`, `pnpm-workspace.yaml`, base `tsconfig`, ESLint (flat) + Prettier.
- `packages/shared`: Zod schemas — `Conversation`, `Message` (role, parts, status,
  parentId for branching), `Attachment`, `ToolResult` (`property_cards`, `viewing_slots`,
  `maintenance_ticket`), `StreamEvent` discriminated union
  (`message_start | text_delta | tool_result | message_end | error`), API request/response
  schemas, pagination cursor.
- `apps/server` (Hono on `@hono/node-server`):
  - REST: list (cursor-paginated) / create / get messages / patch (rename, pin) / delete.
  - `POST /api/conversations/:id/messages` → `text/event-stream`, heartbeats, abort-aware.
  - `ChatProvider` interface; `MockProvider` (token jitter, canned lettings answers,
    tool_result cards, seedable RNG); `AnthropicProvider` behind `ANTHROPIC_API_KEY`.
  - Persistence: SQLite via built-in node:sqlite + typed repository; seed script (see DECISIONS).
  - `/api/debug` (dev only): force `slow`, `fail_mid_stream`, `rate_limit`, `server_error`.
  - Auto-title generation after first reply.
- Proof: `curl -N` streaming transcript pasted into the phase notes.
- CI skeleton: GitHub Actions (install, typecheck, lint, test, build).

## Phase 2 — Design tokens + chat component library ☑
- Tailwind v4 tokens (colour, type scale, radius, spacing, motion), light/dark, AA contrast.
- Components: MessageBubble (user/assistant/system/error), StreamingText, TypingIndicator,
  MessageActions, Composer, AttachmentChip, SuggestionChip, ConversationListItem,
  CodeBlock, PropertyCard, ViewingSlotPicker, MaintenanceTicketCard, Skeletons,
  EmptyState, ErrorBanner.
- `/playground` route: every component × every state, theme toggle, mobile-width frame,
  replayable fake stream.

## Phase 3 — Conversation list + routing + TanStack Query ☑
- React Router: `/`, `/c/:id`, `/share/:id`, `/playground`.
- Sidebar: date-grouped list, search (Ctrl/Cmd+K), inline rename, pin, delete with undo
  toast, new chat; mobile drawer.
- Optimistic create/rename/pin/delete with rollback; infinite list pagination.

## Phase 4 — Streaming hook + live chat ☑
- SSE parser (tests first): split chunks, multi-event chunks, CRLF, comments/heartbeats,
  malformed events → typed error.
- `useChatStream(conversationId)`: fetch + ReadableStream + TextDecoder, Zod-parse events,
  rAF-batched buffer, AbortController stop, retry keeping partial text, regenerate,
  edit-and-resend (branching), reconcile with the Query cache on `message_end`.
- States: sending, streaming, stopped, network error mid-stream, server error, offline
  banner, rate-limited (with retry-after).

## Phase 5 — Rich content + composer power features ☑
- react-markdown + remark-gfm + rehype-sanitize; links `target=_blank rel="noopener noreferrer"`.
- Shiki code blocks (lazy-loaded, fine-grained bundle) + copy button.
- Tool-result cards wired to real stream events.
- Attachments: drag/drop + paste, type/size validation, previews, progress, remove.
- Slash command menu (`/rent-reminder`, `/viewing`, `/maintenance`), keyboard nav, ARIA combobox.
- Per-conversation drafts (Zustand persist).

## Phase 6 — Scroll, virtualisation, mobile, a11y, performance ☑
- Stick-to-bottom only when near bottom; "Jump to latest" button.
- TanStack Virtual with dynamic row heights; seeded 500+ message conversation.
- Mobile: `visualViewport` keyboard handling, safe-area insets, drawer focus trap.
- a11y: `role="log"`, polite announcement on completion, focus return, shortcut dialog.
- Profiler report: re-renders per token before/after memoisation (numbers in DECISIONS.md).

## Phase 7 — Tests, Lighthouse, docs, deploy ☑
- Vitest: XSS, SSE parser, composer keys/IME, auto-scroll logic, optimistic delete + undo.
- Playwright: send → stream → stop → regenerate; error mid-stream → retry; mobile flow.
- Lighthouse CI budgets on the web app.
- README: GIF, architecture diagram, "How streaming works", "How I prevent XSS", "Challenges".
- Deploy: web (Vercel/Netlify), server (Render/Railway/Fly) in mock mode; live URLs.

---

## Phase notes
- **Phase 0** — docs + skeleton created.
- **Phase 1** — pnpm monorepo; shared Zod schemas + SSE parser/encoder + thread helpers; Hono server with REST + SSE, MockProvider, optional AnthropicProvider, node:sqlite, /api/debug (+ per-request x-keyring-debug header), rate limiting, seed (600-message chat). Streaming proven with curl: docs/sse-transcript.txt.
- **Phase 2** — Tailwind v4 tokens (AA in both themes), UI primitives, every chat component; /playground with light+dark panels, mobile width, render counts and a fake stream replayed through the real engine.
- **Phases 3–4** — Router, sidebar (groups, search, rename, pin, delete+Undo via soft delete), optimistic cache helpers; chat engine + useChatStream (stop, resume-retry, regenerate, edit branches, offline auto-resume, rate-limit countdown). Parser tests written first.
- **Phases 5–6** — sanitised Markdown (+ HTML-as-text), lazy Shiki, inline cards with offsets, attachments (XHR progress, sniffing), slash commands, drafts; stick-to-bottom + Jump to latest, always-virtualised list, visualViewport/safe areas, a11y (axe clean). Render benchmark: 40 → 0 row renders per token.
- **Phase 7** — 75 unit + 15 e2e tests green; Lighthouse desktop 100/100/100 (SEO 91 → robots.txt added); CI (checks, Playwright on prod bundle, Lighthouse CI); Docker/Render/Fly/Vercel/Netlify configs; README with GIF + diagram. **Remaining (owner): git push + deploy, then put the live URLs in README.**
