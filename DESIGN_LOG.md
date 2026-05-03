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
- Default theme is now `attempt4`. Attempts 1–3 stay selectable for
  comparison.
