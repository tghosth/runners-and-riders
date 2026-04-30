(() => {
  'use strict';

  // Hebrew alphabet: 22 letters + 5 final forms + space + common punctuation/digits
  const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';
  const PUNCTUATION = ' .,!?־׳״';
  const DIGITS = '0123456789';
  const CHAR_SET = (HEBREW_LETTERS + PUNCTUATION + DIGITS).split('');
  const HEBREW_CHAR_SET = HEBREW_LETTERS.split('');
  const TIME_CHAR_SET = DIGITS.split('');

  const STAGGER_MS = 300;
  const MIN_CYCLES = 10;
  const MAX_CYCLES = 22;
  const MAX_COLS = 13;

  const { HDate, HebrewCalendar, flags: HEBCAL_FLAGS } = window.hebcal;

  // ─── Liturgical logic (see LITURGY.md) ────────────────────────

  // Custom short forms for names that exceed MAX_COLS (13 cells).
  const PARSHA_OVERRIDES = {
    'אחרי מות-קדושים': 'אחרי מ-קדושים',
  };

  // Remove Hebrew niqqud (vowel points + cantillation, U+0591–U+05C7).
  function stripNiqqud(str) {
    return str.replace(/[֑-ׇ]/g, '');
  }

  // Israel: say "תן טל ומטר" from 7 Marcheshvan through 14 Nisan.
  function isTalUMatar(hMonth, hDay) {
    if (hMonth === 8 && hDay >= 7) return true;   // 7+ Marcheshvan
    if (hMonth >= 9 && hMonth <= 13) return true;  // Kislev – Adar(II)
    if (hMonth === 1 && hDay <= 14) return true;   // 1–14 Nisan
    return false;
  }

  // Israel: say "מוריד הגשם" from 22 Tishrei (Shemini Atzeret) through 14 Nisan.
  function isMoridHaGeshem(hMonth, hDay) {
    if (hMonth === 7 && hDay >= 22) return true;   // 22+ Tishrei
    if (hMonth >= 8 && hMonth <= 13) return true;  // Marcheshvan – Adar(II)
    if (hMonth === 1 && hDay <= 14) return true;   // 1–14 Nisan
    return false;
  }

  // Single Hebcal query for jsDate; returns:
  //   holidayName — non-empty string to show in row 1 instead of the parsha,
  //                 or '' on a regular weekday/Shabbat.
  //   yaalehVeYavo — true when יעלה ויבוא is added to the Amida
  //                  (Yom Tov, Chol HaMoed, Rosh Chodesh).
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
      return { holidayName: name, yaalehVeYavo: true };
    }

    // Major Yom Tov — Hebcal Hebrew rendering + יעלה ויבוא
    const yomTov = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.CHAG));
    if (yomTov) return { holidayName: renderHe(yomTov), yaalehVeYavo: true };

    // Rosh Chodesh — no row-1 override, but יעלה ויבוא is said
    const roshChodesh = events.find(e => !!(getFlags(e) & HEBCAL_FLAGS.ROSH_CHODESH));
    return { holidayName: '', yaalehVeYavo: !!roshChodesh };
  }

  // Return the parsha name (Hebrew, no niqqud, no prefix) for the Shabbat
  // of the week containing jsDate. Returns '' on Yom Tov weeks with no
  // regular portion.
  function getParshaForDate(jsDate) {
    const shabbat = new Date(jsDate);
    const dow = shabbat.getDay(); // 0=Sun … 6=Sat
    if (dow !== 6) shabbat.setDate(shabbat.getDate() + (6 - dow));
    const hd = new HDate(shabbat);
    let events;
    try {
      events = HebrewCalendar.calendar({ start: hd, end: hd, sedrot: true, il: true, locale: 'he' });
    } catch { return ''; }
    const ev = events.find(e => { try { return e.render('en').startsWith('Parashat'); } catch { return false; } });
    if (!ev) return '';
    const title = stripNiqqud((ev.render('he') || ev.render('en')) || '');
    // Strip "פרשת " (Hebrew) or "Parashat " (English) prefix
    const bare = title.replace(/^(פרשת|Parashat)\s+/, '');
    return PARSHA_OVERRIDES[bare] || bare;
  }

  // Build the display text for a given JS date. Always 7 rows (padded
  // with blanks) so the grid stays full. יעלה ויבוא, when present,
  // occupies row 2 and shifts Tal/Geshem down by one.
  function getDisplayText(jsDate) {
    const hd = new HDate(jsDate);
    const hMonth = hd.getMonth();
    const hDay = hd.getDate();
    const { holidayName, yaalehVeYavo } = getDayInfo(jsDate);
    const row1 = holidayName || getParshaForDate(jsDate);
    const talRow = isTalUMatar(hMonth, hDay) ? 'תן טל ומטר' : 'תן ברכה';
    const geshem = isMoridHaGeshem(hMonth, hDay) ? 'מוריד הגשם' : 'מוריד הטל';
    const rows = yaalehVeYavo
      ? [row1, 'יעלה ויבוא', talRow, geshem, '', '', '']
      : [row1, talRow, geshem, '', '', '', ''];
    return rows.join('\n');
  }

  const board = document.getElementById('board');

  // Header-row layout: 13 cells total. Up to TIME_COLS (5) cells of
  // "HH:MM" go on the visual left, up to DATE_COLS (8) cells of Hebrew
  // date go on the visual right, and any leftover cells become padding
  // in the middle. With dir="rtl" on the board the DOM-first child
  // sits at the RTL start = visual right.
  const TIME_COLS = 5;
  const DATE_COLS = 8;

  // Time formatter: 24-hour Asia/Jerusalem, en-GB gives "HH:MM" with
  // leading zeros regardless of the user's locale.
  const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Hebrew month-name formatter (long form). We use Intl for the month
  // string but compute the day in gematria ourselves below — `nu-hebr`
  // is unevenly supported across browsers/runtimes.
  const HEBREW_MONTH_FMT = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'long',
  });

  // Day-of-month gematria (1–30). 15 and 16 use the conventional ט״ו /
  // ט״ז to avoid spelling fragments of the divine name.
  const GEMATRIA_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const GEMATRIA_TENS = ['', 'י', 'כ', 'ל'];
  function dayGematria(n, withMarks) {
    if (n === 15) return withMarks ? 'ט״ו' : 'טו';
    if (n === 16) return withMarks ? 'ט״ז' : 'טז';
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (n < 10) return withMarks ? GEMATRIA_ONES[ones] + '׳' : GEMATRIA_ONES[ones];
    if (ones === 0) return withMarks ? GEMATRIA_TENS[tens] + '׳' : GEMATRIA_TENS[tens];
    return withMarks
      ? GEMATRIA_TENS[tens] + '״' + GEMATRIA_ONES[ones]
      : GEMATRIA_TENS[tens] + GEMATRIA_ONES[ones];
  }

  // Format the Hebrew date as `[day-gematria] [month]`. Drops the year
  // (the body of the message is the focus, and Hebrew years rarely
  // change) and tries hardest to fit DATE_COLS cells: full marks, then
  // marks stripped, then truncated.
  function formatHebrewDate(date) {
    const parts = HEBREW_MONTH_FMT.formatToParts(date);
    const dayInt = parseInt(parts.find((p) => p.type === 'day').value, 10);
    const month = parts.find((p) => p.type === 'month').value;
    let str = `${dayGematria(dayInt, true)} ${month}`;
    if (Array.from(str).length <= DATE_COLS) return str;
    // Strip geresh ׳ and gershayim ״ and try again — typically gets us
    // under for leap-year Adar ("כ״ט אדר א׳" → "כט אדר א").
    str = str.replace(/[׳״]/g, '');
    if (Array.from(str).length <= DATE_COLS) return str;
    return Array.from(str).slice(0, DATE_COLS).join('');
  }

  // Header-row cell registries — populated by buildHeaderRow, mutated
  // by updateClock so only the cells whose char actually changed flip.
  let headerTimeCells = [];
  let headerDateCells = [];

  // Builds the brass-plate header — two side-by-side panels (Hebrew
  // date on the visual right, HH:MM time on the visual left) sized
  // smaller than the body cells so they read as a subordinate row.
  // Returns { headerEl, allCells } where allCells is in scheduling
  // order so the cascade can stagger them like any body row.
  function buildHeaderRow() {
    const now = new Date();
    const dateChars = Array.from(formatHebrewDate(now));
    const timeChars = Array.from(TIME_FMT.format(now));

    const headerEl = document.createElement('div');
    headerEl.className = 'board-header';
    const allCells = [];

    // Date panel — inherits dir="rtl" from the board, so DOM-first cell
    // sits at the visual right of the section, matching Hebrew reading.
    const dateSection = document.createElement('div');
    dateSection.className = 'header-section header-date';
    headerDateCells = [];
    for (const ch of dateChars) {
      const cell = createCell();
      setCellChar(cell, ' ');
      cell._target = ch;
      cell._charSet = HEBREW_CHAR_SET;
      dateSection.appendChild(cell.el);
      headerDateCells.push(cell);
      allCells.push(cell);
    }

    // Time panel — explicit dir="ltr" so the digits read 14:30, not
    // 03:41. Inside an RTL board this override is required.
    const timeSection = document.createElement('div');
    timeSection.className = 'header-section header-time';
    timeSection.setAttribute('dir', 'ltr');
    headerTimeCells = [];
    for (const ch of timeChars) {
      const cell = createCell();
      setCellChar(cell, ' ');
      cell._target = ch;
      cell._charSet = TIME_CHAR_SET;
      if (ch === ':') cell._static = true;
      timeSection.appendChild(cell.el);
      headerTimeCells.push(cell);
      allCells.push(cell);
    }

    // RTL flex on the parent: first child sits at the visual right
    // (date), second at the visual left (time). justify-content:
    // space-between in the CSS pushes the gap into the middle.
    headerEl.appendChild(dateSection);
    headerEl.appendChild(timeSection);

    return { headerEl, allCells };
  }

  function updateClock() {
    if (!headerTimeCells.length && !headerDateCells.length) return;
    const now = new Date();
    const timeChars = Array.from(TIME_FMT.format(now));
    const dateChars = Array.from(formatHebrewDate(now));
    const updateOne = (cell, ch) => {
      if (!cell || !ch || cell.current === ch) return;
      // Cancel any in-progress cycle on this cell so the minute tick
      // can land cleanly without two animations stomping each other.
      clearCellTimer(cell);
      cell._target = ch;
      flipCellTo(cell, ch);
    };
    timeChars.forEach((ch, i) => updateOne(headerTimeCells[i], ch));
    dateChars.forEach((ch, i) => updateOne(headerDateCells[i], ch));
  }

  /**
   * Each cell is { el, topSpan, bottomSpan, flapSpan, current, timer }.
   * The two static halves show `current`; during a flip we briefly show
   * the new char on the upper flap, fold it down, then commit it to both halves.
   */
  const cells = [];

  function createCell() {
    const el = document.createElement('div');
    el.className = 'cell';
    // Randomise each flap's slice of the stone slab so cells don't repeat.
    el.style.setProperty('--bg-x', `${Math.floor(Math.random() * 100)}%`);
    el.style.setProperty('--bg-y', `${Math.floor(Math.random() * 100)}%`);

    const top = document.createElement('div');
    top.className = 'half top';
    const topSpan = document.createElement('span');
    top.appendChild(topSpan);

    const bottom = document.createElement('div');
    bottom.className = 'half bottom';
    const bottomSpan = document.createElement('span');
    bottom.appendChild(bottomSpan);

    const flap = document.createElement('div');
    flap.className = 'flap';
    const flapSpan = document.createElement('span');
    flap.appendChild(flapSpan);

    el.appendChild(top);
    el.appendChild(bottom);
    el.appendChild(flap);

    return { el, topSpan, bottomSpan, flap, flapSpan, current: ' ', timer: null, flipTimer: null, _abortCycles: false };
  }

  function setCellChar(cell, char) {
    cell.current = char;
    cell.topSpan.textContent = char;
    cell.bottomSpan.textContent = char;
    cell.flapSpan.textContent = char;
  }

  const FLIP_DURATION_MS = 80;

  function flipCellTo(cell, target, onDone) {
    if (cell.current === target) { onDone && onDone(); return; }
    cell.topSpan.textContent = target;
    cell.el.classList.remove('flipping');
    void cell.el.offsetWidth;
    cell.el.classList.add('flipping');
    clearTimeout(cell.flipTimer);
    cell.flipTimer = setTimeout(() => {
      cell.el.classList.remove('flipping');
      setCellChar(cell, target);
      cell.flipTimer = null;
      onDone && onDone();
    }, FLIP_DURATION_MS + 50);
  }

  function clearCellTimer(cell) {
    cell._abortCycles = true;
    if (cell.flipTimer !== null) {
      clearTimeout(cell.flipTimer);
      cell.flipTimer = null;
      cell.el.classList.remove('flipping');
    }
    if (cell.timer !== null) {
      clearTimeout(cell.timer);
      cell.timer = null;
    }
  }

  function scheduleCellAnimation(cell, target, startDelay) {
    clearCellTimer(cell);
    cell._abortCycles = false;

    if (cell._static) {
      cell.timer = setTimeout(() => { setCellChar(cell, target); cell.timer = null; }, startDelay);
      return;
    }

    const totalCycles = Math.floor(MIN_CYCLES + Math.random() * (MAX_CYCLES - MIN_CYCLES));

    cell.timer = setTimeout(() => {
      cell.timer = null;
      let cyclesLeft = totalCycles;
      const set = cell._charSet || CHAR_SET;

      const tick = () => {
        if (cell._abortCycles) return;
        if (cyclesLeft <= 0) { flipCellTo(cell, target); return; }
        // Pick a char visually different from current so the flip is always visible.
        let randomChar;
        do { randomChar = set[Math.floor(Math.random() * set.length)]; }
        while (randomChar === cell.current && set.length > 1);
        cyclesLeft -= 1;
        flipCellTo(cell, randomChar, tick);
      };
      tick();
    }, startDelay);
  }

  /**
   * Build (or rebuild) the grid to fit the given lines.
   * Returns a 2D array of cells [row][col] sized to fit.
   */
  function buildGrid(lines) {
    // Clear DOM and cell registry
    board.innerHTML = '';
    cells.length = 0;

    // Header (clock + Hebrew date) — prepended inside the board so it
    // shares the frame, but laid out as two smaller panels rather than
    // a full-width row of same-sized flaps.
    const header = buildHeaderRow();
    board.appendChild(header.headerEl);
    cells.push(header.allCells);

    // Always pad body rows to MAX_COLS so every row — including the
    // header — has the same flap count and the cells stay uniform width.
    const cols = MAX_COLS;

    for (let r = 0; r < lines.length; r += 1) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';

      const rowChars = Array.from(lines[r]);
      const rowCells = [];

      // Every row has exactly `cols` cells so flex sizing yields uniform
      // cell widths across rows. Hebrew is RTL — chars start at the
      // visual right and any unused trailing cells fall on the visual
      // left. Board has dir="rtl" so the DOM-first cell is at the right;
      // append chars in logical order, then padding cells.
      const padCount = cols - rowChars.length;
      for (let i = 0; i < rowChars.length; i += 1) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = rowChars[i];
        cell._charSet = HEBREW_CHAR_SET;
        rowEl.appendChild(cell.el);
        rowCells.push(cell);
      }
      for (let i = 0; i < padCount; i += 1) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = ' ';
        cell._charSet = HEBREW_CHAR_SET;
        rowEl.appendChild(cell.el);
        rowCells.push(cell);
      }

      cells.push(rowCells);
      board.appendChild(rowEl);
    }

    return cells;
  }

  function renderMessage(text) {
    const lines = text.split(/\r?\n/).map((l) => {
      const chars = Array.from(l);
      return chars.length > MAX_COLS ? chars.slice(0, MAX_COLS).join('') : l;
    });
    const grid = buildGrid(lines);

    for (let r = 0; r < grid.length; r += 1) {
      const rowDelay = r * STAGGER_MS;
      for (let c = 0; c < grid[r].length; c += 1) {
        const cell = grid[r][c];
        const target = cell._target || ' ';
        scheduleCellAnimation(cell, target, rowDelay);
      }
    }
  }

  // ─── Date picker ───────────────────────────────────────────────
  const dateInput = document.getElementById('date-pick');

  // Default to today in Jerusalem time (en-CA locale gives YYYY-MM-DD)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  dateInput.value = todayStr;

  dateInput.addEventListener('change', () => {
    const [y, m, d] = dateInput.value.split('-').map(Number);
    renderMessage(getDisplayText(new Date(y, m - 1, d)));
  });

  // Build SHA — replaced by the deploy workflow; left as the literal token
  // when running locally so we display "dev" instead.
  const buildShaEl = document.getElementById('build-sha');
  if (buildShaEl) {
    const meta = document.querySelector('meta[name="build-sha"]');
    const sha = meta && meta.content;
    if (sha && !sha.includes('__COMMIT_SHA__')) {
      const short = sha.slice(0, 7);
      const link = document.createElement('a');
      link.href = `https://github.com/tghosth/runners-and-riders/commit/${sha}`;
      link.textContent = short;
      link.rel = 'noopener';
      buildShaEl.replaceChildren(link);
    }
  }

  // Initial render for today
  const [ty, tm, td] = todayStr.split('-').map(Number);
  renderMessage(getDisplayText(new Date(ty, tm - 1, td)));

  // Re-tick on each wall-clock minute boundary. setTimeout (rescheduled
  // every tick) instead of setInterval keeps us aligned to the real
  // minute even if a tab-throttle event delays a single fire.
  function scheduleNextClockTick() {
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    setTimeout(() => {
      updateClock();
      scheduleNextClockTick();
    }, msToNextMinute);
  }
  scheduleNextClockTick();
})();
