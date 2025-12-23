<<<<<<< HEAD
Healthy Harbour Watchers — static site

This repository contains a small static website for the Healthy Harbour Watchers group and example data for Otago Harbour.

Quick start (open locally):

- Option A: Open `index.html` directly in your browser (file://). Some features (fetching JSON) work better with a local HTTP server.

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
- Replace images in `assets/` with real photos named harbour1.svg/harbour2.svg/harbour3.svg or update `index.html`.
- To add more sample locations or measurements, edit JSON files in `data/`.

Supabase integration (optional)
- Create a file `js/config.js` (a placeholder `js/config.js` is included) and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to your project values.
- The site will automatically use Supabase when `js/config.js` contains valid values. The database should expose two tables matching these shapes:

	- `locations(id text primary key, name text, lat double precision, lng double precision)`
	- `samples(id bigserial primary key, date date, parameter text, value double precision, unit text, loc text references locations(id))`

- For public read-only access you can enable select policies or allow anon select; keep service_role keys out of the client.

See `js/config.js` for the example placeholder values. After filling it, reload `data.html` or `locations.html` to fetch from Supabase instead of the local JSON files.

Feedback: tell me which features you want next (filters, upload, real dataset integration).
=======
# healthy-harbour-watchers
Healthy Harbour Watchers Website
>>>>>>> 221c378dbf5a6f017d207e16a180a4e52bbf1b5e
