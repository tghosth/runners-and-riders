(() => {
  'use strict';

  // Hebrew alphabet: 22 letters + 5 final forms + space + common punctuation/digits
  const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';
  const PUNCTUATION = ' .,!?־׳״';
  const DIGITS = '0123456789';
  const CHAR_SET = (HEBREW_LETTERS + PUNCTUATION + DIGITS).split('');

  const STAGGER_MS = 35;
  const CYCLE_INTERVAL_MS = 70;
  const MIN_CYCLES = 4;
  const MAX_CYCLES = 12;
  const MAX_COLS = 13;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const board = document.getElementById('board');
  const messageInput = document.getElementById('message');
  const setBtn = document.getElementById('set-btn');

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

  // Builds the brass-plate header row and returns { rowEl, allCells }
  // where allCells is in DOM order (visual right → left) so the cascade
  // can schedule them like any body row.
  function buildHeaderRow() {
    const now = new Date();
    const dateChars = Array.from(formatHebrewDate(now));
    const timeChars = Array.from(TIME_FMT.format(now));
    const padCount = MAX_COLS - dateChars.length - timeChars.length;

    const rowEl = document.createElement('div');
    rowEl.className = 'board-row board-header-row';
    const allCells = [];

    // DOM order in an RTL board: first appended → visual right.
    // Initialise every header cell to space and stash its true target on
    // `_target`; the cycle phase will land on the time/date chars.
    headerDateCells = [];
    for (const ch of dateChars) {
      const cell = createCell();
      setCellChar(cell, ' ');
      cell._target = ch;
      rowEl.appendChild(cell.el);
      headerDateCells.push(cell);
      allCells.push(cell);
    }
    for (let i = 0; i < padCount; i += 1) {
      const cell = createCell();
      setCellChar(cell, ' ');
      cell._target = ' ';
      rowEl.appendChild(cell.el);
      allCells.push(cell);
    }
    headerTimeCells = [];
    for (const ch of timeChars) {
      const cell = createCell();
      setCellChar(cell, ' ');
      cell._target = ch;
      rowEl.appendChild(cell.el);
      headerTimeCells.push(cell);
      allCells.push(cell);
    }

    return { rowEl, allCells };
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

    return { el, topSpan, bottomSpan, flap, flapSpan, current: ' ', timer: null };
  }

  function setCellChar(cell, char) {
    cell.current = char;
    cell.topSpan.textContent = char;
    cell.bottomSpan.textContent = char;
    cell.flapSpan.textContent = char;
  }

  function flipCellTo(cell, target) {
    if (cell.current === target) return;
    if (prefersReducedMotion) {
      setCellChar(cell, target);
      return;
    }
    // Show target on the flap (which sits over the top half), then fold it down.
    cell.flapSpan.textContent = target;
    cell.flap.style.display = 'flex';
    // Force reflow so animation restarts cleanly
    void cell.el.offsetWidth;
    cell.el.classList.add('flipping');

    const onEnd = () => {
      cell.el.classList.remove('flipping');
      cell.flap.removeEventListener('animationend', onEnd);
      // Commit the new char to both halves; reset flap for next flip
      setCellChar(cell, target);
      cell.flap.style.display = '';
    };
    cell.flap.addEventListener('animationend', onEnd);
  }

  function clearCellTimer(cell) {
    if (cell.timer !== null) {
      clearTimeout(cell.timer);
      clearInterval(cell.timer);
      cell.timer = null;
    }
  }

  function scheduleCellAnimation(cell, target, startDelay) {
    clearCellTimer(cell);

    if (prefersReducedMotion) {
      cell.timer = setTimeout(() => {
        setCellChar(cell, target);
        cell.timer = null;
      }, startDelay);
      return;
    }

    const totalCycles = Math.floor(MIN_CYCLES + Math.random() * (MAX_CYCLES - MIN_CYCLES));

    // Random-cycle phase uses INSTANT char swaps (no flip animation) so cycles
    // can run faster than the CSS flap animation without overlapping flips
    // committing stale targets. Only the final landing flip is animated.
    cell.timer = setTimeout(() => {
      let cyclesLeft = totalCycles;
      const tick = () => {
        if (cyclesLeft <= 0) {
          flipCellTo(cell, target);
          cell.timer = null;
          return;
        }
        const randomChar = CHAR_SET[Math.floor(Math.random() * CHAR_SET.length)];
        setCellChar(cell, randomChar);
        cyclesLeft -= 1;
        cell.timer = setTimeout(tick, CYCLE_INTERVAL_MS);
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

    // Header row (clock + Hebrew date) — same flap cells as the body
    // rows, prepended so it sits above the message inside the frame.
    const header = buildHeaderRow();
    board.appendChild(header.rowEl);
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
      // cell widths across rows. Padding is split around the chars to
      // visually centre each line; for odd totals the extra cell goes to
      // padAfter (visual left = end of line in RTL).
      // Board has dir="rtl" so the first appended cell sits on the right;
      // chars are appended in logical order (char[0] → visually rightmost).
      const padTotal = cols - rowChars.length;
      const padBefore = Math.floor(padTotal / 2);
      const padAfter = padTotal - padBefore;
      const appendPad = () => {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = ' ';
        rowEl.appendChild(cell.el);
        rowCells.push(cell);
      };
      for (let i = 0; i < padBefore; i += 1) appendPad();
      for (let i = 0; i < rowChars.length; i += 1) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = rowChars[i];
        rowEl.appendChild(cell.el);
        rowCells.push(cell);
      }
      for (let i = 0; i < padAfter; i += 1) appendPad();

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

    let cellIndex = 0;
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const cell = grid[r][c];
        const target = cell._target || ' ';
        scheduleCellAnimation(cell, target, cellIndex * STAGGER_MS);
        cellIndex += 1;
      }
    }
  }

  // ─── Wire up controls ──────────────────────────────────────────
  setBtn.addEventListener('click', () => {
    renderMessage(messageInput.value);
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      renderMessage(messageInput.value);
    }
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

  // Initial render with default message — the header row's flap cells
  // already carry the current date/time as their cycle targets, so no
  // immediate updateClock() is needed.
  renderMessage(messageInput.value);

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
