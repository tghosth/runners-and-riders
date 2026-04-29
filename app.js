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

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const board = document.getElementById('board');
  const messageInput = document.getElementById('message');
  const setBtn = document.getElementById('set-btn');
  const sizeSlider = document.getElementById('size');
  const sizeValue = document.getElementById('size-value');

  /**
   * Each cell is { el, topSpan, bottomSpan, flapSpan, current, timer }.
   * The two static halves show `current`; during a flip we briefly show
   * the new char on the upper flap, fold it down, then commit it to both halves.
   */
  const cells = [];

  function createCell() {
    const el = document.createElement('div');
    el.className = 'cell';

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

    const cols = Math.max(1, ...lines.map((l) => Array.from(l).length));

    for (let r = 0; r < lines.length; r += 1) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';

      const rowChars = Array.from(lines[r]);
      const rowCells = [];

      // The board has dir="rtl" so the first appended cell sits on the right.
      // Append characters in logical order (char[0] first → visually rightmost),
      // then trailing padding cells which fill the left side. This right-aligns
      // short Hebrew lines and produces a right-to-left flip cascade.
      const padCount = cols - rowChars.length;
      for (let i = 0; i < rowChars.length; i += 1) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = rowChars[i];
        rowEl.appendChild(cell.el);
        rowCells.push(cell);
      }
      for (let i = 0; i < padCount; i += 1) {
        const cell = createCell();
        setCellChar(cell, ' ');
        cell._target = ' ';
        rowEl.appendChild(cell.el);
        rowCells.push(cell);
      }

      cells.push(rowCells);
      board.appendChild(rowEl);
    }

    return cells;
  }

  function renderMessage(text) {
    const lines = text.split(/\r?\n/);
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

  sizeSlider.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.documentElement.style.setProperty('--board-scale', String(v));
    sizeValue.textContent = `${Math.round(v * 100)}%`;
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
