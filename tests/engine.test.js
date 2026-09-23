// Unit tests for the rules engine. Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const cfg = (over) => ({ ...E.DEFAULT_CONFIG, ...over });
const empty = (n) => Array.from({ length: n }, () => Array(n).fill(null));
const P = (color, king) => ({ color, king: king || false });
const squares = (moves) => moves.map((m) => `${m.row},${m.col}${m.capture ? 'x' : ''}`).sort();

test('the starting position has the right pieces on dark squares', () => {
  const b = E.createBoard(cfg());
  let black = 0, white = 0;
  b.forEach((row, r) => row.forEach((p, c) => {
    if (!p) return;
    assert.ok(E.isDark(r, c));
    if (p.color === 'black') black++; else white++;
  }));
  assert.equal(black, 12);
  assert.equal(white, 12);
  // rows are capped at half the board
  const small = E.createBoard(cfg({ boardSize: 4, rowsPerPlayer: 5 }));
  assert.equal(small.flat().filter(Boolean).length, 8);
});

test('pawns move forward only; black moves down, white moves up', () => {
  const c = cfg();
  const b = empty(8);
  b[2][3] = P('black'); b[5][4] = P('white');
  assert.deepEqual(squares(E.getMovesForPiece(b, 2, 3, c)), ['3,2', '3,4']);
  assert.deepEqual(squares(E.getMovesForPiece(b, 5, 4, c)), ['4,3', '4,5']);
  const back = cfg({ backwardMove: true });
  assert.equal(E.getMovesForPiece(b, 2, 3, back).length, 4);
});

test('a flying king with a capture available may only capture', () => {
  const c = cfg({ boardSize: 8 });
  const b = empty(8);
  b[7][0] = P('black', 'flying');
  b[4][3] = P('white');
  const all = E.getMovesForPiece(b, 7, 0, c);
  assert.ok(all.some((m) => !m.capture), 'the raw list has slides');
  const legal = E.legalMovesForPiece(b, 7, 0, c);
  assert.ok(legal.length > 0);
  assert.ok(legal.every((m) => m.capture), 'only captures are legal');
  assert.deepEqual(squares(legal), ['0,7x', '1,6x', '2,5x', '3,4x']);
  // with mandatory capture off, slides stay legal
  assert.ok(E.legalMovesForPiece(b, 7, 0, cfg({ mandatoryCapture: false })).some((m) => !m.capture));
});

test('a piece that cannot capture has no moves while another piece must capture', () => {
  const c = cfg();
  const b = empty(8);
  b[2][1] = P('black'); b[3][2] = P('white');   // black on 2,1 can take 3,2
  b[0][5] = P('black');                           // black on 0,5 has only slides
  assert.deepEqual(E.legalMovesForPiece(b, 0, 5, c), []);
  assert.deepEqual(E.mustCapturePieces(b, 'black', c), [{ row: 2, col: 1 }]);
  assert.ok(E.getAllPlayerMoves(b, 'black', c).every((m) => m.capture));
});

test('applyStep captures, promotes and reports chains', () => {
  const c = cfg();
  const b = empty(8);
  b[2][1] = P('black'); b[3][2] = P('white'); b[5][4] = P('white');
  const [take] = E.legalMovesForPiece(b, 2, 1, c);
  const r = E.applyStep(b, 2, 1, take, c);
  assert.equal(r.wasCapture, true);
  assert.equal(r.removedColor, 'white');
  assert.equal(b[3][2], null);
  assert.equal(b[4][3].color, 'black');
  assert.deepEqual(squares(r.more), ['6,5x']);  // the chain continues
  const b2 = empty(8);
  b2[6][1] = P('black');
  const r2 = E.applyStep(b2, 6, 1, { row: 7, col: 2, capture: false }, cfg({ kingMove: 'queen' }));
  assert.equal(r2.promoted, true);
  assert.equal(b2[7][2].king, 'queen');
});

test('double-capture kings are downgraded before they are removed', () => {
  const c = cfg({ doubleCaptureKings: true });
  const b = empty(8);
  b[2][1] = P('black'); b[3][2] = P('white', 'standard');
  const r = E.applyStep(b, 2, 1, E.legalMovesForPiece(b, 2, 1, c)[0], c);
  assert.equal(r.removedColor, null);
  assert.deepEqual(b[3][2], { color: 'white', king: false });
});

test('undo snapshot is taken before the move and gives the turn back to the mover', () => {
  const c = cfg();
  const state = { board: E.createBoard(c), currentPlayer: 'black', captured: { black: 0, white: 0 }, turnNumber: 1, lastMove: null };
  const history = [];
  // first move of the game
  history.push(E.snapshot(state));
  const mv = E.getAllPlayerMoves(state.board, 'black', c)[0];
  E.applyStep(state.board, mv.fromRow, mv.fromCol, mv, c);
  state.currentPlayer = 'white'; state.turnNumber = 2;
  // undo
  const snap = history.pop();
  assert.equal(snap.currentPlayer, 'black', 'the mover plays again, not a second move for the same side after the opponent');
  assert.equal(snap.turnNumber, 1);
  assert.deepEqual(snap.board, E.createBoard(c), 'the position is the one before the move');
  // the snapshot is a copy, not a view of the live board
  assert.notEqual(snap.board, state.board);
});

test('checkOutcome names the losing side in the reason', () => {
  const c = cfg();
  const b = empty(8);
  b[0][1] = P('black');
  let o = E.checkOutcome(b, 'white', c);
  assert.equal(o.winner, 'black');
  assert.equal(o.reason, 'White has no pieces left');
  o = E.checkOutcome(b, 'white', cfg({ suicideMode: true }));
  assert.equal(o.winner, 'white');
  // blocked: a white pawn with no moves
  const b2 = empty(8);
  b2[0][1] = P('white'); b2[5][4] = P('black');
  o = E.checkOutcome(b2, 'white', c);
  assert.equal(o.winner, 'black');
  assert.match(o.reason, /^White has no valid moves/);
  assert.equal(E.checkOutcome(b2, 'white', cfg({ stalemateWins: true })).winner, 'white');
  assert.equal(E.checkOutcome(E.createBoard(c), 'black', c), null);
});

test('share-link parameters are validated and clamped', () => {
  const q = (s) => E.parseConfigParams(new URLSearchParams(s));
  assert.equal(q(''), null);
  assert.equal(q('sz=99').boardSize, 20);
  assert.equal(q('sz=1').boardSize, 4);
  assert.equal(q('sz=abc').boardSize, 8);
  assert.equal(q('rp=50').rowsPerPlayer, 10);
  assert.equal(q('sp=purple').startingPlayer, 'random');
  assert.equal(q('sp=white').startingPlayer, 'white');
  assert.equal(q('km=dragon').kingMove, 'standard');
  assert.equal(q('km=knight').kingMove, 'knight');
  assert.equal(q('tm=7').timer, 0);
  assert.equal(q('tm=300').timer, 300);
  assert.equal(q('hm=0').highlightMoves, false);
  assert.equal(q('ak=queen,bogus,queen').activeKingModes, 'queen');
  assert.equal(q('ak=bogus').activeKingModes, E.DEFAULT_CONFIG.activeKingModes);
  assert.equal(q('cs=<script>').colorScheme, 'classic');
  assert.equal(q('db=-5').drawLimitBlack, 1);
});

test('board codes round-trip and reject bad sizes', () => {
  const b = E.createBoard(cfg({ boardSize: 10 }));
  b[4][5] = P('white', 'crown');
  assert.deepEqual(E.decodeBoard(E.encodeBoard(b)), b);
  assert.equal(E.decodeBoard('2:.b..'), null);
  assert.equal(E.decodeBoard('30:' + '.'.repeat(900)), null);
  assert.equal(E.decodeBoard('8:short'), null);
  assert.equal(E.sanitizeRoomId('cc-abc123'), 'cc-abc123');
  assert.equal(E.sanitizeRoomId('<x>'), null);
});

test('a random king keeps one rolled mode for the whole turn', () => {
  const c = cfg({ activeKingModes: 'knight,queen' });
  const b = empty(8);
  b[4][4] = P('black', 'random');
  let n = 0;
  E.rollRandomKings(b, 'black', c, () => (n++ % 2 ? 0.9 : 0.1));
  const mode = b[4][4].rolledMode;
  assert.ok(['knight', 'queen'].includes(mode));
  for (let i = 0; i < 5; i++) assert.equal(E.getKingMode(b[4][4], c), mode);
  // the roll never leaks into a share code
  assert.ok(!E.encodeBoard(b).includes('undefined'));
});
