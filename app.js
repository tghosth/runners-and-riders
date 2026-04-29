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

    const cols = Math.min(MAX_COLS, Math.max(1, ...lines.map((l) => Array.from(l).length)));

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

  // Initial render with default message
  renderMessage(messageInput.value);
})();
