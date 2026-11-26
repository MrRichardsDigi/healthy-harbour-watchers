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
- The Locations item in the navigation opens a click-controlled menu of site profiles. School assignments are managed separately in Supabase so they can be changed without editing the site files. Run `data/location-school-setup.sql` after `data/field-access-setup.sql`; assignments start unassigned and authorized field-access administrators can update them from the admin dashboard. Each location has one current school owner, while changes are retained in an ownership history. Approved field users can still submit samples and upload photos for any location; ownership is organisational, not a per-user site restriction.
- Assigned site profiles show the school logo and use a restrained school-inspired colour accent. Unassigned sites keep the Healthy Harbour Watchers palette. Colours are approximate brand accents rather than a replacement for official school branding.
- Each site profile includes a compact OpenStreetMap view centered on the site's recorded coordinates, plus a link to the full harbour map.
- The Join page loads current school-to-site assignments from Supabase and links each assigned site to its profile; schools without assignments show that none have been assigned yet.
- Approved field users can submit text posts from `blog.html`. Run `data/blog-submissions-setup.sql` after the field-access setup. Posts are always created unpublished and must be reviewed and published by an administrator; public visitors see published posts only.
- Navigation uses `js/navigation.js` for a right-side mobile menu, including the dynamically rendered admin dashboard. The menu closes with its close button, Escape, or a tap outside it. Without JavaScript, the links remain visible.
- The admin dashboard uses discrete single-panel sections for access and locations, review, data upload, and content. The selected section is stored in the URL hash, such as `admin.html#review`, and can be bookmarked.
- Administrators can publish, unpublish, edit, and delete blog posts from the Content section. Editing preserves an existing image unless a replacement image is selected.
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
3. For a new installation, run `data/field-entry-setup.sql` in the Supabase SQL editor, followed by the field sign-in setup below before using field entry. The initial script creates the submission queue and reviewer allowlist; it initially allows public submission and does not change the existing data table's policies.
4. Create reviewer accounts in Supabase Auth. For each reviewer, add their Auth user UUID in the SQL editor:

   ```sql
   insert into public.field_reviewers (user_id) values ('REPLACE-WITH-AUTH-USER-UUID');
   ```

   Remove a reviewer by deleting their row from `public.field_reviewers`. Signing into the admin dashboard alone does not grant field-review access.
5. Publish the site over HTTPS (or use localhost for testing). Verify the existing `locations` table is readable using the public key. Submit a test sample, sign in as an authorized reviewer, approve it, and verify it appears in the data viewer. Also test rejection and an unauthorized account.

Review every sample before approval. The form does not collect names.

Open the field page with internet first and wait for the offline-ready message on each device. The page and site list are then available offline in supported browsers. Entries in progress are saved on the device as they are entered; save each completed sample to keep multiple samples. Saved samples do not send automatically: reconnect and submit each one for review. They remain on that browser/device, not in an account or a backup, and clearing site data or using private browsing can remove them. If a submission is not confirmed, retry the same saved sample unchanged; its persistent submission ID prevents duplicate retries. Do not edit or delete an uncertain submission until its status is checked.

The field form shows advisory unusual-value prompts based on a read-only review of 4,236 historic measurements in November 2026. Bounds are deliberately broader than most observed values: temperature -2–28, adjusted salinity 0–45, adjusted conductivity 0–60, dissolved oxygen % 0–160, pH 5–10, turbidity 0–65, chlorophyll a 0–16, NNN 0–145, DRP 0–5, and enterococci 0–3000. DRP uses the 99th percentile as a guide rather than the historical maximum of 9999, which may be an outlier or placeholder. These are prompts to recheck, not scientific thresholds or rejection rules; genuine unusual results can be submitted. Units not established by the database remain unspecified until confirmed against the approved method.

## Bulk upload

The uploader translates spreadsheet site numbers using the `currentSite` entries in `data/locations.json`, not database IDs. Before previewing, it checks that mapped IDs and names match the database and rejects missing or ambiguous mappings. The preview shows each site number and name; check these before publishing. Update the mapping if the monitoring programme changes, and use only files with the current numbering.

The admin dashboard accepts an Excel workbook containing an `SRF2` sheet or a CSV exported from that sheet. The supplied CSV template provides `Site Number`, `Site Name`, `Date`, and the measurement columns; download it rather than starting with a blank spreadsheet, keep its column headings unchanged, use site numbers `1`–`8`, select one sampling date for the whole upload, then preview and confirm before publishing. The uploader accepts normal dates and Excel serial dates, maps either `Site` or `Site Number`, warns when a row's date differs or cannot be understood, lists columns not imported, and skips blank measurements and explanatory rows without a site or date. It rejects invalid sites, invalid numbers and duplicate site/measurement pairs, and checks for existing site/date/measurement records before publishing. Existing duplicates are checked again by the database when publishing.

The imported columns are water temperature, adjusted salinity, adjusted conductivity, dissolved oxygen %, pH (if supplied), turbidity, chlorophyll a, NNN, DRP and enterococci. Unadjusted salinity, specific conductivity and dissolved oxygen mg/L are not imported. Confirm the selected date and units before publishing.

The redesigned uploader requires `data/bulk-upload-setup.sql` to be installed in Supabase after `data/field-entry-setup.sql`. It adds an authorized-reviewer-only, transactional publish function and an upload receipt for safe retries. It has been installed in the current project; other projects need the setup applied separately. Existing direct-write paths do not participate in the bulk upload's locking, so avoid simultaneous CSV uploads or direct writes for the same date. Use the existing field reviewer allowlist to authorize bulk publishers.

To test the uploader without changing a database, serve the repository locally and open `tests/bulk-upload.html`. The test uses a mock database and requires internet access for the CSV and Excel libraries.

To test field-entry draft handling without changing a database, open `tests/field.html` on the local server. It uses mock storage and a mock submission service. Also verify offline reopening on a separate test device or origin after the offline-ready message appears.

## Field sign-in

The field page supports Google sign-in and email/password sign-in. New email accounts are created on the separate `field-signup.html` page, then must be individually approved by a field access administrator before they can use Field entry; school email domains do not automatically grant access. If Supabase requires email confirmation for new accounts, working email delivery/SMTP is also required. Field sign-in uses separate browser auth storage from the existing admin login. A field access administrator can approve and remove addresses in the admin dashboard; field reviewers do not automatically get permission to manage the access list.

**Do not run the access migration until Google sign-in is configured, an access administrator is ready to be added, and the website is ready to deploy.** Applying `data/field-access-setup.sql` immediately revokes anonymous submission, so old field pages will no longer be able to submit. The current `data/field-entry-setup.sql` refuses to run afterward; older copies of that script can reopen anonymous submissions and must not be used. No existing submission, measurement, or offline draft is deleted by the migration. Users with saved drafts should keep them and reload the updated field page before submitting.

Setup, to be performed by the project owner after local testing:

1. In Google Cloud, create a web OAuth client. Set the authorized JavaScript origin to `https://mrrichardsdigi.github.io` and the authorized redirect URI to the callback URL shown on the Supabase Google provider page. Configure the consent screen and Google provider in Supabase; keep the client secret out of the repository and chat. School administrators may need to approve the app.
2. In Supabase Auth URL configuration, allow `https://mrrichardsdigi.github.io/healthy-harbour-watchers/field.html` as a redirect. For local sign-in tests, explicitly allow the local field URL too. To enable email links later, configure and test suitable SMTP/email delivery, then unhide the email option in `field.html`; Supabase's default email service has restrictions.
3. Back up the project and apply `data/field-access-setup.sql` in the SQL editor. Bootstrap a trusted existing admin account by adding its Auth user UUID (not its email) using `insert into public.field_access_admins (user_id) values ('REPLACE-WITH-ADMIN-UUID');`. Add addresses individually through the admin dashboard. Removing an address blocks future server submissions immediately, even for an existing session.
4. Test an approved account, an unapproved account, anonymous API access, Google callback, the separate admin session, and a saved draft in a separate test project first. Deploy the site and verify access without creating live test measurements. Check the Supabase provider configuration and school access with the project owner before switching over.

Online authorization is checked by the database against the authenticated user's confirmed email. An offline device cannot check revocation: after one successful online approval, a local marker allows the field form to open offline, but every actual submission is checked again by the server. If the page was opened offline, reconnect and reload before submitting. Offline drafts are stored in the browser and are visible to someone with access to the same unlocked device; this is not encrypted or a secure offline login. Signing out leaves drafts on the device so they are not lost. Participants should use a trusted device.

For mock-only browser tests, open `tests/field-auth.html` and `tests/field.html` on a local server. `tests/field-access.sql` creates mock schemas and roles and must be run only against a fresh disposable PostgreSQL database, never the live project.

## Site profiles and photos

The locations list and map link to `site.html?id=...`, a profile for each current or historical site with map and data links. Profiles use `data/locations.json`; no descriptions or site photographs are invented.

The photo feature requires `data/site-photos-setup.sql` after the field entry and field access setup. Test the complete Storage upload, review, rejection and public viewing flow in a separate Supabase project before installing it on production. The script creates a private `site-photos` bucket and fails if that bucket already exists. It adds separate photo records and policies; it does not change measurements or field submissions.

Approved field users can upload a site photo while online, separately from a sample. Choose a JPEG, PNG or WebP of at most 5 MB; the browser resizes it and re-encodes it as JPEG to remove camera metadata before uploading. Only site photos without identifiable people should be submitted. Reviewers must check the actual image for people or personal information before approving it. This is a policy and review process, not automatic detection; the server cannot guarantee a modified client stripped metadata.

The private bucket allows files up to 5 MiB and the database limits the total to 100 photos including pending, approved, rejected and incomplete uploads. Rejected photos should be deleted in the review panel, which frees their slot. Reviewers can also remove published photos. Incomplete uploads older than one day appear there for cleanup. If an upload is interrupted, keep the page open and retry with the same photo; the original remains on the device. Photo storage and transfer count toward Supabase project usage and existing plan limits. The cap is not a guarantee of zero cost; monitor the project and do not enable paid billing without approval.

Only approved photos are accessible to visitors, via time-limited URLs. Reviewers can access pending photos. Never put personal information into a photo. Test `tests/site-photos.sql` only against the same fresh, disposable PostgreSQL database used by `tests/field-access.sql`; it creates mock Storage objects and cannot substitute for a real Supabase Storage integration test.

Feedback: tell me which features you want next
=======
Healthy Harbour Watchers Website
