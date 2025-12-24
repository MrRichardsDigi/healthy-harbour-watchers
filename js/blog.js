

(async function(){
  if(typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
    document.getElementById('blog-posts').innerHTML = '<div style="color:#b33">Supabase config missing or not loaded.</div>';
    return;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.from('blog_posts').select('*').eq('published', true).order('created_at', { ascending: false });
  if(error) {
    document.getElementById('blog-posts').innerHTML = '<div style="color:#b33">Error loading posts: '+error.message+'</div>';
    return;
  }
  if(!data.length) {
    document.getElementById('blog-posts').innerHTML = '<div>No blog posts yet.</div>';
    return;
  }
  document.getElementById('blog-posts').innerHTML = data.map(post => `
    <article style="background:#f4f8ff;padding:18px 20px;border-radius:12px;margin-bottom:24px;box-shadow:0 2px 12px #0b5fa61a;">
      <h3 style="margin-top:0">${post.title}</h3>
      <div style="color:#0b5fa6;font-size:0.98em;margin-bottom:8px;">${(function(d){d=new Date(d);return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();})(post.created_at)}</div>
      ${post.image_url ? `<img src="${post.image_url}" alt="Blog image" style="max-width:100%;margin:12px 0;border-radius:8px;box-shadow:0 1px 6px #0b5fa61a;">` : ''}
      <div style="font-size:1.1em;white-space:pre-line;">${post.content}</div>
    </article>
  `).join('');
})();

// Note: Supabase config (SUPABASE_URL, SUPABASE_ANON_KEY) is loaded from js/config.js, which must be included in blog.html before this script.
