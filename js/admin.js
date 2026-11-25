// Simple admin login and dashboard logic

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
        <a href="field.html">Field entry</a>
        <a href="handbook.html">Handbook</a>
        <a href="join.html">Join</a>
        <a href="blog.html">Blog</a>
        <a href="admin.html" class="nav-current">Admin</a>
        <a href="#" onclick="logout()" style="color:#b33;font-weight:bold;">Logout</a>
      </nav>
    </header>
    <main style='max-width:900px;margin:32px auto;'>
      <section class='intro field-review'>
        <h2>Field entry access</h2>
        <p>Only approved email addresses can submit field samples. School email domains do not automatically grant access.</p>
        <form id='field-access-form'>
          <label for='field-access-email'>Email address</label>
          <input id='field-access-email' type='email' required>
          <button type='submit'>Approve address</button>
        </form>
        <div id='field-access-status' role='status'></div>
        <div id='field-access-list'></div>
      </section>
      <section class='intro field-review'>
        <h2>Review and manage site photos</h2>
        <p>Approve only site photos without identifiable people or other personal information.</p>
        <div id='site-photo-reviews' aria-live='polite'></div>
      </section>
      <section class='intro field-review'>
        <h2>Field submissions awaiting review</h2>
        <p>Approve only measurements you have checked. Approved measurements appear in the public data viewer.</p>
        <div id='field-reviews' aria-live='polite'></div>
      </section>
      <section class='intro'>
        <h2>Bulk Data Upload</h2>
        <p>Upload an SRF2 Excel workbook or CSV. Review the measurements before publishing them.</p>
        <p>Use files with the current site numbering. Check the site numbers and names in the preview before publishing; older files may use different numbers.</p>
        <a href='data/data-upload-template.csv' download style='display:inline-block;margin-bottom:10px;padding:6px 14px;background:#e6f0ff;color:#0b5fa6;border-radius:6px;text-decoration:none;font-size:1em;'>Download CSV Template</a><br>
        <label style='display:block;margin-bottom:10px;'>
          Sampling Date:
          <input type='date' id='csv-sampling-date' style='margin-left:8px;padding:4px 8px;'>
        </label>
        <input type='file' id='csv-upload' accept='.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' style='margin-bottom:10px;'>
        <button id='upload-csv-btn' style='padding:8px 18px;background:#0b5fa6;color:#fff;border:none;border-radius:6px;'>Preview upload</button>
        <div id='csv-upload-status' role='status' aria-live='polite' style='margin-top:10px;font-size:1em;'></div>
        <div id='bulk-preview'></div>
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

  setupSiteNavigation();
  if (supabaseClient) setupFieldAccessAdmin(supabaseClient);
  if (supabaseClient) loadSitePhotoReviews(supabaseClient);
  if (supabaseClient) loadFieldReviews(supabaseClient);

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

  setupBulkUpload(supabaseClient);

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
}

async function logout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  localStorage.removeItem('hhw_admin');
  window.location.href = 'admin.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Always check Supabase Auth session first
  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      localStorage.setItem('hhw_admin', 'yes');
      showDashboard();
      return;
    }
  }
  // If no session, show login form logic
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
  }
});
