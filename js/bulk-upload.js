function setupBulkUpload(client) {
  const fileInput = document.getElementById('csv-upload');
  const dateInput = document.getElementById('csv-sampling-date');
  const previewButton = document.getElementById('upload-csv-btn');
  const status = document.getElementById('csv-upload-status');
  const preview = document.getElementById('bulk-preview');
  const siteMappingConfirmed = false;
  if (!siteMappingConfirmed) {
    fileInput.disabled = true;
    dateInput.disabled = true;
    previewButton.disabled = true;
    status.textContent = 'Bulk upload is paused until the spreadsheet site numbers are confirmed and mapped to the correct sampling sites.';
    return;
  }

  const fields = {
    'water temp oc': [1, 'Water temperature'],
    'sal adj': [2, 'Adjusted salinity'],
    'sp cond adj': [3, 'Adjusted conductivity'],
    'do %': [4, 'Dissolved oxygen (%)'],
    'ph': [5, 'pH'],
    'turbidity': [6, 'Turbidity'],
    'turb': [6, 'Turbidity'],
    'chloro a': [7, 'Chlorophyll a'],
    'nnn μmol/l': [8, 'NNN'],
    'drp μmol/l': [9, 'DRP'],
    'enterococci': [10, 'Enterococci']
  };
  const excluded = ['salinity ppt', 'spec cond', 'do mg/l'];
  let generation = 0;
  let busy = false;

  function invalidate() {
    generation++;
    preview.replaceChildren();
    status.textContent = '';
  }
  fileInput.addEventListener('change', invalidate);
  dateInput.addEventListener('change', invalidate);

  function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => window[globalName] ? resolve() : reject(new Error(`${globalName} did not load.`));
      script.onerror = () => reject(new Error(`Unable to load ${globalName}. Check your connection.`));
      document.head.appendChild(script);
    });
  }
  function normalize(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/µ/g, 'μ').replace(/\s+/g, ' ');
  }
  function dateMatches(value, selected) {
    const text = String(value).trim();
    if (!text) return true;
    const [year, month, day] = selected.split('-').map(Number);
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return +match[1] === year && +match[2] === month && +match[3] === day;
    match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (match) return +match[1] === day && +match[2] === month && +match[3] === year;
    match = text.match(/^(\d{1,2})[ -]([a-z]{3})(?:[ -](\d{2}|\d{4}))?$/i);
    if (match) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const parsedYear = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : year;
      return +match[1] === day && months.indexOf(match[2].toLowerCase()) + 1 === month && parsedYear === year;
    }
    return false;
  }
  function addText(parent, tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  async function readRows(file) {
    if (file.name.toLowerCase().endsWith('.csv')) {
      await loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js', 'Papa');
      const result = Papa.parse(await file.text());
      if (result.errors.length) throw new Error(`CSV parsing error: ${result.errors[0].message}`);
      return result.data;
    }
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'XLSX');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const name = workbook.SheetNames.find(item => item.trim().toLowerCase() === 'srf2');
      if (!name) throw new Error('The workbook has no SRF2 sheet.');
      return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: true });
    }
    throw new Error('Choose a CSV or XLSX file.');
  }

  previewButton.addEventListener('click', async () => {
    if (busy) return;
    invalidate();
    const run = generation;
    const file = fileInput.files[0];
    const selectedDate = dateInput.value;
    if (!client || !file || !selectedDate) {
      status.textContent = 'Choose a file and sampling date, and make sure you are signed in.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = 'The file is larger than 5 MB.';
      return;
    }
    busy = true;
    previewButton.disabled = true;
    status.textContent = 'Reading and validating file...';
    try {
      const [rows, locationsResponse] = await Promise.all([readRows(file), client.from('locations').select('id,location')]);
      if (locationsResponse.error) throw locationsResponse.error;
      if (generation !== run) return;
      if (!rows.length) throw new Error('The file is empty.');
      const headers = rows[0].map(normalize);
      if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('The file contains duplicate column headings.');
      const siteIndex = headers.indexOf('site');
      const dateIndex = headers.indexOf('date');
      const mapped = headers.map((header, index) => ({ index, definition: fields[header] })).filter(item => item.definition);
      if (siteIndex < 0 || !mapped.length) throw new Error('The file must have a Site column and at least one recognized measurement column.');
      if (new Set(mapped.map(item => item.definition[0])).size !== mapped.length) throw new Error('More than one column maps to the same measurement.');
      const validSites = new Map(locationsResponse.data.map(site => [String(site.id), site.location]));
      const measurements = [];
      const errors = [];
      const warnings = [];
      const seen = new Set();
      let ignoredNotes = 0;
      let datesWithoutYear = 0;
      rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;
        const site = String(row[siteIndex] || '').trim();
        if (!row.some(value => String(value == null ? '' : value).trim())) return;
        if (!site && (dateIndex < 0 || !String(row[dateIndex] || '').trim()) &&
            !mapped.some(item => /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(String(row[item.index] || '').trim()))) {
          ignoredNotes++;
          return;
        }
        if (!/^#?\d+$/.test(site) || !validSites.has(String(Number(site.replace('#', ''))))) {
          errors.push(`Row ${rowNumber}: unknown or missing site "${site}".`);
          return;
        }
        const id = Number(site.replace('#', ''));
        if (dateIndex >= 0) {
          const rowDate = String(row[dateIndex] || '').trim();
          if (!dateMatches(rowDate, selectedDate)) warnings.push(`Row ${rowNumber}: date "${rowDate}" does not match the selected date, or could not be recognized.`);
          else if (/^\d{1,2}[ -][a-z]{3}$/i.test(rowDate)) datesWithoutYear++;
        }
        mapped.forEach(item => {
          const raw = String(row[item.index] == null ? '' : row[item.index]).trim();
          if (!raw) return;
          if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw) || !Number.isFinite(Number(raw))) {
            errors.push(`Row ${rowNumber}: invalid ${item.definition[1]} value "${raw}".`);
            return;
          }
          const key = `${id}:${item.definition[0]}`;
          if (seen.has(key)) {
            errors.push(`Row ${rowNumber}: duplicate ${item.definition[1]} for ${validSites.get(String(id))}.`);
            return;
          }
          seen.add(key);
          measurements.push({ locationid: id, parameterid: item.definition[0], value: Number(raw), site: validSites.get(String(id)), parameter: item.definition[1] });
        });
      });
      if (!measurements.length) errors.push('No measurements found.');
      if (measurements.length > 5000) errors.push('The upload exceeds the 5,000-measurement limit.');
      const ignored = headers.filter(header => header && header !== 'site' && header !== 'date' && !fields[header]);
      if (ignored.length) warnings.push(`Not imported: ${ignored.join(', ')}${ignored.some(header => !excluded.includes(header)) ? ' (includes unrecognized columns)' : ''}.`);
      if (ignoredNotes) warnings.push(`${ignoredNotes} non-data row(s) without a site or date will be ignored.`);
      if (datesWithoutYear) warnings.push(`${datesWithoutYear} row date(s) do not show a year. Check that the selected year is correct.`);

      if (!errors.length) {
        const payload = measurements.map(({ locationid, parameterid, value }) => ({ locationid, parameterid, value }));
        const duplicateCheck = await client.rpc('bulk_measurement_duplicates', { p_date: selectedDate, p_measurements: payload });
        if (duplicateCheck.error) throw duplicateCheck.error;
        if (generation !== run) return;
        duplicateCheck.data.forEach(duplicate => {
          const item = measurements.find(record => record.locationid === Number(duplicate.locationid) && record.parameterid === Number(duplicate.parameterid));
          errors.push(`Already exists for ${item.site}: ${item.parameter}.`);
        });
      }

      addText(preview, 'h3', 'Upload preview');
      addText(preview, 'p', `${measurements.length} measurements for ${selectedDate}. Blank cells are not imported.`);
      if (errors.length) {
        const list = preview.appendChild(document.createElement('ul'));
        errors.forEach(error => addText(list, 'li', error));
        status.textContent = 'Fix the errors before uploading.';
        return;
      }
      if (warnings.length) {
        const list = preview.appendChild(document.createElement('ul'));
        warnings.forEach(warning => addText(list, 'li', warning));
      }
      const tableContainer = preview.appendChild(document.createElement('div'));
      tableContainer.className = 'table-scroll';
      const table = tableContainer.appendChild(document.createElement('table'));
      const head = table.createTHead().insertRow();
      ['Site', 'Measurement', 'Value'].forEach(label => addText(head, 'th', label));
      const body = table.createTBody();
      measurements.forEach(item => {
        const row = body.insertRow();
        [item.site, item.parameter, item.value].forEach(value => addText(row, 'td', String(value)));
      });
      let acknowledge;
      if (warnings.length) {
        const label = preview.appendChild(document.createElement('label'));
        acknowledge = document.createElement('input');
        acknowledge.type = 'checkbox';
        label.append(acknowledge, document.createTextNode(' I have checked the warnings and the selected sampling date.'));
      }
      const publish = addText(preview, 'button', 'Publish measurements');
      publish.type = 'button';
      const requestId = crypto.randomUUID();
      publish.addEventListener('click', async () => {
        if (acknowledge && !acknowledge.checked) {
          status.textContent = 'Please confirm you have checked the warnings.';
          return;
        }
        if (!window.confirm(`Publish ${measurements.length} measurements for ${selectedDate}?`)) return;
        publish.disabled = true;
        fileInput.disabled = dateInput.disabled = previewButton.disabled = true;
        status.textContent = 'Publishing...';
        try {
          const payload = measurements.map(({ locationid, parameterid, value }) => ({ locationid, parameterid, value }));
          const { error } = await client.rpc('publish_bulk_measurements', { p_id: requestId, p_date: selectedDate, p_measurements: payload });
          if (error) throw error;
          status.textContent = `Published ${measurements.length} measurements.`;
          preview.replaceChildren();
          fileInput.value = '';
        } catch (error) {
          status.textContent = `Publish failed: ${error.message}. Your preview is still available; retry unchanged if appropriate.`;
          publish.disabled = false;
        } finally {
          fileInput.disabled = dateInput.disabled = previewButton.disabled = false;
        }
      });
      status.textContent = 'Review the measurements before publishing.';
    } catch (error) {
      if (generation === run) status.textContent = `Preview failed: ${error.message}`;
    } finally {
      busy = false;
      previewButton.disabled = false;
    }
  });
}
