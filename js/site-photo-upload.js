document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('site-photo-form');
  const location = document.getElementById('site-photo-location');
  const input = document.getElementById('site-photo-file');
  const status = document.getElementById('site-photo-status');
  const button = form.querySelector('button');
  let pending = null;
  try {
    const response = await fetch('data/locations.json');
    if (!response.ok) throw new Error('Unable to load site list');
    const sites = await response.json();
    location.replaceChildren(new Option('Choose a site', ''));
    sites.forEach(site => location.add(new Option(site.name, site.id)));
    location.disabled = false;
  } catch (error) {
    status.textContent = `${error.message}. Reconnect and reload.`;
  }
  async function prepare(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo no larger than 5 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Choose a JPEG, PNG or WebP photo');
    }
    const image = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser cannot prepare photos');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob =>
        blob ? resolve(blob) : reject(new Error('Could not prepare photo')), 'image/jpeg', 0.85));
    } finally {
      image.close();
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!navigator.onLine || !window.fieldAuth || !window.fieldAuth.approved || !window.fieldAuth.client) {
      status.textContent = 'Connect and reload, then sign in before uploading. The photo stays on your device.';
      return;
    }
    if (!window.confirm('This photo shows the site without identifiable people and may be published after review. Submit it?')) return;
    button.disabled = location.disabled = input.disabled = true;
    const client = window.fieldAuth.client;
    try {
      if (!pending) pending = { id: crypto.randomUUID(), site: Number(location.value), blob: await prepare(input.files[0]), path: null, uploaded: false };
      status.textContent = 'Preparing photo submission...';
      if (!pending.path) {
        const reservation = await client.rpc('site_photo_reserve', { p_id: pending.id, p_locationid: pending.site });
        if (reservation.error) throw reservation.error;
        pending.path = reservation.data;
      }
      if (!pending.uploaded) {
        const upload = await client.storage.from('site-photos').upload(pending.path, pending.blob, { contentType: 'image/jpeg', upsert: false });
        if (upload.error) {
          const confirmation = await client.rpc('site_photo_submit', { p_id: pending.id });
          if (confirmation.error) throw upload.error;
          pending.uploaded = true;
        }
        pending.uploaded = true;
      }
      const result = await client.rpc('site_photo_submit', { p_id: pending.id });
      if (result.error) throw result.error;
      pending = null;
      form.reset();
      status.textContent = 'Photo submitted for review. Thank you!';
    } catch (error) {
      status.textContent = `Photo submission not confirmed: ${error.message}. Keep this page open and retry; your original photo remains on your device.`;
    } finally {
      button.disabled = false;
      location.disabled = input.disabled = !!pending;
    }
  });
});
