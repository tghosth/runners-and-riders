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

  // ?instant in the URL skips all flip animation — cells show their
  // final character immediately. Useful for testing liturgical logic.
  const INSTANT = new URLSearchParams(location.search).has('instant');

  const { HDate } = window.hebcal;
  const { getDisplayText } = window.Liturgy;

  const board = document.getElementById('board');

  // Header-row layout: 13 cells total. Up to TIME_COLS (5) cells of
  // "HH:MM" go on the visual left, up to DATE_COLS (8) cells of Hebrew
  // date go on the visual right, and any leftover cells become padding
  // in the middle. With dir="rtl" on the board the DOM-first child
  // sits at the RTL start = visual right.
  const TIME_COLS = 5;
  const DATE_COLS = 14;

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

  // Shared gematria letter tables
  const G_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const G_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  // Hundreds: 100–400 are single letters; 500–900 use repeated ת (400).
  const G_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

  // Day-of-month gematria (1–30). 15 and 16 use the conventional ט״ו /
  // ט״ז to avoid spelling fragments of the divine name.
  const GEMATRIA_ONES = G_ONES;
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

  // Hebrew year gematria (e.g. 5785 → "תשפ״ה"), dropping the thousands digit.
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
    if (str.length === 1) return str + '׳';
    return str.slice(0, -1) + '״' + str.slice(-1);
  }

  // Format the Hebrew date as `[day-gematria] [month] [year]`. Tries to fit
  // DATE_COLS characters: first with marks, then marks stripped, then truncated.
  function formatHebrewDate(date) {
    const parts = HEBREW_MONTH_FMT.formatToParts(date);
    const dayInt = parseInt(parts.find((p) => p.type === 'day').value, 10);
    const month = parts.find((p) => p.type === 'month').value;
    const hYear = new HDate(date).getFullYear();
    let str = `${dayGematria(dayInt, true)} ${month} ${yearGematria(hYear, true)}`;
    if (Array.from(str).length <= DATE_COLS) return str;
    str = str.replace(/[׳״]/g, '');
    if (Array.from(str).length <= DATE_COLS) return str;
    return Array.from(str).slice(0, DATE_COLS).join('');
  }

  // The currently-displayed date. Header date reflects this; header time
  // always shows the wall clock. Updated by the date pickers.
  let selectedDate = new Date();

  // Header-row cell registries — populated by buildHeaderRow, mutated
  // by updateClock so only the cells whose char actually changed flip.
  let headerTimeCells = [];
  let headerDateCells = [];

  // Builds the brass-plate header — two side-by-side panels (Hebrew
  // date on the visual right, HH:MM time on the visual left) sized
  // smaller than the body cells so they read as a subordinate row.
  // Returns { headerEl, allCells } where allCells is in scheduling
  // order so the cascade can stagger them like any body row.
  function buildHeaderRow(forDate) {
    const dateChars = Array.from(formatHebrewDate(forDate));
    const timeChars = Array.from(TIME_FMT.format(new Date()));

    const headerEl = document.createElement('div');
    headerEl.className = 'board-header';
    const allCells = [];

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

    headerEl.appendChild(dateSection);
    headerEl.appendChild(timeSection);

    return { headerEl, allCells };
  }

  function updateClock() {
    if (!headerTimeCells.length && !headerDateCells.length) return;
    const timeChars = Array.from(TIME_FMT.format(new Date()));
    const dateChars = Array.from(formatHebrewDate(selectedDate));
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
                   isLeap ? 'אדר א׳' : 'אדר', 'אדר ב׳'];
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

  // ─── Date pickers ───────────────────────────────────────────────
  const dateInput  = document.getElementById('date-pick');
  const hebYearSel  = document.getElementById('heb-year');
  const hebMonthSel = document.getElementById('heb-month');
  const hebDaySel   = document.getElementById('heb-day');

  function renderForDate(jsDate) {
    selectedDate = jsDate;
    renderMessage(getDisplayText(jsDate), jsDate);
  }

  function setDateFromGreg(jsDate) {
    syncGregToHebrew(jsDate);
    renderForDate(jsDate);
  }

  function setDateFromHebrewSelectors() {
    const jsDate = hebrewSelectorsToGreg();
    if (!jsDate) return;
    dateInput.value = jsDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    renderForDate(jsDate);
  }

  dateInput.addEventListener('change', () => {
    const [y, m, d] = dateInput.value.split('-').map(Number);
    setDateFromGreg(new Date(y, m - 1, d));
  });

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

  // Default to today in Jerusalem time and initialise both pickers
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  dateInput.value = todayStr;
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayJs = new Date(ty, tm - 1, td);
  syncGregToHebrew(todayJs);
  renderForDate(todayJs);

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
