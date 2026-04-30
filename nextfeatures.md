All items in this backlog have shipped. New ideas can be added below.

## Done

- ~~The combined parsha `אחרי מות-קדושים` is 15 chars (over the 13-cell
  limit). The `PARSHA_OVERRIDES` map in `app.js` substitutes
  `אחרי מ-קדושים` (13 chars). - this is not working, it is rendering as אחרי מותקדשים for some reason~~ — fixed in PR #15 (`stripNiqqud` was eating the maqaf so the override key never matched).

- ~~please refactor to separate decision logic from date logic~~ — done in PR #15 (`liturgy.js`).

- ~~can the hebrew date picker provide a calendar drop down like the english one~~ — done in PR #15 (`.hcal-popup`); the Gregorian picker now uses the same popup too.

- ~~can the line running through the middle of each character be even lighter~~ — lightened to `rgba(0,0,0,0.05)` in PR #15, then fully concealed by the whole-letter overlay added on the `claude/time-picker-and-seconds` branch.

- ~~first day rosh hashana renders with 5787 at the end, it should render with just א' at the end~~ — overridden in PR #15.

- ~~the date at the top should update when the date is chosen in either picker~~ — fixed in PR #15.
