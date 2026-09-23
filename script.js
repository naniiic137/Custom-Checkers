(function () {
  'use strict';

  // Rules live in engine.js (pure, unit-tested); this file is the UI, the editor, the
  // timer, share links and the PeerJS connection.
  const E = window.CheckersEngine;
  const { CONFIG_MAP, DEFAULT_CONFIG, MIN_SIZE, MAX_SIZE, isDark, opp, cap, cloneBoard, clampInt } = E;

  // ===== MULTIPLAYER STATE =====
  const HEARTBEAT_MS = 2000;      // both sides ping this often
  const PEER_TIMEOUT_MS = 7000;   // silence this long means the other side is gone
  const MAX_ID_RETRIES = 5;
  let mp = {
    role: null,      // 'host' | 'guest' | null
    peer: null,
    conn: null,
    roomId: null,
    connected: false,
    receivedSettings: null,
    lastSeen: 0,
    heartbeat: null,
  };

  const KING_DESCRIPTIONS = {
    standard: '♛ One step diagonally (traditional checkers)',
    flying: '✦ Slide any distance diagonally, jump over pieces',
    queen: '♕ Slide any distance in 8 directions',
    knight: '♞ L-shaped jumps like a chess knight',
    crown: '♔ One step in any direction + knight jumps',
    random: '❓ Random mode changes each move',
  };

  // ===== DOM REFS =====
  const $ = s => document.querySelector(s);
  const dom = {};
  function cacheDom() {
    dom.settingsPanel = $('#settings-panel');
    dom.gamePanel = $('#game-panel');
    dom.board = $('#board');
    dom.turnText = $('#turn-text');
    dom.timerDisplay = $('#timer-display');
    dom.timerBlack = $('#timer-black');
    dom.timerWhite = $('#timer-white');
    dom.statusBlack = $('#status-black');
    dom.statusWhite = $('#status-white');
    dom.turnCounter = $('#turn-counter');
    dom.toast = $('#toast');
    dom.gameOverModal = $('#game-over-modal');
    dom.winnerText = $('#winner-text');
    dom.winnerReason = $('#winner-reason');
    dom.playAgainBtn = $('#play-again-btn');
    dom.settingsBtn = $('#settings-btn');
    dom.backToSettingsBtn = $('#back-to-settings-btn');
    dom.startGameBtn = $('#start-game-btn');
    dom.shareLinkBtn = $('#share-link-btn');
    dom.inviteBtn = $('#invite-btn');
    dom.undoBtn = $('#undo-btn');
    dom.settingBoardSize = $('#setting-boardSize');
    dom.settingRowsPerPlayer = $('#setting-rowsPerPlayer');
    dom.settingMandatoryCapture = $('#setting-mandatoryCapture');
    dom.settingKingMove = $('#setting-kingMove');
    dom.settingBackwardMove = $('#setting-backwardMove');
    dom.settingBackwardCapture = $('#setting-backwardCapture');
    dom.settingKingsCanBeCaptured = $('#setting-kingsCanBeCaptured');
    dom.settingPromoteAnyBack = $('#setting-promoteAnyBack');
    dom.settingStartingPlayer = $('#setting-startingPlayer');
    dom.settingRandomPromotion = $('#setting-randomPromotion');
    dom.settingDoubleCaptureKings = $('#setting-doubleCaptureKings');
    dom.settingShuffleKingOnMove = $('#setting-shuffleKingOnMove');
    dom.settingSuicideMode = $('#setting-suicideMode');
    dom.settingStalemateWins = $('#setting-stalemateWins');
    dom.settingDrawLimitEnabled = $('#setting-drawLimitEnabled');
    dom.settingDrawLimitBlack = $('#setting-drawLimitBlack');
    dom.settingDrawLimitWhite = $('#setting-drawLimitWhite');
    dom.settingDrawLimitLinked = $('#setting-drawLimitLinked');
    dom.settingTimer = $('#setting-timer');
    dom.settingHighlightMoves = $('#setting-highlightMoves');
    dom.settingPieceStyle = $('#setting-pieceStyle');
    dom.settingColorScheme = $('#setting-colorScheme');
    dom.kingMoveDesc = $('#king-move-desc');
    dom.editorBoard = $('#editor-board');
    dom.editorBoardSize = $('#editor-boardSize');
    dom.editorRowsPerPlayer = $('#editor-rowsPerPlayer');
    dom.toggleVisualBtn = $('#toggle-visual-btn');
    dom.visualSection = $('#visual-section');
    dom.editorColor = $('#editor-color');
    dom.editorKing = $('#editor-king');
    dom.editorClearBtn = $('#editor-clear-btn');
    dom.editorResetBtn = $('#editor-reset-btn');
    dom.toggleEditorBtn = $('#toggle-editor-btn');
    dom.editorSection = $('#editor-section');
    dom.roleBadge = $('#role-badge');
    dom.mpOverlay = $('#mp-overlay');
    dom.mpSpinner = $('#mp-spinner');
    dom.mpStatusText = $('#mp-status-text');
    dom.mpStatusDetail = $('#mp-status-detail');
    dom.mpLink = $('#mp-link');
    dom.mpActions = $('#mp-actions');
  }

  // ===== STATE =====
  let config = {};
  let board = [];
  let currentPlayer = 'black';
  let selectedCell = null;
  let validMoves = [];
  let captured = { black: 0, white: 0 };
  let turnNumber = 1;
  let gamePhase = 'settings';
  let multiJumpPos = null;
  let lastMove = null;
  let timerState = null;
  let moveHistory = [];
  let noCaptureStreakBlack = 0;
  let noCaptureStreakWhite = 0;
  let editorBoardData = null;
  let mustCaptureHint = [];   // squares flashed when a forced capture is ignored

  const boardSize = (v) => clampInt(v, MIN_SIZE, MAX_SIZE, DEFAULT_CONFIG.boardSize);
  const rowsPerPlayer = (v) => clampInt(v, 1, 10, DEFAULT_CONFIG.rowsPerPlayer);
  const myColor = () => (mp.role === 'host' ? 'black' : mp.role === 'guest' ? 'white' : null);

  function showToast(msg, dur) {
    const el = dom.toast;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), dur || 2000);
  }

  // ===== CONFIG =====
  function getSettingsFromUI() {
    return {
      boardSize: boardSize(dom.settingBoardSize.value),
      rowsPerPlayer: rowsPerPlayer(dom.settingRowsPerPlayer.value),
      mandatoryCapture: dom.settingMandatoryCapture.checked,
      kingMove: dom.settingKingMove.value,
      backwardMove: dom.settingBackwardMove.checked,
      backwardCapture: dom.settingBackwardCapture.checked,
      kingsCanBeCaptured: dom.settingKingsCanBeCaptured.checked,
      promoteAnyBack: dom.settingPromoteAnyBack.checked,
      randomPromotion: dom.settingRandomPromotion.checked,
      doubleCaptureKings: dom.settingDoubleCaptureKings.checked,
      suicideMode: dom.settingSuicideMode.checked,
      stalemateWins: dom.settingStalemateWins.checked,
      drawLimitEnabled: dom.settingDrawLimitEnabled.checked,
      drawLimitBlack: clampInt(dom.settingDrawLimitBlack.value, 1, 999, 40),
      drawLimitWhite: clampInt(dom.settingDrawLimitWhite.value, 1, 999, 40),
      drawLimitLinked: dom.settingDrawLimitLinked.checked,
      shuffleKingOnMove: dom.settingShuffleKingOnMove.checked,
      activeKingModes: getActiveModesFromUI(),
      startingPlayer: dom.settingStartingPlayer.value,
      timer: +dom.settingTimer.value,
      highlightMoves: dom.settingHighlightMoves.checked,
      pieceStyle: dom.settingPieceStyle.value,
      colorScheme: dom.settingColorScheme.value,
    };
  }

  function getActiveModesFromUI() {
    const chips = document.querySelectorAll('#king-mode-chips .mode-chip input:checked');
    return Array.from(chips).map(cb => cb.value).join(',') || 'standard';
  }

  function applyConfigToUI(cfg) {
    Object.keys(DEFAULT_CONFIG).forEach(k => {
      const el = dom['setting' + k.charAt(0).toUpperCase() + k.slice(1)];
      if (el) {
        if (el.type === 'checkbox') el.checked = cfg[k];
        else el.value = cfg[k];
      }
    });
    dom.kingMoveDesc.textContent = KING_DESCRIPTIONS[dom.settingKingMove.value] || '';
    if (cfg.activeKingModes) {
      const modes = cfg.activeKingModes.split(',');
      document.querySelectorAll('#king-mode-chips .mode-chip input').forEach(cb => {
        cb.checked = modes.includes(cb.value);
      });
    }
  }

  function baseURL() { return window.location.href.split('?')[0].split('#')[0]; }

  // A link that opens a local game with these rules (and the edited position, if the
  // editor is open). It never creates or joins an online room.
  function generateShareURL() {
    const cfg = getSettingsFromUI();
    const p = new URLSearchParams();
    for (const [short, long] of Object.entries(CONFIG_MAP)) {
      let v = cfg[long];
      if (typeof v === 'boolean') v = v ? '1' : '0';
      p.set(short, String(v));
    }
    if (!dom.editorSection.classList.contains('hidden') && editorBoardData !== null && editorBoardData.length > 0) {
      const enc = E.encodeBoard(editorBoardData);
      if (enc) p.set('bd', enc);
    }
    return baseURL() + '?' + p.toString();
  }

  function inviteURL() { return baseURL() + '?room=' + encodeURIComponent(mp.roomId); }

  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); showToast(okMsg || 'Link copied to clipboard!'); return true; }
    catch { showToast(text, 5000); return false; }
  }

  // ===== GAME LOGIC =====
  function currentState() {
    return { board, currentPlayer, captured, turnNumber, lastMove, noCaptureStreakBlack, noCaptureStreakWhite };
  }

  function makeMove(fromR, fromC, toR, toC) {
    const moveInfo = validMoves.find(m => m.row === toR && m.col === toC);
    if (!moveInfo || !board[fromR][fromC]) return false;
    // the undo point is the position before the turn's first step
    if (!multiJumpPos) moveHistory.push(E.snapshot(currentState()));
    const piece = board[fromR][fromC];
    const step = E.applyStep(board, fromR, fromC, moveInfo, config);
    if (step.removedColor) captured[step.removedColor]++;
    mustCaptureHint = [];

    if (step.more.length > 0) {
      selectedCell = { row: toR, col: toC };
      validMoves = step.more;
      multiJumpPos = { row: toR, col: toC };
      renderBoard();
      renderUI();
      return true;
    }

    if (piece.king && config.shuffleKingOnMove) {
      const modes = E.getActiveModes(config);
      if (modes.length > 0) piece.king = modes[Math.floor(Math.random() * modes.length)];
    }

    const wasCapture = step.wasCapture || (multiJumpPos !== null);
    lastMove = { from: { row: fromR, col: fromC }, to: { row: toR, col: toC } };
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;

    if (!wasCapture) {
      if (currentPlayer === 'black') noCaptureStreakBlack++;
      else noCaptureStreakWhite++;
    } else if (currentPlayer === 'black') noCaptureStreakBlack = 0;
    else noCaptureStreakWhite = 0;

    if (config.drawLimitEnabled) {
      const streak = currentPlayer === 'black' ? noCaptureStreakBlack : noCaptureStreakWhite;
      const limit = currentPlayer === 'black' ? config.drawLimitBlack : config.drawLimitWhite;
      if (streak >= limit && limit > 0) {
        endInDraw(cap(currentPlayer) + ' reached the move limit without a capture');
        return true;
      }
    }

    endTurn();
    return true;
  }

  function endTurn() {
    stopTimer();
    currentPlayer = opp(currentPlayer);
    turnNumber++;
    E.rollRandomKings(board, currentPlayer, config);

    const outcome = E.checkOutcome(board, currentPlayer, config);
    if (outcome) { endGame(outcome.winner, outcome.reason); return; }

    if (config.timer > 0) startTimer();
    renderBoard();
    renderUI();
    syncMPState();
  }

  function handleCellClick(r, c) {
    if (gamePhase !== 'playing') return;
    const mine = myColor();
    if (mine && currentPlayer !== mine) { showToast("It's your opponent's turn"); return; }

    if (multiJumpPos) {
      if (validMoves.some(m => m.row === r && m.col === c)) {
        makeMove(multiJumpPos.row, multiJumpPos.col, r, c);
      } else showToast('Keep jumping with the same piece');
      return;
    }

    const cell = board[r][c];
    if (cell && cell.color === currentPlayer) {
      if (selectedCell && selectedCell.row === r && selectedCell.col === c) {
        deselectPiece(); return;
      }
      selectPiece(r, c);
      return;
    }

    if (selectedCell && validMoves.some(m => m.row === r && m.col === c)) {
      makeMove(selectedCell.row, selectedCell.col, r, c);
      return;
    }

    if (selectedCell) deselectPiece();
  }

  function selectPiece(r, c) {
    selectedCell = { row: r, col: c };
    // while any capture is required, a piece may only capture
    validMoves = E.legalMovesForPiece(board, r, c, config);
    mustCaptureHint = [];
    if (validMoves.length === 0 && config.mandatoryCapture) {
      const must = E.mustCapturePieces(board, currentPlayer, config);
      if (must.length) {
        mustCaptureHint = must;
        showToast('A capture is required: use a highlighted piece');
      }
    }
    renderBoard();
    renderUI();
  }

  function deselectPiece() {
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;
    renderBoard();
    renderUI();
  }

  // ===== GAME OVER =====
  function youLine(winner) {
    const mine = myColor();
    if (!mine || !winner) return '';
    return winner === mine ? 'You win!' : 'You lose.';
  }

  function endInDraw(reason) {
    gamePhase = 'gameover';
    stopTimer();
    dom.winnerText.textContent = 'Draw!';
    dom.winnerReason.textContent = reason || '';
    delete dom.gameOverModal.dataset.winner;
    dom.gameOverModal.classList.remove('hidden');
    renderBoard();
    renderUI();
    syncMPState();
  }

  // reason names the player it is about ("White has no pieces left")
  function endGame(winner, reason) {
    gamePhase = 'gameover';
    stopTimer();
    dom.winnerText.textContent = cap(winner) + ' wins!';
    dom.winnerReason.textContent = [reason, youLine(winner)].filter(Boolean).join(' · ');
    dom.gameOverModal.dataset.winner = winner;
    dom.gameOverModal.classList.remove('hidden');
    renderBoard();
    renderUI();
    syncMPState();
  }

  // ===== UNDO (local games only) =====
  // The snapshot is the position before the last turn, so the player who moved gets
  // the turn back; no approval step is needed when both players share the device.
  function undo() {
    if (mp.role) return;
    if (gamePhase !== 'playing' || moveHistory.length === 0) { showToast('Nothing to undo'); return; }
    const snap = moveHistory.pop();
    board = snap.board;
    currentPlayer = snap.currentPlayer;
    captured = { ...snap.captured };
    turnNumber = snap.turnNumber;
    lastMove = snap.lastMove;
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;
    mustCaptureHint = [];
    noCaptureStreakBlack = snap.noCaptureStreakBlack || 0;
    noCaptureStreakWhite = snap.noCaptureStreakWhite || 0;
    E.rollRandomKings(board, currentPlayer, config);
    if (config.timer > 0) { stopTimer(); startTimer(); }
    renderBoard();
    renderUI();
  }

  // ===== TIMER =====
  function initTimer() {
    if (timerState) clearInterval(timerState.interval);
    const s = config.timer;
    timerState = { black: s, white: s, interval: null, running: null };
  }

  function startTimer() {
    if (!timerState || timerState.running === currentPlayer) return;
    if (timerState.interval) clearInterval(timerState.interval);
    timerState.running = currentPlayer;
    timerState.interval = setInterval(() => {
      timerState[currentPlayer]--;
      updateTimerDisplay();
      if (timerState[currentPlayer] <= 0) {
        clearInterval(timerState.interval);
        timerState.interval = null;
        endGame(opp(currentPlayer), cap(currentPlayer) + ' ran out of time');
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerState && timerState.interval) {
      clearInterval(timerState.interval);
      timerState.interval = null;
    }
    if (timerState) timerState.running = null;
  }

  function updateTimerDisplay() {
    if (!timerState) return;
    dom.timerBlack.textContent = fmtTime(timerState.black);
    dom.timerWhite.textContent = fmtTime(timerState.white);
    dom.timerBlack.classList.toggle('timer-low', timerState.black <= 10);
    dom.timerWhite.classList.toggle('timer-low', timerState.white <= 10);
  }

  function fmtTime(s) {
    if (s <= 0) return '0:00';
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ===== RENDERING =====
  // Online, each player sees the board from their own side: the host plays Black,
  // whose pieces start at the top, so the host's view is turned around.
  function boardFlipped() { return mp.role === 'host'; }

  function renderBoard() {
    const size = config.boardSize;
    const flip = boardFlipped();
    dom.board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    dom.board.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    dom.board.innerHTML = '';
    const showMoves = config.highlightMoves !== false;

    for (let vr = 0; vr < size; vr++) {
      for (let vc = 0; vc < size; vc++) {
        const r = flip ? size - 1 - vr : vr;
        const c = flip ? size - 1 - vc : vc;
        const cell = document.createElement('div');
        cell.className = 'cell ' + (isDark(r, c) ? 'dark' : 'light');
        cell.dataset.row = r;
        cell.dataset.col = c;

        if (showMoves) {
          const info = validMoves.find(m => m.row === r && m.col === c);
          if (info) cell.classList.add(info.capture ? 'highlight-capture' : 'highlight');
        }
        if (mustCaptureHint.some(p => p.row === r && p.col === c)) cell.classList.add('must-capture');
        if (selectedCell && selectedCell.row === r && selectedCell.col === c) cell.classList.add('selected');
        if (lastMove) {
          if (lastMove.from.row === r && lastMove.from.col === c) cell.classList.add('last-move-from');
          if (lastMove.to.row === r && lastMove.to.col === c) cell.classList.add('last-move-to');
        }

        const piece = board[r][c];
        if (piece) {
          const el = document.createElement('div');
          const km = piece.king || 'standard';
          const kmClass = piece.king ? ' king king-' + km : '';
          el.className = 'piece ' + piece.color + '-piece' + kmClass;
          cell.appendChild(el);
        }

        cell.addEventListener('click', () => handleCellClick(r, c));
        dom.board.appendChild(cell);
      }
    }
  }

  function statusCard(el, color) {
    const mine = myColor();
    const who = mine ? (color === mine ? 'You' : 'Opponent') : cap(color);
    const lost = captured[color];   // pieces of this colour taken off the board
    el.classList.toggle('active', gamePhase === 'playing' && currentPlayer === color);
    el.innerHTML = `<span class="status-swatch ${color}-piece"></span>
      <span class="status-name">${who}${mine ? ` <small>(${cap(color)})</small>` : ''}</span>
      <span class="status-lost" title="${cap(color)} pieces captured">lost ${lost}</span>`;
  }

  function renderUI() {
    const mine = myColor();
    if (gamePhase === 'gameover') {
      dom.turnText.textContent = 'Game over';
    } else if (mine) {
      dom.turnText.textContent = currentPlayer === mine ? `Your turn (${cap(mine)})` : `${cap(currentPlayer)}'s turn`;
    } else {
      dom.turnText.textContent = cap(currentPlayer) + "'s turn";
    }
    dom.turnText.className = currentPlayer + '-turn';
    dom.turnCounter.textContent = 'Turn ' + turnNumber;
    statusCard(dom.statusBlack, 'black');
    statusCard(dom.statusWhite, 'white');
    // the player at the bottom of the screen is listed last
    const bottom = boardFlipped() ? 'black' : 'white';
    dom.statusBlack.style.order = bottom === 'black' ? 2 : 0;
    dom.statusWhite.style.order = bottom === 'white' ? 2 : 0;
    dom.undoBtn.hidden = !!mp.role;
    dom.undoBtn.disabled = gamePhase !== 'playing' || moveHistory.length === 0;

    if (config.timer > 0) {
      dom.timerDisplay.classList.remove('hidden');
      updateTimerDisplay();
    } else {
      dom.timerDisplay.classList.add('hidden');
    }
  }

  // ===== BOARD EDITOR =====
  function initEditor(optionalBoard) {
    const size = boardSize(dom.editorBoardSize.value);
    const rows = rowsPerPlayer(dom.editorRowsPerPlayer.value);
    if (optionalBoard) {
      editorBoardData = cloneBoard(optionalBoard);
    } else {
      editorBoardData = E.createBoard({ boardSize: size, rowsPerPlayer: rows });
    }
    renderEditor();
  }

  const EDITOR_SYMBOLS = {
    standard: '♛', flying: '✦', queen: '♕',
    knight: '♞', crown: '♔', random: '❓',
  };

  function renderEditor() {
    const size = boardSize(dom.editorBoardSize.value);
    const el = dom.editorBoard;
    if (!editorBoardData || editorBoardData.length !== size) {
      initEditor();
      return;
    }
    el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    el.innerHTML = '';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'editor-cell ' + (isDark(r, c) ? 'dark' : 'light');
        cell.dataset.row = r;
        cell.dataset.col = c;

        const piece = editorBoardData[r][c];
        if (piece) {
          const pEl = document.createElement('div');
          const isKing = !!piece.king;
          const km = piece.king || '';
          pEl.className = 'editor-piece ' + piece.color + '-piece' + (isKing ? ' king editor-king-' + km : '');
          cell.appendChild(pEl);
          if (isKing && EDITOR_SYMBOLS[km]) {
            const sym = document.createElement('span');
            sym.className = 'editor-king-symbol';
            sym.textContent = EDITOR_SYMBOLS[km];
            pEl.appendChild(sym);
          }
        }

        cell.addEventListener('click', () => handleEditorClick(r, c));
        el.appendChild(cell);
      }
    }
  }

  function handleEditorClick(r, c) {
    if (!isDark(r, c)) return;
    const color = dom.editorColor.value;
    const raw = dom.editorKing.value;
    const kingMode = raw === 'none' ? false : raw;
    const current = editorBoardData[r][c];

    if (current && current.color === color && current.king === kingMode) {
      editorBoardData[r][c] = null;
    } else {
      editorBoardData[r][c] = { color, king: kingMode };
    }
    renderEditor();
  }

  function clearEditor() {
    const size = boardSize(dom.editorBoardSize.value);
    editorBoardData = Array.from({ length: size }, () => Array(size).fill(null));
    renderEditor();
  }

  function resetEditor() {
    initEditor();
  }

  // ===== VISUAL =====
  function applyVisual(cfg) {
    const palettes = {
      classic: ['#f0d9b5', '#b58863'],
      green: ['#eeeed5', '#7b9659'],
      blue: ['#dee3e6', '#8ca2ad'],
      highcontrast: ['#ffffff', '#000000'],
    };
    const p = palettes[cfg.colorScheme] || palettes.classic;
    document.documentElement.style.setProperty('--board-light', p[0]);
    document.documentElement.style.setProperty('--board-dark', p[1]);
    document.documentElement.className = 'piece-style-' + cfg.pieceStyle + ' color-' + cfg.colorScheme;
  }

  // ===== GAME START =====
  function resetGameState() {
    selectedCell = null;
    validMoves = [];
    captured = { black: 0, white: 0 };
    turnNumber = 1;
    multiJumpPos = null;
    lastMove = null;
    moveHistory = [];
    mustCaptureHint = [];
    noCaptureStreakBlack = 0;
    noCaptureStreakWhite = 0;
    gamePhase = 'playing';
  }

  function showGamePanel() {
    dom.settingsPanel.classList.add('hidden');
    dom.gamePanel.classList.remove('hidden');
    dom.gameOverModal.classList.add('hidden');
  }

  function startGame(cfg, optBoard) {
    config = { ...cfg };
    hideMPOverlay();

    if (optBoard) {
      board = cloneBoard(optBoard);
      config.boardSize = board.length;
    } else {
      const useEditor = editorBoardData !== null && !dom.editorSection.classList.contains('hidden');
      if (useEditor) {
        board = cloneBoard(editorBoardData);
        config.boardSize = board.length;
      } else {
        board = E.createBoard(config);
      }
    }

    currentPlayer = config.startingPlayer === 'random'
      ? (Math.random() < 0.5 ? 'black' : 'white')
      : config.startingPlayer;

    resetGameState();
    E.rollRandomKings(board, currentPlayer, config);
    applyVisual(config);
    if (config.timer > 0) { initTimer(); startTimer(); }
    else timerState = null;
    showGamePanel();
    updateRoleBadge();

    if (mp.role === 'host' && mp.connected) {
      sendMP('gameStart', { config: config, board: E.encodeBoard(board), currentPlayer: currentPlayer });
    }

    const outcome = E.checkOutcome(board, currentPlayer, config);
    if (outcome) { endGame(outcome.winner, outcome.reason); return; }

    renderBoard();
    renderUI();
  }

  function resetToSettings() {
    gamePhase = 'settings';
    stopTimer();
    timerState = null;
    dom.gamePanel.classList.add('hidden');
    dom.settingsPanel.classList.remove('hidden');
    dom.gameOverModal.classList.add('hidden');
    updateRoleBadge();
    updateShareButtons();
    if (mp.role === 'guest') {
      showMPOverlay('Host is in settings', 'Waiting for the host to start the next game', false);
    }
  }

  // Exit mid-game asks first. A guest who exits leaves the room for good.
  function exitGame() {
    if (gamePhase === 'playing' && !window.confirm(mp.role ? 'Leave this online game? Your opponent will be told you left.' : 'Leave this game? The current position will be lost.')) return;
    if (mp.role === 'guest') { leaveRoom(); return; }
    resetToSettings();
  }

  // ===== MULTIPLAYER =====
  function genRoomId() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    const buf = new Uint32Array(8);
    crypto.getRandomValues(buf);
    return 'cc-' + Array.from(buf, (n) => chars[n % chars.length]).join('');
  }

  // actions: [{ label, primary, onClick }]
  function showMPOverlay(text, detail, showSpinner, actions, link) {
    dom.mpStatusText.textContent = text;
    dom.mpStatusDetail.textContent = detail || '';
    dom.mpSpinner.style.display = showSpinner !== false ? 'block' : 'none';
    dom.mpLink.textContent = link || '';
    dom.mpLink.classList.toggle('hidden', !link);
    dom.mpActions.innerHTML = '';
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.primary ? 'btn-primary' : 'btn-secondary');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      dom.mpActions.appendChild(b);
    });
    dom.mpOverlay.classList.remove('hidden');
  }

  function hideMPOverlay() {
    dom.mpOverlay.classList.add('hidden');
  }

  function updateRoleBadge() {
    const mine = myColor();
    if (mine && dom.gamePanel && !dom.gamePanel.classList.contains('hidden')) {
      dom.roleBadge.textContent = 'You: ' + cap(mine);
      dom.roleBadge.className = 'role-badge ' + mine;
      dom.roleBadge.title = mp.role === 'host' ? 'You host this room and play Black' : 'You joined this room and play White';
      dom.roleBadge.classList.remove('hidden');
    } else if (dom.roleBadge) {
      dom.roleBadge.classList.add('hidden');
    }
  }

  function updateShareButtons() {
    if (mp.role === 'guest') {
      dom.inviteBtn.textContent = 'Joined a room';
      dom.inviteBtn.disabled = true;
      dom.shareLinkBtn.disabled = true;
    } else if (mp.role === 'host') {
      dom.inviteBtn.textContent = mp.connected ? 'Opponent connected' : 'Copy invite link';
      dom.inviteBtn.disabled = mp.connected;
      dom.shareLinkBtn.disabled = false;
    } else {
      dom.inviteBtn.textContent = 'Invite a player';
      dom.inviteBtn.disabled = false;
      dom.shareLinkBtn.disabled = false;
    }
  }

  function sendMP(type, data) {
    if (mp.conn && mp.connected) {
      try { mp.conn.send({ type: type, data: data }); } catch (e) { /* channel closing */ }
    }
  }

  function handleMPMessage(msg) {
    mp.lastSeen = Date.now();
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'ping':
        break;
      case 'bye':
        onPeerGone(true);
        break;
      case 'stateSync':
        applyRemoteState(msg.data);
        break;
      case 'gameStart':
        applyRemoteGameStart(msg.data);
        break;
      case 'settingsSync':
        if (mp.role === 'guest') {
          mp.receivedSettings = msg.data;
          applyVisual(msg.data);
          updateRoleBadge();
        }
        break;
      case 'resetGame':
        if (mp.role === 'guest') {
          hideMPOverlay();
          startGame(msg.data.config, msg.data.board);
        }
        break;
    }
  }

  function syncMPState() {
    if (!mp.connected) return;
    const isOver = gamePhase === 'gameover';
    sendMP('stateSync', {
      board: E.encodeBoard(board),
      currentPlayer: currentPlayer,
      captured: captured,
      turnNumber: turnNumber,
      gamePhase: gamePhase,
      lastMove: lastMove || null,
      config: config,
      noCaptureStreakBlack: noCaptureStreakBlack,
      noCaptureStreakWhite: noCaptureStreakWhite,
      gameOver: isOver ? {
        winner: dom.gameOverModal.dataset.winner || null,
        text: dom.winnerText.textContent,
        reason: dom.winnerReason.textContent.split(' · ')[0],
        isDraw: dom.winnerText.textContent === 'Draw!',
      } : null,
    });
  }

  function applyRemoteState(data) {
    if (!data) return;
    board = E.decodeBoard(data.board) || board;
    currentPlayer = data.currentPlayer === 'white' ? 'white' : 'black';
    captured = data.captured || { black: 0, white: 0 };
    turnNumber = data.turnNumber || 1;
    gamePhase = data.gamePhase || 'playing';
    noCaptureStreakBlack = data.noCaptureStreakBlack || 0;
    noCaptureStreakWhite = data.noCaptureStreakWhite || 0;
    moveHistory = [];
    config = data.config || config;
    if (data.lastMove) lastMove = data.lastMove;
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;
    mustCaptureHint = [];
    if (data.gameOver) {
      gamePhase = 'gameover';
      stopTimer();
      if (data.gameOver.isDraw) {
        dom.winnerText.textContent = 'Draw!';
        dom.winnerReason.textContent = data.gameOver.reason || '';
      } else {
        const w = data.gameOver.winner;
        dom.winnerText.textContent = w ? cap(w) + ' wins!' : data.gameOver.text;
        dom.winnerReason.textContent = [data.gameOver.reason, youLine(w)].filter(Boolean).join(' · ');
      }
      dom.gameOverModal.classList.remove('hidden');
      renderBoard();
      renderUI();
      return;
    }
    E.rollRandomKings(board, currentPlayer, config);
    if (dom.gamePanel.classList.contains('hidden')) showGamePanel();
    renderBoard();
    renderUI();
  }

  function applyRemoteGameStart(data) {
    if (!data) return;
    hideMPOverlay();
    config = data.config || DEFAULT_CONFIG;
    board = (data.board && E.decodeBoard(data.board)) || E.createBoard(config);
    config.boardSize = board.length;
    currentPlayer = data.currentPlayer === 'white' ? 'white' : 'black';
    resetGameState();
    E.rollRandomKings(board, currentPlayer, config);
    applyVisual(config);
    showGamePanel();
    updateRoleBadge();
    renderBoard();
    renderUI();
  }

  // Heartbeat: PeerJS does not reliably fire 'close' when the other tab is closed, so
  // both sides ping and treat a long silence (or a 'bye') as the other side leaving.
  function startHeartbeat() {
    stopHeartbeat();
    mp.lastSeen = Date.now();
    mp.heartbeat = setInterval(() => {
      if (!mp.connected) return;
      sendMP('ping', Date.now());
      if (Date.now() - mp.lastSeen > PEER_TIMEOUT_MS) onPeerGone(false);
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (mp.heartbeat) clearInterval(mp.heartbeat);
    mp.heartbeat = null;
  }

  function onPeerGone(said) {
    if (!mp.connected) return;
    mp.connected = false;
    stopHeartbeat();
    try { if (mp.conn) mp.conn.close(); } catch (e) { /* already closed */ }
    mp.conn = null;
    stopTimer();
    updateShareButtons();
    if (mp.role === 'host') {
      const inGame = gamePhase === 'playing';
      showMPOverlay('Your opponent left', inGame
        ? 'They can come back with the same invite link; the game continues where it stopped.'
        : 'They can come back with the same invite link.', true, [
        { label: 'Copy invite link', onClick: () => copyText(inviteURL()) },
        { label: 'Close room', primary: true, onClick: () => { closeRoom(); resetToSettings(); } },
      ], inviteURL());
    } else {
      showMPOverlay('The host left', said ? 'The host closed the game.' : 'The connection to the host was lost.', false, [
        { label: 'Back to settings', primary: true, onClick: () => leaveRoom() },
      ]);
    }
  }

  function wireConnection(conn) {
    mp.conn = conn;
    conn.on('data', handleMPMessage);
    conn.on('close', () => onPeerGone(false));
    conn.on('error', () => onPeerGone(false));
  }

  function initHostPeer(roomId, attempt) {
    attempt = attempt || 0;
    mp.role = 'host';
    mp.roomId = roomId;
    showMPOverlay('Creating a room...', 'Connecting to the PeerJS server', true, [
      { label: 'Cancel', onClick: () => { closeRoom(); } },
    ]);
    const peer = new Peer(roomId);
    mp.peer = peer;
    peer.on('open', (id) => {
      if (mp.peer !== peer) return;
      mp.roomId = id;
      updateShareButtons();
      copyText(inviteURL(), 'Invite link copied!');
      showMPOverlay('Waiting for an opponent...', 'Send this link to a friend. You play Black; they play White.', true, [
        { label: 'Copy link', onClick: () => copyText(inviteURL()) },
        { label: 'Cancel', onClick: () => { closeRoom(); } },
      ], inviteURL());
    });
    peer.on('connection', (conn) => {
      if (mp.peer !== peer) return;
      // one opponent at a time: a second visitor is turned away
      if (mp.connected) { conn.on('open', () => { conn.send({ type: 'bye' }); setTimeout(() => conn.close(), 200); }); return; }
      conn.on('open', () => {
        wireConnection(conn);
        mp.connected = true;
        startHeartbeat();
        hideMPOverlay();
        updateShareButtons();
        updateRoleBadge();
        sendMP('settingsSync', gamePhase === 'settings' ? getSettingsFromUI() : config);
        if (gamePhase === 'playing' || gamePhase === 'gameover') {
          // a returning guest picks the game up where it stopped
          sendMP('gameStart', { config: config, board: E.encodeBoard(board), currentPlayer: currentPlayer });
          syncMPState();
          if (gamePhase === 'playing' && config.timer > 0) startTimer();
          showToast('Your opponent is back');
        } else {
          showToast('Opponent connected! Press Start Game to begin');
        }
      });
    });
    peer.on('error', (err) => {
      if (mp.peer !== peer) return;
      if (err && err.type === 'unavailable-id' && attempt < MAX_ID_RETRIES) {
        // the random id is taken: start over with a fresh one, handlers included
        peer.destroy();
        initHostPeer(genRoomId(), attempt + 1);
        return;
      }
      if (mp.connected) return;   // a late error after the game started is handled by the heartbeat
      showMPOverlay('Could not create a room', (err && err.type ? err.type + ': ' : '') + 'check your connection and try again.', false, [
        { label: 'Close', primary: true, onClick: () => { closeRoom(); } },
      ]);
    });
  }

  function initGuestPeer(roomId) {
    mp.role = 'guest';
    mp.roomId = roomId;
    updateShareButtons();
    showMPOverlay('Connecting...', 'Waiting for the host', true);
    const peer = new Peer();
    mp.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(roomId, { reliable: true });
      conn.on('open', () => {
        wireConnection(conn);
        mp.connected = true;
        startHeartbeat();
        showMPOverlay('Connected!', 'You play White. Waiting for the host to start the game...', false, [
          { label: 'Leave', onClick: () => leaveRoom() },
        ]);
        updateRoleBadge();
      });
    });
    peer.on('error', () => {
      if (mp.connected) return;
      showMPOverlay('Could not connect', 'The host might not be available yet. Try again later.', false, [
        { label: 'Try again', primary: true, onClick: () => window.location.reload() },
        { label: 'Play locally', onClick: () => leaveRoom() },
      ]);
    });
  }

  // Host: stop hosting (the guest is told). Guest side uses leaveRoom().
  function closeRoom() {
    if (mp.connected) sendMP('bye', null);
    stopHeartbeat();
    const peer = mp.peer;
    setTimeout(() => { try { if (peer) peer.destroy(); } catch (e) { /* ignore */ } }, 150);
    mp = { role: null, peer: null, conn: null, roomId: null, connected: false, receivedSettings: null, lastSeen: 0, heartbeat: null };
    hideMPOverlay();
    updateShareButtons();
    updateRoleBadge();
  }

  function leaveRoom() {
    closeRoom();
    history.replaceState(null, '', baseURL());
    document.title = 'Custom Checkers';
    resetToSettings();
    applyConfigToUI(DEFAULT_CONFIG);
    applyVisual(DEFAULT_CONFIG);
  }

  // ===== EVENTS =====
  function bindEvents() {
    dom.startGameBtn.addEventListener('click', () => {
      if (mp.role === 'guest') { showToast('Only the host can start the game'); return; }
      if (mp.role === 'host' && !mp.connected) { showToast('No opponent yet: send the invite link or cancel the room'); return; }
      startGame(getSettingsFromUI());
    });

    dom.shareLinkBtn.addEventListener('click', () => {
      copyText(generateShareURL(), 'Rules link copied! It opens a local game with these settings.');
    });

    dom.inviteBtn.addEventListener('click', () => {
      if (mp.role === 'host' && mp.roomId) { copyText(inviteURL(), 'Invite link copied!'); return; }
      if (!mp.role) initHostPeer(genRoomId());
    });

    dom.playAgainBtn.addEventListener('click', () => {
      dom.gameOverModal.classList.add('hidden');
      if (mp.role === 'host') {
        resetToSettings();
        showToast('You can change settings, then press Start Game');
        return;
      }
      if (mp.role === 'guest') {
        showToast('Waiting for host to start next game');
        return;
      }
      startGame(config);
    });

    dom.settingsBtn.addEventListener('click', () => {
      dom.gameOverModal.classList.add('hidden');
      resetToSettings();
    });

    dom.settingKingMove.addEventListener('change', () => {
      dom.kingMoveDesc.textContent = KING_DESCRIPTIONS[dom.settingKingMove.value] || '';
    });

    dom.backToSettingsBtn.addEventListener('click', exitGame);
    dom.undoBtn.addEventListener('click', undo);

    dom.toggleEditorBtn.addEventListener('click', () => {
      const hidden = dom.editorSection.classList.toggle('hidden');
      dom.toggleEditorBtn.textContent = hidden ? 'Show Board Editor' : 'Hide Board Editor';
      if (!hidden && !editorBoardData) initEditor();
    });

    dom.toggleVisualBtn.addEventListener('click', () => {
      const hidden = dom.visualSection.classList.toggle('hidden');
      dom.toggleVisualBtn.textContent = hidden ? 'Show Visual Settings' : 'Hide Visual Settings';
    });

    const clampInput = (input, fn) => { input.value = fn(input.value); };
    dom.editorBoardSize.addEventListener('change', () => {
      clampInput(dom.editorBoardSize, boardSize);
      if (!dom.editorSection.classList.contains('hidden')) initEditor();
    });
    dom.editorRowsPerPlayer.addEventListener('change', () => {
      clampInput(dom.editorRowsPerPlayer, rowsPerPlayer);
      if (!dom.editorSection.classList.contains('hidden')) initEditor();
    });

    dom.settingDrawLimitLinked.addEventListener('change', () => {
      if (dom.settingDrawLimitLinked.checked) {
        dom.settingDrawLimitWhite.value = dom.settingDrawLimitBlack.value;
      }
    });
    dom.settingDrawLimitBlack.addEventListener('change', () => {
      if (dom.settingDrawLimitLinked.checked) {
        dom.settingDrawLimitWhite.value = dom.settingDrawLimitBlack.value;
      }
    });

    dom.editorClearBtn.addEventListener('click', clearEditor);
    dom.editorResetBtn.addEventListener('click', resetEditor);
    dom.editorColor.addEventListener('change', renderEditor);
    dom.editorKing.addEventListener('change', renderEditor);

    document.querySelectorAll('.preset-group').forEach(group => {
      const input = document.getElementById(group.dataset.target);
      if (!input) return;
      group.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelector('.active')?.classList.remove('active');
          btn.classList.add('active');
          input.value = btn.dataset.value;
          input.dispatchEvent(new Event('change'));
        });
      });
    });

    dom.settingBoardSize.addEventListener('change', () => {
      const size = boardSize(dom.settingBoardSize.value);
      if (String(size) !== String(dom.settingBoardSize.value)) showToast(`Board size is ${MIN_SIZE} to ${MAX_SIZE}`);
      dom.settingBoardSize.value = size;
      document.querySelectorAll('.preset-group[data-target="setting-boardSize"] .preset-btn').forEach(b => {
        b.classList.toggle('active', +b.dataset.value === size);
      });
    });

    dom.settingRowsPerPlayer.addEventListener('change', () => {
      const val = rowsPerPlayer(dom.settingRowsPerPlayer.value);
      dom.settingRowsPerPlayer.value = val;
      document.querySelectorAll('.preset-group[data-target="setting-rowsPerPlayer"] .preset-btn').forEach(b => {
        b.classList.toggle('active', +b.dataset.value === val);
      });
    });

    // tell the other side right away when this tab goes away
    window.addEventListener('pagehide', () => { if (mp.connected) sendMP('bye', null); });
  }

  // ===== INIT =====
  function syncPresets() {
    document.querySelectorAll('.preset-group').forEach(group => {
      const input = document.getElementById(group.dataset.target);
      if (!input) return;
      const val = +input.value;
      group.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.toggle('active', +b.dataset.value === val);
      });
    });
  }

  function init() {
    cacheDom();
    bindEvents();

    dom.kingMoveDesc.textContent = KING_DESCRIPTIONS[dom.settingKingMove.value] || '';
    syncPresets();
    updateShareButtons();

    const params = new URLSearchParams(window.location.search);
    const rawRoom = params.get('room');
    const roomId = E.sanitizeRoomId(rawRoom);
    const bdStr = params.get('bd');
    const decodedBoard = bdStr ? E.decodeBoard(bdStr) : null;

    if (roomId) {
      document.title = 'Custom Checkers - Online';
      initGuestPeer(roomId);
      return;
    }
    if (rawRoom) showToast('That room link is not valid', 3000);
    if (bdStr && !decodedBoard) showToast('The position in the link is not valid, using the normal start', 3500);

    const urlCfg = E.parseConfigParams(params);
    if (urlCfg) {
      if (decodedBoard) urlCfg.boardSize = decodedBoard.length;
      applyConfigToUI(urlCfg);
      syncPresets();
      if (decodedBoard) {
        dom.toggleEditorBtn.textContent = 'Hide Board Editor';
        dom.editorSection.classList.remove('hidden');
        dom.editorBoardSize.value = decodedBoard.length;
        initEditor(decodedBoard);
      }
      startGame(urlCfg);
    } else {
      applyConfigToUI(DEFAULT_CONFIG);
      applyVisual(DEFAULT_CONFIG);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
