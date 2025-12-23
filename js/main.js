/* main.js - handles locations map and data viewer
   - Fetches data from data/locations.json and data/sample-data.json
   - Renders Leaflet map on locations.html
   - Renders Chart and table on data.html (supports ?loc=id)
*/
(async function(){
    // --- Featured Locations logic for index.html ---
    if(document.getElementById('featured-locations')) {
      // Load locations from locations.json, exclude Pulling Point 2, randomize 3
      fetch('data/locations.json').then(r=>r.json()).then(locations => {
        const filtered = locations.filter(l => l.name !== 'Pulling Point 2');
        // Assign images and descriptions (fallbacks)
        const imgList = ['assets/harbour1.jpg','assets/harbour2.jpg','assets/harbour3.jpg'];
        const descs = [
          'Historic sampling site near the harbour mouth.',
          'Popular for mussel and water quality sampling.',
          'Sheltered bay, frequent mussel sampling.',
          'Community site near city edge.',
          'Freshwater meets the harbour ecosystem.',
          'Popular marina and sampling site.',
          'Stormwater outfall monitoring.',
          'Creek entering the harbour.',
          'Outlet to the harbour.'
        ];
        filtered.forEach((l,i)=>{
          l.img = imgList[i%imgList.length];
          l.desc = descs[i%descs.length];
        });
        function shuffle(arr) {
          for(let i=arr.length-1;i>0;i--){
            const j=Math.floor(Math.random()*(i+1));
            [arr[i],arr[j]]=[arr[j],arr[i]];
          }
          return arr;
        }
        const featured = shuffle([...filtered]).slice(0,3);
        const container = document.getElementById('featured-locations');
        featured.forEach(loc => {
          const card = document.createElement('a');
          card.className = 'location-card';
          card.href = `locations.html?loc=${encodeURIComponent(loc.id)}`;
          card.innerHTML = `
            <img src="${loc.img}" alt="${loc.name}">
            <div class="location-info">
              <strong>${loc.name}</strong>
              <span>${loc.desc}</span>
            </div>
          `;
          container.appendChild(card);
        });
      });
    }
  async function fetchJSON(path){
    const r = await fetch(path);
    if(!r.ok) throw new Error('Failed to load '+path);
    return r.json();
  }

  // Initialize Supabase client if config and library are present.
  let supabaseClient = null;
  try{
    if(typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && window.supabase && window.supabase.createClient){
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('Supabase client initialized');
    }
  }catch(e){
    console.warn('Supabase not configured or failed to initialize', e);
  }

  // Helper functions that prefer Supabase when configured, otherwise fall back to local JSON files.
  async function getLocations(){
    if(supabaseClient){
      try{
          const { data: locRows, error } = await supabaseClient.from('locations').select('*');
        if(error) throw error;
        // normalize to {id, name, lat, lng}
        const normalized = (locRows || []).map(r=>({ id: String(r.id), name: r.location ?? r.name ?? String(r.id), lat: r.lat ?? r.latitude, lng: r.lng ?? r.longitude }));
        return normalized;
      }catch(e){
        console.warn('Supabase locations fetch failed, falling back to local JSON', e);
        try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.fetchErrors = window.__hhw_debug.fetchErrors || []; window.__hhw_debug.fetchErrors.push({op:'locations', error:String(e)}); }catch(_){}
        return fetchJSON('data/locations.json');
      }
    }
    return fetchJSON('data/locations.json');
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
          return fetchJSON('data/sample-data.json');
        }

        if(locId){ return normalized.filter(r=>r.loc===locId); }
        return normalized;
      }catch(e){
        console.warn('Supabase composite fetch failed, falling back to local JSON', e);
        try{ window.__hhw_debug = window.__hhw_debug || {}; window.__hhw_debug.fetchErrors = window.__hhw_debug.fetchErrors || []; window.__hhw_debug.fetchErrors.push({op:'data-composite', error:String(e)}); }catch(_){ }
        return fetchJSON('data/sample-data.json');
      }
    }
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
    // Add markers and sidebar logic
    locations.forEach(loc=>{
      const marker = L.marker([loc.lat,loc.lng]).addTo(map);
      marker.on('click', ()=>{
        // Show sidebar with info
        if(sidebar){
          sidebar.style.display = 'block';
          sidebar.innerHTML = `
            <button id="close-sidebar" style="position:absolute;top:12px;right:12px;background:#fff2;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:18px;color:#0b5fa6;z-index:20">&times;</button>
            <h3 style='margin-top:0'>${loc.name}</h3>
            <div style="margin-bottom:10px;font-size:13px;color:#444">Site ID: ${loc.id}</div>
            <div id="site-info" style="margin-bottom:10px;color:#222">(Site info goes here)</div>
            <div><a id="view-data-link" href="#" style="color:#0b5fa6;text-decoration:underline">View data for this site</a></div>
          `;
          // Close button logic
          const closeBtn = sidebar.querySelector('#close-sidebar');
          if(closeBtn){
            closeBtn.onclick = ()=>{ sidebar.style.display = 'none'; };
          }
          // View data link logic: zoom in, then navigate
          const viewDataLink = sidebar.querySelector('#view-data-link');
          if(viewDataLink){
            viewDataLink.onclick = (e)=>{
              e.preventDefault();
              map.flyTo([loc.lat, loc.lng], 16, { animate: true, duration: 1.2 });
              setTimeout(()=>{
                window.location.href = `data.html?loc=${loc.id}`;
              }, 1200);
            };
          }
        }
      });
      // List entry
      const li = document.createElement('li');
      li.innerHTML = `<strong>${loc.name}</strong> — <a href="data.html?loc=${loc.id}">View data</a>`;
      li.style.cursor = 'pointer';
      li.onclick = ()=>{
        map.setView([loc.lat,loc.lng],14);
        marker.fire('click');
      };
      list.appendChild(li);
    });
    // Hide sidebar when clicking map background
    map.on('click', ()=>{ if(sidebar) sidebar.style.display = 'none'; });
  }

  // If we're on data.html, render chart and table
  if(document.getElementById('data-table')){
    // DB connection check UI
    const dbStatusText = document.getElementById('db-status-text');
    const dbCheckBtn = document.getElementById('db-check-btn');

    async function checkSupabaseConnection(){
      if(!supabaseClient){
        dbStatusText.textContent = 'Not configured';
        dbStatusText.style.color = '#a33';
        return false;
      }
      dbStatusText.textContent = 'Checking...';
      dbStatusText.style.color = '#555';
      try{
        // lightweight query: request one row from locations
        const { data, error } = await supabaseClient.from('locations').select('id').limit(1);
        if(error) throw error;
        // also perform a direct REST fetch to surface network/CORS/http errors
        try{
          const restUrl = String(SUPABASE_URL).replace(/\/$/, '') + '/rest/v1/locations?select=id&limit=1';
          const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };
          const resp = await fetch(restUrl, { method: 'GET', headers });
          if(!resp.ok){
            const body = await resp.text().catch(()=>'<no body>');
            dbStatusText.textContent = `Error HTTP ${resp.status}`;
            dbStatusText.title = body;
            dbStatusText.style.color = '#a33';
            console.warn('Supabase REST response', resp.status, body);
            return false;
          }
          dbStatusText.textContent = `Connected (HTTP ${resp.status})`;
          dbStatusText.style.color = '#0a8';
          return true;
        }catch(fetchErr){
          dbStatusText.textContent = 'Fetch error';
          dbStatusText.title = fetchErr.message || String(fetchErr);
          dbStatusText.style.color = '#a33';
          console.warn('Direct fetch to Supabase failed', fetchErr);
          return false;
        }
      }catch(err){
        console.warn('Supabase check failed', err);
        dbStatusText.textContent = 'Error: '+(err.message||err);
        dbStatusText.style.color = '#a33';
        return false;
      }
    }

    if(dbCheckBtn) dbCheckBtn.addEventListener('click', checkSupabaseConnection);
    // auto-check on page load
    checkSupabaseConnection();

    const locId = getLocParam();
    // always fetch all records initially; selection will filter client-side
    // Use the local locations JSON on the data page to avoid depending on the locations endpoint
    const [locations, records] = await Promise.all([fetchJSON('data/locations.json'), getRecords(null)]);
    const allRecords = records || [];

    // populate location selector (deduplicate names and show counts)
    const locationSelect = document.getElementById('location-select');
    // group locations by display name
    const groups = {};
    locations.forEach(l=>{
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
      opt.textContent = name;
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
    // Dual date slider UI
    const dateSliderStart = document.getElementById('date-range-slider-start');
    const dateSliderEnd = document.getElementById('date-range-slider-end');
    const dateSliderMinLabel = document.getElementById('date-slider-min-label');
    const dateSliderMaxLabel = document.getElementById('date-slider-max-label');
    const dateSliderSelected = document.getElementById('date-slider-selected');
    let sliderDates = [];
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
        if(opt.textContent && opt.textContent.trim().toLowerCase() === 'pulling point'){
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
      // dual slider filtering
      let minIdx = 0, maxIdx = sliderDates.length-1;
      if(dateSliderStart && dateSliderEnd && sliderDates.length > 1){
        minIdx = Math.min(Number(dateSliderStart.value), Number(dateSliderEnd.value));
        maxIdx = Math.max(Number(dateSliderStart.value), Number(dateSliderEnd.value));
      }
      return allRecords.filter(r=>{
        // parameter filtering: compare selected param ids to record.parameterId if available, otherwise compare names
        if(selectedParams.length){
          const pId = r.parameterId || r.parameter;
          if(!selectedParams.includes(String(pId))) return false;
        }
        // location filtering: if any selected, require r.loc to be in the flattened list
        if(selectedLoc.length){ if(!selectedLoc.includes(String(r.loc))) return false; }
        // date filtering via dual slider
        if(r.date && sliderDates.length > 1){
          const idx = sliderDates.indexOf(r.date);
          if(idx < minIdx || idx > maxIdx) return false;
        }
        return true;
      });
    }

    // build table from filtered records
    function renderTable(filtered){
      table.innerHTML = '';
      if(!filtered.length){ table.innerHTML = '<tr><td>No records found</td></tr>'; return; }
      const headers = ['date','parameter','value','unit','loc'];
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr>${headers.map(h=>`<th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">${h}</th>`).join('')}</tr>`;
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      filtered.forEach(r=>{
        const tr = document.createElement('tr');
        const displayParam = (paramDisplay && paramDisplay[String(r.parameter)]) ? paramDisplay[String(r.parameter)] : String(r.parameter);
        tr.innerHTML = `<td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.date}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${displayParam}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.value}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.unit}</td>
                        <td style="padding:6px;border-bottom:1px solid #f1f1f1">${r.loc}</td>`;
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
      setupDateSlider();
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
          // Reset sliders to full range
          if(sliderDates.length > 1){
            dateSliderStart.value = 0;
            dateSliderEnd.value = sliderDates.length-1;
            updateDateSliderLabel();
          }
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
      if (sliderDates && sliderDates.length > 1 && dateSliderStart && dateSliderEnd) {
        const minIdx = Math.min(Number(dateSliderStart.value), Number(dateSliderEnd.value));
        const maxIdx = Math.max(Number(dateSliderStart.value), Number(dateSliderEnd.value));
        const startDate = sliderDates[minIdx];
        const endDate = sliderDates[maxIdx];
        function formatDate(d) {
          if(!d) return '';
          const dt = new Date(d);
          if(isNaN(dt)) return d;
          return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        }
        dateRangeStr = ` (${formatDate(startDate)} to ${formatDate(endDate)})`;
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
            spanGaps: true
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
            spanGaps: true
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
            title: { display: false }
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

    if(chartTypeToggle){
      chartTypeToggle.addEventListener('change', ()=>{
        renderChart(filterRecords());
      });
    }

    function applyFilters(){
      const filtered = filterRecords();
      renderTable(filtered);
      renderChart(filtered);
      // update shown location name
      showLocationName(locationSelect.value || '');
    }

    // Dual date slider setup
    function setupDateSlider(){
      sliderDates = Array.from(new Set(allRecords.map(r=>r.date).filter(Boolean))).sort();
      if(sliderDates.length < 2){
        dateSliderStart.disabled = true;
        dateSliderEnd.disabled = true;
        dateSliderMinLabel.textContent = '';
        dateSliderMaxLabel.textContent = '';
        dateSliderSelected.textContent = '';
        return;
      }
      dateSliderStart.disabled = false;
      dateSliderEnd.disabled = false;
      dateSliderStart.min = 0;
      dateSliderStart.max = sliderDates.length-1;
      dateSliderEnd.min = 0;
      dateSliderEnd.max = sliderDates.length-1;
      dateSliderStart.value = 0;
      dateSliderEnd.value = sliderDates.length-1;
      dateSliderStart.step = 1;
      dateSliderEnd.step = 1;
      dateSliderMinLabel.textContent = sliderDates[0];
      dateSliderMaxLabel.textContent = sliderDates[sliderDates.length-1];
      updateDateSliderLabel();

      // Remove previous listeners to avoid duplicates
      dateSliderStart.oninput = null;
      dateSliderEnd.oninput = null;
      dateSliderStart.addEventListener('input', ()=>{
        updateDateSliderLabel();
        applyFilters();
      });
      dateSliderEnd.addEventListener('input', ()=>{
        updateDateSliderLabel();
        applyFilters();
      });
    }

    function updateDateSliderLabel(){
      if(sliderDates.length < 2) { dateSliderSelected.textContent = ''; return; }
      const minIdx = Math.min(Number(dateSliderStart.value), Number(dateSliderEnd.value));
      const maxIdx = Math.max(Number(dateSliderStart.value), Number(dateSliderEnd.value));
      dateSliderSelected.textContent = `${sliderDates[minIdx]} to ${sliderDates[maxIdx]}`;
    }

    // (moved to setupUIAfterDOM)

    // Debug output wiring removed
  }
})();
