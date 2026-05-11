# Liturgical Display Logic

This document records the exact rules used to decide what text appears on
the board for a given date. All rules apply to **Israel** only.

The display has three regions:

```
┌─────────────────────────────────────────────────┐
│  Hebrew date  ↔  ↔  ↔  ↔  HH:MM        ← header │
├─────────────────────────────────────────────────┤
│  ↑                                              │
│  │  body rows (1–7+, padded to 7 minimum)       │
│  │                                              │
│  ↓                                              │
├─────────────────────────────────────────────────┤
│  Sefirat HaOmer  (smaller flap cells, 1–3 lines │
│   stacked on a "footer" panel; only during omer)│
└─────────────────────────────────────────────────┘
```

Each body row is a 13-cell flap row. Anything longer than 13 characters
must be overridden — `tests/run.js` walks every day from 2024 through 2030
and asserts no row overflows.

---

## Body row order

The weekly parsha (if no major holiday) always appears first, followed by
any special Shabbatot/days. If a major holiday exists, it follows the specials.

| # | Row | Always shown? | Source |
|---|-----|---------------|--------|
| 1 | **Weekly parsha** (if no major holiday) | only on non-holiday weeks | see [Row 1 — parsha](#row-1--parsha) |
| 2 | Special Shabbat (פרשת שקלים / זכור / פרה / החודש / שבת הגדול) | only on those Shabbatot | Hebcal `SPECIAL_SHABBAT` events, mapped to "פרשת ..." labels we own |
| 3 | שבת מברכים | only on the Shabbat preceding Rosh Chodesh (except Tishrei) | Hebcal `SHABBAT_MEVARCHIM` flag (option `shabbatMevarchim: true`) |
| 4 | specialDay (Chanukah / Purim / kept modern / kept minor) | only when the day matches an allowlisted event | see [Special days](#special-days) |
| 5 | fastDay (צום גדליה / עשרה בטבת / תענית אסתר / צום י"ז בתמוז / תשעה באב / תענית בכורות) | only on those fasts | Hebcal `MAJOR_FAST` ∪ `MINOR_FAST`, EREV excluded |
| 6 | ראש חודש | only on Rosh Chodesh | Hebcal `ROSH_CHODESH` flag |
| 7 | **Holiday name** (if major holiday) | only on Yom Tov / Chol HaMoed | see [Row 7 — holiday](#row-7--holiday) |
| 8 | יעלה ויבוא | only on R"Ch / Yom Tov / Chol HaMoed | derived from steps above |
| 9 | על הניסים | only on Chanukah / Purim | derived from specialDay being Chanukah or Purim |
| 10 | ותן טל ומטר / ותן ברכה | always | see [Tal/matar](#-tn-tl-vmtr--tn-brkh) |
| 11 | מוריד הגשם / מוריד הטל | always | see [Geshem/tal](#-mvryd-hgshm--mvryd-htl) |

The body is padded to **at least 7 rows**; rows 1–5 and 7–8 only appear
when the condition is true. The rare "Chanukah day 7 + Rosh Chodesh
Tevet on Shabbat" coincidence (e.g. Sat 20 Dec 2025) fills all 7 with
real content; that's the maximum, locked in by a regression test.

---

## Row 1 — Parsha

The weekly Torah portion appears first if no major holiday is present for
the date. If a major holiday exists, parsha is omitted entirely.

Source: `@hebcal/core` v6 (`HebrewCalendar.calendar` with `il: true`).

### Parsha logic

1. Find the Shabbat of the week: if the selected date is not Saturday,
   advance to the next Saturday.
2. Call `HebrewCalendar.calendar({ start, end, sedrot: true, il: true })`.
3. Find the event whose English rendering starts with `"Parashat"`.
4. Strip niqqud (Unicode range U+0591–U+05C7) and the `פרשת ` / `Parashat `
   prefix to get a bare name that fits the 13-cell row.

**Why `il: true`:** Israel and the diaspora can be on different parsha
schedules in years where a Yom Tov falls on a weekday (e.g. Israel reads
אחרי מות and קדושים separately while the diaspora combines them).

**Edge cases:**

- On a non-holiday day whose upcoming Shabbat has no regular reading
  (e.g. mid-week during Chol HaMoed), the parsha algorithm advances week
  by week (up to 5 attempts) until it finds a Shabbat with a regular
  parsha.
- `PARSHA_OVERRIDES` substitutes `אחרי מות־קדשים` (14 chars) → `אחרי מ־קדושים`
  (13 chars). Hebcal renders the combined parsha with a maqaf (U+05BE).

---

## Row 7 — Holiday

A major holiday (Yom Tov, Chol HaMoed) appears in row 7, after any special
Shabbatot/days, but only when a holiday exists. If no major holiday, this
row is omitted entirely.

### Holiday display

1. Call `HebrewCalendar.calendar({ start, end, il: true, shabbatMevarchim: true })`
   for the date.
2. If any event has the `CHOL_HAMOED` flag → fixed Hebrew string:
   - `חול המועד פסח` (12 chars)
   - `ח המועד סוכות` (13 chars; abbreviates "חול" because the full form
     overflows)
   - `הושענא רבה` (10 chars; the 7th day of Sukkot Chol HaMoed has its
     own well-known name and gets it via `HOLIDAY_OVERRIDES`)
3. Else if any event has the `CHAG` flag (major Yom Tov) → `e.render('he')`
   with niqqud stripped. Special case: Rosh Hashana day 1 comes back as
   "ראש השנה 5787" — overridden to "ראש השנה א'" for symmetry with day 2.

---

## Special days (row 3)

Anything that fills the "specialDay" slot, in priority order:

1. **Chanukah / Purim**, matched by the regex `/chanukah/i` ∨ `/\bpurim\b/i`
   on the English render, with `EREV` and `CHANUKAH_CANDLES` events
   excluded. Members:
   - חנוכה א' through חנוכה ח' — Chanukah days, compressed from Hebcal's
     "חנוכה: X' נרות" via `chanukahOverride()` so days 2–8 fit.
   - פורים, שושן פורים, פורים משולש (3-day Jerusalem Purim), פורים קטן,
     שו' פורים קטן (15-Adar-I in leap years; full "שושן פורים קטן" is
     14 chars).
   - **Erev Purim is excluded** — Hebcal flags it `EREV` so we skip it.

2. **Kept modern observances** (`KEPT_MODERN_HOLIDAYS` allowlist on
   Hebcal's `MODERN_HOLIDAY` flag): Yom HaShoah, Yom HaZikaron, Yom
   HaAtzma'ut, Yom Yerushalayim, Sigd. The other ~8 modern Israeli
   civic days (Family Day, Herzl Day, Jabotinsky Day, Hebrew Language
   Day, Ben-Gurion Day, Yitzhak Rabin Memorial Day, Yom HaAliyah, Yom
   HaAliyah School Observance, Rosh Hashana LaBehemot) are intentionally
   filtered out.

3. **Kept minor observances** (`KEPT_MINOR_HOLIDAYS` allowlist on
   Hebcal's `MINOR_HOLIDAY` flag): Lag BaOmer, Tu BiShvat. Other minor
   days (Tu B'Av, Pesach Sheni, Leil Selichot, Chag HaBanot) are
   filtered out.

`specialDay` carries the first match through `overrideLabel(ev)` — which
checks `chanukahOverride()` then `HOLIDAY_OVERRIDES` — falling back to
Hebcal's stock `e.render('he')`.

על הניסים fires only when `chanukahOrPurim` is set (i.e. on the actual
Chanukah / Purim days, not on Sigd or Lag BaOmer).

---

## Fast days (row 4)

Source: Hebcal events with `MAJOR_FAST` ∪ `MINOR_FAST` flags, **EREV
excluded** (Hebcal also flags Erev Tisha B'Av with `MAJOR_FAST` — that's
the eve, not the fast).

| Hebrew date | Display |
|------|---------|
| 3 Tishrei | צום גדליה |
| 10 Tevet | עשרה בטבת |
| 13 Adar (or Adar II in leap years) | תענית אסתר |
| 17 Tammuz | צום י"ז בתמוז |
| 9 Av (or 10 Av if 9 Av is Shabbat) | תשעה באב |
| 14 Nisan (Erev Pesach) | תענית בכורות |

Yom Kippur is also a major fast but already returned early via the CHAG
branch as a row-6 holiday — it does not surface again as fastDay.

The deferred Tisha B'Av (`Tish'a B'Av (observed)`, when 9 Av falls on
Shabbat) shares the same "תשעה באב" label as the regular fast — same
string year-to-year, no נדחה suffix.

---

## Tal/matar — ותן טל ומטר vs ותן ברכה (row 9)

Context: the 9th blessing of the Amida (ברכת השנים). Winter formula
includes the request for rain ("ותן טל ומטר לברכה"); summer formula
ends "ותן ברכה".

Source: Shulchan Aruch Orach Chaim 117:1.

Israel rule:

| Period | Text |
|--------|------|
| 7 Marcheshvan → 14 Nisan | **ותן טל ומטר** |
| 15 Nisan → 6 Marcheshvan | **ותן ברכה** |

The actual halachic switch occurs at Musaf of 15 Nisan (first day of
Pesach). The display treats the entire day of 15 Nisan as summer formula
— at Shacharit on 15 Nisan the board is technically one half-day early.

Implementation (Hebrew month numbers: Nisan = 1):

```
isTalUMatar(hMonth, hDay):
  month 8,  day ≥ 7   → true   (7+ Marcheshvan)
  month 9–13          → true   (Kislev – Adar / Adar II)
  month 1,  day ≤ 14  → true   (1–14 Nisan)
  otherwise           → false
```

Leap year: in a leap year Adar splits into Adar I (month 12) and Adar II
(month 13). Both fall within the rain period.

---

## Geshem/tal — מוריד הגשם vs מוריד הטל (row 10)

Context: the second blessing of the Amida (גבורות). Winter: "מוריד הגשם"
(He who makes rain fall). Summer: "מוריד הטל" — many Ashkenazi siddurim
omit it entirely; this display shows the positive summer phrase.

Source: Shulchan Aruch Orach Chaim 114:1–3.

Israel rule:

| Period | Text |
|--------|------|
| 22 Tishrei → 14 Nisan | **מוריד הגשם** |
| 15 Nisan → 21 Tishrei | **מוריד הטל** |

The switch begins at Musaf of Shemini Atzeret (22 Tishrei in Israel,
which is a single-day chag here — the diaspora's 23 Tishrei is not
relevant). Same half-day approximation as for tal/matar applies on the
boundary days.

```
isMoridHaGeshem(hMonth, hDay):
  month 7,  day ≥ 22  → true   (22+ Tishrei / Shemini Atzeret)
  month 8–13          → true   (Marcheshvan – Adar / Adar II)
  month 1,  day ≤ 14  → true   (1–14 Nisan)
  otherwise           → false
```

---

## Sefirat HaOmer footer

A separate panel below the body, with smaller flap cells. Active 16
Nisan through 5 Sivan (49 days). The **full Ashkenazi text** ("היום …
לעומר") is balanced into 1–3 lines (`splitBalancedLines` picks the
smallest line count whose longest line fits ≤20 chars). All days fit;
day 1 is one line, day 7 is two, longer counts spread to three.

Grammatical detail: masculine cardinals are tabulated in two forms:

- **Construct** (`שני`, `שלשה`, `חמשה`, `ששה`, …) — directly before a
  noun: "שני ימים", "שני שבועות".
- **Absolute** (`שנים`, `שלשה`, …) — in compound numbers: "שנים עשר",
  "שנים ועשרים".

Only "שני / שנים" actually differs between the two; the others coincide.
`omerDayPhrase(n)` and `omerWeekPhrase(weeks, days)` use the right form
for each construction; `omerFullText(n)` joins them with the standard
"שהם" connector.

Spelling follows the *ktiv chaser* of Ashkenazi siddurim: שלשה (not
שלושה), חמשה (not חמישה), ששה (not שישה), שלשים (not שלושים).

---

## Date rollover

The board's "today" rolls over at **tzeit hakochavim in Modi'in** (sun
8.5° below the horizon — the Geonim convention) instead of at civil
midnight. Implementation lives in `core.js`, not in this file:

- `tzeitForLocalDate(y, m, d)` constructs a Hebcal `Zmanim` against a
  hardcoded GeoLocation (lat 31.8924° N, lon 35.0103° E, elevation
  290 m, tz Asia/Jerusalem) and returns `z.tzeit(8.5)`.
- `getEffectiveTodayJs(realNow)` shifts to the next civil date once the
  wall clock has crossed today's tzeit.
- `liveDateMode` (true until the user explicitly picks a date) drives
  `maybeAdvanceLiveDate()` in `app.js`, called from each clock tick and
  from any time-override / "now" button change so the rollover doesn't
  lag a tick.

---

## Quote normalization

Hebcal's Hebrew rendering uses geresh (U+05F3, ׳) and gershayim (U+05F4,
״) for abbreviations. `stripNiqqud` rewrites both to ASCII apostrophe
and double quote — the board displays straight quotes everywhere
("חנוכה ז'", "ראש השנה א'", "תשפ"ה", "ט"ו"), and the day-of-month / year
gematria in `core.js` outputs the same ASCII forms.

---

## Library

All Hebrew-date arithmetic (Gregorian↔Hebrew conversion, month
numbering, leap-year detection, Zmanim) is handled by **`@hebcal/core`
v6.3.3** at `vendor/hebcal-core.min.js`. The bundle uses
`Temporal.PlainDate` internally; since Temporal isn't yet a browser
global, the FullCalendar **`temporal-polyfill`** (`vendor/temporal-polyfill.min.js`,
~57 KB minified) is loaded first to install `Temporal` on `globalThis`.
Both files ship as part of the static page — no network requests at
runtime.

Month numbering: Nisan = 1, Iyyar = 2 … Elul = 6, Tishrei = 7,
Marcheshvan = 8, Kislev = 9, Tevet = 10, Shvat = 11, Adar = 12, Adar II
= 13 (leap years only).
