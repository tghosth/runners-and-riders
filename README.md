# Runners & Riders

A static, single-page web app that renders the day's Hebrew calendar
information as an animated split-flap (Solari) display, styled with the
warm cream / ochre / walnut tones of Jerusalem stone.

**Live site:** https://tghosth.github.io/runners-and-riders/

```
                                                ┌────────────┐
                                                │ ה' ניסן … │   ← header (top): Hebrew date
                                                ├────────────┤
                                                │  יום ד'  14:32  │ ← header (bottom): day-of-week + time
                                                ├────────────┤
                                                │ פרשת שמיני   │ ← body: parsha (or holiday)
                                                │ ראש חודש    │   special Shabbat / Mevarchim /
                                                │ יעלה ויבוא  │   chag / fast / R"Ch /
                                                │ ותן טל ומטר │   tal-matar / geshem-tal /
                                                │ מוריד הגשם  │   על הניסים — only the rows that
                                                │             │   apply to today actually appear
                                                │             │
                                                ├────────────┤
                                                │ היום שני ימים │ ← footer (only during Sefirat
                                                │   לעומר      │   HaOmer): the day's count in
                                                │             │   smaller flap cells
                                                └────────────┘
```

The Hebrew calendar day rolls over at **tzeit hakochavim in Modi'in**
(sun 8.5° below the horizon — the Geonim convention) rather than
midnight, and the board auto-advances at that moment.

---

## How it's built

Plain HTML / CSS / JavaScript with no build step and no framework. Two
vendored dependencies load as plain `<script>` tags:

- `vendor/temporal-polyfill.min.js` — FullCalendar's Temporal polyfill
  (~57 KB). Required because Hebcal-core uses `Temporal.PlainDate`
  internally and `Temporal` isn't yet a browser global.
- `vendor/hebcal-core.min.js` — `@hebcal/core` v6.3.3 — Hebrew calendar
  arithmetic, holiday events, parsha schedule, and Zmanim (sun calc).

Everything else is hand-written:

| File | What's in it |
|---|---|
| `index.html` | Page structure: board frame, date / time / nav controls, footer |
| `style.css` | Jerusalem stone palette, flap-cell layout, 3D fold animation |
| `app.js` | Split-flap engine, header / body / footer layout, scheduler, date pickers, tzeit rollover |
| `liturgy.js` | What goes on each row — Hebcal queries, holiday overrides, Sefirat HaOmer text, balanced line-wrap |
| `tests/run.js` | Regression suite — see [Tests](#tests) below |

The full row-order rules and grammatical conventions are documented
separately in [`LITURGY.md`](LITURGY.md).

---

## Configuration

### URL flags

| Flag | Effect |
|---|---|
| `?instant` | Skip all flap animation — cells show their final character immediately. Useful for visually verifying liturgical decisions without waiting for the cascade. |
| `?seconds` | Render `HH:MM:SS` in the header time block (and tick once a second instead of once a minute). |

### In-page controls

- **Hebrew date picker** — three selects (day / month / year) plus a
  `📅` button that opens a clickable Hebrew month grid. Year and month
  selectors handle leap years (Adar I / Adar II) automatically.
- **Gregorian date picker** — mirror of the Hebrew picker; same
  three-select + month-grid popup pattern.
- **Time picker** — overrides the displayed clock to a chosen wall-time;
  the override ticks forward in real time. Useful for previewing the
  tzeit rollover before it happens.
- **◀ / ▶ stepper** — advance or rewind the displayed date by one
  civil day at a time.
- **חזרה לעכשיו** ("return to now") — clears the time override *and*
  re-enters live mode (the date snaps back to today's effective Hebrew
  day, and the auto-advance at tzeit resumes).

### Code-level knobs

Drop into `app.js` for layout / location / pace, `liturgy.js` for what
counts as a "special" day:

| Constant | File | Purpose |
|---|---|---|
| `FLICKER_SCALE` | `app.js` | Single knob for the load cascade pace. **10 = baseline**, 5 = 2× faster, 20 = 2× slower. Scales the row stagger and per-cell flip count; the per-flap CSS animation stays constant so individual tile turns always feel snappy. |
| `ROLLOVER_LAT` / `_LON` / `_ELEV` / `_TZ` / `_DEPRESSION_DEG` | `app.js` | The geographic location used for the tzeit-hakochavim rollover. Currently hardcoded to Modi'in; swap for a different lat/lon (or wire to a UI picker / geolocation) to relocate. |
| `HEADER_COLS` / `HEADER_NOTILE_COLS` / `TIME_COLS` | `app.js` | Header row geometry. Both header rows are `HEADER_COLS = 18` flap-cells wide; the bottom row reserves `HEADER_NOTILE_COLS = 2` cells of pure brass between the day-of-week and the time. |
| `FOOTER_COLS` / `FOOTER_MAX_LINES` | `app.js` | Sefirat HaOmer footer geometry. Default 20 cols × 3 lines is the smallest grid that holds every omer day's text. |
| `KEPT_MODERN_HOLIDAYS` | `liturgy.js` | Allowlist of Hebcal `MODERN_HOLIDAY` events to surface (default: Yom HaShoah, Yom HaZikaron, Yom HaAtzma'ut, Yom Yerushalayim, Sigd). Adding a desc here lights it up; everything else under that flag stays hidden. |
| `KEPT_MINOR_HOLIDAYS` | `liturgy.js` | Same pattern for `MINOR_HOLIDAY` events (default: Lag BaOmer, Tu BiShvat). |
| `HOLIDAY_OVERRIDES` / `SPECIAL_SHABBAT_MAP` / `PARSHA_OVERRIDES` | `liturgy.js` | Per-event Hebrew label overrides — used both to hand-pick a more recognisable name and to compress labels that would otherwise overflow the 13-cell row width. |

---

## Local development

No build step. Either:

```sh
# Just open the file
open index.html

# Or serve over HTTP (recommended — Google Fonts and some browsers
# prefer http(s))
python3 -m http.server 8000
# then visit http://localhost:8000
```

---

## Tests

```sh
node tests/run.js
```

Walks every Hebrew date for ~16 years and asserts no body row exceeds
13 chars, plus targeted unit tests for the Sefirat HaOmer text, special
Shabbatot detection, the modern / minor holiday allowlists, fast-day
handling, the day-of-week mapping, and Modi'in tzeit times across the
four seasons. ~200 cases.

CI runs the same suite on every PR and on push to `main`
(`.github/workflows/tests.yml`).

---

## Deployment

`.github/workflows/pages.yml` deploys the repo root to GitHub Pages
on every push to `main` (and via manual `workflow_dispatch`). Pages is
configured in **Settings → Pages → Source: GitHub Actions**. Allow
~1 minute after merge for the deploy to complete.

The workflow injects the commit SHA into `index.html` and `style.css`
to bust the browser cache for `app.js`, `liturgy.js`, the polyfill, and
the stone texture image.
