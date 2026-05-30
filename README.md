# Custom Checkers

A fully customizable checkers game with extensive rules, board editor, shareable links, and real-time multiplayer.

## Features

### Game Rules
- Adjustable board size (custom number input, no limits)
- Adjustable piece rows per player
- 6 king movement modes: Standard, Flying, Queen, Knight, Crown, Random
- Active King Types chips — select which modes are active
- Shuffle on Move — king changes mode randomly after each move
- Backward Move — pawns can move one step backward
- Backward Capture — pawns can capture backward
- Kings Can Be Captured toggle
- Promote on Any Back Rank
- Random Promotion — promoted pieces get a random king mode
- Double Capture Kings — king downgraded on first capture, removed on second
- Suicide Mode — first to lose all pieces wins
- Stalemate Wins — player with no moves wins instead of losing
- Draw Limit — per-player move limits with linked/unlinked inputs
- Mandatory Capture toggle
- Starting Player: Black, White, or Random (default)
- Per-player timer (30s to 10m)

### Board Editor
- Hidden behind toggle button
- Own independent board size and piece rows
- Place/remove pieces on dark squares
- Piece color selector (Black/White) and king mode (None/Standard/Flying/Queen/Knight/Crown/Random)
- Clear Board and Default buttons
- Editor board data included in share links

### Visual
- 4 color schemes: Classic, Green, Blue, High Contrast
- 3 piece styles: Classic, Modern, Flat
- Distinct king mode icons: ♛ Standard, ✦ Flying, ♕ Queen, ♞ Knight, ♔ Crown, ❓ Random
- Highlight valid moves toggle
- Mobile-first responsive design

### Multiplayer
- Real-time peer-to-peer via WebRTC (PeerJS)
- Host creates a room, shares a link
- Guest joins and both play on their own devices
- Turn-based with role enforcement (host = black, guest = white)
- Full state sync after every move
- "Play Again" keeps the same room — host can change settings between games
- No backend server needed — works on static hosting

### Sharing
- Shareable links via URL query parameters
- All settings encoded (board size, rules, king modes, etc.)
- Board editor data encoded in `bd` parameter
- Room ID in `room` parameter for multiplayer

### Undo System
- Request undo with opponent approval modal
- Full move history with snapshots
- Disabled in multiplayer mode

## How to Use

### Single Player (Pass-and-Play)
1. Open `index.html` in a browser (must be served over HTTP)
2. Configure game settings
3. Press **Start Game**
4. Both players take turns on the same device

### Multiplayer
1. Host configures settings
2. Host clicks **Generate Share Link**
3. Host sends the copied URL to the guest
4. Guest opens the URL in their browser
5. Host clicks **Start Game** once both are connected
6. Each player can only move their own pieces

### Board Editor
1. Click **Show Board Editor**
2. Set editor board size and piece rows
3. Click dark squares to place/remove pieces
4. Use piece color and king mode selectors
5. Board is used when **Start Game** is clicked

## Files

- `index.html` — Main HTML with settings panel, game panel, modals, board editor, and multiplayer overlay
- `style.css` — Mobile-first responsive CSS with 4 color schemes, 3 piece styles, king mode icons
- `script.js` — All game logic, 20+ settings, board editor, undo system, timer, multiplayer, link sharing

## Deploy to Netlify

No build step required:

1. Push this repo to GitHub
2. Log in to [Netlify](https://app.netlify.com)
3. Click **Add new site** → **Import an existing project**
4. Connect your GitHub repository
5. Deploy settings:
   - **Branch:** `main`
   - **Build command:** (leave empty)
   - **Publish directory:** `/`
6. Click **Deploy site**

Netlify will serve the static files directly. Multiplayer (PeerJS WebRTC) works on HTTPS automatically.
