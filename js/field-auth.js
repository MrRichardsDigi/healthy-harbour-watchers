document.addEventListener('DOMContentLoaded', async () => {
  const login = document.getElementById('field-login');
  const account = document.getElementById('field-account');
  const content = document.getElementById('field-content');
  const status = document.getElementById('field-auth-status');
  const accountStatus = document.getElementById('field-account-status');
  const google = document.getElementById('field-google');
  const emailForm = document.getElementById('field-email-form');
  const email = document.getElementById('field-email');
  const signout = document.getElementById('field-signout');
  const switchAccount = document.getElementById('field-switch');
  const markerKey = 'hhw-field-approved-offline-v1';
  const redirectTo = new URL('field.html', document.baseURI).href;
  const auth = { client: null, approved: false };
  window.fieldAuth = auth;

  function show(allowed, message) {
    auth.approved = allowed;
    login.hidden = allowed;
    account.hidden = !allowed;
    content.hidden = !allowed;
    if (allowed) accountStatus.textContent = message;
    else status.textContent = message;
  }
  function setMarker(value) {
    try {
      if (value) localStorage.setItem(markerKey, value);
      else localStorage.removeItem(markerKey);
      return true;
    } catch (error) {
      console.error('Unable to update offline access marker:', error);
      return false;
    }
  }
  async function signOut() {
    if (auth.client) {
      const { error } = await auth.client.auth.signOut();
      if (error) {
        accountStatus.textContent = `Unable to sign out: ${error.message}`;
        return;
      }
    } else {
      try {
        localStorage.removeItem('hhw-field-auth-v1');
      } catch (error) {
        accountStatus.textContent = 'Unable to clear the local sign-in. Reconnect and sign out.';
        return;
      }
    }
    if (!setMarker(null)) {
      accountStatus.textContent = 'Offline access could not be cleared. Clear this browser’s site data after saving or submitting your drafts.';
      return;
    }
    switchAccount.hidden = true;
    show(false, 'Signed out. Saved samples remain on this device. Reconnect and reload if sign-in is unavailable.');
  }
  signout.addEventListener('click', signOut);
  switchAccount.addEventListener('click', signOut);
  if (!navigator.onLine) {
    try {
      if (localStorage.getItem(markerKey)) {
        show(true, 'Offline access on this device. Reconnect and reload this page before submitting; sign in again if required.');
      } else {
        show(false, 'Connect and reload, then sign in with an approved account before using field entry offline.');
      }
    } catch (error) {
      show(false, 'Unable to read offline access on this device. Reconnect and sign in.');
    }
    return;
  }
  if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined' || !window.supabase) {
    show(false, 'Sign-in is unavailable. Check your connection and reload.');
    return;
  }
  auth.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: 'hhw-field-auth-v1' }
  });
  google.addEventListener('click', async () => {
    google.disabled = true;
    try {
      const { error } = await auth.client.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } }
      });
      if (error) throw error;
    } catch (error) {
      status.textContent = `Unable to sign in: ${error.message}`;
      google.disabled = false;
    }
  });
  emailForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const { error } = await auth.client.auth.signInWithOtp({
        email: email.value.trim(), options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;
      status.textContent = 'If the address can receive sign-in mail, check your inbox and open the link on this device. Approval is still required.';
    } catch (error) {
      status.textContent = `Unable to send sign-in link: ${error.message}`;
    }
  });
  try {
    const { data, error } = await auth.client.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      setMarker(null);
      show(false, 'Sign in with an approved account to use field entry.');
      return;
    }
    const result = await auth.client.rpc('field_access_allowed');
    if (result.error) throw result.error;
    if (result.data !== true) {
      const cleared = setMarker(null);
      switchAccount.hidden = false;
      show(false, cleared ? 'This account has not been approved. Contact the site administrator.' :
        'This account is not approved and offline access could not be cleared. Contact the site administrator.');
      return;
    }
    const saved = setMarker(data.session.user.id);
    show(true, saved
      ? 'Signed in with an approved account. Offline drafts remain on this device.'
      : 'Signed in, but offline access could not be saved on this device.');
  } catch (error) {
    show(false, `Unable to check access: ${error.message}. Connect and try again.`);
  }
});
