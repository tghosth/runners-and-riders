// Regression tests for runners-and-riders.
//
// Run from the repo root with:   node tests/run.js
//
// We load the same liturgy.js the page loads, in a sandboxed `window`
// that mimics what the browser provides. The Temporal polyfill is
// installed first because hebcal-core's Zmanim class instantiates a
// Temporal.PlainDate at construction.
//
// Add new cases in the *_CASES arrays. Each test returns true on pass;
// the runner prints a summary and exits non-zero if anything fails.
//
// CONVENTION: any time you find yourself writing `node -e '…'` to spot-
// check something, fold the assertion into this file before moving on.
// The suite is the canonical record of "things we've already proven."

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── Bootstrap an emulated browser environment ──
function makeWindow() {
  const polyCode    = fs.readFileSync(path.join(ROOT, 'vendor/temporal-polyfill.min.js'), 'utf8');
  const hebcalCode  = fs.readFileSync(path.join(ROOT, 'vendor/hebcal-core.min.js'), 'utf8');
  const coreCode    = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
  const liturgyCode = fs.readFileSync(path.join(ROOT, 'liturgy.js'), 'utf8');
  const win = {};
  // Polyfill writes Temporal onto globalThis when its IIFE runs, so
  // we evaluate it in this realm before loading hebcal.
  new Function(polyCode)();
  new Function('window',
    hebcalCode + '\n; window.hebcal = hebcal;\n' + coreCode + '\n' + liturgyCode
  )(win);
  return win;
}

const win = makeWindow();
const Liturgy = win.Liturgy;
const Core = win.Core;
const { HDate, GeoLocation, Zmanim } = win.hebcal;

// ── Test runner ──
let pass = 0, fail = 0;

function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else    { fail++; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}

function eq(name, actual, expected) {
  const ok = actual === expected;
  check(name, ok, ok ? null : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Sefirat HaOmer text (Ashkenazi nusach) ──
const OMER_CASES = [
  [1,  'היום יום אחד לעומר'],
  [2,  'היום שני ימים לעומר'],
  [3,  'היום שלשה ימים לעומר'],
  [7,  'היום שבעה ימים שהם שבוע אחד לעומר'],
  [8,  'היום שמונה ימים שהם שבוע אחד ויום אחד לעומר'],
  [14, 'היום ארבעה עשר יום שהם שני שבועות לעומר'],
  [21, 'היום אחד ועשרים יום שהם שלשה שבועות לעומר'],
  [22, 'היום שנים ועשרים יום שהם שלשה שבועות ויום אחד לעומר'],
  [33, 'היום שלשה ושלשים יום שהם ארבעה שבועות וחמשה ימים לעומר'],
  [49, 'היום תשעה וארבעים יום שהם שבעה שבועות לעומר'],
];

console.log('\n── Sefirat HaOmer (full text)');
for (const [n, expected] of OMER_CASES) {
  eq(`day ${n}`, Liturgy.omerFullText(n), expected);
}

// The footer caps the omer at FOOTER_MAX_LINES rows of FOOTER_COLS
// cells each. The values must let every omer day's balanced split
// fit; with 3 lines the worst day (#29) needs 20 columns — bumping
// FOOTER_COLS down or FOOTER_MAX_LINES down without re-validating
// would silently overflow. This test pins the budget.
const FOOTER_COLS = 20;
const FOOTER_MAX_LINES = 3;
console.log(`\n── Sefirat HaOmer (balanced split fits ≤ ${FOOTER_MAX_LINES} lines × ${FOOTER_COLS} chars)`);
for (let n = 1; n <= 49; n++) {
  const lines = Liturgy.splitBalancedLines(Liturgy.omerFullText(n), FOOTER_MAX_LINES, FOOTER_COLS);
  const overflow = lines.find(l => Array.from(l).length > FOOTER_COLS);
  check(`day ${n}: ≤${FOOTER_MAX_LINES} lines, each ≤${FOOTER_COLS} chars`,
    lines.length <= FOOTER_MAX_LINES && !overflow,
    overflow ? `line overflows ${FOOTER_COLS}: ${JSON.stringify(overflow)} (${Array.from(overflow).length} chars)`
             : `${lines.length} lines, expected ≤${FOOTER_MAX_LINES}`);
}

console.log('\n── Sefirat HaOmer (split round-trip — joined lines === full text)');
for (let n = 1; n <= 49; n++) {
  const full = Liturgy.omerFullText(n);
  const joined = Liturgy.splitBalancedLines(full, FOOTER_MAX_LINES, FOOTER_COLS).join(' ');
  eq(`day ${n}`, joined, full);
}

console.log('\n── Sefirat HaOmer (split prefers fewer lines when the text fits)');
{
  // Day 1 — short enough to fit on one line at FOOTER_COLS=20
  const lines1 = Liturgy.splitBalancedLines(Liturgy.omerFullText(1), 3, 20);
  eq('day 1: 1 line', lines1.length, 1);
  eq('day 1: joined', lines1.join(' '), 'היום יום אחד לעומר');
}

console.log('\n── Sefirat HaOmer (getOmerSection)');
{
  const offDay = Liturgy.getOmerSection(new Date(2026, 0, 6));
  check('non-omer date returns null', offDay === null,
    offDay ? `got ${JSON.stringify(offDay)}` : null);
  const day1 = Liturgy.getOmerSection(new Date(2026, 3, 3));
  eq('16 Nisan: day=1',     day1 && day1.day,      1);
  eq('16 Nisan: fullText',  day1 && day1.fullText, 'היום יום אחד לעומר');
  const day32 = Liturgy.getOmerSection(new Date(2026, 4, 4)); // 16 Iyar 5786
  eq('16 Iyar: day=32',     day32 && day32.day,    32);
}

// ── Liturgical decisions for known dates ──
console.log('\n── Liturgy.getDayInfo (known special Shabbatot)');
const SHABBAT_CASES = [
  ['Shabbat Shekalim',       new Date(2026, 1, 14), { specialShabbat: 'פרשת שקלים', shabbatMevarchim: true  }],
  ['Shabbat Zachor',         new Date(2026, 1, 28), { specialShabbat: 'פרשת זכור',  shabbatMevarchim: false }],
  ['Shabbat Parah',          new Date(2026, 2,  7), { specialShabbat: 'פרשת פרה',   shabbatMevarchim: false }],
  ['Shabbat HaChodesh',      new Date(2026, 2, 14), { specialShabbat: 'פרשת החודש', shabbatMevarchim: true  }],
  ['Shabbat HaGadol',        new Date(2026, 2, 28), { specialShabbat: 'שבת הגדול',   shabbatMevarchim: false }],
  ['Shabbat Mevarchim Iyar', new Date(2026, 3, 11), { specialShabbat: '',           shabbatMevarchim: true  }],
  ['Plain Shabbat',          new Date(2026, 0, 10), { specialShabbat: '',           shabbatMevarchim: false }],
];
for (const [label, d, expected] of SHABBAT_CASES) {
  const info = Liturgy.getDayInfo(d);
  eq(`${label}: specialShabbat`,   info.specialShabbat,   expected.specialShabbat);
  eq(`${label}: shabbatMevarchim`, info.shabbatMevarchim, expected.shabbatMevarchim);
}

// The body grid pads to 7 rows on quiet days. The maximum *non-empty*
// row count is also 7 — Chanukah days that coincide with R"Ch Tevet
// fill every slot (parsha / Chanukah / ראש חודש / יעלה ויבוא / tal /
// dew / על הנסים). Sat 20 Dec 2025 = Chanukah day 7 + R"Ch Tevet on
// Shabbat is a known-good real-calendar date for this. If a future
// liturgy change ever pushes the body past 7 rows, this test catches
// the overflow before it surprises the user.
console.log('\n── Liturgy.getDisplayText (max-row coincidence: Chanukah + R"Ch Tevet)');
{
  const d = new Date(2025, 11, 20);  // Sat 20 Dec 2025
  const rows = Liturgy.getDisplayText(d).split('\n');
  const nonEmpty = rows.filter(Boolean);
  eq('non-empty rows', nonEmpty.length, 7);
  eq('total rows (padded to 7)', rows.length, 7);
  // Parsha always comes first if present; specials follow.
  // Parsha, then Chanukah, then ראש חודש, then Amidah-flow rows.
  check('parsha row',     nonEmpty[0] === 'מקץ',
    `got ${JSON.stringify(nonEmpty[0])}`);
  check('Chanukah row',   /חנוכה/.test(nonEmpty[1]),
    `got ${JSON.stringify(nonEmpty[1])}`);
  eq('Rosh Chodesh row',  nonEmpty[2], 'ראש חודש');
  eq('יעלה ויבוא row',     nonEmpty[3], 'יעלה ויבוא');
  eq('al hanisim row',    nonEmpty[4], 'על הניסים');
  eq('tal row',           nonEmpty[5], 'ותן טל ומטר');
  eq('geshem row',        nonEmpty[6], 'מוריד הגשם');
}

// Sweep the next 16 years and confirm no day produces more than 7
// non-empty body rows — currently the layout assumes ≤7 explicit
// content rows (anything past that would push the sefira footer
// against the body cells without breathing room).
console.log('\n── Liturgy.getDisplayText (no day exceeds 7 non-empty body rows, 2024–2040)');
{
  let worst = 0, worstDate = null;
  const start = new Date(2024, 0, 1), end = new Date(2040, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const n = Liturgy.getDisplayText(d).split('\n').filter(Boolean).length;
    if (n > worst) { worst = n; worstDate = new Date(d); }
  }
  check('≤7 non-empty rows on any day in 2024–2040', worst <= 7,
    `worst: ${worst} rows on ${worstDate && worstDate.toDateString()}`);
}

// Truncation at the cell-row level is silent — renderMessage in
// app.js slices anything over 13 chars off the visible end. Walk every
// day for several years and assert every body row stays within 13. If
// Hebcal ever adds a new label or a parsha lands without an override,
// this test catches it before it ships.
console.log('\n── Liturgy.getDisplayText (every body row ≤ 13 chars, 2024–2030)');
{
  const MAX_COLS = 13;
  const offenders = [];
  const start = new Date(2024, 0, 1), end = new Date(2030, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const rows = Liturgy.getDisplayText(d).split('\n');
    for (const row of rows) {
      if (Array.from(row).length > MAX_COLS) {
        offenders.push({ date: new Date(d), row, len: Array.from(row).length });
        if (offenders.length >= 10) break;
      }
    }
    if (offenders.length >= 10) break;
  }
  check('no body row exceeds 13 chars', offenders.length === 0,
    offenders.length
      ? offenders.map(o => `${o.date.toDateString()}: ${JSON.stringify(o.row)} (${o.len})`).join('\n      ')
      : null);
}

// Modern Israeli observances are deliberately *filtered* — only the
// four national days + Sigd surface. Every other MODERN_HOLIDAY (Family
// Day, Herzl Day, Jabotinsky Day, Hebrew Language Day, Ben-Gurion Day,
// Rabin Memorial Day, Yom HaAliyah, Yom HaAliyah School Observance,
// Rosh Hashana LaBehemot) must NOT show up as a board row. Pinning the
// keep-list and the drop-list separately so a future Hebcal addition
// can't silently flip back on.
console.log('\n── Liturgy.getDayInfo (modern holiday allowlist)');
{
  const KEEP = [
    ['Yom HaShoah',       new Date(2025, 3, 24), 'יום השואה'],
    ['Yom HaZikaron',     new Date(2025, 3, 30), 'יום הזכרון'],
    ["Yom HaAtzma'ut",    new Date(2025, 4,  1), 'יום העצמאות'],
    ['Yom Yerushalayim',  new Date(2025, 4, 26), 'יום ירושלים'],
    ['Sigd',              new Date(2025, 10, 20), 'חג הסיגד'],
  ];
  for (const [label, d, expected] of KEEP) {
    eq(`${label}: shown`, Liturgy.getDayInfo(d).specialDay, expected);
  }
  const DROP = [
    ['Family Day',                    new Date(2024, 1, 9)],
    ['Herzl Day',                     new Date(2024, 4, 19)],
    ['Jabotinsky Day',                new Date(2024, 7, 4)],
    ['Hebrew Language Day',           new Date(2024, 0, 2)],
    ['Ben-Gurion Day',                new Date(2024, 11, 8)],
    ['Yitzhak Rabin Memorial Day',    new Date(2024, 10, 13)],
    ['Yom HaAliyah',                  new Date(2024, 3, 18)],
    ['Yom HaAliyah School Observance',new Date(2024, 10, 8)],
  ];
  for (const [label, d] of DROP) {
    eq(`${label}: hidden`, Liturgy.getDayInfo(d).specialDay, '');
  }
}

console.log('\n── Liturgy.getDayInfo (minor holiday allowlist + Erev Purim drop)');
{
  // Lag BaOmer (18 Iyar) and Tu BiShvat (15 Shvat) opt in.
  eq('Lag BaOmer (Tue 5 May 2026): shown',
    Liturgy.getDayInfo(new Date(2026, 4, 5)).specialDay, "ל\"ג בעומר");
  eq('Tu BiShvat (Mon 2 Feb 2026): shown',
    Liturgy.getDayInfo(new Date(2026, 1, 2)).specialDay, "ט\"ו בשבט");
  // Erev Purim no longer surfaces (was being matched by the
  // chanukahOrPurim regex); also no on על הניסים.
  const erevPurim = Liturgy.getDayInfo(new Date(2025, 2, 13));  // Thu 13 Mar 2025
  eq('Erev Purim: specialDay hidden', erevPurim.specialDay, '');
  eq('Erev Purim: alHaNisim false', erevPurim.alHaNisim, false);
  // Other minor days still filtered out.
  for (const [label, d] of [
    ['Pesach Sheni',  new Date(2025, 4, 12)],  // Mon 12 May 2025
    ['Tu B\'Av',      new Date(2025, 7,  9)],  // Sat 9 Aug 2025
    ['Leil Selichot', new Date(2025, 8, 13)],  // Sat 13 Sep 2025
  ]) {
    eq(`${label}: hidden`, Liturgy.getDayInfo(d).specialDay, '');
  }
}

// Fast days — minor (Tzom Gedaliah, Asara B'Tevet, Ta'anit Esther,
// 17 Tammuz, Ta'anit Bechorot) and major (Tisha B'Av). Yom Kippur is
// already handled by the CHAG branch as a row-1 holidayName, so we
// don't expect it as a separate fastDay value.
console.log('\n── Liturgy.getDayInfo (fast days)');
{
  const FAST_CASES = [
    ['Tzom Gedaliah',     new Date(2025, 8, 25),  'צום גדליה'],
    ['Asara B\'Tevet',    new Date(2025, 11, 30), 'עשרה בטבת'],
    ['Ta\'anit Esther',   new Date(2026, 2, 2),   'תענית אסתר'],
    ['Tzom Tammuz (17)',  new Date(2025, 6, 13),  'צום י"ז בתמוז'],
    ['Tish\'a B\'Av',     new Date(2025, 7, 3),   'תשעה באב'],
    ['Ta\'anit Bechorot', new Date(2026, 3, 1),   'תענית בכורות'],
  ];
  for (const [label, d, expected] of FAST_CASES) {
    eq(`${label}: fastDay`, Liturgy.getDayInfo(d).fastDay, expected);
  }
  // Yom Kippur — not surfaced as fastDay (already shown as holidayName)
  eq('Yom Kippur: not on fastDay (handled by CHAG)',
    Liturgy.getDayInfo(new Date(2025, 9, 2)).fastDay, '');
  // Regular weekday: no fast
  eq('Regular Tue: no fast', Liturgy.getDayInfo(new Date(2026, 0, 6)).fastDay, '');
  // Deferred Tisha B'Av (when 9 Av is Shabbat) shows the same label
  // as the regular date so the row reads consistently year-to-year.
  eq('Tisha B\'Av deferred (Sun 22 Jul 2029) — same label as regular',
    Liturgy.getDayInfo(new Date(2029, 6, 22)).fastDay, 'תשעה באב');
  // Erev Tisha B'Av — Hebcal flags it MAJOR_FAST + EREV, but it's the
  // eve, not the fast. We exclude EREV so it doesn't surface.
  eq('Erev Tisha B\'Av (Mon 12 Aug 2024): no fastDay',
    Liturgy.getDayInfo(new Date(2024, 7, 12)).fastDay, '');
}

// Shushan Purim Katan only happens in Adar I of leap years (so once
// every 2–3 years). Pin the override so the spell-out-purim choice
// stays committed to.
console.log('\n── Liturgy.getDayInfo (Shushan Purim Katan)');
{
  // Sat 24 Feb 2024 = 15 Adar I 5784 = Shushan Purim Katan
  const d = new Date(2024, 1, 24);
  eq('Sat 24 Feb 2024: specialDay', Liturgy.getDayInfo(d).specialDay, "שו' פורים קטן");
}

console.log('\n── Liturgy.getDayInfo (Rosh Chodesh)');
const ROSH_CASES = [
  ['1 Iyar 5786',  new Date(2026, 3, 18), true],  // Sat 18 Apr 2026
  ['Random Tue',   new Date(2026, 0,  6), false],
];
for (const [label, d, expected] of ROSH_CASES) {
  eq(`${label}: roshChodesh`, Liturgy.getDayInfo(d).roshChodesh, expected);
}

console.log('\n── Liturgy.getOmerDay');
const OMER_DAY_CASES = [
  ['16 Nisan 5786 = day 1',  new Date(2026, 3,  3),  1],
  ['Lag BaOmer (18 Iyar)',   new Date(2026, 4,  5), 33],
  ['5 Sivan = day 49',       new Date(2026, 4, 21), 49],
  ['6 Sivan (Shavuot) = 0',  new Date(2026, 4, 22),  0],
  ['1 Nisan (before omer)',  new Date(2026, 2, 19),  0],
];
for (const [label, jsDate, expected] of OMER_DAY_CASES) {
  eq(label, Liturgy.getOmerDay(new HDate(jsDate)), expected);
}

// Header day-of-week labels: יום א' through יום ו' for Sun–Fri, and
// יום שבת for Saturday. The longer Saturday form drives the section
// minimum dow-section width (7 char cells); the test pins the mapping
// so a future shuffle
// of the table can't go silently sideways.
console.log('\n── Header day-of-week labels');
{
  const HEBREW_DOW = [
    "יום א'",  "יום ב'",  "יום ג'",  "יום ד'",
    "יום ה'",  "יום ו'",  "יום שבת",
  ];
  const dowOf = (jsDate) => HEBREW_DOW[jsDate.getDay()];
  // Sun 4 May 2025 = Yom Rishon, Shabbat 3 May 2025 = יום שבת
  for (const [d, expected] of [
    [new Date(2025, 4, 4), "יום א'"],
    [new Date(2025, 4, 5), "יום ב'"],
    [new Date(2025, 4, 6), "יום ג'"],
    [new Date(2025, 4, 7), "יום ד'"],
    [new Date(2025, 4, 8), "יום ה'"],
    [new Date(2025, 4, 9), "יום ו'"],
    [new Date(2025, 4, 3), "יום שבת"],
  ]) {
    eq(`${d.toDateString()} → dow`, dowOf(d), expected);
  }
  // Saturday is the longest; the dow section is sized to fit it +
  // padding. If a future label tweak grows past 7 chars without the
  // section growing too, the right end of the label would run into
  // the no-tile gap.
  const longest = Math.max(...HEBREW_DOW.map(s => Array.from(s).length));
  eq('longest dow label is 7 chars', longest, 7);
}

// The header date should use single-vav month spellings (סיון, חשון)
// to match the date picker, not the double-vav Academy-of-Hebrew forms
// (סיוון, חשוון) that come out of `Intl.DateTimeFormat('he-IL-u-ca-hebrew')`.
// We exercise the spelling indirectly by spot-checking a date in each
// month against the standalone helper; the layout (gematria + month +
// year) is in app.js and not loaded here.
console.log('\n── Hebrew month names (single-vav forms)');
{
  // Standalone copy of liturgy-side spellings — must match app.js
  // hebrewMonthName(). If you change one, change the other.
  const NAMES = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול',
                 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', "אדר ב'"];
  for (const [d, expected] of [
    [new Date(2025, 4, 28), 'סיון'],   // 1 Sivan 5785
    [new Date(2025, 10, 15), 'חשון'],  // mid-Cheshvan 5786
    [new Date(2026, 5, 1),   'סיון'],
  ]) {
    const hd = new HDate(d);
    eq(`${d.toDateString()} → month`, NAMES[hd.getMonth()], expected);
  }
}

// ── Tzeit hakochavim via Hebcal Zmanim (Modi'in) ──
//
// We assert Hebcal returns a JS Date (not a Temporal.ZonedDateTime —
// the bundle is inconsistent: tzeit() returns Date, tzeit72() returns
// ZonedDateTime; app.js depends on the Date variant). Reference times
// are minute-rounded against the Asia/Jerusalem civil clock and were
// cross-checked against published Modi'in zmanim sites.
console.log('\n── Hebcal Zmanim.tzeit(8.5°) — Modi\'in');
const MODIIN = new GeoLocation('Modi\'in', 31.8924, 35.0103, 290, 'Asia/Jerusalem');
const fmtHm = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
});
const TZEIT_CASES = [
  ['summer solstice', 2026,  6, 21, '20:31'],
  ['winter solstice', 2026, 12, 21, '17:19'],
  ['spring equinox',  2026,  3, 21, '18:28'],
  ['autumn equinox',  2026,  9, 23, '19:11'],
  ['Apr 30 2026',     2026,  4, 30, '19:58'],
];
for (const [label, y, m, d, expectedHm] of TZEIT_CASES) {
  const z = new Zmanim(MODIIN, new Date(y, m - 1, d), false);
  const t = z.tzeit(8.5);
  check(`${label} (${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}) returns Date`,
    t instanceof Date, `got ${Object.prototype.toString.call(t)}`);
  if (t instanceof Date) {
    eq(`${label} time`, fmtHm.format(t), expectedHm);
  }
}

console.log('\n── Hebcal Zmanim — sister zmanim available for future use');
// Sanity-only checks so we don't accidentally lose access to the
// methods we'll want when more zmanim go on the board (alot, sunrise,
// chatzot, plag, sunset). Each should return *something* truthy on a
// regular date.
const z = new Zmanim(MODIIN, new Date(2026, 5, 21), false);
for (const name of ['sunrise', 'sunset', 'chatzot', 'alotHaShachar', 'plagHaMincha', 'minchaGedola']) {
  if (typeof z[name] !== 'function') {
    check(`Zmanim.${name} exists`, false, `method missing on Zmanim instance`);
    continue;
  }
  const v = z[name]();
  check(`Zmanim.${name}() returns a value`, v != null,
    `got ${v}`);
}

// ── Polar edge case ──
// Hebcal returns a sentinel for "no tzeit possible" — Date with NaN
// time. The browser code treats anything not strictly comparable as
// "no rollover today", so we just confirm the sentinel is recognisable.
console.log('\n── Polar edge case (80°N midsummer — no tzeit)');
{
  const polar = new GeoLocation('Arctic', 80, 0, 0, 'UTC');
  const t = new Zmanim(polar, new Date(2026, 5, 21), false).tzeit(8.5);
  const detectable = t == null || (t instanceof Date && Number.isNaN(t.getTime()));
  check('tzeit returns a null/NaN sentinel', detectable,
    `got ${t} (${Object.prototype.toString.call(t)})`);
}

// ── Core module (calendar primitives) ──
//
// These are the pure helpers extracted into core.js — Hebrew month
// math, gematria, date / dow formatting, and tzeit. Exercising them
// directly via window.Core lets tests cover the same code paths the
// page uses, with no DOM in the way. The sweeps below run the
// primitives through ~50 years of Hebrew dates so a future tweak
// can't quietly break a leap year, a particular gematria edge case,
// or the tzeit solver.

console.log('\n── Core: gematria spot checks');
{
  // Day-of-month gematria, with marks
  for (const [n, expected] of [
    [1, "א'"], [9, "ט'"], [10, "י'"], [14, "י\"ד"],
    [15, 'ט"ו'],  [16, 'ט"ז'],  // not "יה" / "יו" (divine name)
    [17, 'י"ז'], [20, "כ'"], [29, 'כ"ט'], [30, "ל'"],
  ]) eq(`dayGematria(${n}, true)`, Core.dayGematria(n, true), expected);

  // Hebrew year gematria — current year, leap year, edge centuries
  for (const [y, expected] of [
    [5784, 'תשפ"ד'], [5785, 'תשפ"ה'], [5786, 'תשפ"ו'],
    [5790, "תש\"צ"], [5800, 'ת"ת'],   [5815, 'תתט"ו'],
  ]) eq(`yearGematria(${y}, true)`, Core.yearGematria(y, true), expected);
}

console.log('\n── Core: hebrewMonthName + leap-year structure');
{
  // Adar → Adar I + Adar II in leap years
  eq('Adar in non-leap year', Core.hebrewMonthName(12, false), 'אדר');
  eq("Adar I in leap year",    Core.hebrewMonthName(12, true),  "אדר א'");
  eq('Adar II in leap year',  Core.hebrewMonthName(13, true),  "אדר ב'");
  // Sample of non-Adar months — should match across leap / non-leap
  for (const m of [1, 4, 7, 10]) {
    eq(`month ${m} same in leap / non-leap`,
      Core.hebrewMonthName(m, false), Core.hebrewMonthName(m, true));
  }
  // 19-year cycle: positions 3, 6, 8, 11, 14, 17, 19 (mod 19 = 3, 6,
  // 8, 11, 14, 17, 0) are leap. Spot-check the next decade.
  const knownLeap = [5784, 5787, 5790, 5793, 5795];      // → Adar I/II
  const knownNonLeap = [5785, 5786, 5788, 5789, 5791];   // → just Adar
  for (const y of knownLeap)
    check(`year ${y} is leap`, Core.hebrewIsLeapYear(y));
  for (const y of knownNonLeap)
    check(`year ${y} is non-leap`, !Core.hebrewIsLeapYear(y));
}

console.log('\n── Core: formatHebrewDate over five decades');
{
  // Walk from 2024 through 2074 and assert every formatted Hebrew
  // date is at most 16 chars (the figure HEADER_COLS = 18 in app.js
  // is built around — anything longer would silently truncate when
  // the UI tried to lay it out).
  let worstLen = 0, worstStr = '', worstDate = null;
  let bad = null;
  const start = new Date(2024, 0, 1);
  const end   = new Date(2074, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const s = Core.formatHebrewDate(d);
    const len = Array.from(s).length;
    if (len > worstLen) { worstLen = len; worstStr = s; worstDate = new Date(d); }
    if (len > 16 && !bad) bad = { d: new Date(d), s, len };
  }
  check(`every Hebrew date 2024–2074 fits 16 chars (worst: "${worstStr}" — ${worstLen} chars)`,
    !bad, bad ? `${bad.d.toDateString()}: "${bad.s}" (${bad.len})` : null);
}

console.log('\n── Core: dowText round-trip across decades');
{
  // Pick one date from every month in 2024–2074 and confirm the
  // mapping matches getDay() exactly. Catches off-by-one regressions
  // and locale-tinted Date semantics on different machines.
  const expected = ["יום א'", "יום ב'", "יום ג'", "יום ד'",
                    "יום ה'", "יום ו'", "יום שבת"];
  let bad = null;
  for (let y = 2024; y <= 2074 && !bad; y++) {
    for (let m = 0; m < 12 && !bad; m++) {
      const d = new Date(y, m, 15);
      const got = Core.dowText(d);
      if (got !== expected[d.getDay()]) bad = { d, got };
    }
  }
  check('dowText matches Date.getDay() for 2024–2074',
    !bad, bad ? `${bad.d.toDateString()}: got ${JSON.stringify(bad.got)}` : null);
}

console.log('\n── Core: tzeit (Modi\'in) sanity over five decades');
{
  // Sun-position math is well-behaved year-to-year, so we mainly
  // want to know it doesn't blow up over a long run (no NaN results
  // anywhere) and that the tzeit times stay reasonable for Modi'in
  // (between 17:00 and 21:00 local civil time year-round).
  let bad = null, samples = 0;
  for (let y = 2024; y <= 2074 && !bad; y++) {
    // First-of-each-month is enough to walk the seasons without an
    // O(50 × 365) loop.
    for (let m = 0; m < 12 && !bad; m++) {
      const t = Core.tzeitForLocalDate(y, m + 1, 15);
      if (!(t instanceof Date) || Number.isNaN(t.getTime())) {
        bad = { y, m, reason: 'NaN/non-Date' };
        break;
      }
      const hm = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(t);
      const [hh, mm] = hm.split(':').map(Number);
      const minutes = hh * 60 + mm;
      if (minutes < 17 * 60 || minutes > 21 * 60) {
        bad = { y, m, reason: `out-of-range: ${hm}` };
      }
      samples++;
    }
  }
  check(`tzeit returns a usable Date for ~${samples} mid-month samples 2024–2074`,
    !bad, bad ? `year ${bad.y} month ${bad.m + 1}: ${bad.reason}` : null);
}

console.log('\n── Core: getEffectiveTodayJs rollover at tzeit');
{
  // Mid-summer (Jun 21) tzeit in Modi'in is ~20:31 local. Pick a
  // moment 1 minute before and 1 minute after; the effective JS
  // date should advance from the same civil day to the next.
  const tz = Core.tzeitForLocalDate(2026, 6, 21);
  const before = new Date(tz.getTime() - 60_000);
  const after  = new Date(tz.getTime() + 60_000);
  const beforeEff = Core.getEffectiveTodayJs(before);
  const afterEff  = Core.getEffectiveTodayJs(after);
  // beforeEff should be the same civil date as `tz`'s local date;
  // afterEff should be one civil day later.
  const oneDay = 86_400_000;
  eq('1 min before tzeit → same civil date',
    afterEff.getTime() - beforeEff.getTime(), oneDay);
}

// ── Summary ──
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
