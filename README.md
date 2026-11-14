# Mixed Doubles Tournament

Offline browser app built with Angular and TypeScript. Tournament format and rules (German): [HOW_TO_PLAY.md](HOW_TO_PLAY.md).

## Use the app

Open the GitHub Pages site in Chrome or Chromium, or download [offline.html](release/offline.html) for offline use. Create or open a tournament file; changes are saved automatically.

## Development

Requirements: Node.js (tested with 24.15) and npm.

```bash
npm ci
npm start       # Development server
npm test        # Rules and component tests
npm run build   # Updates dist/offline.html and release/offline.html
npm run check   # Formatting, linting, tests, and build
```
