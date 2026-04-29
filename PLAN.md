# Hebrew Split-Flap Display — Implementation Plan

## Overview

A single-page web app that renders multi-line Hebrew text as an animated split-flap (Solari board) display, styled with the warm cream/amber tones of Jerusalem stone.

---

## Visual Design

### Jerusalem Stone Palette
| Role | Hex | Notes |
|---|---|---|
| Background | `#F5ECD7` | Warm limestone cream |
| Flap face (lit) | `#E8D5A3` | Polished stone surface |
| Flap face (shadow) | `#C9A96E` | Shadowed lower half |
| Flap border / housing | `#8B6914` | Dark ochre, iron bracket feel |
| Display surround | `#3D2B1F` | Deep walnut, cast-iron frame |
| Text | `#1A0F00` | Near-black ink on stone |
| Accent glow | `#D4A017` | Warm brass highlight |

### Typography
- Font: **Frank Ruhl Libre** (Google Fonts) — classical Hebrew newspaper/stone-engraving style
- Direction: `rtl`, `unicode-bidi: bidi-override`
- Weight: 700 for maximum legibility on small flaps

---

## Architecture

```
/
├── index.html          # Single HTML file, all self-contained
├── style.css           # Jerusalem stone theme + flap animation
├── app.js              # Split-flap engine + Hebrew character set
└── PLAN.md             # This file
```

Single-file deployment is an acceptable alternative (everything inlined into `index.html`) for maximum portability.

---

## Component Breakdown

### 1. Flap Character Cell
Each character occupies a fixed-size card split horizontally:
- **Top half** — shows the character's upper portion (static during idle)
- **Bottom half** — shows the character's lower portion (static during idle)
- On flip: a CSS 3D rotation animates the **departing** top/bottom halves while the new character's halves slide in, mimicking a mechanical flap

```
┌──────────┐
│  upper   │  ← top-half div, rotateX(0) → rotateX(-90deg)
├──────────┤
│  lower   │  ← bottom-half div, rotateX(90deg) → rotateX(0)
└──────────┘
```

### 2. Display Grid
- N rows × M columns of flap cells
- Row count and column count are derived from the longest line and line count of the input text
- Cells not occupied by a character display a blank flap (space character)
- The grid width is resizable via a range slider (scales the entire board via CSS `transform: scale()`)

### 3. Character Set
Hebrew Unicode block: `א`–`ת` (alef–tav, 22 letters) plus final forms `ךכםמנףפץצ` and space, punctuation, digits.

The flap animation cycles through a random subset of the character set before landing on the target character, just like a real Solari board.

### 4. Text Input
A `<textarea>` above the display accepts multi-line Hebrew input (`dir="rtl"`). A **"Set Display"** button triggers the flip sequence. A default message is pre-loaded on page load.

### 5. Resize Control
A range slider (`<input type="range">`) labelled "גודל" (size) scales the board from 50 % to 200 % of its base size via a CSS custom property `--board-scale`.

---

## Animation Sequence

```
For each character position [row][col]:
  1. Schedule a staggered timeout: delay = (row * cols + col) * STAGGER_MS
  2. Begin cycling: pick random Hebrew chars at CYCLE_INTERVAL_MS
  3. After CYCLE_COUNT flips, land on target character
  4. Apply CSS class .flap-flip for the 3D fold animation per flip
```

Constants (tunable):
- `STAGGER_MS` = 40 ms per cell offset
- `CYCLE_INTERVAL_MS` = 80 ms between random flips
- `CYCLE_COUNT` = 6–10 random flips before settling

---

## CSS Animation Detail

```css
/* Each flap cell */
.cell { perspective: 200px; }

/* Top half folds away */
@keyframes fold-top {
  0%   { transform: rotateX(0deg); }
  100% { transform: rotateX(-90deg); }
}

/* Bottom half unfolds in */
@keyframes unfold-bottom {
  0%   { transform: rotateX(90deg); }
  100% { transform: rotateX(0deg); }
}
```

A thin horizontal line (1 px, dark ochre) between the halves simulates the physical gap between flap panels.

---

## Responsive / Resizable Behaviour

- Cell width is derived from the viewport so `--cells-across` (default 15) cells fit the screen: `--cell-w: clamp(16px, calc((100vw - 6rem) / var(--cells-across)), 96px)`. Height tracks 4:3.
- The `--board-scale` CSS variable is layered on top via `transform: scale()` for fine adjustment.
- The board centres horizontally with `margin: auto`.
- Lines longer than 15 characters overflow horizontally inside the frame (`overflow: auto`).

---

## Accessibility

- `lang="he"` on the `<html>` element
- `dir="rtl"` on the board and input
- `aria-label` on the display region describing it as a split-flap board
- Reduced-motion media query: when `prefers-reduced-motion: reduce`, characters update instantly without animation

---

## Deliverables Checklist

- [x] `index.html` — page structure, Google Font import, textarea, slider, board container
- [x] `style.css` — Jerusalem stone colour theme, flap cell layout, 3D keyframe animations
- [x] `app.js` — Hebrew character set, flip engine, stagger scheduler, resize handler
- [x] Default Hebrew message pre-loaded (`שלום ירושלים` + 3 more lines)
- [x] GitHub Pages deployment workflow (`.github/workflows/pages.yml`)
- [x] Bug fixes shipped: RTL reversal + animation race (see *Post-launch fixes*)
- [ ] Tested in Chrome and Firefox after PR #3 redeploy

---

## Deployment — GitHub Pages

A workflow at `.github/workflows/pages.yml` deploys the site automatically on every push to `main`:

1. Checks out the repo
2. Configures Pages (`actions/configure-pages@v5`)
3. Uploads the repo root as a Pages artifact
4. Deploys via `actions/deploy-pages@v4`

### One-time enablement (manual step in GitHub UI)
Pages must be enabled in the repository before the first deploy succeeds:

1. Open **Settings → Pages**
2. Under **Build and deployment → Source**, select **GitHub Actions**

After this, every push to `main` will rebuild and publish the site at:
`https://tghosth.github.io/runners-and-riders/`

The workflow can also be triggered manually via **Actions → Deploy to GitHub Pages → Run workflow**.

---

## Implementation Notes

- **Character set** — Hebrew alphabet (incl. final forms ך ם ן ף ץ), space, punctuation (`. , ! ? ־ ׳ ״`), digits 0–9.
- **Flap mechanism** — each cell has two static halves (top + bottom) showing the *current* character. A third element, `.flap`, sits over the top half showing the *next* character. On the final landing flip, that flap rotates `0deg → -90deg` around its bottom edge; on animation end, both static halves are updated to the new character and the flap is reset.
- **RTL handling** — the board has `dir="rtl"`, so the default flex row already lays children right-to-left. JS appends characters in logical order (`char[0]` first → visually rightmost) followed by trailing padding cells which fill the left side, right-aligning short lines.
- **Stagger** — cells fire sequentially across rows (~35 ms apart) so the cascade reads from top-right to bottom-left, like a real platform board.
- **Resize** — a `--board-scale` CSS variable on `:root` is updated by the slider and applied via `transform: scale()` on `.board`.

---

## Post-launch fixes

After the initial deploy, two bugs were reported and fixed (PR #3):

1. **Reversed Hebrew words** — the original CSS combined `dir="rtl"` on the board with `flex-direction: row-reverse` on each row, double-reversing the layout so words read LTR. Fix: drop `row-reverse` and reorder the JS appender (chars first, padding after).
2. **Inconsistent wrong letters** — the random-cycle phase fired animated flips every ~75 ms while the CSS fold animation lasted 220 ms. Overlapping flips left stale `animationend` handlers that committed previous targets into the static halves. Fix: cycle phase swaps characters instantly; only the final landing flip is animated, so flips never overlap.

---

## Out of Scope (v1)

- Server-side rendering
- Sound effects
- Saving/loading messages
- Vowel diacritics (niqqud) — display consonants only for clean flap sizing
