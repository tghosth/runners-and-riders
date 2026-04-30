# Liturgical Display Logic

This document records the exact halachic rules used to decide what text
appears on each row of the board. All rules apply to **Israel** only.

---

## Row 1 — פרשת השבוע / חג (Holiday or Weekly Torah Portion)

Row 1 shows a holiday name when one exists for the selected date, otherwise
the weekly Torah portion for that Shabbat.

### Holiday display

**Algorithm:**

1. Call `HebrewCalendar.calendar({ start, end, il: true })` for the date.
2. If any event has the `CHOL_HAMOED` flag → show a fixed Hebrew string:
   - `חול המועד פסח` (13 chars) or `ח המועד סוכות` (13 chars)
3. Else if any event has the `CHAG` flag (major Yom Tov) → show
   `e.render('he')` with niqqud stripped.
4. If neither → fall through to the parsha logic below.

### Parsha fallback

**Source:** `@hebcal/core` v6 (`HebrewCalendar.calendar` with `il: true`).

**Algorithm:**

1. Find the Shabbat of the week: if the selected date is not Saturday,
   advance to the next Saturday.
2. Call `HebrewCalendar.calendar({ start, end, sedrot: true, il: true })`
   for that Shabbat.
3. Find the event whose English rendering starts with `"Parashat"`.
4. Strip niqqud (Unicode range U+0591–U+05C7) and the `פרשת ` / `Parashat `
   prefix from the Hebrew rendering to get a bare name that fits the 13-cell
   display.

**Why `il: true`:**  
Israel follows a different parsha schedule than the diaspora on years
where a holiday falls on a weekday. For example, in some years Israel
reads פרשת אחרי מות and פרשת קדושים on separate Shabbatot while the
diaspora reads them together. The `il` flag selects the Israel schedule.

**Edge cases:**

- On Shabbat Chol HaMoed Pesach or Sukkot the regular weekly parsha is
  displaced by the holiday display (step 2 above fires first).
- On Shabbat that coincides with a major Yom Tov (e.g. first day of
  Pesach falling on Shabbat) no regular parsha is read; the holiday name
  is shown instead (step 3 above fires first).
- The combined parsha `אחרי מות-קדושים` is 15 chars (over the 13-cell
  limit). The `PARSHA_OVERRIDES` map in `app.js` substitutes
  `אחרי מ-קדושים` (13 chars).

---

## Row 2 (conditional) — יעלה ויבוא

**Context:** An insertion in the Amida (ברכת עבודה / רצה) and in Birkat
HaMazon on days with a special mussaf or holiday character.

**When it is said:**

| Occasion | Flag checked |
|----------|-------------|
| All major Yom Tov days | `CHAG` |
| Chol HaMoed Pesach / Sukkot | `CHOL_HAMOED` |
| Rosh Chodesh | `ROSH_CHODESH` |

**Display effect:** When יעלה ויבוא is shown it occupies row 2, pushing
תן טל ומטר and מוריד הגשם to rows 3 and 4. On regular days those rows
stay at 2 and 3.

---

## Row 2 or 3 — תן טל ומטר / תן ברכה

**Context:** The 9th blessing of the Amida (ברכת השנים). In the summer
formula the blessing ends "ותן ברכה"; in the winter formula it includes
the request for rain "ותן טל ומטר לברכה".

**Source:** Shulchan Aruch Orach Chaim 117:1.

**Israel rule:**

| Period | Text |
|--------|------|
| 7 Marcheshvan (month 8, day 7) → 14 Nisan (month 1, day 14) | **תן טל ומטר** |
| 15 Nisan → 6 Marcheshvan (rest of year) | **תן ברכה** |

**Why 7 Marcheshvan:**  
The early rain (יורה) is expected to have fallen in the Land of Israel
by then, so asking for rain becomes seasonally appropriate
(SA OC 117:1 and the Gemara Taanit 10a).

**Transition on 15 Nisan (first day of Pesach):**  
The actual switch occurs at Musaf (the additional service). Shacharit of
15 Nisan still says "תן טל ומטר". The display treats the **entire day of
15 Nisan as the first day of ברכה** (i.e. `hDay >= 15` in Nisan → ברכה).
This is a deliberate simplification; if you are davening Shacharit on
15 Nisan the board is technically one half-day early.

**Implementation (Hebrew month numbers use Nisan = 1):**

```
isTalUMatar(hMonth, hDay):
  month 8,  day ≥ 7   → true   (7+ Marcheshvan)
  month 9–13           → true   (Kislev – Adar / Adar II)
  month 1,  day ≤ 14  → true   (1–14 Nisan)
  otherwise            → false
```

**Leap year:** In a leap year Adar is split into Adar I (month 12) and
Adar II (month 13). Both fall within the rain period, so the formula
handles them automatically (`hMonth >= 9 && hMonth <= 13`).

---

## Row 3 or 4 — מוריד הגשם / מוריד הטל

**Context:** The second blessing of the Amida (גבורות / מחיה המתים).
In winter: "מוריד הגשם" (He who makes rain fall). In summer: "מוריד הטל"
(He who makes dew fall) or, in many Ashkenazi customs, the phrase is
simply omitted — but this display shows the positive summer phrase.

**Source:** Shulchan Aruch Orach Chaim 114:1–3.

**Israel rule:**

| Period | Text |
|--------|------|
| 22 Tishrei (Shemini Atzeret, month 7, day 22) → 14 Nisan | **מוריד הגשם** |
| 15 Nisan → 21 Tishrei (rest of year) | **מוריד הטל** |

**Why 22 Tishrei:**  
Shemini Atzeret in Israel is a single day (22 Tishrei). In the diaspora
it is 23 Tishrei (the 8th day of Sukkot). The display uses the Israel date.

**Transition on 22 Tishrei:**  
The switch begins at Musaf of Shemini Atzeret. The display treats the
**entire day of 22 Tishrei as the first day of גשם**. Shacharit of 22
Tishrei technically still says "מוריד הטל"; the board is one half-day
early on that morning.

**Transition on 15 Nisan:**  
Same approximation as for Row 2 — entire day treated as summer formula.

**Implementation:**

```
isMoridHaGeshem(hMonth, hDay):
  month 7,  day ≥ 22  → true   (22+ Tishrei / Shemini Atzeret)
  month 8–13           → true   (Marcheshvan – Adar / Adar II)
  month 1,  day ≤ 14  → true   (1–14 Nisan)
  otherwise            → false
```

---

## Library

All Hebrew-date arithmetic (Gregorian→Hebrew conversion, month numbering,
leap-year detection) is handled by **`@hebcal/core` v6.3.3** bundled at
`vendor/hebcal-core.min.js`. The library is loaded as a UMD script and
exposes `window.hebcal`. No network requests are made at runtime.

Month numbering used throughout: Nisan = 1, Iyyar = 2 … Elul = 6,
Tishrei = 7, Marcheshvan = 8, Kislev = 9, Tevet = 10, Shvat = 11,
Adar = 12, Adar II = 13 (leap years only).
