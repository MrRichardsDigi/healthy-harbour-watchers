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
- `handbook.html` — mobile-friendly guide to handbook topics and page references, with a link to the original 2014 handbook in Google Docs. The original document's sharing settings determine who can open it.
- The handbook topic cards expand to show short guidance. They do not replace the complete approved procedures or safety instructions in the original handbook.
- `data/locations.json` contains the site's location list and the `currentSite` numbers for the eight current monitoring sites. Locations without that property are shown as historical; keep their IDs so existing records remain accessible. Update this list when the monitoring programme changes, and keep IDs and coordinates consistent with Supabase.
- Navigation uses `js/navigation.js` for a right-side mobile menu, including the dynamically rendered admin dashboard. The menu closes with its close button, Escape, or a tap outside it. Without JavaScript, the links remain visible.
- `data.html` — data viewer and chart (Chart.js). Data source: `data/sample-data.json`.
- The data page instructions open on the first visit and collapse on later visits in the same browser. Tap or click their heading to expand or collapse them; clearing browser site data resets this preference.
- The mobile data page has an optional, separate presentation layer: `css/data-mobile.css` and `js/data-mobile.js`. Sites and measurements are under Filters, while the date sliders stay visible. Sliders select actual sampling dates (which are not necessarily evenly spaced in time); apply the chosen range or use All dates to reset it. On desktop use Apply after changing the sliders. To revert the mobile presentation, remove its two references from `data.html`; the existing data controls and desktop layout remain available. The `hhw-data-ready` event in `js/main.js` can also be removed.
- `js/main.js` — code that wires map, list, table and chart. Looks for `?loc=<id>` on `data.html`.

Notes:
- The site uses CDN for Leaflet and Chart.js to keep the repo minimal.

Supabase integration
- Created a file `js/config.js` set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to project values.
- The site will automatically use Supabase when `js/config.js` contains valid values.

## Field entry

Students can open `field.html` on a phone, choose a sampling site and date, and enter one or more measurements. An internet connection is required. Submissions are not added to the public dataset until a reviewer approves them in the admin dashboard. Rejecting a submission leaves it in the database with a rejected status, but does not publish it.

Setup (a Supabase project owner must perform these steps):

1. Configure the project URL and **public anon/publishable key** in `js/config.js`, if not already configured. Never put a service-role or secret key in this file.
2. Confirm that the existing `locations`, `parameters`, `samplingdates`, and `data` tables match the columns used by the existing CSV upload. Confirm the parameter IDs match the field form: 1 temperature, 2 adjusted salinity, 3 adjusted specific conductivity, 4 dissolved oxygen %, 5 pH, 6 turbidity, 7 chlorophyll a, 8 NNN, 9 DRP, 10 enterococci. Verify the instruments' units and adjustment method against your protocols before collecting data.
3. Run `data/field-entry-setup.sql` in the Supabase SQL editor. It creates a private submission queue and reviewer allowlist, plus functions for public submission and authorized review. It does not change the existing data table's policies.
4. Create reviewer accounts in Supabase Auth. For each reviewer, add their Auth user UUID in the SQL editor:

   ```sql
   insert into public.field_reviewers (user_id) values ('REPLACE-WITH-AUTH-USER-UUID');
   ```

   Remove a reviewer by deleting their row from `public.field_reviewers`. Signing into the admin dashboard alone does not grant field-review access.
5. Publish the site over HTTPS (or use localhost for testing). Verify the existing `locations` table is readable using the public key. Submit a test sample, sign in as an authorized reviewer, approve it, and verify it appears in the data viewer. Also test rejection and an unauthorized account.

Anyone with the public link can submit, so review every sample before approval. The form does not collect names. Public submissions can be abused; consider adding rate limiting or bot protection before a broad launch. If a submission fails, the form keeps its entries; retry unchanged to avoid duplicating a submission whose response was lost. Data is not saved offline and will be lost if the page is closed or refreshed.

## Bulk upload

**Bulk upload is paused:** SRF2 site numbers have changed and their corresponding sampling sites are not yet confirmed. Do not upload until the mapping has been verified and implemented. The current uploader previously assumed spreadsheet site numbers were database location IDs; that assumption is unsafe for the new numbering. Reload any open admin pages to pick up the pause.

The admin dashboard accepts an Excel workbook containing an `SRF2` sheet or a CSV exported from that sheet. Select one date for the whole upload, then preview and confirm before publishing. The preview warns when a row's date differs or cannot be understood, lists columns not imported, and skips blank measurements and explanatory rows without a site or date. It rejects invalid sites, invalid numbers and duplicate site/measurement pairs, and checks for existing site/date/measurement records before publishing. Existing duplicates are checked again by the database when publishing.

The imported columns are water temperature, adjusted salinity, adjusted conductivity, dissolved oxygen %, pH (if supplied), turbidity, chlorophyll a, NNN, DRP and enterococci. Unadjusted salinity, specific conductivity and dissolved oxygen mg/L are not imported. Confirm the selected date and units before publishing.

The redesigned uploader requires `data/bulk-upload-setup.sql` to be installed in Supabase after `data/field-entry-setup.sql`. It adds an authorized-reviewer-only, transactional publish function and an upload receipt for safe retries. It has been installed in the current project; other projects need the setup applied separately. Existing direct-write paths do not participate in the bulk upload's locking, so avoid simultaneous CSV uploads or direct writes for the same date. Use the existing field reviewer allowlist to authorize bulk publishers.

Feedback: tell me which features you want next
=======
Healthy Harbour Watchers Website
