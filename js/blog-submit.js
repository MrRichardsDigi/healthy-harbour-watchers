(async function() {
  const section = document.getElementById('blog-submit');
  const signIn = document.getElementById('blog-sign-in');
  const form = document.getElementById('blog-submit-form');
  const status = document.getElementById('blog-submit-status');
  if (!section || !signIn || !form || !status) return;

  if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' ||
      !window.supabase) {
    status.textContent = 'Blog submissions are unavailable right now.';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const redirectTo = new URL('blog.html', document.baseURI).href;

  async function showSubmissionForm() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      signIn.hidden = false;
      form.hidden = true;
      status.textContent = 'Sign in with an approved account to submit a post for review.';
      return;
    }
    const { data: allowed, error: accessError } = await client.rpc('field_access_allowed');
    if (accessError) throw accessError;
    signIn.hidden = !allowed;
    form.hidden = !allowed;
    status.textContent = allowed
      ? 'Your post will be reviewed before it appears publicly.'
      : 'This account is not approved to submit blog posts.';
  }

  signIn.addEventListener('click', async () => {
    signIn.disabled = true;
    status.textContent = 'Opening sign-in...';
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } }
      });
      if (error) throw error;
    } catch (error) {
      status.textContent = `Unable to sign in: ${error.message}`;
      signIn.disabled = false;
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending your post for review...';
    try {
      const { error } = await client.rpc('submit_blog_post', {
        p_title: document.getElementById('blog-submit-title').value,
        p_content: document.getElementById('blog-submit-content').value
      });
      if (error) throw error;
      form.reset();
      status.textContent = 'Thanks. Your post was sent for admin review.';
    } catch (error) {
      status.textContent = `Unable to submit post: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });

  try {
    await showSubmissionForm();
  } catch (error) {
    status.textContent = `Unable to check blog access: ${error.message}`;
  }
})();
