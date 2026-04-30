# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A static, single-page web app that renders multi-line Hebrew text as an animated split-flap (Solari) display, styled with the warm cream/ochre/walnut tones of Jerusalem stone.

Live site: https://tghosth.github.io/runners-and-riders/

## Stack

- Plain HTML / CSS / JavaScript — no build step, no framework, no dependencies
- One Google Font: **Frank Ruhl Libre** (loaded via `<link>` in `index.html`)
- Hosted on GitHub Pages via the workflow in `.github/workflows/pages.yml`

## Layout

```
/
├── index.html                  # Page structure: textarea, button, slider, board
├── style.css                   # Jerusalem stone palette + 3D flap-fold animation
├── app.js                      # Split-flap engine, Hebrew character set, scheduler
├── liturgy.js                  # Liturgical decision logic (parsha, holidays, יעלה ויבוא, etc.)
├── PLAN.md                     # Living implementation plan + changelog
├── CLAUDE.md                   # This file
└── .github/workflows/pages.yml # Auto-deploy to GitHub Pages on push to main
```

## How it works

- The textarea accepts multi-line Hebrew input. On **הצג על הלוח** (or `Ctrl/Cmd+Enter`), `renderMessage()` rebuilds the flap grid sized to the longest line, capped at `MAX_COLS = 13`. Lines longer than 13 chars are truncated.
- Each cell has three layers: a static top half, a static bottom half (both showing the current character), and a `.flap` overlay that rotates 0° → -90° on the final landing flip.
- During the random-cycle phase, characters are swapped instantly with `setCellChar`. **Only the final flip is animated** — this avoids overlapping flips committing stale targets via late `animationend` handlers (the bug fixed in PR #3).
- The board has `dir="rtl"`, so the default flex row already lays children right-to-left. JS pads every body row to `MAX_COLS = 13`. Chars are appended in logical order (`char[0]` → visually rightmost), then trailing padding cells (visually leftmost) — so messages always start at the right and any unused cells fall off the left. **Do not add `flex-direction: row-reverse`** — that double-reverses the layout and Hebrew reads backwards.
- Body cells use `flex: 1 1 0` + `aspect-ratio: 3 / 4`, so the row fills the frame and the cells share the available width equally. Font size scales with the cell via `container-type: inline-size` and `font-size: 93cqi`. `.display-frame` uses `overflow: hidden` so the board never scrolls horizontally.
- The first child of the board is the **clock + Hebrew date header** (`.board-header`) — two smaller flap panels with `justify-content: space-between` so the date sits at the visual right and the time at the visual left of the frame. Header cells size from `5cqw` (queried against `.display-frame`) clamped 20–56 px, so they're roughly half the body cell width regardless of viewport. The time section has `dir="ltr"` (override against the RTL board) so `HH:MM` reads correctly; the date section inherits `dir="rtl"` so Hebrew reads right-to-left. `dayGematria()` builds Hebrew day numerals manually (ט״ו / ט״ז for 15 / 16) since `nu-hebr` rendering is uneven across browsers. `formatHebrewDate()` strips geresh / gershayim if the date overflows `DATE_COLS = 8` (typical leap-year Adar A / B).
- `scheduleNextClockTick()` recursively `setTimeout`s to the next wall-clock minute boundary; on each tick `updateClock()` flips just the cells whose char actually changed (cancelling any in-progress cycle on the same cell to prevent two animations stomping each other).
- `prefers-reduced-motion: reduce` short-circuits all animations to instant character swaps.

## Conventions

- Hebrew is right-to-left throughout: `<html lang="he" dir="rtl">`, textarea has `dir="rtl"`, board has `dir="rtl"`.
- Final letter forms (ך ם ן ף ץ) are part of `CHAR_SET` in `app.js`.
- Niqqud (vowel diacritics) is intentionally out of scope — characters are sized assuming bare consonants.
- Colour palette is defined as CSS custom properties on `:root` in `style.css` (`--stone-*`, `--ochre`, `--walnut*`, `--brass`, `--ink`). Reference these rather than hardcoding hex values.

## Local development

No build step. Either:

```sh
# Just open the file
open index.html

# Or serve over HTTP (recommended — Google Fonts and some browsers prefer http(s))
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deployment

`.github/workflows/pages.yml` deploys the repo root to GitHub Pages on every push to `main` (and via manual `workflow_dispatch`). Pages is configured in **Settings → Pages → Source: GitHub Actions**.

The site URL is `https://tghosth.github.io/runners-and-riders/`. Allow ~1 minute after merge for the deploy to complete.

## Branching

- Develop on a feature branch, open a PR against `main`, merge via squash.
- The branch name pattern used so far: `claude/<short-description>` (e.g. `claude/hebrew-flap-fix-rtl-and-race`).
- After a squash merge, GitHub deletes the head branch automatically — re-create from `main` for further work; do not force-push merged branches back.

## When making changes

- Test the rendered page in a browser (Chrome / Firefox) — type-checking and linters won't catch RTL or animation regressions.
- Watch for two known foot-guns:
  1. **RTL double-reverse.** Don't add `flex-direction: row-reverse` to `.board-row`.
  2. **Animation overlap.** If you reintroduce animated flips inside the cycle phase, make sure the cycle interval is ≥ the CSS animation duration, or chain flips on `animationend`.
- Update `PLAN.md` (deliverables checklist + post-launch fixes section) when shipping behaviour changes.
