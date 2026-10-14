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
- Vercel's production branch is `main`, not the repo default branch. Every merge to the default branch must also be merged into `main` (PR default → main); otherwise production keeps an old version. (2026-10-14: `main` served the standalone comparison page instead of the app.)
- Never put files at the repo root or replace `index.html`; module material lives in `docs/hashbacha/`, app code in `src/`.

## Chrome (user requirement, repeated 2026-10-14)

- The user wants the app always in Google Chrome. A page cannot pick its browser, so: the app is an installable PWA (`public/manifest.webmanifest`, `public/sw.js`, install button in the header and Settings); outside Chrome a banner names the current browser and offers Android intent / iOS `googlechromes://` links or a Windows `.cmd` / Mac `.command` launcher (`src/lib/browser.js`). Never answer this with "not possible" alone.
- Header has a "עריכה ושדרוג ב־Claude" button linking to the Claude Code session.
- Every link handed to the user in chat comes in Chrome form too (user feedback, 2026-10-14, third time): Windows `chrome "URL"` (Win+R), Mac `open -a "Google Chrome" "URL"`, Android `intent://HOST/PATH#Intent;scheme=https;package=com.android.chrome;end`, iPhone `googlechromes://HOST/PATH`. Never a bare https link alone.

## Notes, mail, contacts

- `hb_notes` (kinds: todo/ask/remember/note, optional project_id, due, done). Project card shows filed notes plus a merged timeline of opinion events and dated note lines.
- Every mail opens in `MailComposer` for editing first, then Gmail / Outlook web / mailto / copy. Browsers cannot be forced to Chrome; web compose opens in the current browser.
- Contacts live in `hb_settings.data.contacts` [{name, role, email}]; an address typed in a draft is saved there.
- Every mail sent from the app is filed as `hb_notes` kind `mail_out` (meta: to, subject, via, date). Incoming or external mails are filed by paste (`MailLog`, parser in `src/lib/mailParse.js`) as `mail_in` with sender role and project auto-guessed. No mailbox integration yet (no approval).
- Project file timeline: dots legend (event / opinion note / note / mail out / mail in), click a legend key to filter; newest first.

## Analytics
- Gap tab shows developer profit only; "השוואה יזם מול עירייה" adds city bars and dashed "חסר" slots where city is missing.
- Grouped sorts draw frames; clicking a frame isolates it (focus bar, back button). Date-ordered charts label both axis ends (ישן / חדש).
- Every average states what it averages; developer drill-down is split by project.

## Testing

`npm run build && npm test` (17 review-logic checks + 154 e2e checks) — Playwright (playwright-core, Chromium at /opt/pw-browsers) against `vite preview`, with every Supabase RPC mocked in-memory. Asserts each button's RPC payload and no horizontal scroll at 390px.
The test spawns vite via `node node_modules/vite/bin/vite.js` (not npx) so the server is killed afterwards.

## Design rule for the appraisal review module
- All new screens must look exactly like the existing app: same components, layout shell, navigation, colors, fonts, spacing, buttons, tables, forms, badges and empty states.
- Reuse existing components and design tokens. Do not create new styles when an equivalent exists.
- docs/hashbacha/index.html is a reference for LOGIC ONLY (parsing, scoring, data structure). Ignore its CSS, fonts, colors and layout.
- Status colors (green = closer / in range, red = farther / exceedance) must come from the app's existing success and danger tokens.
- Hebrew, RTL, no icons, consistent with the rest of the app.
- Token reference: success = `--green`, danger = `--red` (`src/styles.css` `:root`); gradients via `profitColor` / `gapColor` in `src/lib/calc.js`.

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

## Appraisal review module
- Before any work on this module, read docs/hashbacha/rules.md, docs/hashbacha/plan.md and docs/hashbacha/progress.md (if they exist).
- After finishing a step, append to docs/hashbacha/progress.md: date, what was built, files changed, what is left.
- Design: all new screens must look exactly like the existing app: same components, layout shell, navigation, colors, fonts, spacing, buttons, tables, forms, badges and empty states. Reuse existing components and tokens; never create a new style when an equivalent exists.
- docs/hashbacha/reference/index.html is a reference for LOGIC ONLY (parsing, scoring, data structure). Ignore its CSS, fonts, colors and layout.
- Status colors (green = closer / in range, red = farther / exceedance) come from the app's existing success and danger tokens.
- Hebrew, RTL, no icons.

## Appraisal review module (built 2026-10-14)
- Main menu item "בקרת שומות" (`#/s`) lists every opinion with its review status. It is also a tab inside the project card, not a separate page: project card tabs "פרויקט ומעקב" / "שומות השבחה" (`#/p/:id/r`, `#/p/:id/r/:reviewId`).
- Logic: `src/lib/review/`. UI: `src/components/review/`. The comparison reuses table / group-row / pill / mail-card / summary / file-timeline / editbar.
- The Claude research project for this module opens from a button in the review tab; its URL lives in Settings (`hb_settings.data.researchUrl`).
- Roles per access code (`hb_access_keys.role`): editor (all), reviewer (review writes only), viewer (read). Viewer writes raise `hb_readonly` (toast, no logout).
