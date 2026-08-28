# Development progress

Updated at the end of every completed phase. See [CLAUDE.md](../CLAUDE.md)
§10 for the phase table and current/next phase at a glance.

---

## Phase 0 — Project initialization ✅

**Date:** 2026-08-29

**What was found:** the project directory was completely empty — no
Next.js app, no git repo, no Supabase config, no env files.

**What was done:**

- Scaffolded Next.js (App Router) + TypeScript with `src/` layout, Tailwind
  CSS v4, and ESLint (flat config), via `create-next-app` into a temp folder
  and moved into the project root (the directory name "vertex quiz" contains
  a space, which is invalid for npm's inferred package name — the folder
  itself was kept as-is per instructions, and `package.json`'s `name` field
  was set to `vertex-quiz` instead).
- Initialized shadcn/ui (`base-nova` style, `base-ui` primitives, neutral
  base color) and added `button`, `card`, `badge` components. Lucide React
  came in automatically as shadcn's icon library dependency.
- Replaced the generated grayscale theme in `src/app/globals.css` with
  Vertex Studio's design tokens (deep navy primary, light neutral
  background, white cards, violet-indigo accent, dark-navy sidebar tokens,
  plus `success`/`warning`/`ai` semantic colors not present in shadcn's
  defaults). Also fixed a generator bug where `--font-sans` pointed at
  itself instead of `--font-geist-sans`.
- Removed default `create-next-app` assets that had no use in this product
  (`public/*.svg`, the Next.js logo favicon) and replaced the favicon with a
  generated Vertex "V" mark (`src/app/icon.tsx`).
- Rewrote `src/app/layout.tsx` metadata and `src/app/page.tsx` as a minimal
  branded status page (pipeline overview: PDF → AI extraction → review →
  publish → student session → analytics) to prove the design tokens and
  shadcn components render correctly.
- Added `.env.example` (tracked) and `.env.local` (gitignored) with
  placeholders for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`;
  adjusted `.gitignore` so `.env.example` stays tracked while every other
  `.env*` file is ignored.
- Wrote `README.md`, `CLAUDE.md`, and `docs/` (`product-spec.md`,
  `architecture.md`, `database.md`, `ai-pipeline.md`,
  `development-progress.md`).
- Verified `npm run build` and `npm run lint` both pass; smoke-tested
  `npm run dev`.
- Initialized git and made the first commit.

**Notable finding:** the scaffolded Next.js version is **16.3.3** (React
19.2), which has real breaking changes vs. Next.js 14/15 conventions —
documented in [CLAUDE.md](../CLAUDE.md) §4, e.g. always-async `cookies()`/
`headers()`/`params`/`searchParams`, and `proxy.ts` replacing
`middleware.ts` for route protection. This matters starting Phase 1 (server
Supabase client) and Phase 2 (protected admin routes).

**Manually verify:**

- `npm run dev` and open `http://localhost:3000` — should show the Vertex
  Quiz branded status page (navy logo mark, pipeline cards, accent badge).
- `npm run build` completes without errors.
- `git log` shows a single, scoped `feat: initialize vertex quiz app` commit.

---

## Phase 0 — Branding and visual reference integration ✅

**Date:** 2026-08-29

Follow-up to Phase 0 initialization: the real Vertex Studio logo and an
admin UI visual reference were supplied in `photos/` and integrated into the
design foundation. No Phase 1+ functionality (auth, Supabase, database, PDF
upload, Gemini, quiz/student flows, analytics) was touched.

**What was done:**

- Inspected the supplied assets: `photos/logo.png` (1254×1254 PNG, no alpha
  — a white angular "V" mark on a solid black square) and `photos/style.webp`
  (a screenshot of a third-party dashboard, used as visual inspiration only).
- Copied the official logo to `public/brand/logo.png` (the source archive in
  `photos/` was kept, not deleted) and used it as-is in the app header via
  `next/image`, displayed as a small rounded "logo chip" — a deliberate
  treatment given the source has no transparency.
- Generated `src/app/icon.png` (64×64 favicon) and `src/app/apple-icon.png`
  (180×180 Apple touch icon) by downscaling the real logo, and removed the
  Phase 0 placeholder `src/app/icon.tsx` that generated a synthetic "V".
- Did **not** copy `style.webp` into `public/` — it's a third-party
  screenshot with no reason to be served to end users; it stays in `photos/`
  as an internal reference only.
- Created `REFERENCES.md` documenting both assets' sources, purpose, final
  locations, and the design principles extracted from the visual reference
  (dark navy sidebar / light workspace split, white cards with subtle
  borders over heavy shadows, restrained corner radius, strong information
  hierarchy, one controlled accent used sparingly, generous whitespace) —
  and what was deliberately *not* carried over (its branding, exact
  component shapes, literal layout, copy).
- Refined the design system: tightened the base corner radius token from
  `0.625rem` to `0.5rem` for a more precise/premium feel in line with the
  logo's angular geometry and the reference's restrained radius; updated
  `CLAUDE.md` §9 with the brand-asset locations and a pointer to
  `REFERENCES.md`.
- Verified `npm run lint` and `npm run build` both pass, and manually
  checked the running dev server: the logo renders through Next's image
  optimizer at both `1x`/`2x` resolutions (200 responses, valid PNG data),
  `/icon.png` and `/apple-icon.png` both resolve, and the page's existing
  Phase 0 content (hero copy, pipeline cards, footer) is unchanged.

**Manually verify:**

- `npm run dev` and open `http://localhost:3000` — the header should show
  the real Vertex "V" logo (not a text placeholder) as a small rounded dark
  tile next to "Vertex Quiz / Vertex Studio", and the browser tab should
  show the same mark as its favicon.
- Resize the browser / check on a narrow viewport — header, hero, and the
  pipeline card grid should reflow without horizontal scrolling or
  overlapping content.
- Open the browser devtools console — no errors, no broken-image icons.
- Confirm corners feel slightly crisper than before (cards, badges, the logo
  tile) without looking sharp/harsh.

---

## Phase 1 — Supabase foundation

Not started.
