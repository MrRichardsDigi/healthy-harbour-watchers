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
  const trendStatus = document.getElementById('site-trends-status');
  const tideStatus = document.getElementById('site-tide-status');
  const tideTable = document.getElementById('site-tide-table');
  const summary = document.getElementById('site-summary');
  const parameterNames = {
    1: 'Temperature',
    3: 'Conductivity',
    5: 'pH',
    6: 'Turbidity',
    10: 'Enterococci'
  };
  const parameterUnits = {
    1: '°C',
    3: 'mS/cm',
    5: '',
    6: 'NTU',
    10: 'CFU/100 mL'
  };

  function chartOptions(yTitle, secondaryTitle) {
    const scales = {
      x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } },
      y: { beginAtZero: false, title: { display: true, text: yTitle } }
    };
    if (secondaryTitle) {
      scales.y1 = {
        beginAtZero: false,
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: secondaryTitle }
      };
    }
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales
    };
  }

  function tideAtEstimatedSampleTime(tideEvents, date) {
    const events = tideEvents
      .filter(event => event.date === date)
      .map(event => ({
        ...event,
        minutes: Number(event.time.slice(0, 2)) * 60 + Number(event.time.slice(3))
      }))
      .sort((a, b) => a.minutes - b.minutes);
    if (!events.length) return null;
    const sampleMinutes = 9 * 60 + 30;
    let before = null;
    let after = null;
    events.forEach(event => {
      if (event.minutes <= sampleMinutes) before = event;
      if (!after && event.minutes >= sampleMinutes) after = event;
    });
    if (!before) before = { ...events[events.length - 1], minutes: events[events.length - 1].minutes - 1440 };
    if (!after) after = { ...events[0], minutes: events[0].minutes + 1440 };
    const fraction = (sampleMinutes - before.minutes) / (after.minutes - before.minutes);
    const height = before.height + (after.height - before.height) * fraction;
    return {
      height,
      phase: after.height > before.height ? 'rising' : 'falling',
      nextEvent: Math.abs(after.minutes - sampleMinutes) <= Math.abs(sampleMinutes - before.minutes) ? after : before
    };
  }

  async function renderTideContext(dates) {
    if (!tideStatus) return;
    try {
      const response = await fetch('data/port-chalmers-tides.json');
      if (!response.ok) throw new Error('Tide reference data unavailable');
      const tideEvents = await response.json();
      const matches = dates.map(date => ({ date, tide: tideAtEstimatedSampleTime(tideEvents, date) }))
        .filter(item => item.tide);
      if (!matches.length) {
        tideStatus.textContent = 'Tide reference data is not available for these sample dates.';
        return;
      }
      const latest = matches[matches.length - 1];
      tideStatus.textContent =
        `Port Chalmers tide prediction: ${latest.tide.height.toFixed(2)} m, ${latest.tide.phase} tide on ${latest.date}.`;
      if (tideTable) {
        const table = document.createElement('table');
        table.innerHTML = '<caption>Recent sample dates and estimated tide conditions</caption><thead><tr><th scope="col">Sample date</th><th scope="col">Tide height</th><th scope="col">Phase</th></tr></thead>';
        const body = document.createElement('tbody');
        matches.slice(-12).forEach(item => {
          const row = document.createElement('tr');
          row.innerHTML = `<td>${item.date}</td><td>${item.tide.height.toFixed(2)} m</td><td>${item.tide.phase}</td>`;
          body.appendChild(row);
        });
        table.appendChild(body);
        tideTable.replaceChildren(table);
      }
    } catch (error) {
      console.warn('Tide context unavailable:', error);
      tideStatus.textContent = 'Port Chalmers tide reference is temporarily unavailable.';
    }
  }

  async function renderSiteTrends(client, locationId) {
    if (!trendStatus || !summary) return;
    if (!window.Chart) {
      trendStatus.textContent = 'Charts are unavailable in this browser.';
      return;
    }
    try {
      const [rowsResponse, datesResponse] = await Promise.all([
        client.from('data').select('dateid, parameterid, value').eq('locationid', locationId).limit(5000),
        client.from('samplingdates').select('id, date').limit(10000)
      ]);
      if (rowsResponse.error) throw rowsResponse.error;
      if (datesResponse.error) throw datesResponse.error;
      const dateById = Object.fromEntries((datesResponse.data || []).map(item => [String(item.id), item.date]));
      const records = (rowsResponse.data || [])
        .map(row => ({
          date: dateById[String(row.dateid)],
          parameterId: Number(row.parameterid),
          value: Number(row.value)
        }))
        .filter(row => parameterNames[row.parameterId] && row.date && Number.isFinite(row.value));
      if (!records.length) {
        trendStatus.textContent = 'No chartable measurements are available for this site yet.';
        return;
      }
      const latestDate = new Date(`${records.reduce((latest, row) => row.date > latest ? row.date : latest, records[0].date)}T00:00:00`);
      const since = new Date(latestDate);
      since.setFullYear(since.getFullYear() - 1);
      const recent = records.filter(row => new Date(`${row.date}T00:00:00`) >= since);
      const dates = [...new Set(recent.map(row => row.date))].sort();
      if (!dates.length) {
        trendStatus.textContent = 'No measurements were recorded in the last 12 months.';
        return;
      }
      const valuesFor = parameterId => dates.map(date => {
        const record = recent.find(row => row.date === date && row.parameterId === parameterId);
        return record ? record.value : null;
      });
      const latestByParameter = {};
      recent.forEach(row => {
        if (!latestByParameter[row.parameterId] || row.date > latestByParameter[row.parameterId].date) {
          latestByParameter[row.parameterId] = row;
        }
      });
      summary.replaceChildren();
      [1, 3, 5, 6, 10].forEach(parameterId => {
        const record = latestByParameter[parameterId];
        if (!record) return;
        const card = document.createElement('div');
        card.className = 'site-summary-card';
        const label = document.createElement('strong');
        label.textContent = parameterNames[parameterId];
        const value = document.createElement('span');
        value.textContent = `${record.value} ${parameterUnits[parameterId]}`.trim();
        card.append(label, value);
        summary.appendChild(card);
      });
      trendStatus.textContent = `Showing ${dates[0]} to ${dates[dates.length - 1]}.`;
      renderTideContext(dates);
      const common = { fill: false, tension: 0.25, spanGaps: true, pointRadius: 3 };
      new Chart(document.getElementById('site-environment-chart'), {
        type: 'line',
        data: { labels: dates, datasets: [
          { ...common, label: 'Temperature (°C)', data: valuesFor(1), borderColor: '#d97706', yAxisID: 'y' },
          { ...common, label: 'Conductivity', data: valuesFor(3), borderColor: '#0b5fa6', yAxisID: 'y1' }
        ] },
        options: chartOptions('°C', 'Conductivity')
      });
      new Chart(document.getElementById('site-clarity-chart'), {
        type: 'line',
        data: { labels: dates, datasets: [
          { ...common, label: 'pH', data: valuesFor(5), borderColor: '#7c3aed', yAxisID: 'y' },
          { ...common, label: 'Turbidity (NTU)', data: valuesFor(6), borderColor: '#0891b2', yAxisID: 'y1' }
        ] },
        options: chartOptions('pH', 'NTU')
      });
      new Chart(document.getElementById('site-bacteria-chart'), {
        type: 'line',
        data: { labels: dates, datasets: [
          { ...common, label: 'Enterococci (CFU/100 mL)', data: valuesFor(10), borderColor: '#be123c', yAxisID: 'y' }
        ] },
        options: chartOptions('CFU/100 mL')
      });
    } catch (error) {
      console.warn('Site trends unavailable:', error);
      trendStatus.textContent = 'Measurements could not be loaded for this site.';
    }
  }
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
    const client = window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined'
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;
    document.title = `${site.name} — Healthy Harbour Watchers`;
    document.getElementById('site-name').textContent = site.name;
    document.getElementById('site-type').textContent = site.currentSite
      ? `Current monitoring site ${site.currentSite}` : 'Historical monitoring site';
    const school = document.getElementById('site-school');
    school.textContent = 'School: Unassigned';
    if (client) {
      const assignment = await client.rpc('location_school_list');
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
    if (client) {
      await renderSiteTrends(client, Number(site.id));
    } else {
      trendStatus.textContent = 'Live measurements are unavailable.';
    }
    const latitude = Number(site.lat);
    const longitude = Number(site.lng);
    const miniMap = document.getElementById('site-mini-map');
    if (window.L && Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const map = window.L.map(miniMap, {
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        touchZoom: false
      }).setView([latitude, longitude], 15);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      window.L.marker([latitude, longitude]).addTo(map).bindPopup(site.name);
    } else {
      miniMap.textContent = 'Map unavailable. Use the harbour map link below.';
    }
    status.hidden = true;
    const container = document.getElementById('site-photos');
    const manifestUrl = new URL('data/site-photos.json', window.location.href);
    const cacheVersion = new URLSearchParams(window.location.search).get('v');
    if (cacheVersion) manifestUrl.searchParams.set('v', cacheVersion);
    const photoManifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
    if (!photoManifestResponse.ok) throw new Error('Could not load curated site photos');
    const photoManifest = await photoManifestResponse.json();
    const curatedPhotos = photoManifest[id] || [];
    for (const fileName of curatedPhotos) {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = `assets/${encodeURIComponent(fileName)}`;
      image.alt = `Field photo from ${site.name}`;
      image.loading = 'lazy';
      figure.appendChild(image);
      container.appendChild(figure);
    }
    if (!client) {
      photosStatus.textContent = curatedPhotos.length
        ? 'Community-submitted photos are unavailable.'
        : 'Photo service unavailable.';
      return;
    }
    const { data, error } = await client.rpc('site_photo_list', { p_locationid: Number(site.id) });
    if (error) throw error;
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
    if (!curatedPhotos.length && !data.length) {
      photosStatus.textContent = 'No approved photos yet.';
      return;
    }
    photosStatus.hidden = true;
  } catch (error) {
    if (document.getElementById('site-details').hidden) status.textContent = `Unable to load site: ${error.message}.`;
    else photosStatus.textContent = `Unable to load photos: ${error.message}.`;
  }
});
