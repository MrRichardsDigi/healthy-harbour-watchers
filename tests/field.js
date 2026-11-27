(async function () {
  const results = document.getElementById('results');
  try {
    const [pageResponse, sitesResponse] = await Promise.all([
      fetch('../field.html?field-test=3'), fetch('../data/locations.json')
    ]);
    if (!pageResponse.ok || !sitesResponse.ok) throw new Error('Unable to load test fixtures.');
    const html = await pageResponse.text();
    const sites = await sitesResponse.json();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    parsed.querySelectorAll('script, link').forEach(element => element.remove());
    const source = '<!doctype html>' + parsed.documentElement.outerHTML;
    let stored = null;
    let calls = [];
    let failure = false;
    let rejectWrites = false;
    let frame;
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    async function waitFor(condition) {
      for (let i = 0; i < 300; i++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Timed out waiting for field form.');
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
        getItem: () => stored,
        setItem: (key, value) => {
          if (rejectWrites) throw new Error('Mock storage failure');
          stored = value;
        }
      } });
      Object.defineProperty(w.navigator, 'serviceWorker', { configurable: true, value: undefined });
      w.fetch = async () => ({ ok: true, json: async () => structuredClone(sites) });
      w.confirm = () => true;
      w.SUPABASE_URL = 'mock';
      w.SUPABASE_ANON_KEY = 'mock';
      w.supabase = { createClient: () => ({ rpc: async (name, args) => {
        calls.push({ name, args });
        return { error: failure ? { message: 'Mock network failure' } : null };
      } }) };
      const script = w.document.createElement('script');
      w.fieldAuth = { approved: true, client: w.supabase.createClient() };
      script.src = new URL('../js/field.js?v=6', location.href).href;
      w.document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load field script'));
      });
      w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
      await waitFor(() => !w.document.getElementById('field-save').disabled);
      return w;
    }
    function change(w, selector, value) {
      const input = w.document.querySelector(selector);
      input.value = value;
      input.dispatchEvent(new w.Event('input', { bubbles: true }));
    }
    let w = await load();
    const bounds = [[-2, 28], [0, 45], [0, 60], [0, 160], [5, 10], [0, 65], [0, 16], [0, 145], [0, 5], [0, 3000], [0, 20]];
    bounds.forEach(([min, max], i) => {
      const selector = `[data-parameter="${i + 1}"]`;
      change(w, selector, String(min));
      assert(!w.document.getElementById(`warning-${i + 1}`).textContent, `Lower boundary ${i + 1}`);
      change(w, selector, String(max));
      assert(!w.document.getElementById(`warning-${i + 1}`).textContent, `Upper boundary ${i + 1}`);
      change(w, selector, String(min - 1));
      assert(!!w.document.getElementById(`warning-${i + 1}`).textContent, `Low warning ${i + 1}`);
      change(w, selector, String(max + 1));
      assert(!!w.document.getElementById(`warning-${i + 1}`).textContent, `High warning ${i + 1}`);
      change(w, selector, '');
    });
    change(w, '#field-location', '4');
    change(w, '[data-parameter="1"]', '90');
    change(w, '[data-observation="weather"]', 'Light rain');
    w.document.getElementById('field-form').requestSubmit();
    assert(JSON.parse(stored).drafts.length === 1, 'Save unusual sample');
    assert(JSON.parse(stored).drafts[0].observations.weather === 'Light rain',
      'Site observations saved with sample');
    change(w, '#field-location', '11');
    change(w, '[data-parameter="5"]', '8.2');
    w.document.getElementById('field-form').requestSubmit();
    change(w, '#field-location', '5');
    change(w, '[data-parameter="1"]', '12');
    w = await load();
    assert(w.document.querySelectorAll('.field-draft').length === 2, 'Multiple saved samples survive reload');
    assert(w.document.querySelector('.field-draft').textContent.includes('Light rain'),
      'Saved site observations survive reload');
    assert(w.document.getElementById('field-location').value === '5' &&
      w.document.querySelector('[data-parameter="1"]').value === '12', 'Work in progress survives reload');

    failure = true;
    w.document.querySelector('.field-draft button').click();
    await waitFor(() => w.document.getElementById('field-status').textContent.startsWith('Submission not confirmed'));
    const first = calls[0].args;
    assert(JSON.parse(stored).drafts[0].attempted, 'Attempt persisted before submission');
    w = await load();
    const card = w.document.querySelector('.field-draft');
    assert(card.textContent.includes('Retry submission') && ![...card.querySelectorAll('button')].some(b => b.textContent === 'Edit'),
      'Uncertain submission cannot be edited');
    failure = false;
    card.querySelector('button').click();
    await waitFor(() => w.document.getElementById('field-status').textContent.startsWith('Submitted for review'));
    assert(calls[1].args.p_id === first.p_id &&
      JSON.stringify(calls[1].args.p_measurements) === JSON.stringify(first.p_measurements) &&
      JSON.stringify(calls[1].args.p_observations) === JSON.stringify(first.p_observations),
      'Idempotent retry includes site observations');
    assert(JSON.parse(stored).drafts.length === 1, 'Only submitted sample removed');

    const edit = [...w.document.querySelectorAll('.field-draft button')].find(button => button.textContent === 'Edit');
    edit.click();
    change(w, '[data-parameter="5"]', '7');
    w.document.getElementById('field-cancel-edit').click();
    assert(JSON.parse(stored).drafts[0].values['5'] === '8.2' &&
      JSON.parse(stored).drafts[0].observations.weather === undefined,
      'Cancel keeps original saved sample and observations');
    rejectWrites = true;
    change(w, '[data-parameter="1"]', '22');
    assert(w.document.getElementById('field-status').textContent.includes('Unable to save') &&
      w.document.getElementById('field-save').disabled, 'Storage failure reported');
    results.textContent = 'PASS\nWarning boundaries and advisory save\nMultiple drafts, observations and work-in-progress survive reload\nUncertain submission and idempotent retry\nEdit cancellation and storage failure';
    results.dataset.result = 'pass';
    frame.remove();
  } catch (error) {
    results.textContent = `FAIL: ${error.message}`;
    results.dataset.result = 'fail';
    console.error(error);
  }
})();
