async function loadFieldReviews(client) {
  const container = document.getElementById('field-reviews');
  container.textContent = 'Loading submissions...';
  try {
    const [submissions, locations] = await Promise.all([
      client.rpc('pending_field_samples'),
      client.from('locations').select('*')
    ]);
    if (submissions.error) throw submissions.error;
    if (locations.error) throw locations.error;
    container.replaceChildren();
    if (!submissions.data.length) {
      container.textContent = 'No submissions awaiting review.';
      return;
    }
    const names = {
      1: 'Water temperature (°C)', 2: 'Adjusted salinity', 3: 'Adjusted specific conductivity',
      4: 'Dissolved oxygen (%)', 5: 'pH', 6: 'Turbidity', 7: 'Chlorophyll a',
      8: 'NNN (µmol/L)', 9: 'DRP (µmol/L)', 10: 'Enterococci', 11: 'Dissolved oxygen (mg/L)'
    };
    for (const sample of submissions.data) {
      const card = document.createElement('article');
      const heading = document.createElement('strong');
      const site = locations.data.find(item => String(item.id) === String(sample.locationid));
      heading.textContent = `${site ? (site.location || site.name || site.id) : `Site ${sample.locationid}`} — ${sample.sampling_date}`;
      const list = document.createElement('ul');
      for (const [id, value] of Object.entries(sample.measurements)) {
        const item = document.createElement('li');
        item.textContent = `${names[id] || `Parameter ${id}`}: ${value}`;
        list.appendChild(item);
      }
      const approve = document.createElement('button');
      approve.textContent = 'Approve';
      const reject = document.createElement('button');
      reject.textContent = 'Reject';
      reject.className = 'reject';
      const feedback = document.createElement('p');
      feedback.setAttribute('role', 'status');
      async function review(approved) {
        if (!window.confirm(approved ? 'Approve and publish these measurements?' : 'Reject this submission?')) return;
        approve.disabled = reject.disabled = true;
        feedback.textContent = 'Saving decision...';
        try {
          const { error } = await client.rpc('review_field_sample', { p_id: sample.id, p_approve: approved });
          if (error) throw error;
          await loadFieldReviews(client);
        } catch (error) {
          feedback.textContent = `Unable to save decision: ${error.message}`;
          approve.disabled = reject.disabled = false;
        }
      }
      approve.addEventListener('click', () => review(true));
      reject.addEventListener('click', () => review(false));
      card.append(heading, list, approve, reject, feedback);
      container.appendChild(card);
    }
  } catch (error) {
    container.textContent = `Unable to load field submissions: ${error.message}`;
  }
}
