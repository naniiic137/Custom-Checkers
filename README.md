# Custom Checkers

**Checkers with the rules unlocked:** pick the board size, choose from 6 king movement modes, tune 20+ settings, design your own starting position, and play a friend online over a peer-to-peer connection. It's a static web app with no build step and no backend.

![Game in progress: a queen king selected, with capture moves highlighted in red and normal moves in purple](docs/screenshots/game.png)

| Rules panel | Board editor (10×10, custom kings) |
| --- | --- |
| ![Settings panel with board size presets, king modes and rule toggles](docs/screenshots/settings.png) | ![Board editor with a 10x10 board and flying, queen and knight kings placed](docs/screenshots/editor.png) |

## Features

### 6 king movement modes

| Mode | Icon | Movement |
| --- | --- | --- |
| Standard | ♛ | One step diagonally (traditional checkers) |
| Flying | ✦ | Slides any distance diagonally, jumps over pieces |
| Queen | ♕ | Slides any distance in 8 directions |
| Knight | ♞ | L-shaped jumps like a chess knight |
| Crown | ♔ | One step in any direction + knight jumps |
| Random | ❓ | Picks a random active mode each move |

### Game rules
- **Board:** any board size via a number input (with 6 / 8 / 10 / 12 presets) and adjustable piece rows per player
- **Active King Types:** chips that choose which modes are used for promotion and randomness
- **King variants:** Shuffle on Move (the king changes mode after each move), Random Promotion, Double Capture Kings (downgraded on the first capture, removed on the second), Kings Can Be Captured
- **Pawn variants:** Backward Move, Backward Capture, Promote on Any Back Rank
- **Win conditions:** Suicide Mode (the first player to lose all pieces wins), Stalemate Wins (a player with no moves wins instead of losing)
- **Draw Limit:** per-player move limits without a capture, with linked or independent inputs
- **Mandatory Capture** toggle, multi-jump chains, **Starting Player** (Black, White or Random)
- **Per-player timer:** 30s, 1m, 2m, 5m or 10m

### Board editor
- Hidden behind a toggle, with its own board size and piece rows
- Click dark squares to place or remove pieces, choosing the colour (Black/White) and king mode (None/Standard/Flying/Queen/Knight/Crown/Random)
- **Clear Board** and **Default** buttons
- The edited board is used when the game starts and is included in share links

### Visuals
- 4 colour schemes: Classic, Green, Blue, High Contrast
- 3 piece styles: Classic, Modern, Flat
- A distinct icon for each king mode
- Optional highlighting of valid moves: purple for moves, red for captures, plus markers for the selected piece and the last move
- Mobile-first responsive layout

### Undo
- An undo request needs the opponent's approval in a modal
- Full move history kept as board snapshots
- Turned off in multiplayer

## How multiplayer works

Multiplayer runs **peer-to-peer over WebRTC** using [PeerJS](https://peerjs.com/). The game has no server of its own.

1. The host clicks **Generate Share Link**. The app creates a random room ID, registers it as the host's PeerJS ID, and copies a link to the clipboard.
2. The link carries every setting as short URL query parameters, plus the custom board (`bd`) and the room ID (`room`).
3. The guest opens the link and connects directly to the host's peer.
4. The host presses **Start Game**. The host plays Black and the guest plays White, and each player can only move their own pieces.
5. After every move, the full game state (board, turn, captures, move history, game-over status) is sent to the other player.
6. **Play Again** keeps the same room, so the host can change settings between games.

Share links also work without multiplayer. A link with settings (and, optionally, a custom board) opens straight into a game with those rules.

## Quick start

The app is plain HTML, CSS and JavaScript, so there is nothing to install or build. It has to be served over HTTP (not opened as `file://`):

```bash
git clone https://github.com/naniiic137/Custom-Checkers.git
cd Custom-Checkers
python -m http.server 8000      # or: npx http-server -p 8000
```

Then open <http://localhost:8000>.

### Play
- **Pass-and-play:** configure the rules and press **Start Game**. Both players take turns on the same device.
- **Online:** click **Generate Share Link**, send the copied URL to a friend, and press **Start Game** once they have connected.
- **Custom position:** click **Show Board Editor**, set the size, place pieces and kings, then start the game or generate a link.

### Deploy
Any static host works: GitHub Pages, Netlify, etc. There's no build command, and the publish directory is the repository root. Multiplayer needs HTTPS on a public host, which both of these provide.

## Project structure

```
Custom-Checkers/
├── index.html          # Settings panel, game panel, board editor, modals, multiplayer overlay
├── style.css           # Mobile-first styles, 4 colour schemes, 3 piece styles, king icons
├── script.js           # Rules engine, move generation, editor, undo, timer, share links, PeerJS sync
└── docs/screenshots/   # README images
```

## Tech stack

- **HTML5 / CSS3** (custom properties, CSS Grid for the board)
- **Vanilla JavaScript** (ES6+, no framework, no bundler)
- **PeerJS 1.5.4** (WebRTC data channels) loaded from a CDN
- **URL query parameters** for shareable game configurations

## Author

Hamza Ben Ismail ([@naniiic137](https://github.com/naniiic137))
