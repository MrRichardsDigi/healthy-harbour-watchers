// Simple admin login and dashboard logic

// Load PapaParse for CSV parsing
function loadPapaParse(cb) {
  if(window.Papa) return cb();
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
  script.onload = cb;
  document.head.appendChild(script);
}

// Create a single Supabase client instance for the whole file
let supabaseClient = null;
if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined' && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function showDashboard() {
  document.body.innerHTML = `
    <div class="site-banner">
      <span>Healthy Harbour Watchers &mdash; Community Science for Otago Harbour</span>
    </div>
    <header class="site-header">
      <a href="index.html" class="site-logo"><img src="assets/logo.png" alt="Healthy Harbour Watchers logo"></a>
      <h1>Admin Dashboard</h1>
      <nav>
        <a href="index.html">Home</a>
        <a href="locations.html">Locations</a>
        <a href="data.html">Data</a>
        <a href="join.html">Join</a>
        <a href="blog.html">Blog</a>
        <a href="admin.html" class="nav-current">Admin</a>
        <a href="#" onclick="logout()" style="color:#b33;font-weight:bold;">Logout</a>
      </nav>
    </header>
    <main style='max-width:900px;margin:32px auto;'>
      <section class='intro'>
        <h2>Bulk Data Upload (CSV)</h2>
        <a href='data/data-upload-template.csv' download style='display:inline-block;margin-bottom:10px;padding:6px 14px;background:#e6f0ff;color:#0b5fa6;border-radius:6px;text-decoration:none;font-size:1em;'>Download CSV Template</a><br>
        <label style='display:block;margin-bottom:10px;'>
          Sampling Date:
          <input type='date' id='csv-sampling-date' style='margin-left:8px;padding:4px 8px;'>
        </label>
        <input type='file' id='csv-upload' accept='.csv,text/csv' style='margin-bottom:10px;'>
        <button id='upload-csv-btn' style='padding:8px 18px;background:#0b5fa6;color:#fff;border:none;border-radius:6px;'>Upload CSV</button>
        <div id='csv-upload-status' style='margin-top:10px;font-size:1em;'></div>
        <div style='font-size:0.95em;color:#555;margin-top:8px;'>Please only use this function if you have the correct CSV format and understand the data structure.</div>
      </section>
      <section class='intro' style='margin-top:32px;'>
        <h2>Write Blog Post</h2>
        <form id='add-blog-form' style='display:flex;flex-direction:column;gap:10px;'>
          <input type='text' id='blog-title' placeholder='Title' required>
          <textarea id='blog-content' placeholder='Content' rows='6' required></textarea>
          <label style='font-size:0.98em;'>Image (optional): <input type='file' id='blog-image' accept='image/*'></label>
          <div style='display:flex;gap:10px;'>
            <button type='submit'>Publish Post</button>
            <button type='button' id='save-draft-btn' style='background:#e6f0ff;color:#0b5fa6;border-radius:6px;border:none;padding:8px 18px;'>Save Draft</button>
          </div>
        </form>
      </section>
      <section class='intro' style='margin-top:32px;'>
        <h2>Draft Blog Posts</h2>
        <div id='draft-posts'></div>
      </section>
    </main>
  `;

  // Drafts management logic
  async function loadDrafts() {
    const draftDiv = document.getElementById('draft-posts');
    if(typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
      draftDiv.innerHTML = '<div style="color:#b33">Supabase config missing or not loaded.</div>';
      return;
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    draftDiv.innerHTML = '<div>Loading drafts...</div>';
    const { data, error } = await client.from('blog_posts').select('*').eq('published', false).order('created_at', { ascending: false });
    if(error) {
      draftDiv.innerHTML = '<div style="color:#b33">Error loading drafts: '+error.message+'</div>';
      return;
    }
    if(!data.length) {
      draftDiv.innerHTML = '<div>No drafts yet.</div>';
      return;
    }
    draftDiv.innerHTML = data.map(post => `
      <div style="background:#f4f8ff;padding:14px 16px;border-radius:10px;margin-bottom:18px;box-shadow:0 1px 6px #0b5fa61a;">
        <strong>${post.title}</strong>
        <div style="color:#0b5fa6;font-size:0.98em;margin-bottom:8px;">${(function(d){d=new Date(d);return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();})(post.created_at)}</div>
        <div style="font-size:1em;white-space:pre-line;margin-bottom:8px;">${post.content}</div>
        <button class="publish-draft-btn" data-id="${post.id}" style="background:#0b5fa6;color:#fff;border:none;border-radius:6px;padding:6px 14px;margin-right:8px;">Publish</button>
        <button class="edit-draft-btn" data-id="${post.id}" style="background:#e6f0ff;color:#0b5fa6;border:none;border-radius:6px;padding:6px 14px;">Edit</button>
      </div>
    `).join('');
    // Add event listeners for publish and edit
    draftDiv.querySelectorAll('.publish-draft-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await client.from('blog_posts').update({ published: true }).eq('id', id);
        loadDrafts();
        alert('Draft published!');
      });
    });
    draftDiv.querySelectorAll('.edit-draft-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const post = data.find(p => String(p.id) === String(id));
        if(post){
          document.getElementById('blog-title').value = post.title;
          document.getElementById('blog-content').value = post.content;
          // Image editing not supported for drafts
        }
      });
    });
  }
  loadDrafts();

  // CSV upload logic
  loadPapaParse(()=>{
    const uploadBtn = document.getElementById('upload-csv-btn');
    const fileInput = document.getElementById('csv-upload');
    const statusDiv = document.getElementById('csv-upload-status');
    uploadBtn.addEventListener('click', async ()=>{
      const file = fileInput.files[0];
      if(!file) { statusDiv.textContent = 'Please select a CSV file.'; return; }
      statusDiv.textContent = 'Parsing CSV...';
      const samplingDateInput = document.getElementById('csv-sampling-date');
      const samplingDate = samplingDateInput && samplingDateInput.value ? samplingDateInput.value : null;
      if(!samplingDate) {
        statusDiv.textContent = 'Please select a sampling date.';
        return;
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
          statusDiv.textContent = `Parsed ${results.data.length} rows. Processing and uploading to Supabase...`;
          try {
            if(typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
              statusDiv.textContent = 'Supabase config missing or not loaded.';
              return;
            }
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            // Insert or get sampling date id
            let dateid = null;
            // Try to find existing date
            // Always convert date from dd/mm/yyyy to YYYY-MM-DD for Supabase
            let formattedDate = samplingDate;
            if(/\d{2}\/\d{2}\/\d{4}/.test(samplingDate)) {
              const [dd, mm, yyyy] = samplingDate.split('/');
              formattedDate = `${yyyy}-${mm}-${dd}`;
            }
            // If date is already YYYY-MM-DD, keep as is
            // Use formattedDate for both insert and select
            // Always use 'date' column (type: date)
            const { data: dateRows, error: dateErr } = await client.from('samplingdates').select('id').eq('date', formattedDate);
            if(dateErr) {
              statusDiv.textContent = 'Error checking sampling date: ' + dateErr.message;
              return;
            }
            if(dateRows && dateRows.length > 0) {
              dateid = dateRows[0].id;
            } else {
              // Try to insert new date, but handle duplicate error gracefully
              let newDateRows = null;
              let newDateErr = null;
              try {
                const insertResult = await client.from('samplingdates').insert([{ date: formattedDate }]).select('id');
                newDateRows = insertResult.data;
                newDateErr = insertResult.error;
              } catch(e) {
                newDateErr = e;
              }
              if(newDateErr) {
                // If duplicate error, re-select the id
                if(newDateErr.message && newDateErr.message.includes('duplicate key value')) {
                  const { data: retryRows, error: retryErr } = await client.from('samplingdates').select('id').eq('date', formattedDate);
                  if(retryErr || !retryRows || retryRows.length === 0) {
                    statusDiv.textContent = `Error retrieving sampling date after duplicate: Not found for date ${formattedDate}`;
                    return;
                  }
                  dateid = retryRows[0].id;
                } else {
                  statusDiv.textContent = 'Error inserting sampling date: ' + newDateErr.message;
                  return;
                }
              } else {
                dateid = newDateRows[0].id;
              }
            }
            // Mapping: column header to parameterid
            const paramMap = {
              'water temp oC': 1,
              'sal adj': 2,
              'sp cond adj': 3,
              'DO %': 4,
              'pH': 5,
              'turb': 6,
              'chloro a': 7,
              'NNN μmol/L': 8,
              'DRP μmol/L': 9,
              'enterococci': 10
            };
            // For each row, create a data row for each parameter
            let uploadRows = [];
            for(const row of results.data) {
              // Get site number from column A, remove #, convert to integer
              let siteNumRaw = row['Site'] || row['site'] || row['Site '];
              let locationid = null;
              if(siteNumRaw) {
                locationid = parseInt(siteNumRaw.replace('#','').trim(), 10);
                if(isNaN(locationid)) locationid = null;
              }
              for(const [col, paramid] of Object.entries(paramMap)) {
                let value = row[col];
                if(value === undefined || value === null || value === '') {
                  value = null;
                } else {
                  // Stricter numeric check: allow only valid numbers
                  const numPattern = /^-?\d+(\.\d+)?$/;
                  if(!numPattern.test(value.trim())) value = null;
                }
                uploadRows.push({
                  parameterid: paramid,
                  value: value,
                  locationid: locationid,
                  dateid: dateid
                  // Add other fields as needed
                });
              }
            }
            const { data, error } = await client.from('data').insert(uploadRows);
            if(error) {
              statusDiv.textContent = 'Upload error: ' + error.message;
            } else {
              statusDiv.textContent = `Upload successful! Inserted ${uploadRows.length} rows.`;
            }
          } catch(e) {
            statusDiv.textContent = 'Upload failed: ' + e.message;
          }
        },
        error: function(err) {
          statusDiv.textContent = 'CSV parse error: ' + err.message;
        }
      });
    });
    // Blog post logic
    const blogForm = document.getElementById('add-blog-form');
    if(blogForm){
      blogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleBlogSave(true);
      });
      const draftBtn = document.getElementById('save-draft-btn');
      if(draftBtn){
        draftBtn.addEventListener('click', async () => {
          await handleBlogSave(false);
        });
      }
      async function handleBlogSave(publish) {
        const title = document.getElementById('blog-title').value.trim();
        const content = document.getElementById('blog-content').value.trim();
        const imageInput = document.getElementById('blog-image');
        let image_url = '';
        if(!title || !content){
          alert('Please enter a title and content.');
          return;
        }
        if(typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
          alert('Supabase config missing or not loaded.');
          return;
        }
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        // Handle image upload if file selected
        if(imageInput && imageInput.files && imageInput.files[0]){
          const file = imageInput.files[0];
          const fileExt = file.name.split('.').pop();
          const fileName = `blog_${Date.now()}.${fileExt}`;
          const { data: imgData, error: imgErr } = await client.storage.from('Blogimages').upload(fileName, file, { cacheControl: '3600', upsert: false });
          if(imgErr){
            alert('Image upload failed: ' + imgErr.message);
            return;
          }
          // Get public URL
          const { data: publicUrlData } = client.storage.from('Blogimages').getPublicUrl(fileName);
          image_url = publicUrlData && publicUrlData.publicUrl ? publicUrlData.publicUrl : '';
        }
        const { data, error } = await client.from('blog_posts').insert([{ title, content, image_url, published: publish }]);
        if(error){
          alert('Error saving post: ' + error.message);
        } else {
          alert(publish ? 'Blog post published!' : 'Draft saved!');
          blogForm.reset();
        }
      }
    }
  });
}

function logout() {
  localStorage.removeItem('hhw_admin');
  window.location.href = 'admin.html';
}

document.addEventListener('DOMContentLoaded', () => {
  // Supabase Auth login
  const form = document.getElementById('admin-login-form');
  if(form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-email').value.trim();
      const password = document.getElementById('admin-password').value;
      const errorDiv = document.getElementById('admin-login-error');
      errorDiv.style.display = 'none';
      if(!email || !password) {
        errorDiv.textContent = 'Please enter email and password.';
        errorDiv.style.display = 'block';
        return;
      }
      if(typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
        errorDiv.textContent = 'Supabase config missing or not loaded.';
        errorDiv.style.display = 'block';
        return;
      }
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if(error) {
        errorDiv.textContent = error.message || 'Login failed.';
        errorDiv.style.display = 'block';
        return;
      }
      // Save session
      localStorage.setItem('hhw_admin', 'yes');
      showDashboard();
    });
    return;
  }
  if(localStorage.getItem('hhw_admin') === 'yes') {
    showDashboard();
    return;
  }
  const pwField = document.getElementById('admin-password');
  if(pwField) {
    pwField.addEventListener('keypress', function(e) {
      if(e.key === 'Enter') {
        e.preventDefault();
        const form = e.target.closest('form');
        if(form) form.dispatchEvent(new Event('submit'));
      }
    });
  }
});
