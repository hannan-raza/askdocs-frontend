# CLAUDE.md — AskDocs Frontend

Project context for Claude Code. Read this first. This is the Next.js frontend
for AskDocs (the backend is a separate FastAPI repo). It's deployed on Vercel and
talks to the FastAPI backend on AWS.

**No secrets in committed files.** Auth0 secrets live in `.env.local` (gitignored)
locally and in Vercel's env vars in production. Reference env var names, never values.

---

## 1. What this app is

The web UI for AskDocs — a multi-tenant "chat with your data" product. Users log
in (Auth0), upload PDFs and CSVs, and chat with them. The backend does the RAG
(PDFs) and text-to-SQL (CSVs); this frontend is the chat + document management UI.

Backend capabilities (already built and deployed):
- **PDF chat (RAG)** and **CSV chat (text-to-SQL)**.
- **NEW: unified query** — `POST /ask` answers from the user's ENTIRE knowledge
  base (all their PDFs AND all their CSVs) in one call. This is what the chat
  should now use. See §7 for the task.

## 2. Stack

- Next.js (App Router, TypeScript, Tailwind), deployed on Vercel.
- Auth via `@auth0/nextjs-auth0` (v4). Server components check the session;
  client components attach the access token to API calls.
- Calls the FastAPI backend through a **Next.js rewrite proxy** (see §5) — the
  browser never calls the backend directly (avoids HTTPS→HTTP mixed content).

## 3. Structure (`src/`)

- `app/layout.tsx` — root layout (fonts, global styles).
- `app/page.tsx` — chat page (server component: session guard → renders `ChatApp`
  inside `AppShell`).
- `app/ChatApp.tsx` — the chat client component (message list, input, send).
- `app/documents/page.tsx` + `documents/DocumentsApp.tsx` — the documents page
  (list/upload/delete, with async "processing…" polling for PDFs).
- `components/AppShell.tsx` — shared shell: top Header (app name + user email +
  logout) and left Sidebar nav (Chat / Documents / History-soon). Wrap page
  content in `<AppShell userEmail={...}>`.
- `lib/api.ts` — all client-side API calls (auth headers + fetch helpers). This is
  the single place API calls live. ADD new backend calls here.
- `lib/auth0.ts` — Auth0 client config (audience + scope incl. `offline_access`
  for token refresh).
- `proxy.ts` — mounts the Auth0 `/auth/*` routes.
- `next.config.ts` — the `/backend/:path*` rewrite (see §5).

## 4. Conventions — FOLLOW THESE

1. **All API calls go in `lib/api.ts`.** Don't scatter `fetch` calls across
   components. Each call attaches the auth header via the existing
   `authHeaders()` helper (fetches the token from `/auth/access-token`).
2. **`const API = "/backend"`** in `lib/api.ts` — API calls hit the same-origin
   `/backend/*` path, which Next.js rewrites to the real backend (§5). Never
   hardcode the backend URL in client code.
3. **Pages are server components that guard the session**, then render a client
   component inside `AppShell`. Pattern (from `app/page.tsx`):
   ```tsx
   const session = await auth0.getSession();
   if (!session) redirect("/auth/login");
   return <AppShell userEmail={session.user.email ?? ""}><SomeClient/></AppShell>;
   ```
4. **Client components** that do state/effects start with `"use client"`.
5. **Reuse `AppShell`** for consistent header + nav across pages.
6. **Never use browser storage** (localStorage/sessionStorage) — not supported in
   this setup; keep state in React (`useState`).

## 5. The proxy (important — how API calls reach the backend)

The Vercel site is HTTPS; the backend ALB is HTTP. Browsers block HTTPS→HTTP
("mixed content"). So API calls go through a Next.js server-side rewrite:

- `next.config.ts` rewrites `/backend/:path*` → `${NEXT_PUBLIC_API_URL}/:path*`.
- `lib/api.ts` uses `const API = "/backend"`, so a call to `${API}/ask` becomes
  `/backend/ask` (same-origin, HTTPS) → Next.js forwards it to the backend
  server-side (no mixed content).

When adding a new backend call, just use `${API}/<path>` — the proxy handles it.

## 6. Auth gotchas

- Access tokens expire; refresh needs `offline_access` scope (set in `auth0.ts`)
  AND "Allow Offline Access" enabled on the Auth0 API. Both are configured.
- Logout: use a `<button>` with `onClick={() => { window.location.href = "/auth/logout"; }}`,
  NOT a bare `<a href>` tag. (Reason below in §8.)
- Auth0 callback/logout/web-origin URLs must include the deployed Vercel domain
  (already configured for the current domain).

## 7. TASK — wire the chat to the unified `POST /ask` endpoint

Goal: the main chat should answer from the user's whole knowledge base (PDFs +
CSVs) by calling the new `POST /ask` endpoint, instead of the PDF-only `/query`.

Backend contract for `POST /ask`:
- Request body: `{ question: string, history: [{role, content}, ...] }`
  (same shape as the existing `/query` — history is a sliding window of recent turns).
- Response: `{ question, answer, sources, sql, used_datasets }`
  - `answer` (string) — the unified answer.
  - `sources` (string[]) — PDF chunks used (may be empty).
  - `sql` (per-dataset SQL that ran; may be empty) — optional to display.
  - `used_datasets` (which datasets were queried; may be empty) — optional to display.

Steps:
1. In `lib/api.ts`, add `askUnified(question, history)` that POSTs to `${API}/ask`
   with the auth header and returns the parsed response. Mirror the existing
   `askQuestion` helper's shape; add the new fields (`sql`, `used_datasets`) to
   the return type.
2. In `app/ChatApp.tsx`, switch the send handler to call `askUnified` instead of
   `askQuestion` (keep sending the last-6-messages history window as it does now).
3. Render the answer as it does today. OPTIONALLY (nice, not required): if
   `used_datasets` or `sql` are present, show a small collapsible "queried data:
   <dataset names>" / the SQL, similar to how PDF `sources` are shown in a
   `<details>` — this is a transparency touch, keep it subtle.
4. Keep the existing `askQuestion`/`/query` helper in place (don't delete it) in
   case it's referenced elsewhere; just stop the chat from using it.

Test locally (`npm run dev`), logged in, with an account that has both a PDF and a
CSV: ask a question that spans both and confirm one blended answer comes back.

## 8. Known gotcha — the `<a>` tag paste issue

Historically, pasting code containing a bare `<a ...>` opening tag into this
project's editing flow has dropped the `<a`, producing broken JSX. Prefer Next.js
`<Link>` or a `<button>` with an `onClick` navigation for links/actions. If you
must use an anchor, double-check the opening tag survived.
(Claude Code writes files directly so this is unlikely to bite it, but flagged so
generated code favors `<Link>`/`<button>` for consistency with the codebase.)

## 9. Working style

- One focused change at a time; keep diffs reviewable.
- After changes, a `/code-review` pass is welcome, but this is lower-risk than the
  backend (no auth/SQL logic here — the backend enforces isolation and SQL safety).
- Explain non-obvious choices briefly; the human is learning the stack.
- Don't introduce new state libraries or restructure the app unless asked — extend
  the existing patterns (AppShell, lib/api.ts, server-guard pages).
