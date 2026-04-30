// Liturgical decision logic — what text to display for a given date.
// See LITURGY.md for the underlying halachic rules.
//
// This file is pure decision logic. It depends on Hebcal for calendar
// queries but has no DOM/animation/render concerns; that's all in app.js.

(() => {
  'use strict';

  const { HDate, HebrewCalendar, flags: HEBCAL_FLAGS } = window.hebcal;

  // Custom short forms for parsha names that exceed MAX_COLS (13 cells).
  // Hebcal renders combined parshiot with a Hebrew maqaf (U+05BE) and the
  // short "קדשים" spelling, so the override key matches that exactly.
  const PARSHA_OVERRIDES = {
    'אחרי מות־קדשים': 'אחרי מ־קדושים',
  };

  // Hebcal flag — events emitted only on a Shabbat that announces the
  // upcoming Rosh Chodesh. Mirrors the value baked into the bundle so we
  // don't depend on it being exposed on `flags`.
  const FLAG_SHABBAT_MEVARCHIM = 32768;

  // The four parshiyot + Shabbat HaGadol — Hebcal returns them as
  // separate events alongside the regular parsha. We render them with
  // the "פרשת" prefix the user expects (Hebcal's stock Hebrew uses
  // "שבת" for all five, which is correct for HaGadol but unusual for
  // the four parshiyot).
  const SPECIAL_SHABBAT_MAP = {
    'Shabbat HaGadol':   'שבת הגדול',
    'Shabbat HaChodesh': 'פרשת החודש',
    'Shabbat Parah':     'פרשת פרה',
    'Shabbat Shekalim':  'פרשת שקלים',
    'Shabbat Zachor':    'פרשת זכור',
  };

  // Hebrew labels we override on Hebcal's stock rendering — either to
  // fit the 13-cell row width or to give a more recognisable / proper
  // name. Keyed by the English description (e.getDesc()). The 13-char
  // ceiling is enforced by the body-row test in tests/run.js, so this
  // table is what catches future Hebcal additions before they truncate.
  const HOLIDAY_OVERRIDES = {
    // Day 7 of Sukkot Chol HaMoed — its own well-known name.
    'Sukkot VII (Hoshana Raba)': 'הושענא רבה',
    // Adar I in a leap year — minor commemoration. The full
    // "שושן פורים קטן" is 14 chars (one over the row width); we
    // shorten שושן → שו׳ rather than abbreviating פורים, which the
    // ש״פ contraction would have hidden.
    'Shushan Purim Katan':       'שו׳ פורים קטן',
    // Tisha B'Av deferred to Sunday when 9 Av falls on Shabbat.
    'Tish\'a B\'Av (observed)':  'תשעה באב נדחה',
  };

  // Israel observances we *want* on the board. Hebcal's MODERN_HOLIDAY
  // flag covers ~13 civic days; the user has explicitly opted in to
  // these five (the four national days + Sigd) and out of the rest
  // (Family Day, Herzl Day, Jabotinsky Day, Hebrew Language Day,
  // Ben-Gurion Day, Rabin Memorial Day, Yom HaAliyah, Yom HaAliyah
  // School Observance, Rosh Hashana LaBehemot). To bring one back,
  // add its English desc here — overrides for previously-truncated
  // labels are kept in HOLIDAY_OVERRIDES_DROPPED below for reference.
  const KEPT_MODERN_HOLIDAYS = new Set([
    'Yom HaShoah',
    'Yom HaZikaron',
    "Yom HaAtzma'ut",
    'Yom Yerushalayim',
    'Sigd',
  ]);

  // Hebcal renders Chanukah days as "חנוכה: X׳ נרות" — the colon and
  // נרות push days 2–8 to 14 chars, over the row width. We compress to
  // "חנוכה X׳" (≤8 chars). The English desc is "Chanukah: N Candle(s)"
  // or "Chanukah: 8th Day"; either way the leading number is the day.
  const CHANUKAH_DAY = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
  function chanukahOverride(en) {
    const m = en.match(/^Chanukah:\s+(\d+)/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    if (day < 1 || day > 8) return null;
    return 'חנוכה ' + CHANUKAH_DAY[day] + '׳';
  }

  // Strip Hebrew niqqud + cantillation (U+0591–U+05C7) but preserve the
  // maqaf (U+05BE) — it's inside the same Unicode range yet is a real
  // punctuation character used between words like אחרי מות־קדשים.
  function stripNiqqud(str) {
    return str.replace(/[֑-ֽֿ-ׇ]/g, '');
  }

  // Israel: say "תן טל ומטר" from 7 Marcheshvan through 14 Nisan.
  function isTalUMatar(hMonth, hDay) {
    if (hMonth === 8 && hDay >= 7) return true;
    if (hMonth >= 9 && hMonth <= 13) return true;
    if (hMonth === 1 && hDay <= 14) return true;
    return false;
  }

  // Israel: say "מוריד הגשם" from 22 Tishrei (Shemini Atzeret) through 14 Nisan.
  function isMoridHaGeshem(hMonth, hDay) {
    if (hMonth === 7 && hDay >= 22) return true;
    if (hMonth >= 8 && hMonth <= 13) return true;
    if (hMonth === 1 && hDay <= 14) return true;
    return false;
  }

  // Single Hebcal query for jsDate; returns:
  //   holidayName — non-empty string to show in row 1 instead of the parsha
  //   yaalehVeYavo — true when יעלה ויבוא is added (Yom Tov / Chol HaMoed / R"Ch)
  //   specialDay — secondary row (Chanukah / Purim / Israeli day)
  //   alHaNisim — Chanukah & Purim only
  function getDayInfo(jsDate) {
    const hd = new HDate(jsDate);
    let events = [];
    try {
      events = HebrewCalendar.calendar({
        start: hd, end: hd, il: true, shabbatMevarchim: true,
      }) || [];
    } catch {}

    const getDesc  = e => { try { return e.getDesc() || ''; } catch { return ''; } };
    const getFlags = e => { try { return e.getFlags(); } catch { return 0; } };
    const renderEn = e => { try { return e.render('en') || ''; } catch { return ''; } };
    const renderHe = e => stripNiqqud((() => { try { return e.render('he') || ''; } catch { return ''; } })());

    // Returns an override string from HOLIDAY_OVERRIDES / Chanukah, or
    // null if Hebcal's own Hebrew rendering should be used. Centralised
    // so every branch (cholHamoed / yomTov / specialDay) hits it the
    // same way.
    const overrideLabel = e => {
      const desc = getDesc(e);
      if (desc.startsWith('Chanukah')) {
        const c = chanukahOverride(desc);
        if (c) return c;
      }
      return HOLIDAY_OVERRIDES[desc] || null;
    };

    // Chol HaMoed — fixed Hebrew string + יעלה ויבוא. Hoshana Rabbah is
    // a Sukkot Chol HaMoed day in Hebcal's eyes, but its proper name
    // wins via HOLIDAY_OVERRIDES before the generic fallback.
    const cholHamoed = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.CHOL_HAMOED));
    if (cholHamoed) {
      const en = renderEn(cholHamoed);
      const name = overrideLabel(cholHamoed)
                 || (/pesach|passover/i.test(en) ? 'חול המועד פסח'
                  :  /sukkot/i.test(en)          ? 'ח המועד סוכות'
                  :  renderHe(cholHamoed));
      return {
        holidayName: name, yaalehVeYavo: true, specialDay: '', alHaNisim: false,
        fastDay: '', roshChodesh: false, specialShabbat: '', shabbatMevarchim: false,
      };
    }

    // Major Yom Tov — Hebcal Hebrew rendering + יעלה ויבוא
    const yomTov = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.CHAG));
    if (yomTov) {
      let name = renderHe(yomTov);
      // RH day 1 comes back as "ראש השנה 5787" — strip the year and use א׳
      if (/Rosh Hashana/i.test(renderEn(yomTov))) {
        if (hd.getMonth() === 7 && hd.getDate() === 1) name = 'ראש השנה א׳';
      }
      return {
        holidayName: name, yaalehVeYavo: true, specialDay: '', alHaNisim: false,
        fastDay: '', roshChodesh: false, specialShabbat: '', shabbatMevarchim: false,
      };
    }

    // Rosh Chodesh — no row-1 override, but יעלה ויבוא is said
    const roshChodesh = !!events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.ROSH_CHODESH));

    // Chanukah / Purim — prefer non-candle events for cleaner Hebrew text
    const chanukahOrPurim =
      events.find(e => !(getFlags(e) & HEBCAL_FLAGS.CHANUKAH_CANDLES) &&
                       (/chanukah/i.test(renderEn(e)) || /\bpurim\b/i.test(renderEn(e)))) ||
      events.find(e => /chanukah/i.test(renderEn(e)) || /\bpurim\b/i.test(renderEn(e)));

    const modernEv = events.find(e =>
      (getFlags(e) & HEBCAL_FLAGS.MODERN_HOLIDAY) && KEPT_MODERN_HOLIDAYS.has(getDesc(e)));

    const specialEv = chanukahOrPurim || modernEv;
    const specialDay = specialEv ? (overrideLabel(specialEv) || renderHe(specialEv)) : '';
    const alHaNisim = !!chanukahOrPurim;

    // Parshiyot + Shabbat HaGadol — keyed by Hebcal's English desc so we
    // can pick our own Hebrew label rather than the stock "שבת ..." one.
    const specialShabbatEv = events.find(e => {
      try { return !!SPECIAL_SHABBAT_MAP[e.getDesc()]; } catch { return false; }
    });
    const specialShabbat = specialShabbatEv
      ? SPECIAL_SHABBAT_MAP[specialShabbatEv.getDesc()] : '';

    const shabbatMevarchim = events.some(e => !!(getFlags(e) & FLAG_SHABBAT_MEVARCHIM));

    // Fasts — minor (Tzom Gedaliah, Asara B'Tevet, Ta'anit Esther, 17
    // Tammuz, Ta'anit Bechorot) and major (Tisha B'Av). Yom Kippur is
    // also a major fast but already returned early via the CHAG branch
    // above. Hebcal's stock Hebrew labels all fit the 13-cell limit.
    const FAST_FLAGS = HEBCAL_FLAGS.MAJOR_FAST | HEBCAL_FLAGS.MINOR_FAST;
    const fastEv = events.find(e => !!(getFlags(e) & FAST_FLAGS));
    const fastDay = fastEv ? (overrideLabel(fastEv) || renderHe(fastEv)) : '';

    return {
      holidayName: '',
      yaalehVeYavo: roshChodesh,
      specialDay,
      alHaNisim,
      fastDay,
      roshChodesh,
      specialShabbat,
      shabbatMevarchim,
    };
  }

  // Next parsha on or after the Shabbat of jsDate's week. Skips weeks
  // whose Shabbat has no regular reading (Yom Tov / Chol HaMoed).
  function getParshaForDate(jsDate) {
    const shabbat = new Date(jsDate);
    const dow = shabbat.getDay();
    if (dow !== 6) shabbat.setDate(shabbat.getDate() + (6 - dow));
    for (let attempt = 0; attempt < 5; attempt++) {
      const hd = new HDate(shabbat);
      let events;
      try {
        events = HebrewCalendar.calendar({ start: hd, end: hd, sedrot: true, il: true, locale: 'he' });
      } catch { return ''; }
      const ev = events.find(e => { try { return e.render('en').startsWith('Parashat'); } catch { return false; } });
      if (ev) {
        const title = stripNiqqud((ev.render('he') || ev.render('en')) || '');
        const bare = title.replace(/^(פרשת|Parashat)\s+/, '');
        return PARSHA_OVERRIDES[bare] || bare;
      }
      shabbat.setDate(shabbat.getDate() + 7);
    }
    return '';
  }

  // ─── Sefirat HaOmer (Ashkenaz) ─────────────────────────────────
  // Day N (1..49) is counted on Hebrew date 16 Nisan + (N-1), through
  // 5 Sivan. Returns 0 outside that window.
  function getOmerDay(hd) {
    const start = new HDate(16, 1 /* Nisan */, hd.getFullYear());
    const diff = hd.abs() - start.abs();
    if (diff < 0 || diff > 48) return 0;
    return diff + 1;
  }

  // Masculine cardinal forms used in the Sefirat HaOmer text.
  // CONSTRUCT (שני, חמשה …) sits directly before a noun: "שני ימים".
  // ABSOLUTE (שנים, חמשה …) is used in compound numbers: "שנים ועשרים".
  // Note "אחד / שלשה / ארבעה / חמשה / ששה / שבעה / שמונה / תשעה" coincide
  // between the two forms — only "שני / שנים" actually differ.
  const NUM_CONSTRUCT = ['', 'אחד', 'שני', 'שלשה', 'ארבעה', 'חמשה', 'ששה', 'שבעה', 'שמונה', 'תשעה'];
  const NUM_ABSOLUTE  = ['', 'אחד', 'שנים', 'שלשה', 'ארבעה', 'חמשה', 'ששה', 'שבעה', 'שמונה', 'תשעה'];

  function omerDayPhrase(n) {
    if (n === 1) return 'יום אחד';
    if (n < 10) return NUM_CONSTRUCT[n] + ' ימים';
    if (n === 10) return 'עשרה ימים';
    if (n < 20) return NUM_ABSOLUTE[n - 10] + ' עשר יום';
    if (n === 20) return 'עשרים יום';
    if (n < 30) return NUM_ABSOLUTE[n - 20] + ' ועשרים יום';
    if (n === 30) return 'שלשים יום';
    if (n < 40) return NUM_ABSOLUTE[n - 30] + ' ושלשים יום';
    if (n === 40) return 'ארבעים יום';
    return NUM_ABSOLUTE[n - 40] + ' וארבעים יום';
  }

  function omerWeekPhrase(weeks, days) {
    let weekP;
    if (weeks === 1) weekP = 'שבוע אחד';
    else if (weeks === 2) weekP = 'שני שבועות';
    else weekP = NUM_CONSTRUCT[weeks] + ' שבועות';
    if (days === 0) return 'שהם ' + weekP;
    if (days === 1) return 'שהם ' + weekP + ' ויום אחד';
    return 'שהם ' + weekP + ' ו' + NUM_CONSTRUCT[days] + ' ימים';
  }

  // Returns the full Ashkenazi single-line text for omer day n, e.g.
  //   "היום שלשה ושלשים יום שהם ארבעה שבועות וחמשה ימים לעומר"
  function omerFullText(n) {
    let txt = 'היום ' + omerDayPhrase(n);
    if (n >= 7) {
      const weeks = Math.floor(n / 7);
      const rem = n % 7;
      txt += ' ' + omerWeekPhrase(weeks, rem);
    }
    return txt + ' לעומר';
  }

  // Word-balanced split into exactly k lines — picks the word
  // boundaries that minimise the longest line. Recursive DP, fine for
  // sefira-sized text (≤ ~10 words). Returns { lines, maxLen } or
  // null if k > word count.
  function balancedSplitInto(words, k) {
    if (k > words.length) return null;
    function rec(start, linesLeft) {
      if (linesLeft === 1) {
        const rest = words.slice(start).join(' ');
        return { lines: [rest], maxLen: Array.from(rest).length };
      }
      let best = null;
      for (let i = start + 1; i <= words.length - linesLeft + 1; i++) {
        const head = words.slice(start, i).join(' ');
        const sub = rec(i, linesLeft - 1);
        if (!sub) continue;
        const maxLen = Math.max(Array.from(head).length, sub.maxLen);
        if (!best || maxLen < best.maxLen) {
          best = { lines: [head, ...sub.lines], maxLen };
        }
      }
      return best;
    }
    return rec(0, k);
  }

  // Splits Hebrew text into the smallest number of lines (1..maxLines)
  // whose longest line fits maxLineLen characters. If even the
  // maxLines split overflows, falls back to that split anyway — the
  // layout still renders, just with a clipped row. Used by the sefira
  // footer; the parameters live in app.js so layout concerns stay out
  // of the liturgy module.
  function splitBalancedLines(text, maxLines, maxLineLen) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    if (words.length === 1) return [text];
    let fallback = null;
    for (let k = 1; k <= maxLines; k++) {
      const r = balancedSplitInto(words, k);
      if (!r) break;
      if (r.maxLen <= maxLineLen) return r.lines;
      fallback = r;
    }
    return fallback ? fallback.lines : [text];
  }

  // The sefira section rendered separately at the bottom of the board
  // on smaller flap cells (see .board-footer in style.css). Returns
  // the day number + the unwrapped Ashkenazi text; app.js does the
  // line-wrapping itself with FOOTER_COLS / FOOTER_MAX_LINES so layout
  // tuning doesn't have to round-trip through this file.
  function getOmerSection(jsDate) {
    const hd = new HDate(jsDate);
    const n = getOmerDay(hd);
    if (n === 0) return null;
    return { day: n, fullText: omerFullText(n) };
  }

  // Build the body text for a given JS date — always at least 7 rows so
  // the grid stays full on a "quiet" day. Special days add more rows;
  // during Sefirat HaOmer the count is appended as its own section after
  // a blank-row separator.
  function getDisplayText(jsDate) {
    const hd = new HDate(jsDate);
    const hMonth = hd.getMonth();
    const hDay = hd.getDate();
    const info = getDayInfo(jsDate);
    const {
      holidayName, yaalehVeYavo, specialDay, alHaNisim, fastDay,
      roshChodesh, specialShabbat, shabbatMevarchim,
    } = info;
    const row1 = holidayName || getParshaForDate(jsDate);
    const talRow = isTalUMatar(hMonth, hDay) ? 'תן טל ומטר' : 'תן ברכה';
    const geshem = isMoridHaGeshem(hMonth, hDay) ? 'מוריד הגשם' : 'מוריד הטל';

    const rows = [row1];
    if (specialShabbat)    rows.push(specialShabbat);
    if (shabbatMevarchim)  rows.push('שבת מברכים');
    if (fastDay)           rows.push(fastDay);
    if (specialDay)        rows.push(specialDay);
    if (roshChodesh)       rows.push('ראש חודש');
    if (yaalehVeYavo)      rows.push('יעלה ויבוא');
    if (alHaNisim)         rows.push('על הניסים');
    rows.push(talRow, geshem);
    while (rows.length < 7) rows.push('');
    return rows.join('\n');
  }

  window.Liturgy = {
    getDisplayText,
    getDayInfo,
    getParshaForDate,
    getOmerDay,
    getOmerSection,
    omerFullText,
    splitBalancedLines,
    isTalUMatar,
    isMoridHaGeshem,
    stripNiqqud,
  };
})();
