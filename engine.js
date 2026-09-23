/* Custom Checkers rules engine: board setup, move generation, forced capture, one
 * move step, win/loss detection, undo snapshots, share-link parsing.
 * Pure functions only (no DOM, no PeerJS). Loaded in the browser as
 * window.CheckersEngine and by Node for the unit tests (require('./engine.js')). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CheckersEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_SIZE = 4;
  const MAX_SIZE = 20;
  const ALL_KING_MODES = ['standard', 'flying', 'queen', 'knight', 'crown'];
  const KING_MODES = ALL_KING_MODES.concat('random');
  const STARTING_PLAYERS = ['black', 'white', 'random'];
  const TIMERS = [0, 30, 60, 120, 300, 600];
  const PIECE_STYLES = ['classic', 'modern', 'flat'];
  const COLOR_SCHEMES = ['classic', 'green', 'blue', 'highcontrast'];

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

  const BOOL_KEYS = ['mandatoryCapture', 'backwardMove', 'backwardCapture', 'kingsCanBeCaptured', 'promoteAnyBack',
    'randomPromotion', 'doubleCaptureKings', 'suicideMode', 'stalemateWins', 'drawLimitEnabled', 'drawLimitLinked',
    'highlightMoves', 'shuffleKingOnMove'];

  // ===== helpers =====
  const isDark = (r, c) => (r + c) % 2 === 1;
  const opp = (color) => (color === 'black' ? 'white' : 'black');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const onBoard = (cfg, r, c) => r >= 0 && r < cfg.boardSize && c >= 0 && c < cfg.boardSize;
  const cloneBoard = (b) => b.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  // ===== share-link encoding =====
  const PIECE_CHARS = {
    b: { color: 'black', king: false }, w: { color: 'white', king: false },
    s: { color: 'black', king: 'standard' }, f: { color: 'black', king: 'flying' }, q: { color: 'black', king: 'queen' },
    k: { color: 'black', king: 'knight' }, c: { color: 'black', king: 'crown' }, r: { color: 'black', king: 'random' },
    S: { color: 'white', king: 'standard' }, F: { color: 'white', king: 'flying' }, Q: { color: 'white', king: 'queen' },
    K: { color: 'white', king: 'knight' }, C: { color: 'white', king: 'crown' }, R: { color: 'white', king: 'random' },
  };
  const CHAR_FOR_PIECE = {};
  Object.keys(PIECE_CHARS).forEach((ch) => { const p = PIECE_CHARS[ch]; CHAR_FOR_PIECE[p.color + '|' + (p.king || '')] = ch; });

  function encodeBoard(b) {
    if (!b || b.length === 0) return '';
    let data = '';
    for (const row of b) for (const p of row) data += p ? (CHAR_FOR_PIECE[p.color + '|' + (p.king || '')] || '.') : '.';
    return b.length + ':' + data;
  }

  function decodeBoard(str) {
    if (typeof str !== 'string') return null;
    const colon = str.indexOf(':');
    if (colon === -1) return null;
    const size = parseInt(str.slice(0, colon), 10);
    const data = str.slice(colon + 1);
    if (isNaN(size) || size < MIN_SIZE || size > MAX_SIZE || data.length !== size * size) return null;
    const b = Array.from({ length: size }, () => Array(size).fill(null));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = PIECE_CHARS[data[r * size + c]];
        if (p && isDark(r, c)) b[r][c] = { ...p };
      }
    }
    return b;
  }

  // Settings from share-link parameters (URLSearchParams or a plain object of short
  // keys). Unknown values fall back to the defaults, numbers are clamped. Returns null
  // when the link carries no setting at all.
  function parseConfigParams(params) {
    const get = (k) => (typeof params.get === 'function' ? params.get(k) : params[k]);
    const raw = {};
    let has = false;
    for (const short of Object.keys(CONFIG_MAP)) {
      const v = get(short);
      if (v !== null && v !== undefined) { has = true; raw[CONFIG_MAP[short]] = String(v); }
    }
    if (!has) return null;
    const cfg = { ...DEFAULT_CONFIG };
    const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
    if (raw.boardSize !== undefined) cfg.boardSize = clampInt(raw.boardSize, MIN_SIZE, MAX_SIZE, DEFAULT_CONFIG.boardSize);
    if (raw.rowsPerPlayer !== undefined) cfg.rowsPerPlayer = clampInt(raw.rowsPerPlayer, 1, 10, DEFAULT_CONFIG.rowsPerPlayer);
    BOOL_KEYS.forEach((k) => { if (raw[k] !== undefined) cfg[k] = raw[k] === '1' || raw[k] === 'true'; });
    if (raw.kingMove !== undefined) cfg.kingMove = pick(raw.kingMove, KING_MODES, DEFAULT_CONFIG.kingMove);
    if (raw.startingPlayer !== undefined) cfg.startingPlayer = pick(raw.startingPlayer, STARTING_PLAYERS, DEFAULT_CONFIG.startingPlayer);
    if (raw.timer !== undefined) { const t = Number(raw.timer); cfg.timer = TIMERS.includes(t) ? t : DEFAULT_CONFIG.timer; }
    if (raw.drawLimitBlack !== undefined) cfg.drawLimitBlack = clampInt(raw.drawLimitBlack, 1, 999, DEFAULT_CONFIG.drawLimitBlack);
    if (raw.drawLimitWhite !== undefined) cfg.drawLimitWhite = clampInt(raw.drawLimitWhite, 1, 999, DEFAULT_CONFIG.drawLimitWhite);
    if (raw.pieceStyle !== undefined) cfg.pieceStyle = pick(raw.pieceStyle, PIECE_STYLES, DEFAULT_CONFIG.pieceStyle);
    if (raw.colorScheme !== undefined) cfg.colorScheme = pick(raw.colorScheme, COLOR_SCHEMES, DEFAULT_CONFIG.colorScheme);
    if (raw.activeKingModes !== undefined) {
      const modes = raw.activeKingModes.split(',').filter((m, i, a) => ALL_KING_MODES.includes(m) && a.indexOf(m) === i);
      cfg.activeKingModes = modes.length ? modes.join(',') : DEFAULT_CONFIG.activeKingModes;
    }
    return cfg;
  }

  // A PeerJS room id from a link: letters, digits and dashes only.
  function sanitizeRoomId(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    return /^[a-z0-9-]{3,40}$/.test(s) ? s : null;
  }

  // ===== setup =====
  function createBoard(cfg) {
    const b = Array.from({ length: cfg.boardSize }, () => Array(cfg.boardSize).fill(null));
    const rows = Math.min(cfg.rowsPerPlayer, Math.floor(cfg.boardSize / 2));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cfg.boardSize; c++) if (isDark(r, c)) b[r][c] = { color: 'black', king: false };
    for (let r = cfg.boardSize - rows; r < cfg.boardSize; r++)
      for (let c = 0; c < cfg.boardSize; c++) if (isDark(r, c)) b[r][c] = { color: 'white', king: false };
    return b;
  }

  function getActiveModes(cfg) {
    if (cfg && typeof cfg.activeKingModes === 'string') {
      const list = cfg.activeKingModes.split(',').filter((m) => ALL_KING_MODES.includes(m));
      if (list.length > 0) return list;
    }
    return ALL_KING_MODES;
  }

  // A "random" king rolls its mode once per turn (rollRandomKings) so every move list
  // computed during that turn agrees; without a roll it picks one on the spot.
  function getKingMode(piece, cfg, rng) {
    if (!piece.king) return null;
    if (piece.king === 'random') {
      if (piece.rolledMode) return piece.rolledMode;
      const modes = getActiveModes(cfg);
      return modes[Math.floor((rng || Math.random)() * modes.length)];
    }
    return piece.king;
  }

  function rollRandomKings(b, color, cfg, rng) {
    const modes = getActiveModes(cfg);
    for (const row of b) for (const p of row) {
      if (!p) continue;
      delete p.rolledMode;
      if (p.king === 'random' && p.color === color) p.rolledMode = modes[Math.floor((rng || Math.random)() * modes.length)];
    }
  }

  // ===== move generation =====
  function moveDirs(piece, cfg) {
    if (piece.king) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const f = piece.color === 'black' ? 1 : -1;
    const dirs = [[f, -1], [f, 1]];
    if (cfg.backwardMove) dirs.push([-f, -1], [-f, 1]);
    return dirs;
  }

  function captureDirs(piece, cfg) {
    if (piece.king) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const f = piece.color === 'black' ? 1 : -1;
    const d = [[f, -1], [f, 1]];
    if (cfg.backwardCapture) d.push([-f, -1], [-f, 1]);
    return d;
  }

  const capturable = (target, piece, cfg) => target && target.color !== piece.color && (cfg.kingsCanBeCaptured || !target.king);

  function stepOrTake(b, r, c, offsets, piece, cfg, moves) {
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (!onBoard(cfg, nr, nc)) continue;
      if (!b[nr][nc]) moves.push({ row: nr, col: nc, capture: false });
      else if (capturable(b[nr][nc], piece, cfg)) moves.push({ row: nr, col: nc, capture: true, capturedRow: nr, capturedCol: nc });
    }
  }

  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const EIGHT = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  // slide any distance; with jump, jumps one enemy piece and lands on any empty square behind it
  function slide(b, r, c, dr, dc, piece, cfg, moves, quiet) {
    let found = null;
    for (let s = 1; s < cfg.boardSize; s++) {
      const nr = r + dr * s, nc = c + dc * s;
      if (!onBoard(cfg, nr, nc)) break;
      const t = b[nr][nc];
      if (!found) {
        if (!t) { if (quiet) moves.push({ row: nr, col: nc, capture: false }); continue; }
        if (!capturable(t, piece, cfg)) break;
        found = [nr, nc];
      } else {
        if (t) break;
        moves.push({ row: nr, col: nc, capture: true, capturedRow: found[0], capturedCol: found[1] });
      }
    }
  }

  function getMovesForPiece(b, r, c, cfg, rng) {
    const piece = b[r][c];
    if (!piece) return [];
    const moves = [];
    const km = getKingMode(piece, cfg, rng);
    if (km === 'knight') { stepOrTake(b, r, c, KNIGHT, piece, cfg, moves); return moves; }
    if (km === 'crown') { stepOrTake(b, r, c, EIGHT, piece, cfg, moves); stepOrTake(b, r, c, KNIGHT, piece, cfg, moves); return moves; }
    if (km === 'queen') { for (const [dr, dc] of EIGHT) slide(b, r, c, dr, dc, piece, cfg, moves, true); return moves; }
    if (km === 'flying') {
      for (const [dr, dc] of moveDirs(piece, cfg)) slide(b, r, c, dr, dc, piece, cfg, moves, true);
      return moves;
    }
    for (const [dr, dc] of moveDirs(piece, cfg)) {
      const nr = r + dr, nc = c + dc;
      if (onBoard(cfg, nr, nc) && !b[nr][nc]) moves.push({ row: nr, col: nc, capture: false });
    }
    for (const [dr, dc] of captureDirs(piece, cfg)) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!onBoard(cfg, mr, mc) || !capturable(b[mr][mc], piece, cfg)) continue;
      if (onBoard(cfg, lr, lc) && !b[lr][lc]) moves.push({ row: lr, col: lc, capture: true, capturedRow: mr, capturedCol: mc });
    }
    return moves;
  }

  // Every move of one side. With mandatory capture on and a capture available anywhere,
  // only captures are returned.
  function getAllPlayerMoves(b, color, cfg, rng) {
    const all = [];
    for (let r = 0; r < cfg.boardSize; r++)
      for (let c = 0; c < cfg.boardSize; c++)
        if (b[r][c] && b[r][c].color === color)
          for (const m of getMovesForPiece(b, r, c, cfg, rng)) all.push({ fromRow: r, fromCol: c, ...m });
    if (cfg.mandatoryCapture && all.some((m) => m.capture)) return all.filter((m) => m.capture);
    return all;
  }

  // The moves the piece on (r, c) may actually make: while any capture is required,
  // captures only (and none at all for a piece that cannot capture).
  function legalMovesForPiece(b, r, c, cfg, rng) {
    const piece = b[r][c];
    if (!piece) return [];
    const own = getMovesForPiece(b, r, c, cfg, rng);
    if (!cfg.mandatoryCapture) return own;
    if (own.some((m) => m.capture)) return own.filter((m) => m.capture);
    return mustCapturePieces(b, piece.color, cfg, rng).length ? [] : own;
  }

  // Squares of the pieces that can capture right now (what a forced capture points at).
  function mustCapturePieces(b, color, cfg, rng) {
    const out = [];
    for (let r = 0; r < cfg.boardSize; r++)
      for (let c = 0; c < cfg.boardSize; c++)
        if (b[r][c] && b[r][c].color === color && getMovesForPiece(b, r, c, cfg, rng).some((m) => m.capture)) out.push({ row: r, col: c });
    return out;
  }

  function getPieceCaptures(b, r, c, cfg, rng) {
    return getMovesForPiece(b, r, c, cfg, rng).filter((m) => m.capture);
  }

  // ===== one step =====
  function tryPromote(r, piece, cfg, rng) {
    if (piece.king) return false;
    const promote = cfg.promoteAnyBack
      ? (r === 0 || r === cfg.boardSize - 1)
      : (piece.color === 'black' ? r === cfg.boardSize - 1 : r === 0);
    if (!promote) return false;
    if (cfg.randomPromotion) {
      const modes = getActiveModes(cfg);
      piece.king = modes[Math.floor((rng || Math.random)() * modes.length)];
    } else {
      piece.king = cfg.kingMove;
    }
    return true;
  }

  // Plays one step (a move or one jump of a chain) on board b, in place.
  // Returns { wasCapture, removedColor, promoted, more } where removedColor is the colour
  // of a piece taken off the board (null when a king was only downgraded) and more lists
  // the follow-up captures of a chain (empty when the turn is over).
  function applyStep(b, fromR, fromC, move, cfg, rng) {
    const piece = b[fromR][fromC];
    let wasCapture = false, removedColor = null;
    if (move.capture) {
      wasCapture = true;
      const taken = b[move.capturedRow][move.capturedCol];
      if (taken) {
        if (cfg.doubleCaptureKings && taken.king) taken.king = false;
        else { removedColor = taken.color; b[move.capturedRow][move.capturedCol] = null; }
      }
    }
    b[move.row][move.col] = piece;
    b[fromR][fromC] = null;
    const promoted = tryPromote(move.row, piece, cfg, rng);
    const jumpsOnce = piece.king === 'knight' || piece.king === 'crown' || piece.rolledMode === 'knight' || piece.rolledMode === 'crown';
    const more = wasCapture && !promoted && !jumpsOnce ? getPieceCaptures(b, move.row, move.col, cfg, rng) : [];
    return { wasCapture, removedColor, promoted, more };
  }

  // Result for the side about to move, or null while the game goes on. The reason names
  // the player it is about ("White has no pieces left"), never just the winner.
  function checkOutcome(b, toMove, cfg, rng) {
    const hasPieces = b.some((row) => row.some((p) => p && p.color === toMove));
    const who = cap(toMove);
    if (!hasPieces) {
      return cfg.suicideMode
        ? { winner: toMove, reason: `${who} has lost all their pieces, which wins in Suicide Mode` }
        : { winner: opp(toMove), reason: `${who} has no pieces left` };
    }
    if (getAllPlayerMoves(b, toMove, cfg, rng).length === 0) {
      if (cfg.stalemateWins) return { winner: toMove, reason: `${who} has no moves left, which wins with Stalemate Wins` };
      if (cfg.suicideMode) return { winner: toMove, reason: `${who} has no moves left, which wins in Suicide Mode` };
      return { winner: opp(toMove), reason: `${who} has no valid moves` };
    }
    return null;
  }

  // ===== undo =====
  // A snapshot is taken at the start of a turn, before the first step, so undoing
  // restores the position and gives the turn back to the player who moved.
  function snapshot(state) {
    return {
      board: cloneBoard(state.board),
      currentPlayer: state.currentPlayer,
      captured: { black: state.captured.black, white: state.captured.white },
      turnNumber: state.turnNumber,
      lastMove: state.lastMove ? { from: { ...state.lastMove.from }, to: { ...state.lastMove.to } } : null,
      noCaptureStreakBlack: state.noCaptureStreakBlack || 0,
      noCaptureStreakWhite: state.noCaptureStreakWhite || 0,
    };
  }

  return {
    MIN_SIZE, MAX_SIZE, ALL_KING_MODES, KING_MODES, CONFIG_MAP, DEFAULT_CONFIG,
    isDark, opp, cap, cloneBoard, clampInt,
    encodeBoard, decodeBoard, parseConfigParams, sanitizeRoomId,
    createBoard, getActiveModes, getKingMode, rollRandomKings,
    getMovesForPiece, getAllPlayerMoves, legalMovesForPiece, mustCapturePieces, getPieceCaptures,
    tryPromote, applyStep, checkOutcome, snapshot,
  };
});
