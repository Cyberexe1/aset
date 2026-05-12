# ASET Browser Extension

Verify scientific claims on any webpage against 1.2M+ peer-reviewed papers.

## Install (Developer Mode)

1. Open Chrome/Edge → `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `aset-extension` folder
5. Extension is installed

## Generate Icons

```bash
cd icons
npm install canvas
node create-icons.js
```

## Usage

1. Select any text on any webpage
2. Right-click → "Verify with ASET"
3. Panel appears with trust score + supporting papers

## Files

- `manifest.json` — Extension config (Manifest V3)
- `background.js` — Service worker, handles context menu + API calls
- `content.js` — Injected into pages, shows verification panel
- `content.css` — Panel styling
- `popup.html` — Extension popup (click the icon)
- `icons/` — Extension icons

## API

Calls `https://api.aset-ai.tech`:
- `POST /api/get-sources` — Find relevant papers
- `POST /api/verify-claim` — AI verification
