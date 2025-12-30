Healthy Harbour Watchers — static site - WIP

This repository contains a small static website for the Healthy Harbour Watchers group

Quick start (open locally):

- Option A: Open `index.html` directly in your browser (file://). Some features (fetching JSON) work much better with a local HTTP server.

- Option B: Run a quick static server (Python):

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

Files of interest:
- `index.html` — landing page with image carousel (see `js/carousel.js`).
- `locations.html` — map of sampling locations (Leaflet). Data source: `data/locations.json`.
- `data.html` — data viewer and chart (Chart.js). Data source: `data/sample-data.json`.
- `js/main.js` — code that wires map, list, table and chart. Looks for `?loc=<id>` on `data.html`.

Notes:
- The site uses CDN for Leaflet and Chart.js to keep the repo minimal.

Supabase integration
- Created a file `js/config.js` set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to project values.
- The site will automatically use Supabase when `js/config.js` contains valid values. The database should expose two tables matching these shapes:

Feedback: tell me which features you want next
=======
Healthy Harbour Watchers Website
