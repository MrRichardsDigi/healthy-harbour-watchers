/* main.js - handles locations map and data viewer
   - Fetches data from data/locations.json and data/sample-data.json
   - Renders Leaflet map on locations.html
   - Renders Chart and table on data.html (supports ?loc=id)
*/
(async function(){
  let supabaseClient = null;
  try{
    if(typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && window.supabase && window.supabase.createClient){
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }catch(e){
    console.warn('Supabase not configured or failed to initialize', e);
  }

        // --- Assays info cards logic for index.html ---
        if(document.getElementById('assays-cards')) {
          const assays = [
            {
              name: 'NNN (Nitrate-Nitrite-Nitrogen)',
              desc: 'NNN is a measure of dissolved inorganic nitrogen, important for understanding nutrient levels and potential for algal growth.',
              href: 'handbook.html#protocol-nitrogen'
            },
            {
              name: 'DRP (Dissolved Reactive Phosphorus)',
              desc: 'DRP indicates the amount of phosphorus available for algae, a key nutrient that can drive blooms.',
              href: 'handbook.html#protocol-drp'
            },
            {
              name: 'Chlorophyll A',
              desc: 'Chlorophyll A is a pigment in algae and is used as an indicator of algal biomass in the water.',
              href: 'handbook.html#protocol-chlorophyll-a'
            },
            {
              name: 'pH',
              desc: 'pH measures how acidic or basic the water is, affecting aquatic life and chemical processes.',
              href: 'handbook.html#protocol-ph'
            },
            {
              name: 'Turbidity',
              desc: 'Turbidity is a measure of water clarity, affected by suspended particles and runoff.',
              href: 'handbook.html#protocol-turbidity'
            },
            {
              name: 'Conductivity',
              desc: 'Conductivity reflects the water’s ability to conduct electricity, related to the concentration of dissolved salts.',
              href: 'handbook.html#protocol-conductivity'
            },
            {
              name: 'Temperature',
              desc: 'Temperature affects oxygen levels, chemical reactions, and the health of aquatic organisms.',
              href: 'handbook.html#protocol-temperature'
            }
          ];
          const imgList = [
            'assets/join5.jpg',
            'assets/join7.jpg',
            'assets/join3.jpg',
            'assets/join2.jpg'
          ];
          const assayImages = {
            Temperature: ['assets/join4.jpg', 'assets/join1.jpg']
          };
          const selected = assays;
          const container = document.getElementById('assays-cards');
          container.innerHTML = '';
          selected.forEach((assay, i) => {
            const card = document.createElement('a');
            card.className = 'location-card';
            card.href = assay.href;
            const assayImage = assayImages[assay.name];
            const img = Array.isArray(assayImage)
              ? assayImage[Math.floor(Math.random() * assayImage.length)]
              : assayImage || imgList[i % imgList.length];
            card.innerHTML = `
              <img src="${img}" alt="${assay.name}">
              <div class="location-info">
                <strong>${assay.name}</strong>
                <span>${assay.desc}</span>
                <span class="assay-protocol-link">View protocol &rarr;</span>
              </div>
            `;
            container.appendChild(card);
          });
        }
    // --- Featured Locations logic for index.html ---
    if(document.getElementById('featured-locations')) {
      fetch('data/locations.json').then(r=>r.json()).then(async locations => {
        const filtered = locations.filter(l => l.currentSite).sort((a,b) => a.currentSite - b.currentSite);
        const imgList = ['assets/harbour1.jpg','assets/harbour2.jpg','assets/harbour3.jpg'];
        const photosByLocation = {};
        const schoolByLocation = {};
        const schoolBranding = {
          "St Hilda's Collegiate": { primary: '#2f6fa3', accent: '#e8f2fb' },
          'Trinity College': { primary: '#17365d', accent: '#f1e2e4' },
          'Logan Park High School': { primary: '#6f1d2b', accent: '#f4e8ea' },
          'Bayfield High School': { primary: '#245b45', accent: '#e9f1ed' },
          'Columba College': { primary: '#1f4d3a', accent: '#e8f0ec' }
        };
        if (supabaseClient) {
          try {
            const assignmentResponse = await supabaseClient.rpc('location_school_list');
            if (assignmentResponse.error) throw assignmentResponse.error;
            (assignmentResponse.data || []).forEach(item => {
              if (item.school_name) {
                schoolByLocation[String(item.location_id)] = item.school_name;
              }
            });
          } catch (error) {
            console.warn('Location school assignments unavailable:', error);
          }
          await Promise.all(filtered.map(async location => {
            try {
              const { data, error } = await supabaseClient.rpc('site_photo_list', {
                p_locationid: Number(location.id)
              });
              if (error) throw error;
              const photo = data && data[0];
              if (!photo || !photo.object_path) return;
              const signed = await supabaseClient.storage.from('site-photos').createSignedUrl(photo.object_path, 3600);
              if (signed.error) throw signed.error;
              if (signed.data && signed.data.signedUrl) {
                photosByLocation[String(location.id)] = signed.data.signedUrl;
              }
            } catch (error) {
              console.warn(`Approved photo unavailable for ${location.name}:`, error);
            }
          }));
        }
        filtered.forEach((l,i)=>{
          l.img = photosByLocation[String(l.id)] || imgList[i%imgList.length];
          l.desc = `Current monitoring site ${l.currentSite}`;
        });
        const featured = filtered;
        const container = document.getElementById('featured-locations');
        container.innerHTML = '';
        featured.forEach(loc => {
          const card = document.createElement('a');
          card.className = 'location-card';
          card.href = `site.html?id=${encodeURIComponent(loc.id)}`;
          const schoolName = schoolByLocation[String(loc.id)] || '';
          const theme = schoolBranding[schoolName];
          if (theme) {
            card.classList.add('school-owned-card');
            card.style.setProperty('--school-primary', theme.primary);
            card.style.setProperty('--school-accent', theme.accent);
          }
          card.innerHTML = `
            <img src="${loc.img}" alt="Photo of ${loc.name}">
            <div class="location-info">
              <strong>${loc.name}</strong>
              <span>${loc.desc}</span>
            </div>
          `;
          if (schoolName) {
            const school = document.createElement('span');
            school.className = 'location-school';
            school.textContent = schoolName;
            card.querySelector('.location-info').appendChild(school);
          }
          container.appendChild(card);
        });
      });
    }
  async function fetchJSON(path){
    const r = await fetch(path);
    if(!r.ok) throw new Error('Failed to load '+path);
    return r.json();
  }

  function showDataSourceNotice(message) {
    const notice = document.getElementById('data-source-status');
    if (notice) {
      notice.textContent = message;
      notice.hidden = !message;
    }
  }

  // Helper functions that prefer Supabase when configured, otherwise fall back to local JSON files.
  async function getLocations(){
    if(supabaseClient){
      try{
        const [{ data: locRows, error }, localLocations] = await Promise.all([
          supabaseClient.from('locations').select('*'),
          fetchJSON('data/locations.json')
        ]);
        if(error) throw error;
        let assignments = {};
        const assignmentResponse = await supabaseClient.rpc('location_school_list');
        if (!assignmentResponse.error) {
          (assignmentResponse.data || []).forEach(item => {
            assignments[String(item.location_id)] = item.school_name || '';
          });
        } else {
          console.warn('Location school assignments unavailable:', assignmentResponse.error);
        }
        // normalize to {id, name, lat, lng}
        const normalized = (locRows || []).map(r=>({ id: String(r.id), name: r.location ?? r.name ?? String(r.id), lat: r.lat ?? r.latitude, lng: r.lng ?? r.longitude, currentSite: localLocations.find(l => String(l.id) === String(r.id))?.currentSite, schoolName: assignments[String(r.id)] || '' }));
        return normalized;
      }catch(e){
        console.warn('Supabase locations fetch failed, falling back to local JSON', e);
        try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.fetchErrors = window.__hhw_debug.fetchErrors || []; window.__hhw_debug.fetchErrors.push({op:'locations', error:String(e)}); }catch(_){}
        return fetchJSON('data/locations.json').then(rows => rows.map(row => ({ ...row, schoolName: '' })));
      }
    }
    return fetchJSON('data/locations.json').then(rows => rows.map(row => ({ ...row, schoolName: '' })));
  }

  async function getRecords(locId){
    if(supabaseClient){
      try{
        // fetch main data rows
        const { data: rows, error: rowsErr } = await supabaseClient.from('data').select('*').limit(20000);
        if(rowsErr) throw rowsErr;

        // fetch mapping tables: parameters and samplingdates
        const [paramsResp, datesResp] = await Promise.all([
          supabaseClient.from('parameters').select('*'),
          supabaseClient.from('samplingdates').select('*').limit(10000)
        ]);
        const params = paramsResp.data ?? paramsResp;
        const dates = datesResp.data ?? datesResp;
        // Debug: log parameters and dates tables
        try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.parametersTable = params; window.__hhw_debug.samplingdatesTable = dates; }catch(_){}
        // Build mapping with string keys
        const paramById = {};
        (params||[]).forEach(p=>{
          paramById[String(p.id)] = { name: p.parameter ?? p.name ?? String(p.id), unit: p.unit };
        });
        const dateById = {};
        (dates||[]).forEach(d=>{
          dateById[String(d.id)] = d.date;
        });

        // Optionally fetch dates/locations if you want to map those as well
        // const [datesResp, locsResp] = await Promise.all([
        //   supabaseClient.from('samplingdates').select('*'),
        //   supabaseClient.from('locations').select('*')
        // ]);
        // const dateById = new Map((datesResp.data||[]).map(d=>[String(d.id), d.date]));
        // const locById = new Map((locsResp.data||[]).map(l=>[String(l.id), { name: l.location ?? l.name ?? String(l.id) }]));

        const missingParamIds = [];
        const normalized = (rows||[]).map(r=>{
          const paramIdStr = String(r.parameterid);
          const p = paramById[paramIdStr];
          if(!p && !missingParamIds.includes(paramIdStr)) missingParamIds.push(paramIdStr);
          // Map dateid to date string
          const dateStr = r.dateid ? dateById[String(r.dateid)] : null;
          return {
            date: dateStr || null,
            parameter: p ? p.name : paramIdStr,
            parameterId: paramIdStr,
            value: r.value != null ? Number(r.value) : null,
            unit: p ? p.unit : '',
            loc: String(r.locationid),
            _raw: r
          };
        });
        if(missingParamIds.length){
          try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.missingParameterIds = missingParamIds; }catch(_){}
        }

        try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.recordsTable = 'data'; window.__hhw_debug.rawRows = rows?.length ?? 0; }catch(_){ }

        // Only fall back to local JSON if Supabase returns zero rows or errors
        if(!rows || rows.length === 0 || (normalized||[]).length === 0){
          try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.notes = (window.__hhw_debug.notes||[]); window.__hhw_debug.notes.push('Supabase returned 0 rows; falling back to local JSON'); }catch(_){}
          showDataSourceNotice('No live measurements were returned. Showing the bundled sample data instead.');
          return fetchJSON('data/sample-data.json');
        }

        showDataSourceNotice('');
        if(locId){ return normalized.filter(r=>r.loc===locId); }
        return normalized;
      }catch(e){
        console.warn('Supabase composite fetch failed, falling back to local JSON', e);
        showDataSourceNotice('Could not load live measurements. Showing the bundled sample data instead; check your connection and try again.');
        try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.fetchErrors = window.__hhw_debug.fetchErrors || []; window.__hhw_debug.fetchErrors.push({op:'data-composite', error:String(e)}); }catch(_){ }
        return fetchJSON('data/sample-data.json');
      }
    }
    showDataSourceNotice('Live data is not configured. Showing the bundled sample data instead.');
    return fetchJSON('data/sample-data.json');
  }

  // Helper to read query param `loc`
  function getLocParam(){
    const p = new URLSearchParams(location.search);
    return p.get('loc');
  }

  // If we're on locations.html, render map and list
  if(document.getElementById('map')){
    const locations = await getLocations();
    const map = L.map('map').setView([-45.87,170.62],12);
    // Satellite tiles (Esri World Imagery)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }).addTo(map);
    const list = document.getElementById('locations-list');
    const sidebar = document.getElementById('site-sidebar');
    const paramCardsLeft = document.getElementById('location-parameter-cards-left');
    const paramCardsRight = document.getElementById('location-parameter-cards-right');
    // Helper: render most recent datapoint cards for a location, split left/right
    async function renderParameterCardsSplit(locationId) {
      if(!paramCardsLeft || !paramCardsRight) return;
      paramCardsLeft.innerHTML = '<span style="color:#888;font-size:1em">Loading...</span>';
      paramCardsRight.innerHTML = '';
      const records = await getRecords(locationId);
      // For each parameter, find the most recent valid data point
      const latestValidByParam = {};
      records.forEach(r => {
        if(!r.parameter) return;
        // Only consider valid values (zero is valid)
        const isValid = r.value !== null && r.value !== undefined && r.value !== '' && r.value !== 'N/A';
        if(!isValid) return;
        if(!latestValidByParam[r.parameter] || (r.date && r.date > latestValidByParam[r.parameter].date)) {
          latestValidByParam[r.parameter] = r;
        }
      });
      const cards = Object.values(latestValidByParam).map(rec => {
        const card = document.createElement('div');
        card.className = 'location-parameter-card';
        card.innerHTML = `<strong>${rec.parameter}</strong>
          <div style="font-size:1.1em;color:#1976d2;font-weight:600;">${rec.value} ${rec.unit ?? ''}</div>
          <div style="font-size:0.98em;color:#555;">${rec.date ? 'Sampled: ' + rec.date : ''}</div>`;
        return card;
      });
      paramCardsLeft.innerHTML = '';
      paramCardsRight.innerHTML = '';
      // Split cards into left/right columns
      const mid = Math.ceil(cards.length / 2);
      cards.slice(0, 5).forEach(card => paramCardsLeft.appendChild(card));
      cards.slice(5, 10).forEach(card => paramCardsRight.appendChild(card));
    }
    // Add markers and sidebar logic
    const groups = [
      { title: 'Current monitoring sites', items: locations.filter(loc => loc.currentSite).sort((a,b) => a.currentSite - b.currentSite) },
      { title: 'Historical sites', items: locations.filter(loc => !loc.currentSite) }
    ];
    groups.forEach(group => {
      const heading = document.createElement('h2');
      heading.textContent = group.title;
      const entries = document.createElement('ul');
      list.append(heading, entries);
      group.items.forEach(loc=>{
      const marker = L.marker([loc.lat,loc.lng]).addTo(map);
      marker.bindTooltip(loc.name, { direction: 'top', className: 'location-pin-label' });
      marker.on('click', ()=>{
        // Show sidebar with info
        if(sidebar){
          sidebar.style.display = 'block';
          sidebar.innerHTML = `
            <button id="close-sidebar" aria-label="Close site details" style="position:absolute;top:12px;right:12px;background:#fff2;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:18px;color:#0b5fa6;z-index:20">&times;</button>
            <h3 style='margin-top:0'>${loc.name}</h3>
            <div style="margin-bottom:10px;font-size:13px;color:#444">${loc.currentSite ? `Current site ${loc.currentSite}` : 'Historical site'}${loc.schoolName ? ` · ${loc.schoolName}` : ''}</div>
            <div><a href="site.html?id=${encodeURIComponent(loc.id)}">View site profile</a></div>
            <div><a id="view-data-link" href="data.html?loc=${encodeURIComponent(loc.id)}" style="color:#0b5fa6;text-decoration:underline">View data for this site</a></div>
          `;
          // Close button logic
          const closeBtn = sidebar.querySelector('#close-sidebar');
          if(closeBtn){
            closeBtn.onclick = ()=>{ sidebar.style.display = 'none'; };
          }
          // Render parameter cards for this location (split left/right)
          renderParameterCardsSplit(loc.id);
        }
      });
      if (getLocParam() === String(loc.id)) {
        map.setView([loc.lat, loc.lng], 14);
        marker.fire('click');
      }
      // List entry
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-list-button';
      button.textContent = `${loc.currentSite ? `Site ${loc.currentSite}: ` : ''}${loc.name}${loc.schoolName ? ` — ${loc.schoolName}` : ''}`;
      button.onclick = ()=>{
        map.setView([loc.lat,loc.lng],14);
        marker.fire('click');
      };
      const link = document.createElement('a');
      link.href = `data.html?loc=${encodeURIComponent(loc.id)}`;
      link.textContent = 'View data';
      const profile = document.createElement('a');
      profile.href = `site.html?id=${encodeURIComponent(loc.id)}`;
      profile.textContent = 'Site profile';
      li.append(button, document.createTextNode(' — '), profile, document.createTextNode(' — '), link);
      entries.appendChild(li);
      });
    });
    // Hide sidebar and parameter cards when clicking map background
    map.on('click', ()=>{ if(sidebar) sidebar.style.display = 'none'; if(paramCardsLeft) paramCardsLeft.innerHTML = ''; if(paramCardsRight) paramCardsRight.innerHTML = ''; });
  }

  // If we're on data.html, render chart and table
  if(document.getElementById('data-table')){
        // Download CSV button logic
        const downloadBtn = document.getElementById('download-csv');
        if(downloadBtn){
          downloadBtn.addEventListener('click',()=>{
            const filtered = filterRecords();
            if(!filtered.length){
              alert('No data to download.');
              return;
            }
            // Build CSV
            const headers = ['date','parameter','value','unit','loc'];
            const rows = [headers.join(',')];
            filtered.forEach(r=>{
              const row = [
                r.date,
                (paramDisplay && paramDisplay[String(r.parameter)]) ? paramDisplay[String(r.parameter)] : String(r.parameter),
                r.value,
                r.unit,
                r.loc
              ].map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',');
              rows.push(row);
            });
            const csv = rows.join('\r\n');
            // Download
            const blob = new Blob([csv],{type:'text/csv'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'hhw-data.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(()=>{
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);
          });
        }
    const locId = getLocParam();
    // always fetch all records initially; selection will filter client-side
    // Use the local locations JSON on the data page to avoid depending on the locations endpoint
    const [locations, records] = await Promise.all([fetchJSON('data/locations.json'), getRecords(null)]);
    const allRecords = records || [];

    // populate location selector (deduplicate names and show counts)
    const locationSelect = document.getElementById('location-select');
    // group locations by display name
    const groups = {};
    locations.slice().sort((a,b) => (a.currentSite || 999) - (b.currentSite || 999)).forEach(l=>{
      const name = l.name || l.location || String(l.id);
      groups[name] = groups[name] || [];
      groups[name].push(String(l.id));
    });
    // TEMP: restrict shown locations to a single name while debugging. Set to null to disable.
    const LOCATION_OVERRIDE = null;
    Object.entries(groups).forEach(([name, ids])=>{
      if(LOCATION_OVERRIDE && name !== LOCATION_OVERRIDE) return; // skip other groups
      const opt = document.createElement('option');
      opt.value = ids.join('|'); // store all ids for this display name
      const current = locations.find(l => (l.name || l.location || String(l.id)) === name)?.currentSite;
      opt.textContent = `${name}${current ? ` (current site ${current})` : ' (historical)'}`;
      locationSelect.appendChild(opt);
    });
    // If override is active, hide/disable the default empty option and select the override option(s)
    if(LOCATION_OVERRIDE){
      for(const opt of Array.from(locationSelect.options)){
        if(!opt.value){ opt.disabled = true; opt.selected = false; opt.hidden = true; }
      }
      for(const opt of locationSelect.options){ if(opt.value){ opt.selected = true; } }
    }
    // if ?loc= was provided, select matching grouped option(s)
    if(locId){
      const sid = String(locId);
      // mark any option whose value contains the requested id (options may contain 'id' or 'id|id')
      for(const opt of locationSelect.options){
        if(!opt.value) { opt.selected = false; continue; }
        const ids = String(opt.value).split('|').map(x=>x.trim());
        opt.selected = ids.includes(sid);
      }
    } else {
      // default to 'All locations' (first option)
      if(locationSelect.options.length) locationSelect.options[0].selected = true;
    }
    // show initial location name
    function showLocationName(selected){
      if(!selected){ document.getElementById('location-name').textContent = `Location: All locations`; return; }
      let name = selected;
      const sid = String(selected);
      for(const opt of locationSelect.options){
        if(!opt.value) continue;
        const ids = String(opt.value).split('|').map(x=>x.trim());
          if(ids.includes(sid)){
            name = opt.textContent;
            break;
          }
      }
      document.getElementById('location-name').textContent = `Location: ${name}`;
    }
    showLocationName(locationSelect.value || '');

    // UI elements
    const paramSelect = document.getElementById('param-select');
    const dateStart = document.getElementById('date-start');
    const dateEnd = document.getElementById('date-end');
    const dateStartLabel = document.getElementById('date-start-label');
    const dateEndLabel = document.getElementById('date-end-label');
    const dateClear = document.getElementById('date-clear');
    const samplingDates = Array.from(new Set(allRecords.map(r => r.date).filter(Boolean))).sort();
    let appliedDateRange = null;
    const applyBtn = document.getElementById('apply-filters');
    const resetBtn = document.getElementById('reset-filters');
    const table = document.getElementById('data-table');
    const ctx = document.getElementById('chart').getContext('2d');

    // derive available parameters and dates
    // Try to read a separate `parameters` table (id,parameter,unit). If present, use it to map ids -> display names.
    let paramMap = null; // maps paramId -> displayName
    let paramKeys = [];
    const debug = { paramKeys, paramsData: null, paramsErr: null, notes: [], rawDataFromSupabase: null };
    
    // Fetch raw data table for debugging connection
    if(supabaseClient){
      try{
        const { data: rawData, error: rawErr } = await supabaseClient.from('data').select('*').limit(100);
        debug.rawDataFromSupabase = { rows: rawData, error: rawErr, count: rawData?.length ?? 0 };
        if(rawErr){
          debug.notes.push('raw data fetch error: '+(rawErr.message||rawErr));
        } else if(rawData && rawData.length){
          debug.notes.push(`raw data table: ${rawData.length} rows found`);
          if(rawData[0]) debug.notes.push(`first row keys: ${Object.keys(rawData[0]).join(', ')}`);
        } else {
          debug.notes.push('raw data query returned 0 rows');
        }
      }catch(e){
        debug.notes.push('raw data fetch exception: '+String(e));
      }
    }
    
    try{
      if(supabaseClient){
        // select all columns and try to auto-detect id/name columns (common variations)
        const { data: paramsData, error: paramsErr } = await supabaseClient.from('parameters').select('*').limit(200);
        debug.paramsData = paramsData;
        debug.paramsErr = paramsErr && paramsErr.message ? paramsErr.message : paramsErr;
        if(paramsErr) debug.notes.push('parameters select returned error');
        if(!paramsErr && paramsData && paramsData.length){
          // detect available columns
          const cols = Object.keys(paramsData[0] || {});
          debug.paramsColumns = cols;
          // candidate name keys to try
          const nameCandidates = ['name','label','parameter','param_name','parameter_name','display','display_name','description'];
          const idCandidates = ['id','parameter_id','param_id','code'];
          let idKey = cols.find(c=>idCandidates.includes(c)) || cols[0];
          let nameKey = cols.find(c=>nameCandidates.includes(c)) || cols.find(c=>c!==idKey) || idKey;
          paramMap = {};
          paramsData.forEach(p=>{ paramMap[String(p[idKey])] = p[nameKey] ?? String(p[idKey]); });
          debug.notes.push(`parameters table loaded (${paramsData.length}); id=${idKey}, name=${nameKey}`);
        } else {
          debug.notes.push('no parameter rows returned from `parameters` table; will try to detect from `data` table');
          try{
            // try to get distinct parameter ids from the master `data` table
            const { data: dataParamRows, error: dataParamErr } = await supabaseClient.from('data').select('parameterid').limit(10000);
            if(dataParamErr){
              debug.notes.push('failed to read parameterids from `data` table: '+(dataParamErr.message||dataParamErr));
            } else if(dataParamRows && dataParamRows.length){
              const ids = Array.from(new Set(dataParamRows.map(r=>String(r.parameterid))));
              debug.notes.push(`found parameter ids in data table: ${ids.join(',')}`);
              // attempt to fetch matching parameter rows for nicer labels
              const { data: paramsById, error: paramsByIdErr } = await supabaseClient.from('parameters').select('*').in('id', ids).limit(200);
              if(paramsByIdErr){
                debug.notes.push('failed to fetch parameters by id: '+(paramsByIdErr.message||paramsByIdErr));
                // fallback to ids as keys
                paramMap = {};
                ids.forEach(id=>{ paramMap[String(id)] = String(id); });
              } else if(paramsById && paramsById.length){
                const cols = Object.keys(paramsById[0] || {});
                const nameCandidates = ['name','label','parameter','param_name','parameter_name','display','display_name','description'];
                const idCandidates = ['id','parameter_id','param_id','code'];
                let idKey = cols.find(c=>idCandidates.includes(c)) || cols[0];
                let nameKey = cols.find(c=>nameCandidates.includes(c)) || cols.find(c=>c!==idKey) || idKey;
                paramMap = {};
                paramsById.forEach(p=>{ paramMap[String(p[idKey])] = p[nameKey] ?? String(p[idKey]); });
                debug.notes.push(`parameters fetched by id (${paramsById.length}); id=${idKey}, name=${nameKey}`);
              } else {
                // no parameter rows found - fallback to using ids as labels
                paramMap = {};
                ids.forEach(id=>{ paramMap[String(id)] = String(id); });
                debug.notes.push('no parameter rows found for ids; using ids as labels');
              }
            } else {
              debug.notes.push('no parameterids found in data table; will fall back to sample data');
            }
          }catch(e){
            console.warn('parameter autodetect failed', e);
            debug.notes.push('parameter autodetect exception: '+String(e));
          }
        }
      }
    }catch(e){ console.warn('Failed to load parameters table', e); }
    // Build display mapping and populate select. Prefer paramMap (ids) when available, otherwise derive from records.
    if(paramMap){
      paramKeys = Object.keys(paramMap).sort();
    } else {
      paramKeys = Array.from(new Set((allRecords||[]).map(r=> r.parameterId ?? r.parameter))).sort();
    }
    const paramDisplay = {};
    if(paramMap){
      paramKeys.forEach(k=>{ paramDisplay[String(k)] = paramMap[String(k)] || String(k); });
      // paramSelect values are parameter ids
      paramSelect.innerHTML = paramKeys.map(k=>`<option value="${k}">${paramDisplay[String(k)]}</option>`).join('');
    } else {
      paramKeys.forEach(k=>{ paramDisplay[String(k)] = String(k); });
      paramSelect.innerHTML = paramKeys.map(k=>`<option value="${k}">${paramDisplay[String(k)]}</option>`).join('');
    }
    // If no parameters were discovered, show a helpful placeholder so users know why the list is empty
    if((paramKeys||[]).length === 0){
      paramSelect.innerHTML = '<option value="">(no parameters found)</option>';
    }
    // expose paramKeys to debug for easier troubleshooting
    try{ debug.paramKeys = paramKeys; window.__hhw_debug = Object.assign(window.__hhw_debug||{}, { paramKeys }); }catch(_){ }
    // Preselect Pulling Point 2 and Water Temperature on first load
    let initialSelectionDone = false;
    function preselectInitial(){
      if(initialSelectionDone) return;
      initialSelectionDone = true;
      // Try to select Pulling Point (location) and Water Temperature (parameter)
      // Find Pulling Point option (not 1 or 2)
      let locFound = false;
      for(let i=0;i<locationSelect.options.length;i++){
        const opt = locationSelect.options[i];
        if(locId ? opt.value.split('|').includes(String(locId)) : opt.value.split('|').includes('1')){
          opt.selected = true;
          locFound = true;
        } else {
          opt.selected = false;
        }
      }
      // Find Water Temperature parameter (case-insensitive match)
      let paramFound = false;
      for(let i=0;i<paramSelect.options.length;i++){
        const opt = paramSelect.options[i];
        if(opt.textContent && opt.textContent.toLowerCase().includes('water temp')){
          opt.selected = true;
          paramFound = true;
        } else {
          opt.selected = false;
        }
      }
      // If not found, select first available
      if(!locFound && locationSelect.options.length) locationSelect.options[0].selected = true;
      if(!paramFound && paramSelect.options.length) paramSelect.options[0].selected = true;
    }

    // helper: filter records by UI
    function filterRecords(){
      const selectedParams = Array.from(paramSelect.selectedOptions).map(o=>o.value);
      const selectedLocValues = Array.from(locationSelect.selectedOptions).map(o=>o.value).filter(v=>v && v!=='');
      // flatten selected location ids (options may hold 'id' or 'id|id')
      const selectedLoc = selectedLocValues.length ? selectedLocValues.flatMap(v=>String(v).split('|')) : [];
      return allRecords.filter(r=>{
        // parameter filtering: compare selected param ids to record.parameterId if available, otherwise compare names
        if(selectedParams.length){
          const pId = r.parameterId || r.parameter;
          if(!selectedParams.includes(String(pId))) return false;
        }
        // location filtering: if any selected, require r.loc to be in the flattened list
        if(selectedLoc.length){ if(!selectedLoc.includes(String(r.loc))) return false; }
        if (appliedDateRange && (!r.date || r.date < appliedDateRange.start || r.date > appliedDateRange.end)) return false;
        return true;
      });
    }

    // build table from filtered records
    function renderTable(filtered){
      table.innerHTML = '';
      if(!filtered.length){ table.innerHTML = '<tr><td>No records found</td></tr>'; return; }
      const headers = ['date','parameter','value','unit','location'];
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr>${headers.map(h=>`<th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">${h}</th>`).join('')}</tr>`;
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      // Build a map of location id to name for fast lookup
      const locIdToName = {};
      if (Array.isArray(locations)) {
        locations.forEach(l => {
          locIdToName[String(l.id)] = l.name || l.location || String(l.id);
        });
      }
      function formatDateDDMMYYYY(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
      filtered.forEach(r=>{
        const tr = document.createElement('tr');
        const displayParam = (paramDisplay && paramDisplay[String(r.parameter)]) ? paramDisplay[String(r.parameter)] : String(r.parameter);
        const displayLoc = locIdToName[String(r.loc)] || r.loc;
        const displayDate = formatDateDDMMYYYY(r.date);
        tr.innerHTML = `<td style="padding:6px;border-bottom:1px solid #f1f1f1">${displayDate}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${displayParam}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.value}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.unit}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${displayLoc}</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    }

    // chart instance management
    let chartInstance = null;
    const colors = ['#0b5fa6','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b'];
    function palette(i){ return colors[i % colors.length]; }

    const chartTypeToggleBtn = document.getElementById('chart-type-toggle-btn');
    let chartTypeState = 'bar'; // default
    let trendlineState = false;
        const trendlineToggleBtn = document.getElementById('trendline-toggle-btn');
        function updateTrendlineBtn() {
          if (!trendlineToggleBtn) return;
          trendlineToggleBtn.textContent = trendlineState ? 'Hide Trendline' : 'Show Trendline';
        }
        if(trendlineToggleBtn){
          trendlineToggleBtn.addEventListener('click', ()=>{
            trendlineState = !trendlineState;
            updateTrendlineBtn();
            renderChart(filterRecords());
          });
          updateTrendlineBtn();
        }
    function getChartType() {
      return chartTypeState;
    }

    function updateChartTypeBtn() {
      if (!chartTypeToggleBtn) return;
      chartTypeToggleBtn.textContent = chartTypeState === 'bar' ? 'Convert to line graph' : 'Convert to bar graph';
    }

    // Ensure all UI is initialized after DOM and after allRecords is set
    function setupUIAfterDOM() {
      if(chartTypeToggleBtn){
        chartTypeToggleBtn.addEventListener('click', ()=>{
          chartTypeState = chartTypeState === 'bar' ? 'line' : 'bar';
          updateChartTypeBtn();
          renderChart(filterRecords());
        });
        updateChartTypeBtn();
      }
      preselectInitial();
      setupDateSliders();
      dateClear.addEventListener('click', () => {
        resetDateSliders();
        applyFilters();
      });
      // Set up Apply button to always apply current filter state
      if(applyBtn){
        applyBtn.onclick = null;
        applyBtn.addEventListener('click', ()=>{
          applyFilters();
        });
      }
      if(resetBtn){
        resetBtn.onclick = null;
        resetBtn.addEventListener('click', ()=>{
          resetDateSliders();
          for(let i=0;i<paramSelect.options.length;i++) paramSelect.options[i].selected = true;
          locationSelect.value = '';
          applyFilters();
        });
      }
      // Initial render
      applyFilters();
    }

    // Call after allRecords and selectors are ready
    setupUIAfterDOM();
    document.dispatchEvent(new Event('hhw-data-ready'));

    function renderChart(filtered){
      const chartTitleDiv = document.getElementById('chart-title');
      if(!filtered.length){ 
        ctx.canvas.style.display='none'; 
        if(chartInstance){ chartInstance.destroy(); chartInstance=null;}
        if(chartTitleDiv) chartTitleDiv.textContent = '';
        return; 
      }
      ctx.canvas.style.display='block';
      // get sorted unique dates
      const dates = Array.from(new Set(filtered.map(r=>r.date))).sort((a,b)=>new Date(a)-new Date(b));
      // get selected params and locations
      const params = Array.from(new Set(filtered.map(r=>r.parameter))).sort();
      const locs = Array.from(new Set(filtered.map(r=>r.loc))).sort();
      let datasets = [];
      // --- Dynamic chart title logic ---
      let paramNames = params.map(p => (paramDisplay && paramDisplay[String(p)]) ? paramDisplay[String(p)] : String(p));
      let locNames = locs.map(l => {
        let label = String(l);
        const locOpt = Array.from(locationSelect.options).find(opt=>opt.value.split('|').includes(String(l)));
        if(locOpt) label = locOpt.textContent;
        return label;
      });
      // Date range formatting
      let dateRangeStr = '';
      if (appliedDateRange) {
        dateRangeStr = ` (${formatSamplingDate(appliedDateRange.start)} to ${formatSamplingDate(appliedDateRange.end)})`;
      }
      let chartTitle = '';
      if(paramNames.length === 1 && locNames.length === 1){
        chartTitle = `${paramNames[0]} at ${locNames[0]}${dateRangeStr}`;
      } else if(paramNames.length === 1 && locNames.length > 1){
        chartTitle = `${paramNames[0]} at ${locNames.join(' & ')}${dateRangeStr}`;
      } else if(paramNames.length > 1 && locNames.length === 1){
        chartTitle = `${paramNames.join(' & ')} at ${locNames[0]}${dateRangeStr}`;
      } else if(paramNames.length > 1 && locNames.length > 1){
        chartTitle = `${paramNames.join(' & ')} at ${locNames.join(' & ')}${dateRangeStr}`;
      } else {
        chartTitle = `Data${dateRangeStr}`;
      }
      if(chartTitleDiv) chartTitleDiv.textContent = chartTitle;
      // --- End chart title logic ---
      // If exactly one parameter and multiple locations, compare locations
      if(params.length === 1 && locs.length > 1){
        datasets = locs.map((locKey,i)=>{
          const data = dates.map(d=>{
            const rec = filtered.find(r=>String(r.loc)===String(locKey) && r.date===d);
            return rec ? rec.value : null;
          });
          // Try to get location name from select options
          let label = String(locKey);
          const locOpt = Array.from(locationSelect.options).find(opt=>opt.value.split('|').includes(String(locKey)));
          if(locOpt) label = locOpt.textContent;
          return {
            label,
            data,
            backgroundColor: palette(i),
            borderColor: palette(i),
            borderWidth: 1,
            spanGaps: true,
            _showTrendline: trendlineState
          };
        });
      } else {
        // Default: compare parameters (old behavior)
        datasets = params.map((paramKey,i)=>{
          const data = dates.map(d=>{
            const rec = filtered.find(r=>String(r.parameter)===String(paramKey) && r.date===d);
            return rec ? rec.value : null;
          });
          const label = (paramDisplay && paramDisplay[String(paramKey)]) ? paramDisplay[String(paramKey)] : String(paramKey);
          return {
            label,
            data,
            backgroundColor: palette(i),
            borderColor: palette(i),
            borderWidth: 1,
            spanGaps: true,
            _showTrendline: trendlineState
          };
        });
      }
      const chartData = { labels: dates, datasets };
      if(chartInstance) chartInstance.destroy();
      const chartType = getChartType();
      chartInstance = new Chart(ctx, {
        type: chartType,
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { font: { size: 16 }, padding: 18 } },
            tooltip: { backgroundColor: '#0b5fa6', titleColor: '#fff', bodyColor: '#fff', borderColor: '#fff', borderWidth: 1, padding: 14 },
            title: { display: false },
            trendline: { enabled: trendlineState, color: '#e74c3c', lineWidth: 2 }
          },
          elements: {
            line: { borderWidth: 4, tension: 0.3 },
            point: { radius: 5, borderWidth: 2, backgroundColor: '#fff' },
            bar: { borderRadius: 0, borderSkipped: false }
          },
          scales: {
            x: {
              display: true,
              stacked: false,
              grid: { color: '#e3e8f0', borderColor: '#b5c6e0' },
              ticks: { font: { size: 14 } }
            },
            y: {
              display: true,
              stacked: false,
              grid: { color: '#e3e8f0', borderColor: '#b5c6e0' },
              ticks: { font: { size: 14 } }
            }
          }
        }
      });
    }

    function formatSamplingDate(value) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function updateDateSliderLabels() {
      const start = samplingDates[Number(dateStart.value)];
      const end = samplingDates[Number(dateEnd.value)];
      dateStartLabel.textContent = start ? formatSamplingDate(start) : 'No dates available';
      dateEndLabel.textContent = end ? formatSamplingDate(end) : 'No dates available';
      dateStart.setAttribute('aria-valuetext', dateStartLabel.textContent);
      dateEnd.setAttribute('aria-valuetext', dateEndLabel.textContent);
    }

    function resetDateSliders() {
      dateStart.value = '0';
      dateEnd.value = String(Math.max(0, samplingDates.length - 1));
      updateDateSliderLabels();
    }

    function setupDateSliders() {
      const last = Math.max(0, samplingDates.length - 1);
      [dateStart, dateEnd].forEach(slider => {
        slider.max = String(last);
        slider.disabled = samplingDates.length < 2;
      });
      resetDateSliders();
      dateStart.addEventListener('input', () => {
        if (Number(dateStart.value) > Number(dateEnd.value)) dateEnd.value = dateStart.value;
        updateDateSliderLabels();
      });
      dateEnd.addEventListener('input', () => {
        if (Number(dateEnd.value) < Number(dateStart.value)) dateStart.value = dateEnd.value;
        updateDateSliderLabels();
      });
      dateClear.disabled = samplingDates.length < 2;
    }

    function applyFilters(){
      const start = Number(dateStart.value);
      const end = Number(dateEnd.value);
      appliedDateRange = samplingDates.length > 1 && (start !== 0 || end !== samplingDates.length - 1)
        ? { start: samplingDates[start], end: samplingDates[end] }
        : null;
      const filtered = filterRecords();
      renderTable(filtered);
      renderChart(filtered);
      // update shown location name
      showLocationName(locationSelect.value || '');
    }


    // (moved to setupUIAfterDOM)

    // Debug output wiring removed
  }
})();
