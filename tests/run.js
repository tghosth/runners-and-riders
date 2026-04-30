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
  const liturgyCode = fs.readFileSync(path.join(ROOT, 'liturgy.js'), 'utf8');
  const win = {};
  // Polyfill writes Temporal onto globalThis when its IIFE runs, so
  // we evaluate it in this realm before loading hebcal.
  new Function(polyCode)();
  new Function('window',
    hebcalCode + '\n; window.hebcal = hebcal;\n' + liturgyCode
  )(win);
  return win;
}

const win = makeWindow();
const Liturgy = win.Liturgy;
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

// ── Summary ──
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
