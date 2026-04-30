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
    'אחרי מות־קדשים': 'אחרי מ־קדשים',
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
    try { events = HebrewCalendar.calendar({ start: hd, end: hd, il: true }) || []; } catch {}

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
      return { holidayName: name, yaalehVeYavo: true, specialDay: '', alHaNisim: false };
    }

    // Major Yom Tov — Hebcal Hebrew rendering + יעלה ויבוא
    const yomTov = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.CHAG));
    if (yomTov) {
      let name = renderHe(yomTov);
      // RH day 1 comes back as "ראש השנה 5787" — strip the year and use א׳
      if (/Rosh Hashana/i.test(renderEn(yomTov))) {
        if (hd.getMonth() === 7 && hd.getDate() === 1) name = 'ראש השנה א׳';
      }
      return { holidayName: name, yaalehVeYavo: true, specialDay: '', alHaNisim: false };
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

    return { holidayName: '', yaalehVeYavo: roshChodesh, specialDay, alHaNisim };
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

  // Build the body text for a given JS date — always 7 rows so the grid
  // stays full. See LITURGY.md for row order.
  function getDisplayText(jsDate) {
    const hd = new HDate(jsDate);
    const hMonth = hd.getMonth();
    const hDay = hd.getDate();
    const { holidayName, yaalehVeYavo, specialDay, alHaNisim } = getDayInfo(jsDate);
    const row1 = holidayName || getParshaForDate(jsDate);
    const talRow = isTalUMatar(hMonth, hDay) ? 'תן טל ומטר' : 'תן ברכה';
    const geshem = isMoridHaGeshem(hMonth, hDay) ? 'מוריד הגשם' : 'מוריד הטל';
    const rows = [row1];
    if (specialDay) rows.push(specialDay);
    if (yaalehVeYavo) rows.push('יעלה ויבוא');
    rows.push(talRow, geshem);
    if (alHaNisim) rows.push('אל הניסים');
    while (rows.length < 7) rows.push('');
    return rows.join('\n');
  }

  window.Liturgy = {
    getDisplayText,
    getDayInfo,
    getParshaForDate,
    isTalUMatar,
    isMoridHaGeshem,
    stripNiqqud,
  };
})();
