document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('field-form');
  const location = document.getElementById('field-location');
  const date = document.getElementById('field-date');
  const submit = document.getElementById('field-submit');
  const status = document.getElementById('field-status');
  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  date.value = localToday();

  if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' ||
      SUPABASE_ANON_KEY === '******' || !window.supabase) {
    status.textContent = 'Field entry is not configured. Please contact the site administrator.';
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  try {
    const { data, error } = await client.from('locations').select('*');
    if (error) throw error;
    if (!data || !data.length) throw new Error('No sampling sites are available.');
    location.replaceChildren(new Option('Choose a site', ''));
    data.forEach(site => location.add(new Option(site.location || site.name || String(site.id), String(site.id))));
    location.disabled = false;
    submit.disabled = false;
  } catch (error) {
    status.textContent = `Unable to load sampling sites: ${error.message}`;
    return;
  }

  let requestId = null;
  let lastPayload = '';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const measurements = {};
    for (const input of form.querySelectorAll('[data-parameter]')) {
      if (input.value !== '') {
        const value = input.valueAsNumber;
        if (!Number.isFinite(value)) {
          status.textContent = 'Please enter valid numbers for all measurements.';
          return;
        }
        measurements[input.dataset.parameter] = value;
      }
    }
    if (!Object.keys(measurements).length) {
      status.textContent = 'Enter at least one measurement.';
      return;
    }
    const payload = JSON.stringify([location.value, date.value, measurements]);
    if (payload !== lastPayload) {
      requestId = crypto.randomUUID();
      lastPayload = payload;
    }
    submit.disabled = true;
    status.textContent = 'Submitting...';
    try {
      const { error } = await client.rpc('submit_field_sample', {
        p_id: requestId,
        p_locationid: Number(location.value),
        p_date: date.value,
        p_measurements: measurements
      });
      if (error) throw error;
      status.textContent = 'Submitted for review. Thank you!';
      form.reset();
      date.value = localToday();
      lastPayload = '';
      requestId = null;
    } catch (error) {
      if (error.code === 'PGRST202' && error.message.includes('submit_field_sample')) {
        status.textContent = 'Field submissions are not set up in the database yet. Your entries are still here; please contact the site administrator.';
      } else {
        status.textContent = `Submission failed: ${error.message}. Your entries are still here; check your connection and try again.`;
      }
    } finally {
      submit.disabled = false;
    }
  });
});
