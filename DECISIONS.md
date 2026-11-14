# Keyring — decisions

Append-only. Each entry: date, context, decision, alternatives, consequences.

Format:

```
## YYYY-MM-DD — Title
**Decision:** …
**Why:** …
**Alternatives:** …
**Consequences:** …
```

---

## 2026-11-14 — Monorepo with pnpm workspaces (web / server / shared)

**Decision:** Three packages: `apps/web`, `apps/server`, `packages/shared`. pnpm workspaces.

**Why:** The streaming contract must be identical on both sides. Zod in `shared` is the API. A single frontend repo with ad-hoc types would drift the moment SSE events get a new field.

**Alternatives:** Single Vite app with a Vite plugin mock; Next.js full-stack; Turborepo.

**Consequences:** Root scripts orchestrate `typecheck` / `test` / `dev`. CI checks all three packages. Deploy splits: static web + Node server.

---

## 2026-11-14 — Hono on the server, not Express

**Decision:** Hono for REST + SSE.

**Why:** First-class `streamSSE`, small surface, native `Web` `Request`/`Response` (same mental model as `fetch` on the client). Enough HTTP for this API without Express middleware archaeology.

**Alternatives:** Express + extra SSE helpers; Fastify; Vite-only mock.

**Consequences:** Node 22 (`.nvmrc`). SSE written as a web `Response` body.

---

## 2026-11-14 — fetch + ReadableStream, not EventSource

**Decision:** The web client opens streams with `fetch` (POST JSON) and reads `response.body`.

**Why:** `EventSource` is GET-only, cannot send a message body, has weak abort/header control, and does not match how production AI chat UIs work. We need POST, `AbortController`, and custom headers.

**Alternatives:** `EventSource`; `fetch` + `@microsoft/fetch-event-source`; WebSockets.

**Consequences:** We own an SSE parser (buffer, split, retry). That parser is a first-class unit-tested module. Documented again when implemented in Phase 4.

---

## 2026-11-14 — MockProvider default; LLM key server-only

**Decision:** Chat works with zero API keys. A real provider is constructed only if the server env contains a key. The browser never sees it.

**Why:** Portfolio reviewers and CI cannot depend on a paid key. JD asks for streaming UI skill, not prompt-ops. Keys in the client would be stolen in one Network-tab glance.

**Alternatives:** Client-side OpenAI SDK; mock-only forever.

**Consequences:** One `ChatProvider` interface. `/api/debug` only in non-production. Typed `env.ts` on the server.

---

## 2026-11-14 — SQLite (better-sqlite3) for persistence

**Decision:** Conversations and messages in SQLite. JSON file only if native modules block a target deploy (document that fallback if we take it).

**Why:** Undo, rename, share links, and refresh-after-stream need a real store. SQLite is zero-ops locally and cheap on a small Node host. JSON files race under concurrent streams.

**Alternatives:** In-memory Map; JSON file; Postgres.

**Consequences:** `.gitignore` the db file. Schema via Drizzle so migrations stay typed. Serverless hosts that cannot run native addons may force a JSON fallback or a different host (Render/Fly/Railway preferred).

---

## 2026-11-14 — Optional LLM is Anthropic, server-side only

**Decision:** `MockProvider` by default (`PROVIDER=mock`). If `ANTHROPIC_API_KEY` is set on the server, an `AnthropicProvider` may be selected. No OpenAI (or any) key in the Vite bundle.

**Why:** One real provider is enough to prove the interface. Anthropic matches a typical AI-startup stack. Keeping a single optional vendor avoids two streaming adapters in Phase 1.

**Alternatives:** OpenAI; OpenRouter; mock-only with no interface.

**Consequences:** `.env.example` documents the key as commented. Browser env only has `VITE_API_URL`.

---

## 2026-11-14 — rAF-batched stream updates (planned, implement Phase 4)

**Decision:** Token deltas accumulate in a ref; flush to React at most once per animation frame.

**Why:** `setState` per token thrashes layout and profiler. Chat UIs feel “janky” from this more often than from CSS.

**Alternatives:** `setState` per event; debounce 16–50ms with `setTimeout`.

**Consequences:** Tests should not assume one React render per `text_delta`. Profiler numbers go in this file in Phase 6.

---

## 2026-11-14 — XSS: no raw HTML; rehype-sanitize (planned, implement Phase 5)

**Decision:** Markdown via `react-markdown` + GFM + `rehype-sanitize`. Never `dangerouslySetInnerHTML` for model text. Tool cards are React components from Zod-parsed JSON.

**Why:** Assistants (and mock providers) can emit HTML. A portfolio chat that executes `<script>` or `<img onerror>` is a fail.

**Alternatives:** `rehype-raw` + allowlist; `DOMPurify` after `marked`.

**Consequences:** A dedicated Vitest proves a script/onerror payload does not run. Links get `noopener`.

---

## 2026-11-14 — Auto-scroll only if near bottom (planned, implement Phase 6)

**Decision:** Stick to bottom while streaming iff the user is within a threshold of the bottom. Scrolling up disables stick and shows “Jump to latest”.

**Why:** Fighting a user who is reading an earlier message is the classic chat-UI defect.

**Alternatives:** Always `scrollIntoView` on the last message; IntersectionObserver on a sentinel.

**Consequences:** Need a reliable “near bottom” measurement that still works with virtualisation.

---

## 2026-11-14 — Product name Keyring

**Decision:** Fictional brand “Keyring” for UK lettings chat. Original copy.

**Why:** The brief forbids cloning a real product’s name. Keys / properties is a clear metaphor without impersonating a live agency tool.

**Alternatives:** Generic “Lettings Chat”; names too close to existing PropTech.

**Consequences:** All UI strings, README, and meta titles use Keyring.

---

## 2026-11-14 — Built-in `node:sqlite` instead of better-sqlite3 / Drizzle (revises the SQLite entry's tooling)

**Decision:** Persistence uses Node 22's built-in `node:sqlite` (`DatabaseSync`) with hand-written SQL, a tiny migration runner (`PRAGMA user_version`) and one typed repository (`apps/server/src/db/repository.ts`).

**Why:** better-sqlite3 is a native addon: it needs build tools on Windows and breaks on some hosts. `node:sqlite` needs nothing installed and runs anywhere Node 22 runs, including the Docker image. With three tables, Drizzle's type layer wasn't worth a second abstraction; rows map to the shared Zod types in one place.

**Alternatives:** better-sqlite3 + Drizzle (as planned); JSON file; Postgres.

**Consequences:** Node prints an `ExperimentalWarning` (silenced in `start`). The bundler must keep the `node:` prefix. tsup strips it by default, which crashed the first production build, so `removeNodeProtocol: false` is set.

---

## 2026-11-14 — Conversations are trees (edit / regenerate create branches)

**Decision:** Every message has a `parentId`. Edit-and-resend creates a *sibling* user message; Regenerate creates a sibling assistant reply. The visible thread is computed by `buildThread` (in `packages/shared`) from per-fork selections, defaulting to the newest child. Rows show a `‹ 2 / 3 ›` switcher.

**Why:** Overwriting history on edit loses context and makes Regenerate destructive. A tree also keeps the server append-only.

**Alternatives:** Truncate-and-replace on edit; a separate "versions" table.

**Consequences:** One `POST /messages` endpoint takes three intents (`send`, `regenerate`, `resume`). Branch selection is client state in Zustand.

---

## 2026-11-14 — Retry *resumes* the same reply; Stop keeps partial text

**Decision:** A reply that fails mid-stream (network drop or provider error), or that the user stops, keeps its partial text with status `error` or `stopped`. Retry and Continue send `intent: "resume"`. The server puts the same message back into `streaming` and sends `message_start` with the partial text as `content`.

The mock provider is seeded by the assistant message id, so it regenerates the identical script and skips the characters already sent. The resumed text is therefore exactly what an uninterrupted run would produce (asserted in server and e2e tests). The Anthropic provider can't prefill on current models, so it replays the partial reply as an assistant turn and asks the model to continue.

**Why:** A Retry that throws away 80% of an answer feels broken. Keeping one message id also keeps feedback, branches and share links stable.

**Alternatives:** Retry regenerates from scratch; the client concatenates two replies.

**Consequences:** The server tracks in-flight assistant ids, so a reply left `streaming` by a crash or a stale fetch can still be resumed. On boot, the server marks such replies as `error`. On the client, only the reply this tab is actively streaming renders live; any other `streaming` row renders as stopped.

---

## 2026-11-14 — The streaming engine lives outside React

**Decision:** `createChatEngine` (plain TS, one per app) owns fetch, abort controllers, the SSE parser, rAF batching and cache reconciliation. React reads a Zustand stream store through narrow selectors such as `useStreamText(id)`. `useChatStream(id)` only wires stable action callbacks.

**Why:** A stream must survive switching to another chat and back, and must not re-render the tree per token. Keeping the engine outside React also makes it unit-testable with a fake `fetch` and a manual frame scheduler.

**Alternatives:** State in a component (dies on unmount); everything in the TanStack Query cache (every token would notify every observer of the conversation).

**Consequences:** Persisted messages live in TanStack Query and live text in the stream store; `message_end` swaps one for the other. The playground runs the same engine with a fake network.

---

## 2026-11-14 — Render cost while streaming (measured)

**Decision:** Three layers keep streaming cheap:

1. Rows are `memo`ised and receive only primitives plus a stable message object. Actions come from a context whose value never changes during a stream.
2. Only `StreamingReply` subscribes to the live text.
3. Deltas are committed once per animation frame.

Markdown is also split into memoised blocks, so re-parsing costs O(last block), and Shiki highlighting is deferred until a code block is final.

**Numbers** (`streamingPerf.test.tsx`, 40 messages, 200 tokens):

| Approach | Row renders | Streaming-body renders | Renders per token |
| --- | ---: | ---: | ---: |
| A. Naive (text in list state, no memo) | 8,000 | — | 40.0 |
| B. Memo rows + isolated subscription | 0 | 200 | 1.0 |
| C. B + rAF batching (~4 tokens/frame) | 0 | 50 | 0.25 |

**Alternatives:** `useDeferredValue` on the whole list; debouncing with `setTimeout`.

**Consequences:** React commits at most once per frame (~60×/s) however fast tokens arrive. Tests must not assume one render per `text_delta`.

---

## 2026-11-14 — Auto-scroll: only *user* input unpins

**Decision:** `useStickToBottom` tracks a `pinned` flag. Coming within 80 px of the bottom always re-pins. Scrolling away unpins **only if** the scroll event follows wheel, touch, key or pointer input within 600 ms. Content growth is followed with a `ResizeObserver` on the virtualised content.

**Why:** A naive "am I at the bottom?" check mis-fires during streaming, because content growth and virtual-row measurement fire scroll events that look like the user scrolling up. Verified in Chromium:

- while unpinned during a stream, `scrollTop` stays exactly constant;
- after "Jump to latest" mid-stream, the distance from the bottom is 0.

**Alternatives:** An IntersectionObserver sentinel (breaks with virtualisation, since the sentinel is often unmounted); always calling `scrollIntoView`.

**Consequences:** The container sets `overflow-anchor: none` so the browser's scroll anchoring doesn't fight TanStack Virtual's own adjustment.

---

## 2026-11-14 — Always virtualise (TanStack Virtual, dynamic heights)

**Decision:** The message list is always virtualised, with measured row heights and rows keyed by message id. A seeded 600-message conversation renders about 7 DOM rows.

**Why:** One code path, with no threshold where behaviour changes.

**Consequences:** The visible list can't be a live region, because rows remounting while scrolling would be announced again (see the next entry).

---

## 2026-11-14 — Accessibility of a streaming log

**Decision:** The visible list is `role="log"` with `aria-live="off"`, `aria-busy` while streaming, and is focusable as a scroll region. A separate visually hidden `role="log" aria-live="polite"` region gets one entry per **completed** reply. Menus, the slot picker and the slash menu follow the WAI-ARIA menu, radio-group and listbox patterns; dialogs are native `<dialog>`.

**Why:** A polite live region on a virtualised list would announce every token and every remounted row. This setup meets the spec's intent exactly: announce completed replies, not tokens.

**Consequences:** Playwright runs axe (WCAG 2.2 AA) on the empty state, a chat with cards and the full playground, in both themes. It caught two bugs, both now fixed:
- a 4.46:1 code-token contrast, fixed with Shiki's `github-*-default` themes and a white code background;
- a nested-theme CSS bug in the playground.

---

## 2026-11-14 — Tool results are inline, typed cards with offsets

**Decision:** `tool_result` events carry a Zod-validated union (`property_cards` | `viewing_slots` | `maintenance_ticket`). The server stamps each one with the text `offset` where it was emitted, and the client interleaves cards with the text at that point. Cards are React components, and card buttons send follow-up messages.

**Why:** Cards appended at the end read wrongly ("Here's the property:" followed by unrelated text). Rendering from JSON, never from HTML strings, keeps cards outside the XSS surface.

**Consequences:** Viewing times always display in `Europe/London` time, because these are UK properties. The first version showed a 10:00 slot as 15:30 on a UTC+5:30 machine.

---

## 2026-11-14 — Attachments: XHR upload, content sniffing, no SVG

**Decision:** Files upload as soon as they're attached, using `XMLHttpRequest` because fetch has no upload progress events. They are validated on the client (type, 5 MB, at most 4) and again on the server, including magic-byte sniffing. They're stored as SQLite blobs and served with `nosniff`, plus a sandboxing CSP for images.

**Why:** SVG files and HTML renamed as `.png` are classic stored-XSS vectors.

---

## 2026-11-14 — Optional real model: Anthropic SDK with a server-side tool loop

**Decision:** `AnthropicProvider` uses `@anthropic-ai/sdk` (`beta.messages.stream`), with `claude-opus-5-5` by default (`ANTHROPIC_MODEL` overrides it).

- The response mode maps to `output_config.effort`: fast → low, balanced → medium, thorough → high.
- Server-side refusal fallbacks are on.
- Three tools run on the fictional dataset in a streaming tool loop: `search_properties`, `get_viewing_slots`, `create_maintenance_ticket`. Their inputs are Zod-validated before execution.
- The provider transcript, including thinking blocks, is stored server-side only and replayed unchanged on later turns.

**Why:** The provider emits the same event contract as the mock, so the frontend can't tell them apart. Replaying thinking blocks unchanged is required for multi-turn correctness.

**Consequences:** The mock stays the default model even when a key is set, so the public demo only spends credits when someone picks Claude in the model menu.

---

## 2026-11-14 — Delete is a server soft-delete; Undo is a real restore

**Decision:** `DELETE` sets `deleted_at`, and `POST /conversations/:id/restore` clears it. The client removes the chat optimistically and shows an Undo toast; Undo waits for the in-flight delete to finish before restoring.

**Why:** A delayed DELETE is lost if the tab closes. A soft delete keeps Undo correct even after the request has landed, and the restore survives a reload (asserted in e2e).

---

## 2026-11-14 — Bundle: lazy Markdown, lazy Shiki, lazy routes

**Decision:**
- Shiki uses the fine-grained core and the JavaScript regex engine (no WASM), loading each language and theme on first use.
- The Markdown stack is a separate chunk, preloaded on `requestIdleCallback`, with a plain-text fallback in the same typography.
- `/share` and `/playground` are lazy routes.

**Why:** Lighthouse (desktop) on the production build first scored Performance 74, with 690 ms of total blocking time from parsing a single 127 KB (gzip) entry chunk. Splitting out Markdown cut the entry chunk to 73 KB gzip. Performance is now **100**, with TBT 20 ms, LCP 0.5 s and CLS 0; Accessibility and Best practices are also 100.
