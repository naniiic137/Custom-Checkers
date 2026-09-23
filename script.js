(function () {
  'use strict';

  // ===== CONFIGURATION =====
  const CONFIG_MAP = {
    sz: 'boardSize', rp: 'rowsPerPlayer', mc: 'mandatoryCapture',
    km: 'kingMove', bm: 'backwardMove', bc: 'backwardCapture', kc: 'kingsCanBeCaptured',
    pa: 'promoteAnyBack', rr: 'randomPromotion', dk: 'doubleCaptureKings',
    sm: 'suicideMode', sw: 'stalemateWins', dl: 'drawLimitEnabled',
    db: 'drawLimitBlack', dw: 'drawLimitWhite', dq: 'drawLimitLinked',
    sk: 'shuffleKingOnMove', ak: 'activeKingModes',
    sp: 'startingPlayer', tm: 'timer',
    hm: 'highlightMoves', ps: 'pieceStyle', cs: 'colorScheme',
  };

  const DEFAULT_CONFIG = {
    boardSize: 8, rowsPerPlayer: 3, mandatoryCapture: true,
    kingMove: 'standard', backwardMove: false, backwardCapture: false, kingsCanBeCaptured: true,
    promoteAnyBack: false, randomPromotion: false, doubleCaptureKings: false,
    suicideMode: false, stalemateWins: false,
    shuffleKingOnMove: false, activeKingModes: 'standard,flying,queen,knight,crown',
    drawLimitEnabled: false, drawLimitBlack: 40, drawLimitWhite: 40, drawLimitLinked: true,
    startingPlayer: 'random', timer: 0,
    highlightMoves: true, pieceStyle: 'classic', colorScheme: 'classic',
  };

  // ===== MULTIPLAYER STATE =====
  let mp = {
    role: null,      // 'host' | 'guest' | null
    peer: null,
    conn: null,
    roomId: null,
    connected: false,
    receivedSettings: null,
  };

  const KING_SYMBOLS = {
    standard: '♛', flying: '✦', queen: '♕',
    knight: '♞', crown: '♔', random: '❓',
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
    dom.capturedBlack = $('#captured-black');
    dom.capturedWhite = $('#captured-white');
    dom.turnCounter = $('#turn-counter');
    dom.toast = $('#toast');
    dom.gameOverModal = $('#game-over-modal');
    dom.winnerText = $('#winner-text');
    dom.winnerReason = $('#winner-reason');
    dom.playAgainBtn = $('#play-again-btn');
    dom.settingsBtn = $('#settings-btn');
    dom.backToSettingsBtn = $('#back-to-settings-btn');
    dom.startGameBtn = $('#start-game-btn');
    dom.generateLinkBtn = $('#generate-link-btn');
    dom.undoBtn = $('#undo-btn');
    dom.undoModal = $('#undo-modal');
    dom.undoRequestText = $('#undo-request-text');
    dom.undoResponder = $('#undo-responder');
    dom.undoYesBtn = $('#undo-yes-btn');
    dom.undoNoBtn = $('#undo-no-btn');
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
  let undoRequestActive = false;
  let noCaptureStreakBlack = 0;
  let noCaptureStreakWhite = 0;
  let editorBoardData = null;

  // ===== UTILITY =====
  function onBoard(r, c) { return r >= 0 && r < config.boardSize && c >= 0 && c < config.boardSize; }
  function isDark(r, c) { return (r + c) % 2 === 1; }
  function opp(color) { return color === 'black' ? 'white' : 'black'; }
  function cloneBoard(b) { return b.map(row => row.map(cell => cell ? { ...cell } : null)); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ===== BOARD DATA ENCODING (for share links) =====
  const PIECE_CHARS = {
    'b': c => ({ color: 'black', king: false }),
    'w': c => ({ color: 'white', king: false }),
    's': c => ({ color: 'black', king: 'standard' }),
    'f': c => ({ color: 'black', king: 'flying' }),
    'q': c => ({ color: 'black', king: 'queen' }),
    'k': c => ({ color: 'black', king: 'knight' }),
    'c': c => ({ color: 'black', king: 'crown' }),
    'S': c => ({ color: 'white', king: 'standard' }),
    'F': c => ({ color: 'white', king: 'flying' }),
    'Q': c => ({ color: 'white', king: 'queen' }),
    'K': c => ({ color: 'white', king: 'knight' }),
    'C': c => ({ color: 'white', king: 'crown' }),
    'r': c => ({ color: 'black', king: 'random' }),
    'R': c => ({ color: 'white', king: 'random' }),
  };
  const CHAR_FOR_PIECE = {};
  for (const [ch, fn] of Object.entries(PIECE_CHARS)) {
    const p = fn();
    const key = p.color + '|' + (p.king || '');
    CHAR_FOR_PIECE[key] = ch;
  }

  function encodeBoard(b) {
    if (!b || b.length === 0) return '';
    const size = b.length;
    let data = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = b[r][c];
        if (!p) { data += '.'; continue; }
        const key = p.color + '|' + (p.king || '');
        data += CHAR_FOR_PIECE[key] || '.';
      }
    }
    return size + ':' + data;
  }

  function decodeBoard(str) {
    const colon = str.indexOf(':');
    if (colon === -1) return null;
    const size = parseInt(str.slice(0, colon), 10);
    const data = str.slice(colon + 1);
    if (isNaN(size) || size < 2 || size > 50 || data.length !== size * size) return null;
    const b = Array.from({ length: size }, () => Array(size).fill(null));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const ch = data[r * size + c];
        if (ch === '.') continue;
        const make = PIECE_CHARS[ch];
        if (make) b[r][c] = make();
      }
    }
    return b;
  }

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
      boardSize: Math.max(2, +dom.settingBoardSize.value || 8),
      rowsPerPlayer: Math.max(0, +dom.settingRowsPerPlayer.value || 3),
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
      drawLimitBlack: Math.max(1, +dom.settingDrawLimitBlack.value || 40),
      drawLimitWhite: Math.max(1, +dom.settingDrawLimitWhite.value || 40),
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

  const ALL_KING_MODES = ['standard', 'flying', 'queen', 'knight', 'crown'];

  function getActiveModesFromUI() {
    const chips = document.querySelectorAll('#king-mode-chips .mode-chip input:checked');
    return Array.from(chips).map(cb => cb.value).join(',') || 'standard';
  }

  function getActiveModes(cfg) {
    if (cfg.activeKingModes && typeof cfg.activeKingModes === 'string') {
      const list = cfg.activeKingModes.split(',').filter(Boolean);
      if (list.length > 0) return list;
    }
    return ALL_KING_MODES;
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

  function parseURLConfig() {
    const params = new URLSearchParams(window.location.search);
    let has = false;
    const raw = {};
    for (const [k, v] of params) {
      if (k in CONFIG_MAP) { has = true; raw[CONFIG_MAP[k]] = v; }
    }
    if (!has) return null;

    const cfg = { ...DEFAULT_CONFIG };
    if (raw.boardSize !== undefined) cfg.boardSize = +raw.boardSize;
    if (raw.rowsPerPlayer !== undefined) cfg.rowsPerPlayer = +raw.rowsPerPlayer;
    ['mandatoryCapture', 'backwardMove', 'backwardCapture', 'kingsCanBeCaptured', 'promoteAnyBack', 'randomPromotion', 'doubleCaptureKings', 'suicideMode', 'stalemateWins', 'drawLimitEnabled', 'drawLimitLinked', 'highlightMoves', 'shuffleKingOnMove']
      .forEach(k => { if (raw[k] !== undefined) cfg[k] = raw[k] === '1'; });
    if (raw.kingMove !== undefined) cfg.kingMove = raw.kingMove;
    if (raw.startingPlayer !== undefined) cfg.startingPlayer = raw.startingPlayer;
    if (raw.timer !== undefined) cfg.timer = +raw.timer;
    if (raw.drawLimitBlack !== undefined) cfg.drawLimitBlack = +raw.drawLimitBlack;
    if (raw.drawLimitWhite !== undefined) cfg.drawLimitWhite = +raw.drawLimitWhite;
    if (raw.pieceStyle !== undefined) cfg.pieceStyle = raw.pieceStyle;
    if (raw.colorScheme !== undefined) cfg.colorScheme = raw.colorScheme;
    if (raw.activeKingModes !== undefined) cfg.activeKingModes = raw.activeKingModes;
    return cfg;
  }

  function generateShareURL() {
    const cfg = getSettingsFromUI();
    const p = new URLSearchParams();
    for (const [short, long] of Object.entries(CONFIG_MAP)) {
      let v = cfg[long];
      if (typeof v === 'boolean') v = v ? '1' : '0';
      p.set(short, String(v));
    }
    if (!dom.editorSection.classList.contains('hidden') && editorBoardData !== null && editorBoardData.length > 0) {
      const enc = encodeBoard(editorBoardData);
      if (enc) p.set('bd', enc);
    }
    if (mp.role === 'host' && mp.roomId) {
      p.set('room', mp.roomId);
    }
    return window.location.href.split('?')[0] + '?' + p.toString();
  }

  // ===== BOARD SETUP =====
  function createBoard(cfg) {
    const b = Array.from({ length: cfg.boardSize }, () => Array(cfg.boardSize).fill(null));
    const rows = Math.min(cfg.rowsPerPlayer, Math.floor(cfg.boardSize / 2));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cfg.boardSize; c++)
        if (isDark(r, c)) b[r][c] = { color: 'black', king: false };
    for (let r = cfg.boardSize - rows; r < cfg.boardSize; r++)
      for (let c = 0; c < cfg.boardSize; c++)
        if (isDark(r, c)) b[r][c] = { color: 'white', king: false };
    return b;
  }

  // ===== MOVE GENERATION =====
  function moveDirs(piece, cfg) {
    if (piece.king) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const f = piece.color === 'black' ? 1 : -1;
    const dirs = [[f, -1], [f, 1]];
    if (cfg && cfg.backwardMove) dirs.push([-f, -1], [-f, 1]);
    return dirs;
  }

  function captureDirs(piece, cfg) {
    if (piece.king) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const f = piece.color === 'black' ? 1 : -1;
    const d = [[f, -1], [f, 1]];
    if (cfg.backwardCapture) d.push([-f, -1], [-f, 1]);
    return d;
  }

  function getKingMode(piece, cfg) {
    if (!piece.king) return null;
    if (piece.king === 'random') {
      const modes = cfg ? getActiveModes(cfg) : ALL_KING_MODES;
      return modes[Math.floor(Math.random() * modes.length)];
    }
    return piece.king;
  }

  function getMovesForPiece(b, r, c, cfg) {
    const piece = b[r][c];
    if (!piece) return [];
    const moves = [];
    const km = getKingMode(piece, cfg);

    if (km) {
      if (km === 'knight') { knightMoves(b, r, c, piece, cfg, moves); return moves; }
      if (km === 'crown') { crownMoves(b, r, c, piece, cfg, moves); return moves; }
      if (km === 'queen') { queenMoves(b, r, c, piece, cfg, moves); return moves; }
      if (km === 'flying') {
        const mDirs = moveDirs(piece, cfg);
        for (const [dr, dc] of mDirs) flyingRegular(b, r, c, dr, dc, cfg, moves);
        const cDirs = captureDirs(piece, cfg);
        for (const [dr, dc] of cDirs) flyingCapture(b, r, c, dr, dc, piece, cfg, moves);
        return moves;
      }
    }

    const mDirs = moveDirs(piece, cfg);
    for (const [dr, dc] of mDirs) simpleMove(b, r, c, dr, dc, moves);
    const cDirs = captureDirs(piece, cfg);
    for (const [dr, dc] of cDirs) simpleCapture(b, r, c, dr, dc, piece, cfg, moves);
    return moves;
  }

  function queenMoves(b, r, c, piece, cfg, moves) {
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr, dc] of dirs) {
      queenSlide(b, r, c, dr, dc, piece, cfg, moves);
    }
  }

  function queenSlide(b, r, c, dr, dc, piece, cfg, moves) {
    let found = false, fr, fc;
    for (let s = 1; s < cfg.boardSize; s++) {
      const nr = r + dr * s, nc = c + dc * s;
      if (!onBoard(nr, nc)) break;
      if (!found) {
        if (!b[nr][nc]) {
          moves.push({ row: nr, col: nc, capture: false });
        } else if (b[nr][nc].color !== piece.color) {
          if (cfg.kingsCanBeCaptured || !b[nr][nc].king) {
            found = true; fr = nr; fc = nc;
          } else break;
        } else break;
      } else {
        if (b[nr][nc]) break;
        moves.push({ row: nr, col: nc, capture: true, capturedRow: fr, capturedCol: fc });
      }
    }
  }

  function knightMoves(b, r, c, piece, cfg, moves) {
    const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc)) continue;
      if (!b[nr][nc]) moves.push({ row: nr, col: nc, capture: false });
      else if (b[nr][nc].color !== piece.color)
        if (cfg.kingsCanBeCaptured || !b[nr][nc].king)
          moves.push({ row: nr, col: nc, capture: true, capturedRow: nr, capturedCol: nc });
    }
  }

  function crownMoves(b, r, c, piece, cfg, moves) {
    const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc)) continue;
      if (!b[nr][nc]) moves.push({ row: nr, col: nc, capture: false });
      else if (b[nr][nc].color !== piece.color)
        if (cfg.kingsCanBeCaptured || !b[nr][nc].king)
          moves.push({ row: nr, col: nc, capture: true, capturedRow: nr, capturedCol: nc });
    }
    const knightJumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of knightJumps) {
      const nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc)) continue;
      if (!b[nr][nc]) moves.push({ row: nr, col: nc, capture: false });
      else if (b[nr][nc].color !== piece.color)
        if (cfg.kingsCanBeCaptured || !b[nr][nc].king)
          moves.push({ row: nr, col: nc, capture: true, capturedRow: nr, capturedCol: nc });
    }
  }

  function simpleMove(b, r, c, dr, dc, moves) {
    const nr = r + dr, nc = c + dc;
    if (onBoard(nr, nc) && !b[nr][nc]) {
      moves.push({ row: nr, col: nc, capture: false });
    }
  }

  function simpleCapture(b, r, c, dr, dc, piece, cfg, moves) {
    const mr = r + dr, mc = c + dc;
    if (!onBoard(mr, mc) || !b[mr][mc] || b[mr][mc].color === piece.color) return;
    if (!cfg.kingsCanBeCaptured && b[mr][mc].king) return;
    const lr = r + 2 * dr, lc = c + 2 * dc;
    if (onBoard(lr, lc) && !b[lr][lc]) {
      moves.push({ row: lr, col: lc, capture: true, capturedRow: mr, capturedCol: mc });
    }
  }

  function flyingRegular(b, r, c, dr, dc, cfg, moves) {
    for (let s = 1; s < cfg.boardSize; s++) {
      const nr = r + dr * s, nc = c + dc * s;
      if (!onBoard(nr, nc) || b[nr][nc]) break;
      moves.push({ row: nr, col: nc, capture: false });
    }
  }

  function flyingCapture(b, r, c, dr, dc, piece, cfg, moves) {
    let found = false, fr, fc;
    for (let s = 1; s < cfg.boardSize; s++) {
      const nr = r + dr * s, nc = c + dc * s;
      if (!onBoard(nr, nc)) break;
      if (!found) {
        if (!b[nr][nc]) continue;
        if (b[nr][nc].color === piece.color) break;
        if (!cfg.kingsCanBeCaptured && b[nr][nc].king) break;
        found = true; fr = nr; fc = nc;
      } else {
        if (b[nr][nc]) break;
        moves.push({ row: nr, col: nc, capture: true, capturedRow: fr, capturedCol: fc });
      }
    }
  }

  function getAllPlayerMoves(b, color, cfg) {
    const all = [];
    let anyCapture = false;
    for (let r = 0; r < cfg.boardSize; r++) {
      for (let c = 0; c < cfg.boardSize; c++) {
        if (b[r][c] && b[r][c].color === color) {
          const pm = getMovesForPiece(b, r, c, cfg);
          pm.forEach(m => {
            all.push({ fromRow: r, fromCol: c, ...m });
            if (m.capture) anyCapture = true;
          });
        }
      }
    }
    if (cfg.mandatoryCapture && anyCapture) return all.filter(m => m.capture);
    return all;
  }

  function getPieceCaptures(b, r, c, cfg) {
    return getMovesForPiece(b, r, c, cfg).filter(m => m.capture);
  }

  // ===== GAME LOGIC =====
  function makeMove(fromR, fromC, toR, toC) {
    const piece = board[fromR][fromC];
    const moveInfo = validMoves.find(m => m.row === toR && m.col === toC);

    let wasCapture = false;
    if (moveInfo && moveInfo.capture) {
      wasCapture = true;
      const cap = board[moveInfo.capturedRow][moveInfo.capturedCol];
      if (cap) {
        if (config.doubleCaptureKings && cap.king) {
          cap.king = false;
          board[moveInfo.capturedRow][moveInfo.capturedCol] = cap;
        } else {
          captured[cap.color]++;
          board[moveInfo.capturedRow][moveInfo.capturedCol] = null;
        }
      }
    }

    board[toR][toC] = piece;
    board[fromR][fromC] = null;

    const promoted = tryPromote(toR, toC, piece);
    const isKc = piece.king === 'knight' || piece.king === 'crown';

    if (wasCapture && !promoted && !isKc) {
      const more = getPieceCaptures(board, toR, toC, config);
      if (more.length > 0) {
        selectedCell = { row: toR, col: toC };
        validMoves = more;
        multiJumpPos = { row: toR, col: toC };
        renderBoard();
        renderUI();
        return true;
      }
    }

    if (piece.king && config.shuffleKingOnMove) {
      const modes = getActiveModes(config);
      if (modes.length > 0) piece.king = modes[Math.floor(Math.random() * modes.length)];
    }

    lastMove = { from: { row: fromR, col: fromC }, to: { row: toR, col: toC } };
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;

    if (!wasCapture) {
      if (currentPlayer === 'black') noCaptureStreakBlack++;
      else noCaptureStreakWhite++;
    } else {
      if (currentPlayer === 'black') noCaptureStreakBlack = 0;
      else noCaptureStreakWhite = 0;
    }

    if (config.drawLimitEnabled) {
      const streak = currentPlayer === 'black' ? noCaptureStreakBlack : noCaptureStreakWhite;
      const limit = currentPlayer === 'black' ? config.drawLimitBlack : config.drawLimitWhite;
      if (streak >= limit && limit > 0) {
        endInDraw(cap(currentPlayer) + ' reached the move limit');
        return true;
      }
    }

    endTurn();
    return true;
  }

  function tryPromote(r, c, piece) {
    if (piece.king) return false;
    const promote = config.promoteAnyBack
      ? (r === 0 || r === config.boardSize - 1)
      : (piece.color === 'black' ? r === config.boardSize - 1 : r === 0);
    if (promote) {
      if (config.randomPromotion) {
        const modes = getActiveModes(config);
        piece.king = modes[Math.floor(Math.random() * modes.length)];
      } else {
        piece.king = config.kingMove;
      }
      return true;
    }
    return false;
  }

  function endTurn() {
    stopTimer();
    moveHistory.push({
      board: cloneBoard(board),
      currentPlayer: currentPlayer,
      captured: { black: captured.black, white: captured.white },
      turnNumber: turnNumber,
      lastMove: lastMove ? { from: { ...lastMove.from }, to: { ...lastMove.to } } : null,
      noCaptureStreakBlack: noCaptureStreakBlack,
      noCaptureStreakWhite: noCaptureStreakWhite,
    });

    currentPlayer = opp(currentPlayer);
    turnNumber++;

    const hasPieces = board.some(row => row.some(cell => cell && cell.color === currentPlayer));
    if (!hasPieces) {
      if (config.suicideMode) endGame(currentPlayer, 'wins by losing all pieces');
      else endGame(opp(currentPlayer), 'has lost all pieces');
      return;
    }

    const allMoves = getAllPlayerMoves(board, currentPlayer, config);
    if (allMoves.length === 0) {
      if (config.stalemateWins) endGame(currentPlayer, 'wins with no moves');
      else if (config.suicideMode) endGame(currentPlayer, 'wins by having no moves');
      else endGame(opp(currentPlayer), 'has no valid moves');
      return;
    }

    if (config.timer > 0) startTimer();
    renderBoard();
    renderUI();
    syncMPState();
  }

  function handleCellClick(r, c) {
    if (gamePhase !== 'playing' || undoRequestActive) return;

    if (multiJumpPos) {
      if (validMoves.some(m => m.row === r && m.col === c)) {
        makeMove(multiJumpPos.row, multiJumpPos.col, r, c);
      }
      return;
    }

    const cell = board[r][c];
    if (cell && cell.color === currentPlayer) {
      if (mp.role === 'host' && cell.color !== 'black') return;
      if (mp.role === 'guest' && cell.color !== 'white') return;
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
    validMoves = getMovesForPiece(board, r, c, config);
    if (config.mandatoryCapture) {
      const allMoves = getAllPlayerMoves(board, currentPlayer, config);
      if (allMoves.some(m => m.capture) && !validMoves.some(m => m.capture)) {
        validMoves = [];
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
  function endInDraw(reason) {
    gamePhase = 'gameover';
    stopTimer();
    dom.winnerText.textContent = 'Draw!';
    dom.winnerReason.textContent = reason || '';
    dom.gameOverModal.classList.remove('hidden');
    renderBoard();
    renderUI();
    syncMPState();
  }

  function endGame(winner, reason) {
    gamePhase = 'gameover';
    stopTimer();
    dom.winnerText.textContent = cap(winner) + ' Wins!';
    dom.winnerReason.textContent = reason;
    dom.gameOverModal.classList.remove('hidden');
    renderBoard();
    renderUI();
    syncMPState();
  }

  // ===== UNDO =====
  function requestUndo() {
    if (gamePhase !== 'playing' || moveHistory.length === 0 || undoRequestActive) return;

    const lastSnap = moveHistory[moveHistory.length - 1];
    const moveMaker = lastSnap.currentPlayer;
    const requester = opp(moveMaker);

    undoRequestActive = true;
    stopTimer();

    dom.undoRequestText.textContent = cap(requester) + ' wants to undo ' + cap(moveMaker) + "'s last move.";
    dom.undoResponder.textContent = cap(moveMaker) + ', do you approve?';

    dom.undoYesBtn.onclick = function () {
      dom.undoModal.classList.add('hidden');
      undoRequestActive = false;
      executeUndo();
    };

    dom.undoNoBtn.onclick = function () {
      dom.undoModal.classList.add('hidden');
      undoRequestActive = false;
      if (config.timer > 0) startTimer();
    };

    dom.undoModal.classList.remove('hidden');
  }

  function executeUndo() {
    if (moveHistory.length === 0) return;
    const snap = moveHistory.pop();
    board = snap.board;
    currentPlayer = snap.currentPlayer;
    captured = { ...snap.captured };
    turnNumber = snap.turnNumber;
    lastMove = snap.lastMove;
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;
    noCaptureStreakBlack = snap.noCaptureStreakBlack !== undefined ? snap.noCaptureStreakBlack : 0;
    noCaptureStreakWhite = snap.noCaptureStreakWhite !== undefined ? snap.noCaptureStreakWhite : 0;

    if (config.timer > 0) { stopTimer(); startTimer(); }
    dom.undoModal.classList.add('hidden');
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
        endGame(opp(currentPlayer), 'ran out of time');
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
  function renderBoard() {
    const size = config.boardSize;
    dom.board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    dom.board.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    dom.board.innerHTML = '';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell ' + (isDark(r, c) ? 'dark' : 'light');
        cell.dataset.row = r;
        cell.dataset.col = c;

        const isValid = validMoves.some(m => m.row === r && m.col === c);
        if (isValid) {
          const info = validMoves.find(m => m.row === r && m.col === c);
          cell.classList.add(info && info.capture ? 'highlight-capture' : 'highlight');
        }

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

  function renderUI() {
    const label = cap(currentPlayer);
    dom.turnText.textContent = label + "'s Turn";
    dom.turnText.className = currentPlayer + '-turn';
    dom.turnCounter.textContent = 'Turn ' + turnNumber;
    dom.capturedBlack.textContent = 'Black: ' + captured.black;
    dom.capturedWhite.textContent = 'White: ' + captured.white;

    if (config.timer > 0) {
      dom.timerDisplay.classList.remove('hidden');
      updateTimerDisplay();
    } else {
      dom.timerDisplay.classList.add('hidden');
    }
  }

  // ===== BOARD EDITOR =====
  function initEditor(optionalBoard) {
    const size = Math.max(2, +dom.editorBoardSize.value || 8);
    const rows = Math.max(0, +dom.editorRowsPerPlayer.value || 3);
    if (optionalBoard) {
      editorBoardData = cloneBoard(optionalBoard);
    } else {
      editorBoardData = createBoard({ boardSize: size, rowsPerPlayer: rows });
    }
    renderEditor();
  }

  const EDITOR_SYMBOLS = {
    standard: '♛', flying: '✦', queen: '♕',
    knight: '♞', crown: '♔', random: '❓',
  };

  function renderEditor() {
    const size = Math.max(2, +dom.editorBoardSize.value || 8);
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
    const size = Math.max(2, +dom.editorBoardSize.value || 8);
    editorBoardData = Array.from({ length: size }, () => Array(size).fill(null));
    renderEditor();
  }

  function resetEditor() {
    initEditor();
  }

  function getEditorBoard() {
    return editorBoardData ? cloneBoard(editorBoardData) : null;
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
  function startGame(cfg, optBoard) {
    config = { ...cfg };
    hideMPOverlay();

    // Guest uses received board
    if (optBoard) {
      board = cloneBoard(optBoard);
      config.boardSize = board.length;
    } else {
      const useEditor = editorBoardData !== null && !dom.editorSection.classList.contains('hidden');
      if (useEditor) {
        board = cloneBoard(editorBoardData);
        config.boardSize = board.length;
      } else {
        board = createBoard(config);
      }
    }

    if (config.startingPlayer === 'random') {
      currentPlayer = Math.random() < 0.5 ? 'black' : 'white';
    } else {
      currentPlayer = config.startingPlayer;
    }

    selectedCell = null;
    validMoves = [];
    captured = { black: 0, white: 0 };
    turnNumber = 1;
    multiJumpPos = null;
    lastMove = null;
    moveHistory = [];
    undoRequestActive = false;
    noCaptureStreakBlack = 0;
    noCaptureStreakWhite = 0;
    gamePhase = 'playing';

    applyVisual(config);
    if (config.timer > 0) { initTimer(); startTimer(); }
    else timerState = null;

    dom.settingsPanel.classList.add('hidden');
    dom.gamePanel.classList.remove('hidden');
    dom.gameOverModal.classList.add('hidden');
    dom.undoModal.classList.add('hidden');

    const allMoves = getAllPlayerMoves(board, currentPlayer, config);
    if (allMoves.length === 0) {
      if (config.stalemateWins || config.suicideMode) endGame(currentPlayer, 'wins by having no moves');
      else endGame(opp(currentPlayer), 'has no valid moves');
      return;
    }

    renderBoard();
    renderUI();
    updateRoleBadge();

    if (mp.role === 'host' && mp.connected) {
      sendMP('gameStart', {
        config: config,
        board: encodeBoard(board),
        currentPlayer: currentPlayer,
      });
    }
  }

  function resetToSettings() {
    gamePhase = 'settings';
    stopTimer();
    timerState = null;
    undoRequestActive = false;
    dom.gamePanel.classList.add('hidden');
    dom.settingsPanel.classList.remove('hidden');
    dom.gameOverModal.classList.add('hidden');
    dom.undoModal.classList.add('hidden');
    updateRoleBadge();
    if (mp.role === 'guest') {
      showMPOverlay('Host is in settings', 'Waiting for host to start the next game', false);
    }
  }

  // ===== MULTIPLAYER =====
  function genRoomId() {
    return Math.random().toString(36).slice(2, 8);
  }

  function showMPOverlay(text, detail, showSpinner) {
    dom.mpStatusText.textContent = text;
    dom.mpStatusDetail.textContent = detail || '';
    dom.mpSpinner.style.display = showSpinner !== false ? 'block' : 'none';
    dom.mpOverlay.classList.remove('hidden');
  }

  function hideMPOverlay() {
    dom.mpOverlay.classList.add('hidden');
  }

  function updateRoleBadge() {
    if (mp.role && dom.gamePanel && !dom.gamePanel.classList.contains('hidden')) {
      dom.roleBadge.textContent = mp.role === 'host' ? 'HOST' : 'GUEST';
      dom.roleBadge.className = 'role-badge ' + mp.role;
      dom.roleBadge.classList.remove('hidden');
    } else if (dom.roleBadge) {
      dom.roleBadge.classList.add('hidden');
    }
  }

  function sendMP(type, data) {
    if (mp.conn && mp.connected) {
      mp.conn.send({ type: type, data: data });
    }
  }

  function handleMPMessage(msg) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
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
          dom.roleBadge.classList.remove('hidden');
          dom.roleBadge.textContent = 'GUEST';
          dom.roleBadge.className = 'role-badge guest';
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
      board: encodeBoard(board),
      currentPlayer: currentPlayer,
      captured: captured,
      turnNumber: turnNumber,
      gamePhase: gamePhase,
      lastMove: lastMove || null,
      config: config,
      moveHistory: moveHistory,
      noCaptureStreakBlack: noCaptureStreakBlack,
      noCaptureStreakWhite: noCaptureStreakWhite,
      gameOver: isOver ? { winner: dom.winnerText.textContent, reason: dom.winnerReason.textContent, isDraw: dom.winnerText.textContent === 'Draw!' } : null,
    });
  }

  function applyRemoteState(data) {
    if (!data) return;
    board = decodeBoard(data.board) || board;
    currentPlayer = data.currentPlayer;
    captured = data.captured || { black: 0, white: 0 };
    turnNumber = data.turnNumber || 1;
    gamePhase = data.gamePhase || 'playing';
    noCaptureStreakBlack = data.noCaptureStreakBlack || 0;
    noCaptureStreakWhite = data.noCaptureStreakWhite || 0;
    moveHistory = data.moveHistory || [];
    config = data.config || config;
    if (data.lastMove) lastMove = data.lastMove;
    if (data.gameOver) {
      gamePhase = 'gameover';
      stopTimer();
      if (data.gameOver.isDraw) {
        dom.winnerText.textContent = 'Draw!';
      } else {
        dom.winnerText.textContent = data.gameOver.winner;
      }
      dom.winnerReason.textContent = data.gameOver.reason || '';
      dom.gameOverModal.classList.remove('hidden');
      renderBoard();
      renderUI();
      return;
    }
    undoRequestActive = false;
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;
    renderBoard();
    renderUI();
  }

  function applyRemoteGameStart(data) {
    if (!data) return;
    hideMPOverlay();
    config = data.config || DEFAULT_CONFIG;
    if (data.board) {
      board = decodeBoard(data.board) || createBoard(config);
    } else {
      board = createBoard(config);
    }
    currentPlayer = data.currentPlayer || 'black';
    captured = { black: 0, white: 0 };
    turnNumber = 1;
    selectedCell = null;
    validMoves = [];
    multiJumpPos = null;
    lastMove = null;
    moveHistory = [];
    noCaptureStreakBlack = 0;
    noCaptureStreakWhite = 0;
    gamePhase = 'playing';
    applyVisual(config);
    dom.settingsPanel.classList.add('hidden');
    dom.gamePanel.classList.remove('hidden');
    dom.gameOverModal.classList.add('hidden');
    dom.undoModal.classList.add('hidden');
    updateRoleBadge();
    renderBoard();
    renderUI();
  }

  function initHostPeer(roomId) {
    mp.role = 'host';
    mp.roomId = roomId;
    mp.peer = new Peer(roomId);
    mp.peer.on('open', (id) => {
      showMPOverlay('Waiting for opponent...', 'Share the link to invite someone', true);
    });
    mp.peer.on('connection', (conn) => {
      mp.conn = conn;
      mp.connected = true;
      conn.on('data', handleMPMessage);
      conn.on('close', () => {
        mp.connected = false;
        showMPOverlay('Connection lost', 'The opponent disconnected', false);
      });
      hideMPOverlay();
      if (gamePhase === 'settings') {
        showToast('Opponent connected! Press Start Game to begin');
        dom.generateLinkBtn.textContent = 'Room: ' + roomId;
        dom.generateLinkBtn.disabled = true;
        sendMP('settingsSync', getSettingsFromUI());
      }
      updateRoleBadge();
    });
    mp.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        genRoomId();
        mp.roomId = roomId = genRoomId();
        mp.peer = new Peer(roomId);
      }
    });
  }

  function initGuestPeer(roomId) {
    mp.role = 'guest';
    mp.roomId = roomId;
    showMPOverlay('Connecting...', 'Waiting for host', true);
    mp.peer = new Peer();
    mp.peer.on('open', () => {
      const conn = mp.peer.connect(roomId, { reliable: true });
      mp.conn = conn;
      conn.on('open', () => {
        mp.connected = true;
        hideMPOverlay();
        showMPOverlay('Connected!', 'Waiting for host to start the game...', false);
        updateRoleBadge();
      });
      conn.on('data', handleMPMessage);
      conn.on('close', () => {
        mp.connected = false;
        showMPOverlay('Connection lost', 'The host disconnected', false);
      });
    });
    mp.peer.on('error', () => {
      showMPOverlay('Could not connect', 'The host might not be available yet. Try again later.', false);
    });
  }

  // ===== EVENTS =====
  function bindEvents() {
    dom.startGameBtn.addEventListener('click', () => {
      if (mp.role === 'guest') { showToast('Only the host can start the game'); return; }
      startGame(getSettingsFromUI());
    });

    dom.generateLinkBtn.addEventListener('click', async () => {
      if (!mp.role && !mp.roomId) {
        const roomId = genRoomId();
        initHostPeer(roomId);
      }
      const url = generateShareURL();
      try { await navigator.clipboard.writeText(url); showToast('Link copied to clipboard!'); }
      catch { showToast(url, 4000); }
    });

    dom.playAgainBtn.addEventListener('click', () => {
      dom.gameOverModal.classList.add('hidden');
      if (mp.role === 'host') {
        resetToSettings();
        showToast('You can change settings, then press Start Game');
        if (mp.connected) {
          showMPOverlay('Waiting...', 'Press Start Game when ready', false);
        }
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

    dom.backToSettingsBtn.addEventListener('click', resetToSettings);
    dom.undoBtn.addEventListener('click', () => {
      if (mp.role) { showToast('Undo is not available in multiplayer'); return; }
      requestUndo();
    });

    dom.toggleEditorBtn.addEventListener('click', () => {
      const hidden = dom.editorSection.classList.toggle('hidden');
      dom.toggleEditorBtn.textContent = hidden ? 'Show Board Editor' : 'Hide Board Editor';
      if (!hidden && !editorBoardData) initEditor();
    });

    dom.toggleVisualBtn.addEventListener('click', () => {
      const hidden = dom.visualSection.classList.toggle('hidden');
      dom.toggleVisualBtn.textContent = hidden ? 'Show Visual Settings' : 'Hide Visual Settings';
    });

    dom.editorBoardSize.addEventListener('change', () => {
      if (!dom.editorSection.classList.contains('hidden')) initEditor();
    });
    dom.editorRowsPerPlayer.addEventListener('change', () => {
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
      const size = Math.max(2, +dom.settingBoardSize.value || 8);
      dom.settingBoardSize.value = size;
      document.querySelectorAll('.preset-group[data-target="setting-boardSize"] .preset-btn').forEach(b => {
        b.classList.toggle('active', +b.dataset.value === size);
      });
    });

    dom.settingRowsPerPlayer.addEventListener('change', () => {
      const val = Math.max(0, +dom.settingRowsPerPlayer.value || 0);
      dom.settingRowsPerPlayer.value = val;
      document.querySelectorAll('.preset-group[data-target="setting-rowsPerPlayer"] .preset-btn').forEach(b => {
        b.classList.toggle('active', +b.dataset.value === val);
      });
    });
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

    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const bdStr = params.get('bd');
    let decodedBoard = null;
    if (bdStr) decodedBoard = decodeBoard(bdStr);

    if (roomId) {
      document.title = 'Checkers - Joined Game';
      dom.generateLinkBtn.textContent = 'Joined Room';
      dom.generateLinkBtn.disabled = true;
      initGuestPeer(roomId);
      return;
    }

    const urlCfg = parseURLConfig();
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
