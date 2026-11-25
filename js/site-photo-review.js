async function loadSitePhotoReviews(client) {
  const container = document.getElementById('site-photo-reviews');
  container.textContent = 'Loading photos...';
  try {
    const [result, response] = await Promise.all([
      client.rpc('site_photo_review_list'), fetch('data/locations.json')
    ]);
    if (result.error) throw result.error;
    if (!response.ok) throw new Error('Unable to load site list');
    const locations = await response.json();
    container.replaceChildren();
    if (!result.data.length) {
      container.textContent = 'No site photos.';
      return;
    }
    for (const photo of result.data) {
      const card = document.createElement('article');
      const heading = document.createElement('strong');
      const site = locations.find(item => String(item.id) === String(photo.locationid));
      heading.textContent = `${site ? site.name : `Site ${photo.locationid}`} — ${new Date(photo.created_at).toLocaleDateString('en-NZ')} (${photo.status})`;
      card.appendChild(heading);
      if (photo.status === 'pending' || photo.status === 'approved') {
        const signed = await client.storage.from('site-photos').createSignedUrl(photo.object_path, 3600);
        if (signed.error) throw signed.error;
        const image = document.createElement('img');
        image.src = signed.data.signedUrl;
        image.alt = `Submitted photo of ${site ? site.name : 'monitoring site'}`;
        image.style.cssText = 'display:block;max-width:100%;max-height:400px;margin:12px 0';
        card.appendChild(image);
      }
      const feedback = document.createElement('p');
      feedback.setAttribute('role', 'status');
      const approve = document.createElement('button');
      approve.textContent = 'Approve';
      const reject = document.createElement('button');
      reject.textContent = photo.status === 'pending' ? 'Reject and delete' :
        photo.status === 'approved' ? 'Remove published photo' : 'Delete incomplete photo';
      reject.className = 'reject';
      async function review(allowed) {
        if (!window.confirm(allowed ? 'Publish this site photo?' : 'Delete this site photo?')) return;
        approve.disabled = reject.disabled = true;
        try {
          if (photo.status === 'pending' || photo.status === 'approved') {
            const result = await client.rpc('site_photo_review', { p_id: photo.id, p_approve: allowed });
            if (result.error) throw result.error;
            if (!allowed) photo.status = 'rejected';
          }
          if (!allowed) {
            const removal = await client.storage.from('site-photos').remove([photo.object_path]);
            if (removal.error) throw removal.error;
            const discarded = await client.rpc('site_photo_discard', { p_id: photo.id });
            if (discarded.error) throw discarded.error;
          }
          await loadSitePhotoReviews(client);
        } catch (error) {
          feedback.textContent = `Unable to complete photo review: ${error.message}. Retry the deletion if necessary.`;
          if (photo.status !== 'pending') {
            approve.hidden = true;
            reject.textContent = 'Finish deleting photo';
          }
          approve.disabled = reject.disabled = false;
        }
      }
      approve.addEventListener('click', () => review(true));
      reject.addEventListener('click', () => review(false));
      if (photo.status === 'pending') card.appendChild(approve);
      card.append(reject, feedback);
      container.appendChild(card);
    }
  } catch (error) {
    container.textContent = `Unable to load site photos: ${error.message}`;
  }
}
