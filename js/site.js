document.addEventListener('DOMContentLoaded', async () => {
  const schoolBranding = {
    "St Hilda's Collegiate": { primary: '#2f6fa3', accent: '#e8f2fb' },
    'Trinity College': { primary: '#17365d', accent: '#f1e2e4' },
    'Logan Park High School': { primary: '#6f1d2b', accent: '#f4e8ea' },
    'Bayfield High School': { primary: '#245b45', accent: '#e9f1ed' },
    'Columba College': { primary: '#1f4d3a', accent: '#e8f0ec' }
  };
  const status = document.getElementById('site-status');
  const photosStatus = document.getElementById('site-photos-status');
  const schoolBrand = document.getElementById('site-school-brand');
  const schoolLogo = document.getElementById('site-school-logo');
  try {
    const id = new URLSearchParams(location.search).get('id');
    const response = await fetch('data/locations.json');
    if (!response.ok) throw new Error('Could not load the site list');
    const locations = await response.json();
    const site = locations.find(item => String(item.id) === id);
    if (!site) {
      status.textContent = 'Site not found. Choose a site from the locations page.';
      return;
    }
    document.title = `${site.name} — Healthy Harbour Watchers`;
    document.getElementById('site-name').textContent = site.name;
    document.getElementById('site-type').textContent = site.currentSite
      ? `Current monitoring site ${site.currentSite}` : 'Historical monitoring site';
    const school = document.getElementById('site-school');
    school.textContent = 'School: Unassigned';
    if (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
      const assignmentClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const assignment = await assignmentClient.rpc('location_school_list');
      if (!assignment.error) {
        const match = (assignment.data || []).find(item => String(item.location_id) === id);
        if (match && match.school_name) {
          school.textContent = `School: ${match.school_name}`;
          schoolBrand.hidden = false;
          schoolLogo.src = match.logo_path || '';
          schoolLogo.alt = `${match.school_name} logo`;
          if (!match.logo_path) schoolLogo.hidden = true;
          const theme = schoolBranding[match.school_name];
          if (theme) {
            document.getElementById('site-details').style.setProperty('--site-school-primary', theme.primary);
            document.getElementById('site-details').style.setProperty('--site-school-accent', theme.accent);
            document.getElementById('site-details').classList.add('school-themed');
          }
        }
      }
    }
    document.getElementById('site-coordinates').textContent =
      `Coordinates: ${Number(site.lat).toFixed(5)}, ${Number(site.lng).toFixed(5)}`;
    document.getElementById('site-map').href = `locations.html?loc=${encodeURIComponent(site.id)}`;
    document.getElementById('site-data').href = `data.html?loc=${encodeURIComponent(site.id)}`;
    document.getElementById('site-details').hidden = false;
    status.hidden = true;
    if (!window.supabase || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
      throw new Error('Photo service unavailable');
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client.rpc('site_photo_list', { p_locationid: Number(site.id) });
    if (error) throw error;
    if (!data.length) {
      photosStatus.textContent = 'No approved photos yet.';
      return;
    }
    const container = document.getElementById('site-photos');
    for (const photo of data) {
      const signed = await client.storage.from('site-photos').createSignedUrl(photo.object_path, 3600);
      if (signed.error) throw signed.error;
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = signed.data.signedUrl;
      image.alt = `Photo of ${site.name}`;
      image.loading = 'lazy';
      const caption = document.createElement('figcaption');
      caption.textContent = `Submitted ${new Date(photo.created_at).toLocaleDateString('en-NZ')}`;
      figure.append(image, caption);
      container.appendChild(figure);
    }
    photosStatus.hidden = true;
  } catch (error) {
    if (document.getElementById('site-details').hidden) status.textContent = `Unable to load site: ${error.message}.`;
    else photosStatus.textContent = `Unable to load photos: ${error.message}.`;
  }
});
