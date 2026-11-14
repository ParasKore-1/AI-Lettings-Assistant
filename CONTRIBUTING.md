# Contributing — Keyring conventions

Keyring is a **fictional** AI assistant for UK tenants, landlords and letting agents.
All names, branding, copy, addresses and listings are invented. Never use real agency
names, real property addresses or real people.

Read `PLAN.md` for the current phase and `DECISIONS.md` before changing any
architecture. Append a dated entry to `DECISIONS.md` for every non-obvious choice.

## Repo layout

```
apps/web        React 18 + Vite + TS strict + Tailwind v4 (the product)
apps/server     Node + Hono: REST + SSE API, providers, SQLite persistence
packages/shared Zod schemas + inferred TS types (single source of truth for the wire format)
e2e/            Playwright specs (run against web + server in mock mode)
scripts/        dev tooling (record-demo.mjs → docs/demo.gif)
.github/        CI workflows
```

## Toolchain

- Node 22 (`.nvmrc`), pnpm 9 workspaces. Never use npm/yarn.
- Workspace deps use `workspace:*`. Import shared code as `@keyring/shared`.
- Common scripts (root): `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, `pnpm e2e`. Run `typecheck`, `lint` and `test` before declaring a task done.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (see `tsconfig.base.json`).
- No `any`. Use `unknown` + Zod parsing at every trust boundary (network, storage, env, SSE).
- Types for the wire format come **only** from `packages/shared` (`z.infer`). Never redeclare them.
- Discriminated unions with exhaustive `switch` + `assertNever`.

## Frontend conventions (apps/web)

- Feature folders under `src/features/<feature>/` (chat, composer, conversations, layout, settings, share, playground); shared UI in
  `src/components/ui`, app-wide hooks in `src/hooks`, helpers in `src/lib`. Named exports; component files export only components (Fast Refresh).
- Server state → TanStack Query (query keys in `src/lib/utils.ts`, cache helpers in `features/conversations/cache.ts`).
- Streaming state → the chat engine (`features/chat/stream`), never component state. Read it with the narrow selectors in `streamStore.ts`. UI/client state →
  Zustand (`src/stores`). Never copy server data into Zustand.
- Styling: Tailwind v4 with design tokens defined as CSS variables in `src/styles/index.css`
  (`--kr-*`, mapped via `@theme inline`). Use semantic utilities (`bg-surface`, `text-fg-muted`) — no raw hex in components (EPC badge colours are the one exception).
- Accessibility is not optional: every interactive element is keyboard-reachable, has an
  accessible name and visible focus. Respect `prefers-reduced-motion`.
- **Never** render untrusted HTML. No `dangerouslySetInnerHTML` outside the sanitised
  Markdown/Shiki pipeline (and that path must have an XSS test).
- Streaming performance: only the streaming row may re-render per token. Message rows are
  `memo`ised and keyed by message id; token updates are rAF-batched.
- Env: read via `src/env.ts` (Zod-validated `import.meta.env`). Never read `import.meta.env` elsewhere.

## Server conventions (apps/server)

- Hono routes in `src/routes`, providers in `src/providers`, DB in `src/db` (built-in `node:sqlite`; add schema changes as a new entry in `MIGRATIONS`).
- Keep the `node:` prefix on built-ins (tsup `removeNodeProtocol: false`).
- Validate every request body/param with the shared Zod schemas.
- Providers implement one `ChatProvider` interface returning `AsyncIterable<StreamEvent>`.
  `MockProvider` is the default; the Anthropic provider is enabled only when
  `ANTHROPIC_API_KEY` is set server-side. **API keys never reach the browser.**
- Honour client aborts: stop the provider when the request signal aborts.
- `/api/debug` exists only when `ENABLE_DEBUG` is true (default: outside production).

## Testing

- Vitest + React Testing Library for units/components (`*.test.ts(x)` beside the source).
- Write parser/stream tests **before** the implementation.
- Playwright e2e in `/e2e`, always against the MockProvider; failures are injected with `POST /api/debug` (runs serially). `e2e/a11y.spec.ts` runs axe in both themes — keep it green.
- Perf guard: `streamingPerf.test.tsx` asserts 0 row re-renders while streaming.
- Query elements by role/label, not test ids, unless unavoidable.

## Git

- Conventional commits (`feat(web): …`, `fix(server): …`, `docs: …`).
- Small commits per sub-step; never commit `.env` or the SQLite file.
