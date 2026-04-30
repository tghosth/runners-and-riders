(() => {
  'use strict';

  // Hebrew alphabet: 22 letters + 5 final forms + space + common punctuation/digits
  const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';
  const PUNCTUATION = ' .,!?־\'"';
  const DIGITS = '0123456789';
  const CHAR_SET = (HEBREW_LETTERS + PUNCTUATION + DIGITS).split('');
  const HEBREW_CHAR_SET = HEBREW_LETTERS.split('');
  const TIME_CHAR_SET = DIGITS.split('');

  const STAGGER_MS = 300;
  const MIN_CYCLES = 10;
  const MAX_CYCLES = 22;
  const MAX_COLS = 13;

  // ?instant in the URL skips all flip animation — cells show their
  // final character immediately. Useful for testing liturgical logic.
  const INSTANT = new URLSearchParams(location.search).has('instant');

  // ?seconds in the URL adds an HH:MM:SS time display (and ticks every
  // second instead of every minute).
  const SHOW_SECONDS = new URLSearchParams(location.search).has('seconds');

  const { HDate, GeoLocation, Zmanim } = window.hebcal;
  const { getDisplayText, getOmerSection, splitBalancedLines } = window.Liturgy;

  // ─── Tzeit hakochavim ────────────────────────────────────────
  // The Hebrew date rolls over at tzeit hakochavim — when the sun's
  // centre dips `ROLLOVER_DEPRESSION_DEG` below the horizon (8.5° is
  // the Geonim / "three medium stars visible" convention). We use
  // Hebcal's NOAA-based Zmanim class, which exposes the full set of
  // halachic times (alot, sunrise, chatzot, plag, sunset, tzeit72, …)
  // from the same GeoLocation — useful when we want more zmanim later.
  // The bundle uses Temporal.PlainDate internally, so the Temporal
  // polyfill must load first (see vendor/temporal-polyfill.min.js).
  //
  // Hardcoded for now: Modi'in-Maccabim-Re'ut, Israel. Swap these
  // constants (or wire them to a picker / geolocation) to relocate.
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
    // the y/m/d components are read, time-of-day is ignored.
    const z = new Zmanim(ROLLOVER_LOC, new Date(year, month - 1, day), false);
    return z.tzeit(ROLLOVER_DEPRESSION_DEG);
  }

  // Returns a JS Date set to midnight (browser-local) representing the
  // *effective* Hebrew calendar day for `realNow`: today's local civil
  // date at the rollover location if before tzeit, the next civil date
  // once tzeit has passed. The HDate constructor uses the day component
  // of the date, so the wall-clock crossover propagates cleanly.
  function getEffectiveTodayJs(realNow) {
    const isoStr = realNow.toLocaleDateString('en-CA', { timeZone: ROLLOVER_TZ });
    const [y, m, d] = isoStr.split('-').map(Number);
    const tz = tzeitForLocalDate(y, m, d);
    if (tz && realNow.getTime() >= tz.getTime()) {
      return new Date(y, m - 1, d + 1);
    }
    return new Date(y, m - 1, d);
  }

  // True until the user manually picks a date — controls whether the
  // displayed date auto-advances at tzeit each evening.
  let liveDateMode = true;

  const board = document.getElementById('board');

  // Header-row layout: 13 cells total. Up to TIME_COLS (5) cells of
  // "HH:MM" go on the visual left, up to DATE_COLS (8) cells of Hebrew
  // date go on the visual right, and any leftover cells become padding
  // in the middle. With dir="rtl" on the board the DOM-first child
  // sits at the RTL start = visual right.
  // The time block is always 8 flap cells wide (HH:MM:SS-shaped),
  // regardless of whether ?seconds is on. With seconds the cells show
  // "HH:MM:SS"; without, the first 5 show "HH:MM" and the remaining
  // 3 are blank flaps. Keeping the section width fixed means the rest
  // of the header layout (dow section width, brass gap, total tile
  // count) doesn't shift between modes.
  const TIME_COLS = 8;

  // Both header rows are 18 cell-widths across so the top (date) and
  // bottom (dow / brass / time) line up tile-for-tile. 18 is wide
  // enough for the longest possible date string (e.g.
  // "י\"א אדר א' תשפ\"ד" — 16 chars in an Adar I leap year, plus a
  // pair of trailing blank flaps), so the date never has to drop its
  // gershayim or get truncated.
  const HEADER_COLS = 18;
  // Cell-widths of pure brass plate (no flap) between the dow section
  // and the time section. The two cells in this gap are *not* tiles —
  // the brass background shows through directly.
  const HEADER_NOTILE_COLS = 2;
  // The dow section takes whatever width is left over once we've
  // reserved space for the no-tile gap and the time block. With the
  // default HH:MM time that's 11 cells (5 dow chars + 6 padding flaps
  // for weekdays, 7 + 4 for Shabbat); with ?seconds HH:MM:SS it's 8.
  const DOW_TOTAL_COLS = HEADER_COLS - HEADER_NOTILE_COLS - TIME_COLS;

  // Day-of-week labels: יום א' through יום ו' (5 chars each) and the
  // longer יום שבת on Saturday (7 chars). The dow section is wider
  // than the longest label (DOW_TOTAL_COLS); short labels are
  // padded with trailing blank flaps on the visual left.
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

  // Footer (sefira count) layout. Lines are padded to FOOTER_COLS so
  // cells stay uniformly sized across rows. 20 cells × 3 lines is the
  // smallest grid that holds every omer day's text (worst case is
  // day 29 — its balanced 3-line split has a longest line of 20).
  // Fewer columns gives bigger cells; FOOTER_MAX_LINES is the user-
  // facing knob — bumping it up lets FOOTER_COLS shrink in tandem.
  const FOOTER_COLS = 20;
  const FOOTER_MAX_LINES = 3;

  // Time formatter: 24-hour Asia/Jerusalem, en-GB gives "HH:MM" (or
  // "HH:MM:SS" with ?seconds) with leading zeros regardless of locale.
  const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    ...(SHOW_SECONDS ? { second: '2-digit' } : {}),
    hour12: false,
  });

  // Time override — when the user picks a time, we store an anchor
  // (the chosen instant + the real-time instant when they picked it)
  // and the displayed clock = anchor + (now - anchorReal). Setting
  // null returns to the real wall clock.
  let timeOverride = null;
  function getDisplayedTime() {
    if (timeOverride === null) return new Date();
    return new Date(timeOverride.anchorClock + (Date.now() - timeOverride.anchorReal));
  }

  // We used to format the header's Hebrew month name via
  //   new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' })
  // but the Academy-of-Hebrew spelling that comes out (סיוון, חשוון)
  // didn't match the single-vav spellings the date-picker uses (סיון,
  // חשון), and didn't match traditional siddurim. The header now reads
  // its month name from `hebrewMonthName()` below, sharing one source
  // of truth between the picker and the board.

  // Shared gematria letter tables
  const G_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const G_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  // Hundreds: 100–400 are single letters; 500–900 use repeated ת (400).
  const G_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

  // Day-of-month gematria (1–30). 15 and 16 use the conventional ט"ו /
  // ט"ז to avoid spelling fragments of the divine name. Quote marks
  // here are ASCII ' and " (geresh/gershayim look directional in some
  // fonts; we standardise on straight quotes everywhere).
  const GEMATRIA_ONES = G_ONES;
  const GEMATRIA_TENS = ['', 'י', 'כ', 'ל'];
  function dayGematria(n, withMarks) {
    if (n === 15) return withMarks ? 'ט"ו' : 'טו';
    if (n === 16) return withMarks ? 'ט"ז' : 'טז';
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (n < 10) return withMarks ? GEMATRIA_ONES[ones] + "'" : GEMATRIA_ONES[ones];
    if (ones === 0) return withMarks ? GEMATRIA_TENS[tens] + "'" : GEMATRIA_TENS[tens];
    return withMarks
      ? GEMATRIA_TENS[tens] + '"' + GEMATRIA_ONES[ones]
      : GEMATRIA_TENS[tens] + GEMATRIA_ONES[ones];
  }

  // Hebrew year gematria (e.g. 5785 → "תשפ"ה"), dropping the thousands digit.
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
  // longest possible string is 16 chars (an Adar I leap-year date),
  // which fits HEADER_COLS exactly — no trimming or strip-marks
  // fallback needed.
  function formatHebrewDate(date) {
    const hd = new HDate(date);
    const dayInt = hd.getDate();
    const hYear = hd.getFullYear();
    const month = hebrewMonthName(hd.getMonth(), hebrewIsLeapYear(hYear));
    return `${dayGematria(dayInt, true)} ${month} ${yearGematria(hYear, true)}`;
  }

  // The currently-displayed date. Header date reflects this; header time
  // always shows the wall clock. Updated by the date pickers.
  let selectedDate = new Date();

  // Header-row cell registries — populated by buildHeaderRow, mutated
  // by updateClock so only the cells whose char actually changed flip.
  let headerTimeCells = [];
  let headerDateCells = [];
  let headerDowCells  = [];

  // Helper: append a flap cell to `parent` and register it on `regs`.
  // If `target` is a single char from `charSet` it animates as that;
  // if it's a literal blank space the cycle phase still runs (but
  // lands on ' '), giving the padding cells a brief flicker that
  // matches the rest of the row instead of staying static.
  function appendCell(parent, target, charSet, regs) {
    const cell = createCell();
    setCellChar(cell, ' ');
    cell._target = target;
    cell._charSet = charSet;
    parent.appendChild(cell.el);
    for (const reg of regs) reg.push(cell);
    return cell;
  }

  // Builds the brass-plate header. .board-header is a flex column with
  // two rows: the Hebrew date alone on top, and a bottom row carrying
  // the day-of-week (visual right), spacer cells, and the wall-clock
  // time (visual left). Both rows are padded to exactly HEADER_COLS
  // flap cells so they line up tile-for-tile, and the bottom row
  // always has HEADER_NOTILE_COLS pure-brass cells separating dow
  // from time. Returns { headerEl, allCells } in cascade order.
  function buildHeaderRow(forDate) {
    const dateChars = Array.from(formatHebrewDate(forDate));
    const timeChars = Array.from(TIME_FMT.format(getDisplayedTime()));
    const dowChars  = Array.from(dowText(forDate));

    const headerEl = document.createElement('div');
    headerEl.className = 'board-header';
    const allCells = [];

    // ── Top row: Hebrew date — chars first (visual right), blank
    // padding cells after to fill HEADER_COLS.
    const dateSection = document.createElement('div');
    dateSection.className = 'header-section header-date';
    headerDateCells = [];
    for (const ch of dateChars) {
      appendCell(dateSection, ch, HEBREW_CHAR_SET, [headerDateCells, allCells]);
    }
    for (let i = dateChars.length; i < HEADER_COLS; i += 1) {
      appendCell(dateSection, ' ', HEBREW_CHAR_SET, [headerDateCells, allCells]);
    }

    // ── Bottom row: dow section (right) + 2 brass cells (no flap)
    //              + time section (left)
    const bottomRow = document.createElement('div');
    bottomRow.className = 'header-bottom-row';

    // dowSection: DOW_TOTAL_COLS cells of flap. The label chars come
    // first (visual right) and the rest of the section is padded with
    // blank flaps. Section's flex-grow is its cell count so the three
    // siblings (dow / notile / time) share the row width proportionally
    // — every flap-cell ends up the same width as if the whole row
    // were a flat 18-cell strip.
    const dowSection = document.createElement('div');
    dowSection.className = 'header-section header-dow';
    dowSection.style.flex = `${DOW_TOTAL_COLS} 1 0`;
    headerDowCells = [];
    for (const ch of dowChars) {
      appendCell(dowSection, ch, HEBREW_CHAR_SET, [headerDowCells, allCells]);
    }
    for (let i = dowChars.length; i < DOW_TOTAL_COLS; i += 1) {
      appendCell(dowSection, ' ', HEBREW_CHAR_SET, [headerDowCells, allCells]);
    }

    // notileSection: HEADER_NOTILE_COLS cells of pure brass — no flap,
    // no border, no background. Just transparent space so the brass
    // plate of the .display-frame shows through. The empty divs share
    // the .header-notile-cell flex/aspect-ratio so they take up the
    // same width and height as a flap cell would.
    const notileSection = document.createElement('div');
    notileSection.className = 'header-section header-notile';
    notileSection.style.flex = `${HEADER_NOTILE_COLS} 1 0`;
    for (let i = 0; i < HEADER_NOTILE_COLS; i += 1) {
      const empty = document.createElement('div');
      empty.className = 'header-notile-cell';
      notileSection.appendChild(empty);
    }

    // timeSection: dir="ltr" so HH:MM (or HH:MM:SS) renders forwards.
    // Always TIME_COLS = 8 cells wide; trailing cells past the formatted
    // time (when ?seconds is off) get blank flap padding.
    const timeSection = document.createElement('div');
    timeSection.className = 'header-section header-time';
    timeSection.setAttribute('dir', 'ltr');
    timeSection.style.flex = `${TIME_COLS} 1 0`;
    headerTimeCells = [];
    for (const ch of timeChars) {
      const cell = appendCell(timeSection, ch, TIME_CHAR_SET, [headerTimeCells, allCells]);
      if (ch === ':') cell._static = true;
    }
    for (let i = timeChars.length; i < TIME_COLS; i += 1) {
      appendCell(timeSection, ' ', TIME_CHAR_SET, [headerTimeCells, allCells]);
    }

    // DOM order: dow → notile → time. With dir="rtl" inherited on
    // bottomRow, the dow section sits on the visual right and time
    // on the visual left, separated by the two brass cells.
    bottomRow.appendChild(dowSection);
    bottomRow.appendChild(notileSection);
    bottomRow.appendChild(timeSection);

    headerEl.appendChild(dateSection);
    headerEl.appendChild(bottomRow);

    return { headerEl, allCells };
  }

  // Builds the brass-plate footer used for the Sefirat HaOmer count —
  // mirrors the header structurally (smaller cells than the body, set
  // off from the message rows by extra top margin) but stacks two
  // flex rows of FOOTER_COLS cells each so a balanced split of the
  // full Ashkenazi text fits with cell sizes that stay constant
  // across both lines. Returns null on non-omer dates. The cells are
  // returned as one flat array (in DOM/cascade order) and as a
  // per-line list so renderMessage can stagger each footer row.
  function buildFooterRows(forDate) {
    const sec = getOmerSection ? getOmerSection(forDate) : null;
    if (!sec) return null;
    const lines = splitBalancedLines(sec.fullText, FOOTER_MAX_LINES, FOOTER_COLS);

    const footerEl = document.createElement('div');
    footerEl.className = 'board-footer';

    const lineCells = [];

    for (const lineText of lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'footer-line';
      const chars = Array.from(lineText);
      const padCount = Math.max(0, FOOTER_COLS - chars.length);
      const cellsForLine = [];

      for (const ch of chars) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = ch;
        cell._charSet = HEBREW_CHAR_SET;
        lineEl.appendChild(cell.el);
        cellsForLine.push(cell);
      }
      for (let i = 0; i < padCount; i += 1) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = ' ';
        cell._charSet = HEBREW_CHAR_SET;
        lineEl.appendChild(cell.el);
        cellsForLine.push(cell);
      }

      lineCells.push(cellsForLine);
      footerEl.appendChild(lineEl);
    }

    return { footerEl, lineCells };
  }

  function updateClock() {
    if (!headerTimeCells.length && !headerDateCells.length) return;
    const timeChars = Array.from(TIME_FMT.format(getDisplayedTime()));
    const dateChars = Array.from(formatHebrewDate(selectedDate));
    const dowChars  = Array.from(dowText(selectedDate));
    // Pad date / dow / time to their respective full widths so cells
    // past the formatted content settle to a literal ' ' (rather than
    // keeping whatever char was there before). Only matters for time
    // when ?seconds is off (the trailing 3 cells stay blank).
    while (dateChars.length < HEADER_COLS)     dateChars.push(' ');
    while (dowChars.length  < DOW_TOTAL_COLS)  dowChars.push(' ');
    while (timeChars.length < TIME_COLS)       timeChars.push(' ');

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
    dowChars.forEach( (ch, i) => updateOne(headerDowCells[i],  ch));
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

    // Whole-letter overlay so the seam between top + bottom halves
    // doesn't visually bisect the character in the static state. The
    // overlay is hidden during a flip (.flipping class) so the standard
    // split-flap animation still reads.
    const letter = document.createElement('span');
    letter.className = 'letter';

    el.appendChild(top);
    el.appendChild(bottom);
    el.appendChild(flap);
    el.appendChild(letter);

    return { el, topSpan, bottomSpan, flap, flapSpan, letter, current: ' ', timer: null, flipTimer: null, _abortCycles: false };
  }

  function setCellChar(cell, char) {
    cell.current = char;
    cell.topSpan.textContent = char;
    cell.bottomSpan.textContent = char;
    cell.flapSpan.textContent = char;
    cell.letter.textContent = char;
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

    if (INSTANT) { setCellChar(cell, target); return; }

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
  function buildGrid(lines, forDate) {
    board.innerHTML = '';
    cells.length = 0;

    const header = buildHeaderRow(forDate);
    board.appendChild(header.headerEl);
    cells.push(header.allCells);

    const cols = MAX_COLS;

    for (let r = 0; r < lines.length; r += 1) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';

      const rowChars = Array.from(lines[r]);
      const rowCells = [];

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

    const footer = buildFooterRows(forDate);
    if (footer) {
      board.appendChild(footer.footerEl);
      for (const lc of footer.lineCells) cells.push(lc);
    }

    return cells;
  }

  function renderMessage(text, forDate) {
    const lines = text.split(/\r?\n/).map((l) => {
      const chars = Array.from(l);
      return chars.length > MAX_COLS ? chars.slice(0, MAX_COLS).join('') : l;
    });
    const grid = buildGrid(lines, forDate);

    for (let r = 0; r < grid.length; r += 1) {
      const rowDelay = r * STAGGER_MS;
      for (let c = 0; c < grid[r].length; c += 1) {
        const cell = grid[r][c];
        const target = cell._target || ' ';
        scheduleCellAnimation(cell, target, rowDelay);
      }
    }
  }

  // ─── Hebrew date selector helpers ──────────────────────────────

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

  function hebrewMonthName(month, isLeap) {
    const NAMES = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול',
                   'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט',
                   isLeap ? "אדר א'" : 'אדר', "אדר ב'"];
    return NAMES[month] || '';
  }

  function populateHebrewYear(sel, targetYear) {
    const current = parseInt(sel.value, 10) || targetYear;
    const start = targetYear - 5;
    const end   = targetYear + 10;
    sel.innerHTML = '';
    for (let y = start; y <= end; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${yearGematria(y, true)} (${y})`;
      if (y === current) opt.selected = true;
      sel.appendChild(opt);
    }
    if (!sel.value) sel.value = targetYear;
  }

  function populateHebrewMonths(sel, year, targetMonth) {
    const prev = parseInt(sel.value, 10) || targetMonth;
    const isLeap = hebrewIsLeapYear(year);
    const numMonths = isLeap ? 13 : 12;
    sel.innerHTML = '';
    for (let m = 1; m <= numMonths; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = hebrewMonthName(m, isLeap);
      if (m === prev) opt.selected = true;
      sel.appendChild(opt);
    }
    if (!sel.value || parseInt(sel.value, 10) > numMonths) sel.value = Math.min(prev, numMonths);
  }

  function populateHebrewDays(sel, month, year, targetDay) {
    const prev = parseInt(sel.value, 10) || targetDay;
    const maxDay = hebrewDaysInMonth(month, year);
    sel.innerHTML = '';
    for (let d = 1; d <= maxDay; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === Math.min(prev, maxDay)) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function syncGregToHebrew(jsDate) {
    const hd = new HDate(jsDate);
    const hYear  = hd.getFullYear();
    const hMonth = hd.getMonth();
    const hDay   = hd.getDate();
    populateHebrewYear(hebYearSel, hYear);
    hebYearSel.value = hYear;
    populateHebrewMonths(hebMonthSel, hYear, hMonth);
    hebMonthSel.value = hMonth;
    populateHebrewDays(hebDaySel, hMonth, hYear, hDay);
    hebDaySel.value = hDay;
  }

  function hebrewSelectorsToGreg() {
    const year  = parseInt(hebYearSel.value, 10);
    const month = parseInt(hebMonthSel.value, 10);
    const day   = parseInt(hebDaySel.value, 10);
    if (!year || !month || !day) return null;
    try { return new HDate(day, month, year).greg(); } catch { return null; }
  }

  // ─── Gregorian date selector helpers ───────────────────────────
  // Mirrors the Hebrew picker so both calendars present an identical
  // UI: three selects (day / month / year) + a 📅 button that opens a
  // styled month-grid popup. Months are labelled in Hebrew so the row
  // reads naturally next to "תאריך לועזי".
  const GREG_MONTH_NAMES = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                            'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  function gregDaysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
  }

  function populateGregYear(sel, targetYear) {
    const current = parseInt(sel.value, 10) || targetYear;
    const start = targetYear - 5;
    const end   = targetYear + 10;
    sel.innerHTML = '';
    for (let y = start; y <= end; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === current) opt.selected = true;
      sel.appendChild(opt);
    }
    if (!sel.value) sel.value = targetYear;
  }

  function populateGregMonths(sel, targetMonth) {
    const prev = parseInt(sel.value, 10) || targetMonth;
    sel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = GREG_MONTH_NAMES[m];
      if (m === prev) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function populateGregDays(sel, month, year, targetDay) {
    const prev = parseInt(sel.value, 10) || targetDay;
    const maxDay = gregDaysInMonth(month, year);
    sel.innerHTML = '';
    for (let d = 1; d <= maxDay; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === Math.min(prev, maxDay)) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function syncGregSelectors(jsDate) {
    const y = jsDate.getFullYear();
    const m = jsDate.getMonth() + 1;
    const d = jsDate.getDate();
    populateGregYear(gregYearSel, y);
    gregYearSel.value = y;
    populateGregMonths(gregMonthSel, m);
    gregMonthSel.value = m;
    populateGregDays(gregDaySel, m, y, d);
    gregDaySel.value = d;
  }

  function gregSelectorsToJs() {
    const y = parseInt(gregYearSel.value, 10);
    const m = parseInt(gregMonthSel.value, 10);
    const d = parseInt(gregDaySel.value, 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  // ─── Date pickers ───────────────────────────────────────────────
  const gregYearSel  = document.getElementById('greg-year');
  const gregMonthSel = document.getElementById('greg-month');
  const gregDaySel   = document.getElementById('greg-day');
  const hebYearSel   = document.getElementById('heb-year');
  const hebMonthSel  = document.getElementById('heb-month');
  const hebDaySel    = document.getElementById('heb-day');

  function renderForDate(jsDate) {
    selectedDate = jsDate;
    renderMessage(getDisplayText(jsDate), jsDate);
  }

  // While liveDateMode is on, this watches for the tzeit-hakochavim
  // crossover and re-renders against the new effective Hebrew date.
  // Called from each clock tick and from any wall-clock change (time
  // override, "now" button) so the rollover doesn't lag a tick.
  function maybeAdvanceLiveDate() {
    if (!liveDateMode) return;
    const eff = getEffectiveTodayJs(getDisplayedTime());
    if (eff.getTime() === selectedDate.getTime()) return;
    syncGregSelectors(eff);
    syncGregToHebrew(eff);
    renderForDate(eff);
  }

  function setDateFromGreg(jsDate) {
    liveDateMode = false;
    syncGregToHebrew(jsDate);
    renderForDate(jsDate);
  }

  function setDateFromGregSelectors() {
    const jsDate = gregSelectorsToJs();
    if (!jsDate) return;
    liveDateMode = false;
    syncGregToHebrew(jsDate);
    renderForDate(jsDate);
  }

  function setDateFromHebrewSelectors() {
    const jsDate = hebrewSelectorsToGreg();
    if (!jsDate) return;
    liveDateMode = false;
    syncGregSelectors(jsDate);
    renderForDate(jsDate);
  }

  gregYearSel.addEventListener('change', () => {
    const y = parseInt(gregYearSel.value, 10);
    const m = parseInt(gregMonthSel.value, 10);
    populateGregDays(gregDaySel, m, y, parseInt(gregDaySel.value, 10));
    setDateFromGregSelectors();
  });

  gregMonthSel.addEventListener('change', () => {
    const y = parseInt(gregYearSel.value, 10);
    const m = parseInt(gregMonthSel.value, 10);
    populateGregDays(gregDaySel, m, y, parseInt(gregDaySel.value, 10));
    setDateFromGregSelectors();
  });

  gregDaySel.addEventListener('change', setDateFromGregSelectors);

  hebYearSel.addEventListener('change', () => {
    const year  = parseInt(hebYearSel.value, 10);
    const month = parseInt(hebMonthSel.value, 10);
    populateHebrewMonths(hebMonthSel, year, month);
    const monthNow = parseInt(hebMonthSel.value, 10);
    populateHebrewDays(hebDaySel, monthNow, year, parseInt(hebDaySel.value, 10));
    setDateFromHebrewSelectors();
  });

  hebMonthSel.addEventListener('change', () => {
    const year  = parseInt(hebYearSel.value, 10);
    const month = parseInt(hebMonthSel.value, 10);
    populateHebrewDays(hebDaySel, month, year, parseInt(hebDaySel.value, 10));
    setDateFromHebrewSelectors();
  });

  hebDaySel.addEventListener('change', setDateFromHebrewSelectors);

  // ─── Hebrew calendar popup ──────────────────────────────────────
  // A clickable month grid that mirrors what the native <input type="date">
  // gives the Gregorian picker. Click a day → updates both pickers + board.
  const hcalToggle = document.getElementById('hcal-toggle');
  const hcalPopup  = document.getElementById('hcal-popup');

  // Popup view state — driven independently of the selectors so the user
  // can browse ahead/behind without committing a date until they click one.
  let hcalViewYear = 0;
  let hcalViewMonth = 0;

  function renderHcalPopup() {
    const year = hcalViewYear;
    const month = hcalViewMonth;
    const isLeap = hebrewIsLeapYear(year);
    const numMonths = isLeap ? 13 : 12;
    const daysInMonth = hebrewDaysInMonth(month, year);

    // Selected (current) Hebrew date for highlighting
    const sel = new HDate(selectedDate);
    const selY = sel.getFullYear(), selM = sel.getMonth(), selD = sel.getDate();

    // Day-of-week of the 1st of this month (0=Sunday … 6=Saturday)
    const firstDow = new HDate(1, month, year).greg().getDay();

    const monthLabel = `${hebrewMonthName(month, isLeap)} ${yearGematria(year, true)}`;

    // Build header row of weekday letters. Board is RTL so DOM-first is
    // the visual right; Sunday (יום ראשון) belongs on the right.
    const dowLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

    let html = `
      <div class="hcal-nav">
        <button type="button" class="hcal-prev" aria-label="חודש קודם">▶</button>
        <span class="hcal-label">${monthLabel}</span>
        <button type="button" class="hcal-next" aria-label="חודש הבא">◀</button>
      </div>
      <div class="hcal-grid">
    `;
    for (const l of dowLetters) html += `<div class="hcal-dow">${l}</div>`;

    // Pad leading cells before day 1
    for (let i = 0; i < firstDow; i++) html += `<div class="hcal-pad"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const isSel = (year === selY && month === selM && d === selD);
      html += `<button type="button" class="hcal-day${isSel ? ' selected' : ''}" data-day="${d}">${dayGematria(d, false)}</button>`;
    }
    html += `</div>`;
    hcalPopup.innerHTML = html;

    hcalPopup.querySelector('.hcal-prev').addEventListener('click', () => {
      let m = month - 1, y = year;
      if (m < 1) { y -= 1; m = hebrewIsLeapYear(y) ? 13 : 12; }
      hcalViewYear = y; hcalViewMonth = m;
      renderHcalPopup();
    });
    hcalPopup.querySelector('.hcal-next').addEventListener('click', () => {
      let m = month + 1, y = year;
      const max = hebrewIsLeapYear(y) ? 13 : 12;
      if (m > max) { y += 1; m = 1; }
      hcalViewYear = y; hcalViewMonth = m;
      renderHcalPopup();
    });
    for (const btn of hcalPopup.querySelectorAll('.hcal-day')) {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.day, 10);
        const jsDate = new HDate(d, month, year).greg();
        setDateFromGreg(jsDate);
        closeHcalPopup();
      });
    }
  }

  function openHcalPopup() {
    const sel = new HDate(selectedDate);
    hcalViewYear = sel.getFullYear();
    hcalViewMonth = sel.getMonth();
    hcalPopup.hidden = false;
    renderHcalPopup();
  }

  function closeHcalPopup() {
    hcalPopup.hidden = true;
  }

  if (hcalToggle && hcalPopup) {
    hcalToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      hcalPopup.hidden ? openHcalPopup() : closeHcalPopup();
    });
    hcalPopup.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { if (!hcalPopup.hidden) closeHcalPopup(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !hcalPopup.hidden) closeHcalPopup(); });
  }

  // ─── Gregorian calendar popup ──────────────────────────────────
  // Mirror of the Hebrew popup (shares the .hcal-* CSS classes) so the
  // two date pickers have an identical look + interaction model.
  const gcalToggle = document.getElementById('gcal-toggle');
  const gcalPopup  = document.getElementById('gcal-popup');

  let gcalViewYear = 0;
  let gcalViewMonth = 0;

  function renderGcalPopup() {
    const year = gcalViewYear;
    const month = gcalViewMonth;
    const daysInMonth = gregDaysInMonth(month, year);

    const selY = selectedDate.getFullYear();
    const selM = selectedDate.getMonth() + 1;
    const selD = selectedDate.getDate();

    const firstDow = new Date(year, month - 1, 1).getDay();

    const monthLabel = `${GREG_MONTH_NAMES[month]} ${year}`;
    const dowLetters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

    let html = `
      <div class="hcal-nav">
        <button type="button" class="hcal-prev" aria-label="חודש קודם">▶</button>
        <span class="hcal-label">${monthLabel}</span>
        <button type="button" class="hcal-next" aria-label="חודש הבא">◀</button>
      </div>
      <div class="hcal-grid">
    `;
    for (const l of dowLetters) html += `<div class="hcal-dow">${l}</div>`;
    for (let i = 0; i < firstDow; i++) html += `<div class="hcal-pad"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const isSel = (year === selY && month === selM && d === selD);
      html += `<button type="button" class="hcal-day${isSel ? ' selected' : ''}" data-day="${d}">${d}</button>`;
    }
    html += `</div>`;
    gcalPopup.innerHTML = html;

    gcalPopup.querySelector('.hcal-prev').addEventListener('click', () => {
      let m = month - 1, y = year;
      if (m < 1) { y -= 1; m = 12; }
      gcalViewYear = y; gcalViewMonth = m;
      renderGcalPopup();
    });
    gcalPopup.querySelector('.hcal-next').addEventListener('click', () => {
      let m = month + 1, y = year;
      if (m > 12) { y += 1; m = 1; }
      gcalViewYear = y; gcalViewMonth = m;
      renderGcalPopup();
    });
    for (const btn of gcalPopup.querySelectorAll('.hcal-day')) {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.day, 10);
        setDateFromGreg(new Date(year, month - 1, d));
        closeGcalPopup();
      });
    }
  }

  function openGcalPopup() {
    gcalViewYear = selectedDate.getFullYear();
    gcalViewMonth = selectedDate.getMonth() + 1;
    gcalPopup.hidden = false;
    renderGcalPopup();
  }

  function closeGcalPopup() {
    gcalPopup.hidden = true;
  }

  if (gcalToggle && gcalPopup) {
    gcalToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      gcalPopup.hidden ? openGcalPopup() : closeGcalPopup();
    });
    gcalPopup.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { if (!gcalPopup.hidden) closeGcalPopup(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !gcalPopup.hidden) closeGcalPopup(); });
  }

  // ─── Time picker ────────────────────────────────────────────────
  // Lets the user override the clock so the board shows a chosen
  // wall-clock time. The override ticks forward from the chosen instant
  // (anchor + elapsed real time); the "now" button clears it.
  const timeInput = document.getElementById('time-pick');
  const timeNowBtn = document.getElementById('time-now');

  function fmtTimeForInput(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function clearTimeOverride() {
    timeOverride = null;
    if (timeInput) timeInput.value = fmtTimeForInput(new Date());
    // "Return to now" should also restore the *date* — re-enter live
    // mode so the board snaps back to today's effective Hebrew day
    // (and resumes auto-advancing at tzeit).
    liveDateMode = true;
    const eff = getEffectiveTodayJs(getDisplayedTime());
    if (eff.getTime() !== selectedDate.getTime()) {
      syncGregSelectors(eff);
      syncGregToHebrew(eff);
      renderForDate(eff);
    }
    updateClock();
  }

  if (timeInput) {
    timeInput.value = fmtTimeForInput(new Date());
    timeInput.addEventListener('change', () => {
      const v = timeInput.value;
      if (!v) return;
      const [hh, mm, ss] = v.split(':').map((p) => parseInt(p, 10) || 0);
      const now = new Date();
      const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, ss || 0, 0);
      timeOverride = { anchorClock: anchor.getTime(), anchorReal: now.getTime() };
      updateClock();
      maybeAdvanceLiveDate();
    });
  }
  if (timeNowBtn) timeNowBtn.addEventListener('click', clearTimeOverride);

  // ─── Date stepper ───────────────────────────────────────────────
  // ◀ / ▶ buttons that nudge the displayed date by one civil day.
  // Uses setDateFromGreg, so they also flip liveDateMode off — the
  // user is explicitly browsing a chosen date, no longer tracking
  // today. "חזרה לעכשיו" puts them back into live mode.
  function stepDate(deltaDays) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + deltaDays);
    syncGregSelectors(next);
    setDateFromGreg(next);
  }
  const datePrevBtn = document.getElementById('date-prev');
  const dateNextBtn = document.getElementById('date-next');
  if (datePrevBtn) datePrevBtn.addEventListener('click', () => stepDate(-1));
  if (dateNextBtn) dateNextBtn.addEventListener('click', () => stepDate(+1));

  // Build SHA — replaced by the deploy workflow
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

  // Default to today in Jerusalem time, shifted to next Greg day after
  // Modi'in tzeit (so the Hebrew date rolls over at nightfall, not midnight).
  const todayJs = getEffectiveTodayJs(getDisplayedTime());
  syncGregSelectors(todayJs);
  syncGregToHebrew(todayJs);
  renderForDate(todayJs);

  // Re-tick on each wall-clock minute (or second, with ?seconds)
  // boundary. setTimeout rescheduled every tick keeps us aligned to
  // the real boundary even if a tab-throttle event delays a single fire.
  function scheduleNextClockTick() {
    const period = SHOW_SECONDS ? 1_000 : 60_000;
    const msToNext = period - (Date.now() % period);
    setTimeout(() => {
      updateClock();
      maybeAdvanceLiveDate();
      scheduleNextClockTick();
    }, msToNext);
  }
  scheduleNextClockTick();
})();
