# Mixed Doubles Tournament

Offline browser app built with Angular and TypeScript. Tournament format and rules (German): [HOW_TO_PLAY.md](HOW_TO_PLAY.md).

## Use the app

Use the published GitHub Pages site in Chrome or Chromium.

## Development

Requirements: Node.js (tested with 24.15) and npm.

```bash
nvm use         # Select the project's Node.js version when using nvm
npm ci
npm start       # Development server
npm test        # Rules and component tests
npm run test:e2e # Complete tournament in Chrome (must be installed)
npm run build   # Compile app under dist/offline.html
npm run check   # Formatting, linting, tests, and build
```
