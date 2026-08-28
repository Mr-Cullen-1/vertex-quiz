# Design references

This file documents the official brand assets and visual references supplied
for Vertex Quiz, where they live, and what was extracted from them into the
design system. Source files are kept in `photos/` as a durable reference
archive; anything actually shipped in the product lives under `public/` or
`src/app/`.

### Vertex Studio Logo

**Source:** `photos/logo.png` (kept as the archival original)
**Shipped at:** `public/brand/logo.png` (used by the app via `next/image`),
plus generated `src/app/icon.png` (browser tab favicon, 64×64) and
`src/app/apple-icon.png` (Apple touch icon, 180×180), both downscaled from
the source logo.

**Purpose:** official brand identity asset — the real Vertex Studio mark, an
angular "V" built from crossing diagonal shapes, rendered white on a solid
black square (the PNG has no alpha channel; the black square is baked into
the file). That square-tile look is used deliberately as a "logo chip" — the
image is displayed at a small fixed size with rounded corners, the same
treatment SaaS products commonly use for a monogram mark, rather than being
placed on a transparent/light background where the black square would look
like a rendering artifact.

This is the actual supplied asset, used as-is — no recreation, no
alternative logo, no text placeholder.

### Vertex Quiz Visual Reference

**Source:** `photos/style.webp` (reference only — a screenshot of a
third-party product's dashboard; intentionally **not** copied into
`public/`, since it's not a Vertex Quiz asset and has no reason to be served
to end users).

**Purpose:** primary visual reference for the admin interface's composition,
not for its branding or exact layout.

Design principles extracted from it:

- **Dark navy sidebar / light workspace split.** A persistent dark navy
  navigation rail against a bright, near-white content area — high contrast
  between chrome and content, not between content sections.
- **White cards with subtle borders**, not heavy shadows — separation comes
  from a thin border/background contrast, not elevation effects.
- **Restrained corner radius** across nav items, cards, and stat tiles —
  soft enough to feel modern, sharp enough to feel precise/professional.
- **Strong information hierarchy** — a large page title, clearly grouped
  stat tiles, then list/table content — rather than everything competing for
  attention at once.
- **One controlled accent used for emphasis only** (the reference uses a
  warm accent on exactly one highlighted item), everything else stays
  neutral. This confirmed the existing Vertex Studio token direction: a
  single accent color, applied sparingly, rather than color-coding every
  card.
- **Generous whitespace and compact-but-legible navigation** — the sidebar
  is narrow and text-led with small icons, not icon-only or oversized.

What was **not** carried over, per the brief: its exact logo/branding, its
specific component shapes (pill tabs, avatar stacks, orange highlight
block), its literal grid/layout, and its copy. Vertex Quiz's admin interface
(built starting Phase 2) will follow the principles above while using
Vertex Studio's own navy/violet token system, its own logo, and its own
component design.

## Asset organization

```
photos/              Archival source references (kept, not served)
  logo.png            Original brand asset, full resolution
  style.webp          Third-party UI reference — internal use only

public/brand/         Assets actually shipped in the product
  logo.png            Copy of the official logo, rendered via next/image

src/app/
  icon.png            64×64 favicon, downscaled from photos/logo.png
  apple-icon.png      180×180 Apple touch icon, downscaled from photos/logo.png
```

`photos/` is not deleted or moved — it remains the source-of-truth archive
for original, unmodified reference files.
