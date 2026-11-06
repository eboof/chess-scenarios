# Chess Scenarios

A small web app for the iPad that lets you set up positions from chess books (or anywhere else),
save them to a library, and play them out against the computer.

- **Board and pieces:** Lichess's board (chessground) with its brown board and cburnett pieces
- **Rules:** chess.js
- **Computer:** Stockfish 19 (single-threaded "lite" WebAssembly build), running entirely in the browser
- **Storage:** the browser's local storage on the device. Use **Export → Backup file** now and then
  to keep a copy.

## Using it

- **Library:** lists your saved positions. Tap one to play it, or use **New position**, **Import** and **Export**.
- **Editor:** pick a piece from the palette and tap squares to place it (tap again to remove it),
  or use ✋ to drag pieces around. Set the side to move, castling rights and the move number. You can
  also paste a FEN, or use **From PGN…** to paste a game and choose the position after any move.
- **Play:** choose your side and the computer level (500 / 1000 / 1500 / 2000). If you choose the side
  that isn't to move, the computer moves first. You also get undo, restart, flip, a hint (full-strength
  engine), the book solution (if you entered one), stepping back through moves, and PGN copy/save.
- **Import:** accepts a backup file, or a `.pgn` file with one or more games. Each game becomes a
  position, using either its starting position (good for puzzle files) or its final position.

Engine levels are approximate. Stockfish can't limit itself below about 1320, so the 500 and 1000
levels also play some random moves. Adjust them in `src/levels.ts`.

## Development

```sh
npm install
npm run dev        # http://localhost:5173, also reachable from the iPad on the same Wi-Fi
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run check-fens # check that the sample positions are valid
```

From the iPad you can open the dev server at `http://<your-mac's-ip>:5173`. Offline mode and
"install" only work over HTTPS, so use the GitHub Pages version for that.

## Deploying to GitHub Pages

1. Create a GitHub repo and push this project to the `main` branch.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Every push to `main` builds and publishes to `https://<user>.github.io/<repo>/`.

On the iPad, open that URL in Safari and choose **Share → Add to Home Screen**.

## License

GPL-3.0-or-later. Chessground and Stockfish are both GPL.
