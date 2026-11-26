document.addEventListener('DOMContentLoaded', async () => {
  const siteLists = Array.from(document.querySelectorAll('.school-sites'));
  if (!siteLists.length) return;

  try {
    if (!window.supabase || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
      throw new Error('School assignment service unavailable');
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const response = await client.rpc('location_school_list');
    if (response.error) throw response.error;

    const assignedSites = new Map();
    for (const location of response.data || []) {
      if (!location.school_name) continue;
      if (!assignedSites.has(location.school_name)) assignedSites.set(location.school_name, []);
      assignedSites.get(location.school_name).push(location);
    }

    siteLists.forEach(list => {
      const sites = assignedSites.get(list.dataset.schoolName) || [];
      list.replaceChildren();
      if (!sites.length) {
        list.textContent = 'No sites assigned yet';
        return;
      }
      const heading = document.createElement('span');
      heading.textContent = 'Monitoring sites';
      list.appendChild(heading);
      const links = document.createElement('ul');
      sites.forEach(site => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `site.html?id=${encodeURIComponent(site.location_id)}`;
        link.textContent = site.location_name;
        item.appendChild(link);
        links.appendChild(item);
      });
      list.appendChild(links);
    });
  } catch (error) {
    console.warn('Unable to load school site assignments:', error);
    siteLists.forEach(list => {
      list.textContent = 'Sites currently unavailable';
    });
  }
});
