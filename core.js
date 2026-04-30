// Calendar / Hebrew-math primitives used by the rest of the app.
//
// Everything in this file is pure: no DOM access, no setTimeout, no
// reading of URL flags or other UI state. The render layer (app.js)
// imports these via `window.Core` and decides how to put the values
// on screen — so the same primitives could power a different UI
// (plain HTML, a different framework, a server-side renderer, a CLI
// preview tool, …) without changing this file.
//
// Companion module: liturgy.js handles the *content* of each row
// (which holiday names, fasts, special Shabbatot, etc. apply today).
// This module handles the underlying *primitives* (Hebrew month
// math, gematria, day-of-week, formatting, tzeit hakochavim).

(() => {
  'use strict';

  const { HDate, GeoLocation, Zmanim } = window.hebcal;

  // ─── Hebrew month / leap-year math ─────────────────────────────

  function hebrewIsLeapYear(year) {
    return typeof HDate.isLeapYear === 'function'
      ? HDate.isLeapYear(year)
      : (7 * year + 1) % 19 < 7;
  }

  function hebrewDaysInMonth(month, year) {
    return typeof HDate.daysInMonth === 'function'
      ? HDate.daysInMonth(month, year)
      : [0, 30, 29, 30, 29, 30, 29, 30, 29, 29, 29, 30, 29, 29][month] || 29;
  }

  // Single-vav month spellings (סיון / חשון), matching traditional
  // Ashkenazi siddurim. Adar splits into Adar I + Adar II in leap
  // years.
  function hebrewMonthName(month, isLeap) {
    const NAMES = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול',
                   'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט',
                   isLeap ? "אדר א'" : 'אדר', "אדר ב'"];
    return NAMES[month] || '';
  }

  // ─── Gematria ──────────────────────────────────────────────────

  // Letter tables. ASCII apostrophe (geresh) and double-quote
  // (gershayim) are used for the marks so the rendered output reads
  // with straight quotes everywhere.
  const G_ONES     = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const G_TENS     = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  // Hundreds: 100–400 are single letters; 500–900 use repeated ת (400).
  const G_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  const DAY_TENS   = ['', 'י', 'כ', 'ל'];

  // Day-of-month gematria (1–30). 15 and 16 use the conventional
  // ט"ו / ט"ז to avoid spelling fragments of the divine name.
  function dayGematria(n, withMarks) {
    if (n === 15) return withMarks ? 'ט"ו' : 'טו';
    if (n === 16) return withMarks ? 'ט"ז' : 'טז';
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (n < 10)     return withMarks ? G_ONES[ones]   + "'" : G_ONES[ones];
    if (ones === 0) return withMarks ? DAY_TENS[tens] + "'" : DAY_TENS[tens];
    return withMarks
      ? DAY_TENS[tens] + '"' + G_ONES[ones]
      : DAY_TENS[tens] + G_ONES[ones];
  }

  // Hebrew year gematria (e.g. 5785 → "תשפ"ה"), dropping the
  // thousands digit per the standard "האלף הששי" convention.
  function yearGematria(year, withMarks) {
    const n = year % 1000;
    const h = Math.floor(n / 100);
    const rem = n % 100;
    let tensOnes;
    if (rem === 15) tensOnes = 'טו';
    else if (rem === 16) tensOnes = 'טז';
    else tensOnes = G_TENS[Math.floor(rem / 10)] + G_ONES[rem % 10];
    const str = G_HUNDREDS[h] + tensOnes;
    if (!withMarks) return str;
    if (str.length === 0) return str;
    if (str.length === 1) return str + "'";
    return str.slice(0, -1) + '"' + str.slice(-1);
  }

  // Format the Hebrew date as `[day-gematria] [month] [year]`. The
  // longest possible string is 16 chars (an Adar I leap-year date
  // like "י"א אדר א' תשפ"ד"); the UI sizes its date row accordingly,
  // so this function never needs a strip-marks or truncation fallback.
  function formatHebrewDate(jsDate) {
    const hd = new HDate(jsDate);
    const dayInt = hd.getDate();
    const hYear  = hd.getFullYear();
    const month  = hebrewMonthName(hd.getMonth(), hebrewIsLeapYear(hYear));
    return `${dayGematria(dayInt, true)} ${month} ${yearGematria(hYear, true)}`;
  }

  // ─── Day of week ───────────────────────────────────────────────

  // יום א' through יום ו' for Sun–Fri (5 chars each), and the longer
  // יום שבת (7 chars) on Saturday.
  const HEBREW_DOW = [
    "יום א'",   // 0 = Sunday
    "יום ב'",   // 1 = Monday
    "יום ג'",   // 2 = Tuesday
    "יום ד'",   // 3 = Wednesday
    "יום ה'",   // 4 = Thursday
    "יום ו'",   // 5 = Friday
    "יום שבת",  // 6 = Saturday
  ];
  function dowText(jsDate) { return HEBREW_DOW[jsDate.getDay()]; }

  // ─── Tzeit hakochavim rollover ────────────────────────────────

  // The Hebrew calendar day rolls over at tzeit hakochavim — when the
  // sun's centre dips ROLLOVER_DEPRESSION_DEG below the horizon. We use
  // Hebcal's NOAA-based Zmanim class, which gives the full set of
  // halachic times (alot, sunrise, chatzot, plag, sunset, tzeit72, …)
  // from the same GeoLocation, useful when more zmanim get wired in
  // later.
  //
  // Hardcoded to Modi'in-Maccabim-Re'ut, Israel for now. The render
  // layer doesn't read these values directly — it calls
  // getEffectiveTodayJs() / tzeitForLocalDate() — so swapping the
  // location to a UI picker or geolocation in the future is local
  // to this module.
  const ROLLOVER_LAT  = 31.8924;   // °N
  const ROLLOVER_LON  = 35.0103;   // °E
  const ROLLOVER_ELEV = 290;       // m above sea level
  const ROLLOVER_TZ   = 'Asia/Jerusalem';
  const ROLLOVER_DEPRESSION_DEG = 8.5;
  const ROLLOVER_LOC = new GeoLocation(
    'Rollover Location',
    ROLLOVER_LAT,
    ROLLOVER_LON,
    ROLLOVER_ELEV,
    ROLLOVER_TZ,
  );

  function tzeitForLocalDate(year, month, day) {
    // Zmanim takes a JS Date pinned to the local civil date — only
    // the y/m/d components are read; time-of-day is ignored.
    const z = new Zmanim(ROLLOVER_LOC, new Date(year, month - 1, day), false);
    return z.tzeit(ROLLOVER_DEPRESSION_DEG);
  }

  // Returns a JS Date set to midnight (browser-local) representing the
  // *effective* Hebrew calendar day for `realNow`: today's local civil
  // date at the rollover location if before tzeit, the next civil date
  // once tzeit has passed. The HDate constructor reads only y/m/d, so
  // this propagates cleanly into the rest of the calendar pipeline.
  function getEffectiveTodayJs(realNow) {
    const isoStr = realNow.toLocaleDateString('en-CA', { timeZone: ROLLOVER_TZ });
    const [y, m, d] = isoStr.split('-').map(Number);
    const tz = tzeitForLocalDate(y, m, d);
    if (tz && realNow.getTime() >= tz.getTime()) {
      return new Date(y, m - 1, d + 1);
    }
    return new Date(y, m - 1, d);
  }

  window.Core = {
    // Hebrew month math
    hebrewIsLeapYear,
    hebrewDaysInMonth,
    hebrewMonthName,
    // Gematria
    dayGematria,
    yearGematria,
    // Date / dow formatting
    formatHebrewDate,
    HEBREW_DOW,
    dowText,
    // Tzeit
    tzeitForLocalDate,
    getEffectiveTodayJs,
    ROLLOVER_TZ,
  };
})();
