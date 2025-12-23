// Simple admin login and dashboard logic
const ADMIN_PASSWORD = "harbour2025"; // Change this to your real password!

// Load PapaParse for CSV parsing
function loadPapaParse(cb) {
  if(window.Papa) return cb();
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
  script.onload = cb;
  document.head.appendChild(script);
}

function showDashboard() {
  document.body.innerHTML = `
    <header class='site-header'><h1>Admin Dashboard</h1><nav><a href='index.html'>Home</a> <a href='admin.html' onclick='logout()'>Logout</a></nav></header>
    <main style='max-width:900px;margin:32px auto;'>
      <section class='intro'>
        <h2>Bulk Data Upload (CSV)</h2>
        <a href='data/data-upload-template.csv' download style='display:inline-block;margin-bottom:10px;padding:6px 14px;background:#e6f0ff;color:#0b5fa6;border-radius:6px;text-decoration:none;font-size:1em;'>Download CSV Template</a><br>
        <input type='file' id='csv-upload' accept='.csv,text/csv' style='margin-bottom:10px;'>
        <button id='upload-csv-btn' style='padding:8px 18px;background:#0b5fa6;color:#fff;border:none;border-radius:6px;'>Upload CSV</button>
        <div id='csv-upload-status' style='margin-top:10px;font-size:1em;'></div>
        <div style='font-size:0.95em;color:#555;margin-top:8px;'>CSV columns should match your Supabase table (e.g., date, parameterid, value, unit, locationid, etc).</div>
      </section>
      <section class='intro' style='margin-top:32px;'>
        <h2>Write Blog Post</h2>
        <form id='add-blog-form' style='display:flex;flex-direction:column;gap:10px;'>
          <input type='text' id='blog-title' placeholder='Title' required>
          <textarea id='blog-content' placeholder='Content' rows='6' required></textarea>
          <label style='font-size:0.98em;'>Image (optional): <input type='file' id='blog-image' accept='image/*'></label>
          <button type='submit'>Publish Post</button>
        </form>
      </section>
    </main>
  `;

  // CSV upload logic
  loadPapaParse(()=>{
    const uploadBtn = document.getElementById('upload-csv-btn');
    const fileInput = document.getElementById('csv-upload');
    const statusDiv = document.getElementById('csv-upload-status');
    uploadBtn.addEventListener('click', async ()=>{
      const file = fileInput.files[0];
      if(!file) { statusDiv.textContent = 'Please select a CSV file.'; return; }
      statusDiv.textContent = 'Parsing CSV...';
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
          statusDiv.textContent = `Parsed ${results.data.length} rows. Uploading to Supabase...`;
          // --- Supabase upload logic ---
          try {
            // Load Supabase config (assumes js/config.js is present)
            if(typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
              statusDiv.textContent = 'Supabase config missing or not loaded.';
              return;
            }
            const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            // Batch insert (adjust table name/columns as needed)
            const { data, error } = await client.from('data').insert(results.data);
            if(error) {
              statusDiv.textContent = 'Upload error: ' + error.message;
            } else {
              statusDiv.textContent = `Upload successful! Inserted ${results.data.length} rows.`;
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
        const { data, error } = await client.from('blog_posts').insert([{ title, content, image_url, published: true }]);
        if(error){
          alert('Error publishing post: ' + error.message);
        } else {
          alert('Blog post published!');
          blogForm.reset();
        }
      });
    }
  });
}

function logout() {
  localStorage.removeItem('hhw_admin');
  window.location.href = 'admin.html';
}

document.addEventListener('DOMContentLoaded', () => {
  if(localStorage.getItem('hhw_admin') === 'yes') {
    showDashboard();
    return;
  }
  const form = document.getElementById('admin-login-form');
  if(form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const pw = document.getElementById('admin-password').value;
      if(pw === ADMIN_PASSWORD) {
        localStorage.setItem('hhw_admin', 'yes');
        showDashboard();
      } else {
        const err = document.getElementById('admin-login-error');
        err.textContent = 'Incorrect password.';
        err.style.display = 'block';
      }
    });
  }
});
