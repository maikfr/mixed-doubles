# Mixed Doubles Tournament

Offline browser app built with Angular and TypeScript. Tournament format and rules (German): [HOW_TO_PLAY.md](HOW_TO_PLAY.md).

## Use the app

**No programming or installation required.**

1. Download and extract the repository.
2. Open **`release/offline.html`** in Chrome or Chromium.
3. Create or open a tournament file. Changes are saved to it automatically.

The app works offline without a server. Keep the tournament management view open for live updates to the tournament overview. Tournament data is stored in the selected file; the browser remembers only the file connection.

## Development

Requirements: Node.js (tested with 24.15) and npm.

```bash
npm ci
npm start       # Development server
npm test        # Rules and component tests
npm run build   # Updates dist/offline.html and release/offline.html
npm run check   # Formatting, linting, tests, and build
```

`npm run format` formats the project. Code, technical documentation, comments, and diagnostics use English. The browser interface, user-facing messages, and `HOW_TO_PLAY.md` use German. Tests retain German UI expectations; legacy backup identifiers remain supported for compatibility.
