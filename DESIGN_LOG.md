# Design Log

Tracks design experiments on the split-flap board. Each entry names the
commit that introduces the design and a short description of the changes.

The split-flap mechanism, RTL layout, and all liturgical content stay the
same across attempts — only visual styling moves.

## Comparing live

All three designs ship as separate stylesheets (`theme-baseline.css`,
`theme-attempt1.css`, `theme-attempt2.css`) and load together on page
open. The **עיצוב** dropdown at the top of the controls switches between
them instantly; selection is persisted in `localStorage` under the key
`design-theme`. Theme-switcher infrastructure was added in `f329c99`.

## Baseline

- **`17e2134`** — *Even up section widths and tidy the cell seam*
- Jerusalem-stone palette (cream / ochre / walnut), Frank Ruhl Libre serif,
  stone-textured flap faces with chiselled letter shadow, walnut display
  frame with brass trim. Square corners, cells flush with no gap, header
  and footer separated from the body by a 6 px margin.

## Attempt 1: Modern light wood + frosted glass

- **`c246035`** — *Design Attempt 1: modern light wood + frosted glass*
- Heebo modern Hebrew sans-serif (weight 600 in the cells).
- Stone slab texture dropped; flap faces are smooth cream gradients
  (`--flap-light` / `--flap-mid` / `--flap-deep`).
- Display frame: light ash-wood gradient with brushed-champagne trim,
  rounded to 18 px.
- Text shadow simplified from a chiselled triple-stack to a single
  faint highlight.
- Palette retuned cooler: slate text, muted earth accent, off-white
  page background.
- **Feedback:** wood OK; tiles look blocky/artificial rather than
  glass; Heebo disliked.

## Attempt 2: Glassier tiles + Bellefair (Koren-substitute)

- **`20054c2`** — *Design Attempt 2: glassier tiles + Bellefair (Koren-substitute)*
- Wood frame and overall palette kept from Attempt 1.
- Tiles: `--flap-*` retuned to a near-white range
  (`#fefcf6` → `#f4eedb` → `#e6dcc1`) for a translucent glass feel
  instead of opaque painted blocks.
- Each face gets a radial sheen at the top + a 1.5 px inset white
  highlight along the top edge. With `--cell-gap: 0`, that highlight
  doubles as a shelf-line at every row boundary.
- Bottom half adds a faint inner shadow at its base to suggest glass
  thickness.
- Font: Heebo → **Bellefair** (Google Fonts), the closest free
  equivalent to **Koren** — Koren is a commercial Koren Publishers
  Jerusalem typeface and isn't available as a free web font, so this
  is a substitute. Swap the URL in `index.html` if a Koren web-font
  license is sourced.
- Bellefair is single-weight 400, so cell/flap/letter font-weight is
  400 to use the natural strokes (no synthetic bold). Fallback chain
  corrected to a serif stack.
- **Feedback:** tiles still read as cheap plastic; Bellefair too
  thin / unclear at large sizes.

## Attempt 3: Cool glass + David Libre 700

- **`00453b5`** — *Design Attempt 3: cool glass + David Libre 700*
- Wood frame kept; tile palette shifted from warm cream to cool
  off-white with a faint green undertone so the flaps read as cold
  glass rather than warm cream plastic. `--flap-light #f4f6f2` /
  `--flap-mid #dde0db` / `--flap-deep #babfb8`.
- Highlights are now sharp specular reflections rather than soft
  sheens: a thin (0–18%) linear highlight at the very top of each
  face plus an ambient radial sky-glow below it. Top-edge inset is
  2 px at 0.95 alpha (was 1.5 px / 0.85).
- Glass thickness: the bottom half gains a 1 px dark hairline at
  its base + a soft inner shadow above it, reading as the underside
  thickness of a real piece of glass. A faint sub-reflection at the
  top of the bottom half keeps the two halves feeling continuous.
- Font: Bellefair → **David Libre at weight 700**. Same elegant
  Hebrew-serif lineage as Bellefair / Koren, but with a proper bold
  weight that's much clearer at the large board sizes. Cell / flap /
  letter overlays all use 700 explicitly.
- **Feedback:** still reads as plastic; want it more glassy.

## Attempt 4: Actually-translucent glass

- **`43b21b9`** — *Design Attempt 4: actually-translucent glass*
- Same cool palette and David Libre 700 as Attempt 3. The big move
  is genuine translucency: the cells let the wood frame underneath
  show through, instead of opaque gradients pretending to be glass.
- New RGB-triplet vars (`--flap-light-rgb` etc.) so the half / flap
  rules can drop them into `rgba()` at runtime.
- `.cell` background: solid `--walnut-dark` → `transparent`. The
  `.display-frame`'s wood gradient is now what's behind every cell.
- `.half` / `.flap` base gradients use `rgba()` at alpha 0.86–0.94
  so ~10–14 % of the wood bleeds through. Subtle but measurable —
  this is what reads as "glass over wood" instead of "tile on wood".
- Specular highlights pushed harder: top linear band tightened to
  0–14 % at alpha 0.7 (was 0–18 % at 0.55), plus a 14 px / 0.18
  inner-glow inset for a "lit from within" feel, plus a new
  lens-style radial highlight (55 % × 65 % at 50 / 35) suggesting
  the front face is slightly convex.
- Bottom-half thickness emphasised: hairline bumped to alpha 0.12,
  inner shadow extended to 4 px / 0.08.
- **Feedback:** push it further — make it more glassy.

## Attempt 5: Real frosted glass via backdrop-filter

- **`8cd7487`** — *Design Attempt 5: real frosted glass via backdrop-filter*
- Commits to glass-on-wood by combining all three directions
  suggested at the end of Attempt 4.
- `--cell-gap: 0 → 3 px`. Each cell is visibly a discrete piece of
  glass set into the wood frame; wood shows through the gaps
  between tiles and at every row boundary.
- `backdrop-filter: blur(10px) saturate(115%)` on `.half` / `.flap`.
  This actually blurs the `.display-frame`'s wood gradient behind
  each face — the canonical frosted-glass effect, not a faked one.
  `-webkit-` prefix included for Safari.
- Tint alpha lowered to 0.55–0.72 (from 0.86–0.94 in Attempt 4) so
  the blurred wood backdrop is the dominant material reading, not
  the cream tint on top of it.
- `isolation: isolate` dropped from `.cell` — backdrop-filter needs
  to see through to the frame layer; `.letter` still paints above
  `.flap` because both have explicit z-index.
- Highlights kept from Attempt 4 (sharp top specular, sky-glow,
  lens-style central highlight, top-edge inset, inner glow, bottom
  hairline + thickness shadow).
- **Feedback:** the 3 px gap broke Hebrew readability — each
  letter felt isolated from the next.

## Attempt 6: Continuous frosted glass (drop the gap)

- **`19e9bf9`** — *Design Attempt 6: continuous frosted glass (drop the gap)*
- Same frosted-glass material as Attempt 5 (backdrop-filter blur on
  the wood, alpha 0.55–0.72 cool tint, sharp top specular,
  sky-glow, lens-style central highlight, top-edge inset, inner
  glow, bottom hairline + thickness shadow).
- `--cell-gap: 3 px → 0`. Adjacent cells touch and a row reads as
  one continuous frosted-glass strip with letters set into it.
- The wood frame is still present *under* every cell, so
  backdrop-filter has the same backdrop to blur — the glass effect
  is preserved, the readability cost is gone. Cells remain
  individually animated for the flip mechanic; only the static
  appearance merges.
- **Feedback:** the seam between top and bottom halves reads as a
  hard boundary — wanted a smoother transition.

## Attempt 7: Smooth top → bottom transition

- **`27da4ef`** — *Design Attempt 7: smooth top → bottom transition*
- Same material as Attempt 6. Three changes that together remove
  the visible step at the seam:
  1. Flap's `border-bottom` from `rgba(0,0,0,0.14)` to
     `rgba(0,0,0,0.04)` — barely visible at rest, still defines
     the falling-flap edge during the flip animation.
  2. The bottom half's sub-reflection (a `linear-gradient` white
     band at its top) is removed — that band was creating a bright
     stripe right below the seam.
  3. The flap's base tint end alpha matches the bottom half's
     start exactly (both `--flap-mid` at 0.62) so the colour
     handoff is identical.
- The full-perimeter inner glow (`inset 0 0 14px`) is replaced
  with side-only insets, mirrored on both halves. The flap's
  bottom edge and the bottom half's top edge no longer get extra
  brightening that wouldn't continue across the seam.
- **Feedback:** still reads as two halves — the *overall*
  brightness of the top is higher than the bottom because the
  highlights live on `.flap` / `.half.top` and never reach the
  bottom half. Need the highlight effect itself to fade smoothly
  across the seam.

## Attempt 8: Cell-spanning highlight overlay

- **`b20ee52`** — *Design Attempt 8: cell-spanning highlight overlay*
- Lifts every glass highlight off the per-half elements (which
  are physically constrained to the upper or lower 50 % of the
  cell) onto a single `.cell::before` overlay that spans the full
  cell. Brightness now tapers continuously from top to bottom with
  no half-vs-half step.
- Highlights on `.cell::before`:
  - Sharp specular `0%–7%` of cell.
  - Sky-glow ellipse `130% × 60%` at `50% / 0%` — height in cell
    units this time, so it fades through the seam.
  - Lens highlight ellipse `55% × 50%` at `50% / 30%` — its faded
    edges extend well past the seam.
  - Top-edge inset (2 px white) + side inner glows (left + right)
    now span the whole cell via `box-shadow`.
- `.half` / `.flap` drop their highlight gradients and side glows
  entirely — now just translucent base tint + `backdrop-filter`
  blur.
- `.flap` z-index 2 → 1 so the new overlay (z-index 2) paints
  over it just like over the static halves; `.letter` stays at 3.
- Side effect: during the flip animation the highlights stay still
  while the flap rotates underneath — actually reads as more
  realistic glass (environmental reflections don't move with a
  falling tile).
- Default theme is now `attempt8`. Attempts 1–7 stay selectable.
