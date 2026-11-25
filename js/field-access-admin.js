function setupFieldAccessAdmin(client) {
  const form = document.getElementById('field-access-form');
  const email = document.getElementById('field-access-email');
  const status = document.getElementById('field-access-status');
  const list = document.getElementById('field-access-list');
  async function load() {
    status.textContent = 'Loading approved addresses...';
    try {
      const { data, error } = await client.rpc('field_access_list');
      if (error) throw error;
      form.hidden = false;
      list.replaceChildren();
      if (!data.length) list.textContent = 'No approved addresses.';
      data.forEach(item => {
        const row = document.createElement('p');
        const text = document.createElement('span');
        text.textContent = item.email;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
          if (!window.confirm(`Remove field access for ${item.email}?`)) return;
          remove.disabled = true;
          try {
            const result = await client.rpc('field_access_change', { p_email: item.email, p_allow: false });
            if (result.error) throw result.error;
            await load();
          } catch (error) {
            status.textContent = `Unable to remove access: ${error.message}`;
            remove.disabled = false;
          }
        });
        row.append(text, ' ', remove);
        list.appendChild(row);
      });
      status.textContent = '';
    } catch (error) {
      status.textContent = `Unable to manage field access: ${error.message}`;
      form.hidden = true;
      list.replaceChildren();
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await client.rpc('field_access_change', { p_email: email.value.trim(), p_allow: true });
      if (error) throw error;
      email.value = '';
      await load();
    } catch (error) {
      status.textContent = `Unable to approve address: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
  load();
}
