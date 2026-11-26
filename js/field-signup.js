document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('field-signup-form');
  const email = document.getElementById('field-signup-email');
  const password = document.getElementById('field-signup-password');
  const confirm = document.getElementById('field-signup-confirm');
  const status = document.getElementById('field-signup-status');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (password.value !== confirm.value) {
      status.textContent = 'The passwords do not match.';
      return;
    }
    if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
      status.textContent = 'Account creation is unavailable. Check your connection and try again.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Creating your account...';
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storageKey: 'hhw-field-auth-v1' }
      });
      const { data, error } = await client.auth.signUp({
        email: email.value.trim(),
        password: password.value,
        options: { emailRedirectTo: new URL('field.html', document.baseURI).href }
      });
      if (error) throw error;
      status.textContent = data.session
        ? 'Account created. An administrator still needs to approve your email before you can use Field entry.'
        : 'Account created. Check your email to confirm your address, then wait for administrator approval before signing in.';
      form.reset();
    } catch (error) {
      status.textContent = `Unable to create account: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
});
