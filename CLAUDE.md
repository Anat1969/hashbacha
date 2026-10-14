# Hashbacha Project

## Stack (v2, from 2026-10)

- Vite + React 18 + framer-motion, Hebrew RTL, no icons.
- Supabase project `ASHDODMAP` (`cbhexpybdggwzyakgagd`), shared — every table/function uses the `hb_` prefix.
- Data access only through `hb_*` RPC functions gated by an access code (sha256 in `hb_access_keys`) or an email in `hb_admins`. Tables have RLS on and no anon grants.
- Deletes are soft (`deleted_at`) with a trash/restore UI. The Supabase MCP tool stalls on SQL containing DELETE statements (waits for confirmation), so keep using soft deletes.
- Chart.js for analytics, SheetJS (xlsx) for Excel import/export (lazy-loaded).
- Deployed on Vercel from GitHub (project `hashbacha`). `vercel.json` sets Vite build + SPA rewrite.

## Access (user feedback, 2026-10-14)

- Never hand over a bare code with no instructions. Deliver a one-click entry link: `https://hashbacha-roan.vercel.app/?k=CODE`. The app stores the code and strips it from the URL.
- The gate screen explains how to get in; Settings shows a copyable entry link for sharing with the team.
- Vercel's production branch is `main`, not the repo default branch: after merging, deploy production manually (`create_deployment` with `target: production`).

## Notes, mail, contacts

- `hb_notes` (kinds: todo/ask/remember/note, optional project_id, due, done). Project card shows filed notes plus a merged timeline of opinion events and dated note lines.
- Every mail opens in `MailComposer` for editing first, then Gmail / Outlook web / mailto / copy. Browsers cannot be forced to Chrome; web compose opens in the current browser.
- Contacts live in `hb_settings.data.contacts` [{name, role, email}]; an address typed in a draft is saved there.

## Testing

`npm run build && npm test` (96 checks) — Playwright (playwright-core, Chromium at /opt/pw-browsers) against `vite preview`, with every Supabase RPC mocked in-memory. Asserts each button's RPC payload and no horizontal scroll at 390px.
The test spawns vite via `node node_modules/vite/bin/vite.js` (not npx) so the server is killed afterwards.

## Design language

Architectural grayscale, IBM Plex Sans Hebrew (thin only at display sizes), IBM Plex Mono labels, layered panels with shadows, perspective grid backdrop, motion on entry. Running text ≥ 4.5:1 contrast.

## Domain notes

- Profit threshold is 15%. Ranges like "10-16%" resolve to their midpoint and are tagged "טווח".
- Colour = risk (user feedback 2026-10-14). Profit: gradient green below the 15% benchmark, red above it (`profitColor`). Gap (developer minus city): risk is the size of the disagreement either way, green under 3 points, red above (`gapColor`). Arrows follow the same rule: ↑ red above the benchmark, ↓ green at or below.
- Always show both sides of profitability (developer and city) and prefix names with their role ("שמאי יזם: ...").
- Durations are shown in years, months and days (`formatDuration`).
- Follow-up party ("ממתין ל") is an opinion field: שמאי העירייה / שמאי היזם / היזם / העירייה. When empty it is inferred from the notes and marked "משוער".
- Notes field: added text is stamped with today's date on its own line.
- "Waiting" = a project's latest opinion has a request date but no opinion date.

## Legacy

`legacy/` holds the v1 vanilla app (GitHub Pages, `gh-pages` branch). The gh-pages sync rule applied to v1 only: copy `legacy/public/*` to the gh-pages root if v1 ever needs a fix.

## Branches

- `claude/unclear-description-myfrxh` — repository default branch
- `gh-pages` — v1 on GitHub Pages
