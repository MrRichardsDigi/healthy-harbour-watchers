(async function () {
  const results = document.getElementById('results');
  const form = document.getElementById('field-access-form');
  const status = document.getElementById('field-access-status');
  const list = document.getElementById('field-access-list');
  let failure = '';
  let addresses = ['one@example.org'];
  const client = {
    rpc: async (name, args) => {
      if (failure === name) throw new Error('Mock network failure');
      if (name === 'field_access_list') return { data: addresses.map(email => ({ email })), error: null };
      if (args.p_allow) addresses.push(args.p_email);
      else addresses = addresses.filter(email => email !== args.p_email);
      return { error: null };
    }
  };
  function assert(condition, message) { if (!condition) throw new Error(message); }
  async function waitFor(condition) {
    for (let i = 0; i < 300; i++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for admin action');
  }
  try {
    window.confirm = () => true;
    setupFieldAccessAdmin(client);
    await waitFor(() => list.textContent.includes('one@example.org'));
    assert(!form.hidden, 'Form not shown');
    const email = document.getElementById('field-access-email');
    email.value = 'two@example.org';
    failure = 'field_access_change';
    form.requestSubmit();
    await waitFor(() => status.textContent.includes('Unable to approve address'));
    assert(!form.querySelector('button').disabled && email.value === 'two@example.org', 'Failed approval handling');
    list.querySelector('button').click();
    await waitFor(() => status.textContent.includes('Unable to remove access'));
    assert(!list.querySelector('button').disabled && addresses.length === 1, 'Failed removal handling');
    failure = '';
    form.requestSubmit();
    await waitFor(() => list.textContent.includes('two@example.org'));
    assert(!email.value, 'Successful approval did not clear input');
    list.querySelector('button').click();
    await waitFor(() => !list.textContent.includes('one@example.org'));
    failure = 'field_access_list';
    email.value = 'three@example.org';
    form.requestSubmit();
    await waitFor(() => status.textContent.includes('Unable to manage field access'));
    assert(form.hidden && !list.textContent, 'Failed refresh showed stale controls');
    results.textContent = 'PASS\nApprovals and removals\nRejected requests and failed refresh';
    results.dataset.result = 'pass';
  } catch (error) {
    results.textContent = `FAIL: ${error.message}`;
    results.dataset.result = 'fail';
    console.error(error);
  }
})();
