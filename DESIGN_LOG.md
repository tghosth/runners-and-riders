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
