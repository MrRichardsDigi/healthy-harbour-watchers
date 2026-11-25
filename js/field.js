document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('field-form');
  const location = document.getElementById('field-location');
  const date = document.getElementById('field-date');
  const save = document.getElementById('field-save');
  const cancelEdit = document.getElementById('field-cancel-edit');
  const status = document.getElementById('field-status');
  const offlineStatus = document.getElementById('offline-status');
  const draftsElement = document.getElementById('field-drafts');
  const inputs = [...form.querySelectorAll('[data-parameter]')];
  const names = ['Water temperature (°C)', 'Adjusted salinity', 'Adjusted specific conductivity',
    'Dissolved oxygen (%)', 'pH', 'Turbidity', 'Chlorophyll a', 'NNN (µmol/L)', 'DRP (µmol/L)', 'Enterococci'];
  const ranges = [[-2, 28], [0, 45], [0, 60], [0, 160], [5, 10], [0, 65], [0, 16], [0, 145], [0, 5], [0, 3000]];
  const storageKey = 'hhw-field-drafts-v1';
  let state;
  let lastStored;
  let storageAvailable = true;
  let busy = false;
  let sites = [];

  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function blankWork() {
    return { location: '', date: localToday(), values: {}, editingId: null };
  }
  function failStorage(message) {
    storageAvailable = false;
    save.disabled = true;
    status.textContent = message;
    renderDrafts();
  }
  function persist() {
    if (!storageAvailable) return false;
    try {
      if (localStorage.getItem(storageKey) !== lastStored) {
        failStorage('Field samples changed in another tab. Copy any unsaved entries, then reload this page before continuing.');
        return false;
      }
      const next = JSON.stringify(state);
      localStorage.setItem(storageKey, next);
      lastStored = next;
      return true;
    } catch (error) {
      console.error('Unable to save field samples on this device:', error);
      failStorage('Unable to save on this device. Keep this page open, copy your entries, and check browser storage settings.');
      return false;
    }
  }
  function warnings() {
    inputs.forEach((input, index) => {
      const value = input.valueAsNumber;
      const [min, max] = ranges[index];
      document.getElementById(`warning-${index + 1}`).textContent =
        input.value !== '' && Number.isFinite(value) && (value < min || value > max)
          ? 'This is unusual compared with past readings. Check the value and units; it can still be saved and submitted.'
          : '';
    });
  }
  function readWork() {
    const values = {};
    inputs.forEach(input => { if (input.value !== '') values[input.dataset.parameter] = input.value; });
    return { location: location.disabled ? state.work.location : location.value, date: date.value, values, editingId: state.work.editingId };
  }
  function showWork(work) {
    location.value = work.location;
    date.value = work.date;
    inputs.forEach(input => { input.value = work.values[input.dataset.parameter] || ''; });
    save.textContent = work.editingId ? 'Update saved sample' : 'Save sample on this device';
    cancelEdit.hidden = !work.editingId;
    warnings();
  }
  function addText(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }
  function renderDrafts() {
    draftsElement.replaceChildren();
    if (!state || !state.drafts.length) {
      draftsElement.textContent = 'No saved samples on this device.';
      return;
    }
    state.drafts.forEach(draft => {
      const card = document.createElement('article');
      card.className = 'field-draft';
      const site = sites.find(item => String(item.id) === draft.location);
      addText(card, 'strong', `${site ? site.name : `Site ${draft.location}`} — ${draft.date}`);
      const list = card.appendChild(document.createElement('ul'));
      Object.entries(draft.values).forEach(([id, value]) => addText(list, 'li', `${names[Number(id) - 1]}: ${value}`));
      if (draft.attempted) addText(card, 'p', 'A submission was attempted but not confirmed. Retry unchanged to avoid a duplicate.');
      const send = addText(card, 'button', draft.attempted ? 'Retry submission' : 'Submit for review');
      send.type = 'button';
      send.disabled = !storageAvailable || busy || state.work.editingId === draft.id;
      send.addEventListener('click', () => submitDraft(draft.id));
      if (!draft.attempted) {
        const edit = addText(card, 'button', 'Edit');
        edit.type = 'button';
        edit.disabled = !storageAvailable || busy;
        edit.addEventListener('click', () => {
          if ((state.work.location || Object.keys(state.work.values).length) &&
              !window.confirm('Replace the sample currently being entered? Save it first if you need to keep it.')) return;
          state.work = { location: draft.location, date: draft.date, values: { ...draft.values }, editingId: draft.id };
          if (persist()) {
            showWork(state.work);
            renderDrafts();
            status.textContent = 'Editing saved sample. Save changes before submitting.';
            location.focus();
          }
        });
      }
      const remove = addText(card, 'button', 'Delete');
      remove.type = 'button';
      remove.disabled = !storageAvailable || busy || state.work.editingId === draft.id;
      remove.addEventListener('click', () => {
        const message = draft.attempted
          ? 'This submission may already have reached the server. Deleting it prevents a safe retry. Delete this local copy?'
          : 'Delete this saved sample from this device?';
        if (!window.confirm(message)) return;
        state.drafts = state.drafts.filter(item => item.id !== draft.id);
        if (persist()) renderDrafts();
      });
      draftsElement.appendChild(card);
    });
  }
  async function submitDraft(id) {
    const draft = state.drafts.find(item => item.id === id);
    if (!draft || busy || !storageAvailable) return;
    if (!navigator.onLine) {
      status.textContent = 'You are offline. The sample is saved on this device; submit it when connected.';
      return;
    }
    if (!window.fieldAuth || !window.fieldAuth.approved || !window.fieldAuth.client) {
      status.textContent = 'Sign in while connected before submitting. Your sample remains saved on this device.';
      return;
    }
    if (!window.confirm('Submit this saved sample for review?')) return;
    draft.attempted = true;
    if (!persist()) return;
    busy = true;
    save.disabled = true;
    renderDrafts();
    status.textContent = 'Submitting saved sample...';
    try {
      const client = window.fieldAuth.client;
      const measurements = Object.fromEntries(Object.entries(draft.values).map(([key, value]) => [key, Number(value)]));
      const { error } = await client.rpc('submit_field_sample', {
        p_id: draft.id, p_locationid: Number(draft.location), p_date: draft.date, p_measurements: measurements
      });
      if (error) throw error;
      state.drafts = state.drafts.filter(item => item.id !== id);
      if (persist()) status.textContent = 'Submitted for review. Thank you!';
    } catch (error) {
      status.textContent = `Submission not confirmed: ${error.message}. Your sample is saved; retry unchanged when connected.`;
    } finally {
      busy = false;
      save.disabled = !storageAvailable || !sites.length;
      renderDrafts();
    }
  }
  try {
    lastStored = localStorage.getItem(storageKey);
    state = lastStored ? JSON.parse(lastStored) : { version: 1, work: blankWork(), drafts: [] };
    if (state.version !== 1 || !state.work || !state.work.values || !Array.isArray(state.drafts)) {
      throw new Error('Unrecognized saved samples format');
    }
  } catch (error) {
    console.error('Unable to load saved field samples:', error);
    state = { version: 1, work: blankWork(), drafts: [] };
    failStorage('Unable to read or save samples on this device. Check browser storage settings; existing saved data has not been overwritten.');
  }
  window.addEventListener('storage', event => {
    if (event.key === storageKey && event.newValue !== lastStored) {
      failStorage('Field samples changed in another tab. Copy any unsaved entries, then reload this page before continuing.');
    }
  });
  date.value = state.work.date;
  inputs.forEach(input => { input.value = state.work.values[input.dataset.parameter] || ''; });
  warnings();
  renderDrafts();
  form.addEventListener('input', () => {
    if (!storageAvailable) return;
    if (inputs.some(input => input.validity.badInput)) {
      status.textContent = 'Finish entering the number so it can be saved on this device.';
      return;
    }
    state.work = readWork();
    if (persist()) warnings();
  });
  form.addEventListener('change', () => {
    if (!storageAvailable) return;
    if (inputs.some(input => input.validity.badInput)) return;
    state.work = readWork();
    if (persist()) warnings();
  });
  cancelEdit.addEventListener('click', () => {
    if (!storageAvailable || busy || !window.confirm('Discard the changes you are editing? The saved sample will be kept.')) return;
    state.work = blankWork();
    if (persist()) {
      showWork(state.work);
      renderDrafts();
      status.textContent = 'Editing cancelled. The saved sample has not changed.';
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!storageAvailable || busy || !form.reportValidity()) return;
    const work = readWork();
    if (!Object.keys(work.values).length) {
      status.textContent = 'Enter at least one measurement.';
      return;
    }
    const existing = state.drafts.find(item => item.id === work.editingId);
    if (work.editingId && (!existing || existing.attempted)) {
      status.textContent = 'This sample cannot be edited. Reload and retry its submission unchanged.';
      return;
    }
    const draft = { id: existing ? existing.id : crypto.randomUUID(), location: work.location,
      date: work.date, values: work.values, attempted: false };
    if (existing) state.drafts[state.drafts.indexOf(existing)] = draft;
    else state.drafts.push(draft);
    state.work = blankWork();
    if (persist()) {
      showWork(state.work);
      renderDrafts();
      status.textContent = 'Sample saved on this device. Submit it for review when connected.';
    }
  });
  try {
    const response = await fetch('data/locations.json');
    if (!response.ok) throw new Error('Site list could not be loaded');
    sites = await response.json();
    if (!Array.isArray(sites) || !sites.length) throw new Error('Site list is empty');
    location.replaceChildren(new Option('Choose a site', ''));
    sites.forEach(site => location.add(new Option(site.name, String(site.id))));
    if (state.work.location && !sites.some(site => String(site.id) === state.work.location)) {
      location.add(new Option(`Saved site ${state.work.location} (unavailable)`, state.work.location));
    }
    showWork(state.work);
    location.disabled = false;
    save.disabled = !storageAvailable;
    renderDrafts();
  } catch (error) {
    status.textContent = `Unable to load sampling sites: ${error.message}. Reconnect and reload; saved samples remain on this device.`;
  }
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('field-worker.js');
      if (!registration.active) {
        await new Promise((resolve, reject) => {
          const worker = registration.installing || registration.waiting;
          if (!worker) {
            reject(new Error('Offline worker did not start'));
            return;
          }
          const timer = setTimeout(() => reject(new Error('Offline setup timed out')), 20000);
          function checkState() {
            if (worker.state === 'activated') {
              clearTimeout(timer);
              resolve();
            } else if (worker.state === 'redundant') {
              clearTimeout(timer);
              reject(new Error('Offline setup failed'));
            }
          }
          worker.addEventListener('statechange', checkState);
          checkState();
        });
      }
      offlineStatus.textContent = 'Offline access is ready on this device. Samples stay here until you submit them.';
      if (registration.waiting) offlineStatus.textContent += ' An update will be available after you close other site tabs.';
    } catch (error) {
      console.error('Unable to prepare offline access:', error);
      offlineStatus.textContent = 'Offline page access could not be prepared. Saved samples remain on this device, but reopen this page while connected.';
    }
  } else {
    offlineStatus.textContent = 'This browser does not support offline page access. Saved samples remain on this device, but reopen this page while connected.';
  }
});
