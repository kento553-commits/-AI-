# AI Thought Receipt Bridge

Chrome extension prototype for sending the current AI conversation page to the local web app.

## Load in Chrome

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this `chrome-extension` folder.

## Flow

1. Open an AI conversation page.
2. Click the extension icon.
3. Click `思考レシート化する`.
4. The extension opens `http://localhost:5173/?draft=...`.
5. The web app reads the `draft` parameter and shows a thought receipt candidate.

The web app URL is currently fixed to `http://localhost:5173/` in `popup.js`.
