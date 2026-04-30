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

    const getFlags = e => { try { return e.getFlags(); } catch { return 0; } };
    const renderEn = e => { try { return e.render('en') || ''; } catch { return ''; } };
    const renderHe = e => stripNiqqud((() => { try { return e.render('he') || ''; } catch { return ''; } })());

    // Chol HaMoed — fixed Hebrew string + יעלה ויבוא
    const cholHamoed = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.CHOL_HAMOED));
    if (cholHamoed) {
      const en = renderEn(cholHamoed);
      const name = /pesach|passover/i.test(en) ? 'חול המועד פסח'
                 : /sukkot/i.test(en)          ? 'ח המועד סוכות'
                 : renderHe(cholHamoed);
      return {
        holidayName: name, yaalehVeYavo: true, specialDay: '', alHaNisim: false,
        roshChodesh: false, specialShabbat: '', shabbatMevarchim: false,
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
        roshChodesh: false, specialShabbat: '', shabbatMevarchim: false,
      };
    }

    // Rosh Chodesh — no row-1 override, but יעלה ויבוא is said
    const roshChodesh = !!events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.ROSH_CHODESH));

    // Chanukah / Purim — prefer non-candle events for cleaner Hebrew text
    const chanukahOrPurim =
      events.find(e => !(getFlags(e) & HEBCAL_FLAGS.CHANUKAH_CANDLES) &&
                       (/chanukah/i.test(renderEn(e)) || /\bpurim\b/i.test(renderEn(e)))) ||
      events.find(e => /chanukah/i.test(renderEn(e)) || /\bpurim\b/i.test(renderEn(e)));

    const modernEv = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.MODERN_HOLIDAY));

    const specialEv = chanukahOrPurim || modernEv;
    const specialDay = specialEv ? renderHe(specialEv) : '';
    const alHaNisim = !!chanukahOrPurim;

    // Parshiyot + Shabbat HaGadol — keyed by Hebcal's English desc so we
    // can pick our own Hebrew label rather than the stock "שבת ..." one.
    const specialShabbatEv = events.find(e => {
      try { return !!SPECIAL_SHABBAT_MAP[e.getDesc()]; } catch { return false; }
    });
    const specialShabbat = specialShabbatEv
      ? SPECIAL_SHABBAT_MAP[specialShabbatEv.getDesc()] : '';

    const shabbatMevarchim = events.some(e => !!(getFlags(e) & FLAG_SHABBAT_MEVARCHIM));

    return {
      holidayName: '',
      yaalehVeYavo: roshChodesh,
      specialDay,
      alHaNisim,
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

  // Greedy word-wrap for Hebrew text into ≤max-char lines.
  function wrapWords(text, max) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (Array.from(next).length <= max) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Returns the Ashkenazi "היום … לעומר" text broken into ≤MAX lines.
  // We break at structural boundaries (היום / day-phrase / week-phrase /
  // remainder / לעומר) rather than purely greedy — produces lines that
  // each read as a coherent noun phrase.
  function omerLines(n, max) {
    const lines = [];
    const dayP = omerDayPhrase(n);
    const opener = 'היום ' + dayP;
    if (Array.from(opener).length <= max) {
      lines.push(opener);
    } else {
      lines.push('היום');
      for (const l of wrapWords(dayP, max)) lines.push(l);
    }
    if (n >= 7) {
      const weeks = Math.floor(n / 7);
      const rem = n % 7;
      for (const l of wrapWords(omerWeekPhrase(weeks, rem), max)) lines.push(l);
    }
    const last = lines[lines.length - 1];
    if (Array.from(last + ' לעומר').length <= max) {
      lines[lines.length - 1] = last + ' לעומר';
    } else {
      lines.push('לעומר');
    }
    return lines;
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
      holidayName, yaalehVeYavo, specialDay, alHaNisim,
      roshChodesh, specialShabbat, shabbatMevarchim,
    } = info;
    const row1 = holidayName || getParshaForDate(jsDate);
    const talRow = isTalUMatar(hMonth, hDay) ? 'תן טל ומטר' : 'תן ברכה';
    const geshem = isMoridHaGeshem(hMonth, hDay) ? 'מוריד הגשם' : 'מוריד הטל';

    const rows = [row1];
    if (specialShabbat)    rows.push(specialShabbat);
    if (shabbatMevarchim)  rows.push('שבת מברכים');
    if (specialDay)        rows.push(specialDay);
    if (roshChodesh)       rows.push('ראש חודש');
    if (yaalehVeYavo)      rows.push('יעלה ויבוא');
    rows.push(talRow, geshem);
    if (alHaNisim)         rows.push('אל הניסים');
    while (rows.length < 7) rows.push('');

    const omerN = getOmerDay(hd);
    if (omerN > 0) {
      rows.push('');
      for (const l of omerLines(omerN, 13)) rows.push(l);
    }
    return rows.join('\n');
  }

  window.Liturgy = {
    getDisplayText,
    getDayInfo,
    getParshaForDate,
    getOmerDay,
    omerLines,
    isTalUMatar,
    isMoridHaGeshem,
    stripNiqqud,
  };
})();
