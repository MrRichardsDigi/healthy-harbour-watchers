function setupLocationSchoolAdmin(client) {
  const status = document.getElementById('location-school-status');
  const list = document.getElementById('location-school-list');
  if (!status || !list) return;

  async function load() {
    status.textContent = 'Loading location assignments...';
    list.replaceChildren();
    try {
      const [locationsResponse, schoolsResponse] = await Promise.all([
        client.rpc('location_school_list'),
        client.rpc('school_partner_list')
      ]);
      if (locationsResponse.error) throw locationsResponse.error;
      if (schoolsResponse.error) throw schoolsResponse.error;
      const data = locationsResponse.data;
      const schools = schoolsResponse.data || [];
      if (!data || !data.length) {
        list.textContent = 'No locations found.';
        status.textContent = '';
        return;
      }
      data.forEach(item => {
        const row = document.createElement('div');
        row.className = 'location-school-row';
        const label = document.createElement('label');
        label.textContent = item.location_name;
        label.htmlFor = `location-school-${item.location_id}`;
        const select = document.createElement('select');
        select.id = label.htmlFor;
        select.dataset.locationId = item.location_id;
        select.innerHTML = '<option value="">Unassigned</option>';
        schools.forEach(school => {
          const option = document.createElement('option');
          option.value = school.school_id;
          option.textContent = school.school_name;
          select.appendChild(option);
        });
        select.value = item.school_id ? String(item.school_id) : '';
        select.addEventListener('change', async () => {
          select.disabled = true;
          status.textContent = `Saving ${item.location_name}...`;
          try {
            const result = await client.rpc('location_school_change', {
              p_location_id: Number(select.dataset.locationId),
              p_school_id: select.value ? Number(select.value) : null
            });
            if (result.error) throw result.error;
            status.textContent = 'Location assignments saved.';
          } catch (error) {
            status.textContent = `Unable to save location assignment: ${error.message}`;
            select.value = item.school_id ? String(item.school_id) : '';
          } finally {
            select.disabled = false;
          }
        });
        row.append(label, select);
        list.appendChild(row);
      });
      status.textContent = '';
    } catch (error) {
      status.textContent = `Unable to load location assignments: ${error.message}`;
    }
  }

  load();
}
