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

- Cells flex-fill the frame: `.cell { flex: 1 1 0; min-width: 0; aspect-ratio: 3 / 4 }` inside `.board-row { display: flex; width: 100% }`. The frame has `overflow: hidden` so the board always fits the viewport — no horizontal scroll on small screens.
- Font size scales with the cell via container queries (`container-type: inline-size; font-size: 93cqi`).
- `MAX_COLS = 13` caps the row count; `buildGrid` pads every row to the longest-line length (1–13) so all rows have the same number of cells and uniform width.
- The board centres horizontally with `margin: auto`.
- Lines longer than 13 characters are truncated at input time (`renderMessage` slices each line to `MAX_COLS`).

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
- **RTL handling** — the board has `dir="rtl"`, so the default flex row already lays children right-to-left. JS appends only the actual characters (no padding cells) in logical order (`char[0]` → visually rightmost). The board is a flex column with `align-items: center`, so each row sizes to its own char count and shorter rows are centred within the longest-row width.
- **Stagger** — cells fire sequentially across rows (~35 ms apart) so the cascade reads from top-right to bottom-left, like a real platform board.
- **Sizing** — `MAX_COLS = 13` is the hard cap on flaps per row. Every row is padded to the longest-line length so flap counts match across rows, and cells use `flex: 1 1 0` + `aspect-ratio: 3 / 4` so they fill the frame uniformly. Font size scales with each cell via `container-type: inline-size` + `font-size: 93cqi`.

---

## Post-launch fixes

After the initial deploy, two bugs were reported and fixed (PR #3):

1. **Reversed Hebrew words** — the original CSS combined `dir="rtl"` on the board with `flex-direction: row-reverse` on each row, double-reversing the layout so words read LTR. Fix: drop `row-reverse` and reorder the JS appender (chars first, padding after).
2. **Inconsistent wrong letters** — the random-cycle phase fired animated flips every ~75 ms while the CSS fold animation lasted 220 ms. Overlapping flips left stale `animationend` handlers that committed previous targets into the static halves. Fix: cycle phase swaps characters instantly; only the final landing flip is animated, so flips never overlap.

## Post-launch enhancements

- **Letter overlay reliably above seam.** Added `isolation: isolate` to `.cell` (forces a per-cell stacking context) and replaced `backface-visibility: hidden` on the halves with an explicit `z-index: 0`. The `backface-visibility` hint had been promoting the halves onto separate GPU compositing layers in some browsers, which can win the painting order regardless of the .letter's `z-index: 1` and made the seam appear *in front of* the letter glyph rather than behind it.

- **Sefirat HaOmer + special Shabbatot + Modi'in tzeit rollover.** Liturgy now renders Sefirat HaOmer as its own section at the bottom of the board: every day from 16 Nisan through 5 Sivan, the full Ashkenazi text ("היום … לעומר") is broken at structural boundaries (היום / day-phrase / week-phrase / remainder / לעומר) and word-wrapped to ≤13 chars per line. `getOmerDay(hd)` computes the count from `hd.abs() - HDate(16, Nisan, year).abs()`. Masculine cardinals are tabulated in two forms (construct "שני" for "שני ימים / שני שבועות"; absolute "שנים" for compounds "שנים עשר / שנים ועשרים") so the grammatical case shifts correctly with day number. Also added body rows for the four parshiyot (פרשת שקלים / זכור / פרה / החודש), שבת הגדול, שבת מברכים, and ראש חודש — Hebcal events are queried with `shabbatMevarchim: true` and the four parshiyot's English desc is mapped to "פרשת …" rather than Hebcal's stock "שבת …". The Hebrew date / liturgy now roll over at **tzeit hakochavim in Modi'in** (sun 8.5° below the horizon) instead of midnight: a `GeoLocation` + `Zmanim` from Hebcal is constructed once for the rollover location, `tzeitForLocalDate(y,m,d)` returns Hebcal's Zmanim.tzeit(8.5), and `getEffectiveTodayJs(realNow)` shifts to the next Greg date once the wall clock has crossed today's tzeit. A `liveDateMode` flag (true until the user explicitly picks a date) drives `maybeAdvanceLiveDate()`, which is called from each clock tick and from any time-override / "now" button change so the rollover doesn't lag a tick.

- **Temporal polyfill vendored.** Hebcal-core v6.3.3 uses `Temporal.PlainDate` inside `Zmanim` and a few other classes, but Temporal is a Stage-3 proposal that browsers don't yet expose as a global. We previously side-stepped this with a hand-written NOAA solver, but that locked us out of the rest of Hebcal's zmanim (alot, plag, mincha gedola, sof zman shma…) and risked subtle drift from the published ones. Switched to the FullCalendar `temporal-polyfill` (`vendor/temporal-polyfill.min.js`, ~57 KB minified) — loaded before `hebcal-core.min.js` in `index.html` so the polyfill installs `Temporal` on `globalThis` before any Hebcal code runs. `app.js` now constructs a `GeoLocation` + `Zmanim` from Hebcal directly, opening the door to the rest of the zmanim API for future board rows.

- **Regression test suite + CI.** Added `tests/run.js` — a node script that loads the same vendored polyfill + hebcal bundle + `liturgy.js` the page does, then asserts: full Sefirat HaOmer text round-trip for representative days; the ≤13-char wrap invariant for *every* day 1–49; special-Shabbat detection (Shekalim/Zachor/Parah/HaChodesh/HaGadol + Mevarchim co-occurrences); Rosh Chodesh; omer-day computation across both boundaries; Hebcal `Zmanim.tzeit(8.5°)` minute-rounded times for the four seasons in Modi'in; the JS-Date return-type contract `app.js` depends on; that the sister zmanim methods (`sunrise / sunset / chatzot / alotHaShachar / plagHaMincha / minchaGedola`) still exist on the Zmanim instance so we don't accidentally lose them; and a polar-geometry edge case (80°N midsummer — Hebcal returns a Date-with-NaN sentinel). 97 cases total. CI workflow `.github/workflows/tests.yml` runs `node tests/run.js` on every PR and on push to main using Node 20, no install step.

- **Stone texture + engraved letters.** Replaced the solid stone-colour gradients on each flap with a procedural Jerusalem-stone SVG (`stone.svg`) used as `background-image`. The SVG layers four `feTurbulence` filters (mottle, grain, fine speckle, sparse veins) over a warm-cream base, producing a no-dependency limestone material. Each cell randomises `--bg-x` / `--bg-y` so flaps don't repeat, and the bottom half samples a deterministically-offset region from the top so the two halves don't mirror identical pixels. The light/shadow gradient layer was kept on top of the texture (lighter on the upper flap, darker on the lower) to preserve the perceived flap shape. Letters are now styled as **engraved**: the colour is shifted to `rgba(60, 46, 30, 0.78)` (close to the stone) and a paired `text-shadow` (dark above, cream highlight below) gives a chiselled-groove appearance with a top-down light source. The `pages.yml` `sed` step was extended to also rewrite `__COMMIT_SHA__` in `style.css` so the SVG cache-buster works post-deploy.

- **Photographic stone texture.** Replaced the procedural `stone.svg` with `stone.jpg` — a 1024×1024 seamless honed-meleke photo (CC0). Same `--stone-texture` plumbing, smoother finish, more believable mineral variation. ~260 KB JPEG, downscaled to 360 px in CSS.

- **Removed size slider; capped board at 13 cells across.** Dropped the `<input type="range">`, the `--board-scale` CSS variable, and the `transform: scale()` on `.board`. Introduced `MAX_COLS = 13` in `app.js`: `renderMessage` truncates each line to 13 characters, and `buildGrid` writes the actual longest-line length (1–13) onto `--cells-across` on `.board`. The existing `--cell-w` clamp picks up the per-render value, so short messages render at the 96 px ceiling instead of being stretched to fill the row.

- **Lighter wood frame, centred rows.** Display housing switched from dark walnut to a honey-oak gradient (`--wood-light` / `--wood-dark`); inset highlight/shadow tuned for the lighter tone. `buildGrid` now splits padding cells around the chars (`padBefore` / `padAfter`) so each row is centred within the board instead of right-aligned. Odd padding totals bias the extra cell to `padAfter` (visual left = end of line in RTL).

- **Reverted to walnut frame; row centring via flex.** The lighter wood didn't suit the design — restored the original `--walnut` / `--walnut-dark` gradient on `.display-frame` and the original inset highlight/shadow values. The `padBefore` / `padAfter` split also didn't visually centre rows the way intended (a 12-char row in a 13-cell grid still looked right-leaning), so `buildGrid` now creates **no padding cells at all** — each row sizes to its own char count and the board's `align-items: center` (flex column) centres shorter rows within the longest-row width. `--cells-across` is still set from the longest line so cell width stays consistent across rows.

- **Uniform rows + flex-fill cells; no horizontal scroll.** Brought padding cells back so every row has the same flap count (= longest-line length, capped at 13) and switched cell sizing to `flex: 1 1 0` + `aspect-ratio: 3 / 4`. The board's row is `width: 100%`, so cells share the available frame width equally and the entire board scales to fit the viewport on any screen. Removed the `--cells-across` / `--cell-w` / `--cell-h` clamp plumbing — no longer needed. Font size now scales with each cell via `container-type: inline-size` + `font-size: 93cqi`. `.display-frame { overflow: hidden }` so nothing scrolls left/right. Padding within rows is split around the chars (`padBefore` / `padAfter`) so each line is visually centred.

- **Clock + Hebrew date header; default 7-line message.** Added a brass-toned `.board-header` inside `.display-frame` above the flaps. The 24-hour Asia/Jerusalem time sits on the visual left and the Hebrew calendar date (locale `he-IL-u-ca-hebrew-nu-hebr`) on the visual right via `flex` + `justify-content: space-between`. `updateClock()` formats both with `Intl.DateTimeFormat` and re-ticks aligned to the next minute boundary so the time stays in sync with wall-clock minutes. Default textarea content extended from 4 to 7 sample lines (`rows="7"`).

- **Header rendered as flap cells.** Replaced the brass-text header with a real `.board-row` of the same flap cells used for the message: 8 cells of Hebrew date on the visual right, 5 cells of `HH:MM` time on the visual left, padding cells in the middle (13 total — same as every body row, so flap sizes stay uniform). `dayGematria()` builds Hebrew day numerals manually (ט״ו / ט״ז for 15 / 16) so the result doesn't depend on `nu-hebr` browser support; `formatHebrewDate()` falls back to mark-stripped or truncated forms only for leap-year Adar A / B and a couple of other dates that exceed 8 chars with full marks. `updateClock` cancels any in-progress cycle on a cell before flipping (so a minute tick mid-cascade doesn't stomp the cycle), and `buildGrid` now always pads body rows to `MAX_COLS = 13` so the header and message rows share identical cell widths regardless of message length.

- **Header redesign + right-aligned body.** The header is now two separate, smaller flap panels (`.board-header` containing `.header-section.header-date` and `.header-section.header-time`) with `justify-content: space-between` so the date and time read as distinct plates rather than one long row. Header cells are sized from `5cqw` (queried against `.display-frame`, which now has `container-type: inline-size`) clamped 20–56 px — roughly half the body-cell width. The time panel carries an explicit `dir="ltr"` so `HH:MM` reads forwards; the date panel inherits the board's `dir="rtl"`. Body rows switched from centred padding back to right-aligned: chars are appended in logical order first (visually rightmost), trailing padding cells fall on the visual left.

- **Time picker, ?seconds flag, identical date pickers, letter overlay, responsive header.** (1) Added a `<input type="time" step="1">` + "חזרה לזמן הנוכחי" button so the user can override the displayed clock. The override stores an anchor (chosen instant + real-time instant) and ticks forward as `anchor + (Date.now() - anchorReal)`; clearing returns to wall-clock. (2) `?seconds` URL flag renders `HH:MM:SS` and re-ticks every second — `TIME_COLS`, the `Intl.DateTimeFormat` `second` field, and `scheduleNextClockTick`'s period are all gated on `SHOW_SECONDS`. (3) The Gregorian picker now mirrors the Hebrew one — three selects (day / month / Hebrew-named months / year) plus a 📅 popup reusing the `.hcal-*` classes — replacing the native `<input type="date">` so both calendars look identical. (4) Added a `.letter` overlay element to each cell that draws the full character above the two halves, hidden during the flip animation, so the seam no longer visually bisects the character in the static state. (5) Header cells switched from `clamp(20px, 5cqw, 56px)` to `min(56px, 5cqw)` with `flex: 0 1 auto` and `min-width: 0` on both the section and the cells, so the date + time row shrinks uniformly to fit narrow viewports instead of overflowing.

- **Israeli days, Chanukah, Purim, אל הניסים row, Hebrew year + date picker (#17).** Added the Hebrew year selector (gematria years dropdown), expanded liturgy to include Israeli civil-religious days, a dedicated Chanukah / Purim row, and the על הנסים insertion. Hebrew date selectors gained a year dropdown to replace inferring year from today.

- **Parsha look-ahead + ?instant flag for testing (#16).** When the selected date's upcoming Shabbat has no regular reading (e.g. mid-week of Chol HaMoed), the parsha algorithm advances week by week (up to 5 attempts) so the display always shows the next regular parsha. `?instant` URL flag bypasses all flip animation, swapping characters immediately — useful for visually verifying liturgical decisions without waiting for the cascade.

- **Shorten חול המועד סוכות → ח המועד סוכות.** The 13-char limit on row 1 forced the abbreviated form for Sukkot Chol HaMoed.

- **יעלה ויבוא row + holiday display + parsha override (#15).** Added the conditional יעלה ויבוא row (Yom Tov / Chol HaMoed / Rosh Chodesh) which, when present, pushes the rain/dew rows down by one. Holiday display fires before the parsha fallback. Parsha overrides map combined parshiot to short forms that fit 13 chars.

- **Liturgy refactor + Hebrew month picker + assorted fixes.** Decision logic moved out of `app.js` into a new `liturgy.js` (`window.Liturgy.getDisplayText` etc.) so the render engine and the halachic rule set live in separate files. Bug fixes: (1) `stripNiqqud` now preserves the maqaf (U+05BE) — the previous regex stripped it as part of the niqqud range, so the Hebcal output `אַחֲרֵי מוֹת־קְדֹשִׁים` collapsed to `אחרי מותקדשים` and the `PARSHA_OVERRIDES` short form never matched. The override key was also updated to use the maqaf and the short Hebcal spelling (`אחרי מות־קדשים` → `אחרי מ־קדשים`). (2) Rosh Hashana day 1 came back from Hebcal as `ראש השנה 5787` (year suffix instead of day numeral); now overridden to `ראש השנה א׳` for symmetry with day 2. (3) The `border-bottom` line splitting top/bottom flap halves was lightened to `rgba(0,0,0,0.05)` (was 0.15) so the engraved text reads cleaner. (4) The header date now reflects the *selected* date, not always today — `buildHeaderRow`/`updateClock` take `selectedDate` as input while the time keeps ticking from the wall clock. (5) Added a clickable Hebrew month-grid popup next to the year/month/day selectors — clicking a day sets both pickers and re-renders the board; `◀ ▶` nav steps months including the leap-year 13.

---

## Out of Scope (v1)

- Server-side rendering
- Sound effects
- Saving/loading messages
- Vowel diacritics (niqqud) — display consonants only for clean flap sizing
