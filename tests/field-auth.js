(async function () {
  const results = document.getElementById('results');
  let frame;
  try {
    const response = await fetch('../field.html?auth-test=1');
    if (!response.ok) throw new Error('Unable to load field page.');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    parsed.querySelectorAll('script, link, img').forEach(element => element.remove());
    const source = '<!doctype html>' + parsed.documentElement.outerHTML;
    const storage = {};
    const calls = [];
    let session = null;
    let allowed = false;
    let offline = false;
    const fakeClient = {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        signInWithOAuth: async options => { calls.push(['google', options]); return { error: null }; },
        signInWithOtp: async options => { calls.push(['email', options]); return { error: null }; },
        signOut: async () => { session = null; return { error: null }; }
      },
      rpc: async () => ({ data: allowed, error: null })
    };
    function assert(condition, message) { if (!condition) throw new Error(message); }
    async function waitFor(condition) {
      for (let i = 0; i < 300; i++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Timed out waiting for sign-in.');
    }
    async function load() {
      if (frame) frame.remove();
      frame = document.createElement('iframe');
      frame.hidden = true;
      frame.srcdoc = source;
      document.body.appendChild(frame);
      await new Promise(resolve => { frame.onload = resolve; });
      const w = frame.contentWindow;
      Object.defineProperty(w, 'localStorage', { configurable: true, value: {
        getItem: key => storage[key] || null,
        setItem: (key, value) => { storage[key] = value; },
        removeItem: key => { delete storage[key]; }
      } });
      Object.defineProperty(w.navigator, 'onLine', { configurable: true, value: !offline });
      w.SUPABASE_URL = 'mock';
      w.SUPABASE_ANON_KEY = 'mock';
      w.supabase = { createClient: () => fakeClient };
      const script = w.document.createElement('script');
      script.src = new URL('../js/field-auth.js?v=1', location.href).href;
      w.document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load sign-in code.'));
      });
      w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
      await waitFor(() => w.document.getElementById('field-auth-status').textContent !== 'Checking access...' ||
        !w.document.getElementById('field-content').hidden);
      return w;
    }
    let w = await load();
    assert(w.document.getElementById('field-content').hidden, 'Unsigned user sees form');
    assert(w.document.getElementById('field-email-option').hidden, 'Email sign-in should be hidden');
    w.document.getElementById('field-google').click();
    w.document.getElementById('field-email').value = 'participant@example.org';
    w.document.getElementById('field-email-form').requestSubmit();
    await waitFor(() => calls.length === 2);
    assert(calls[0][1].provider === 'google' && calls[1][1].email === 'participant@example.org',
      'Sign-in requests incorrect');
    session = { user: { id: 'test-user' } };
    w = await load();
    assert(w.document.getElementById('field-content').hidden &&
      w.document.getElementById('field-auth-status').textContent.includes('not been approved'), 'Unapproved access');
    allowed = true;
    w = await load();
    assert(!w.document.getElementById('field-content').hidden &&
      storage['hhw-field-approved-offline-v1'] === 'test-user', 'Approved access');
    offline = true;
    w = await load();
    assert(!w.document.getElementById('field-content').hidden && !w.fieldAuth.client, 'Offline access');
    w.document.getElementById('field-signout').click();
    assert(w.document.getElementById('field-content').hidden &&
      !storage['hhw-field-approved-offline-v1'], 'Offline sign-out');
    results.textContent = 'PASS\nUnsigned and unapproved accounts blocked\nGoogle and email sign-in requests\nApproved online access\nPreviously approved offline access and sign-out';
    results.dataset.result = 'pass';
    frame.remove();
  } catch (error) {
    results.textContent = `FAIL: ${error.message}`;
    results.dataset.result = 'fail';
    console.error(error);
  }
})();
