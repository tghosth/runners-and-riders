# Design Log

Tracks design experiments on the split-flap board. Each entry names the
commit that introduces the design and a short description of the changes.

The split-flap mechanism, RTL layout, and all liturgical content stay the
same across attempts — only visual styling moves.

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
