function setupSiteNavigation() {
  const header = document.querySelector('.site-header');
  const nav = header && header.querySelector('nav');
  if (!nav || header.querySelector('.site-menu-toggle')) return;

  nav.id = 'site-navigation';
  nav.setAttribute('aria-label', 'Main navigation');
  setupLocationMenu(nav);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-menu-toggle';
  button.setAttribute('aria-controls', nav.id);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span aria-hidden="true">&#9776;</span> Menu';
  nav.before(button);
  const backdrop = document.createElement('div');
  backdrop.className = 'site-menu-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  nav.before(backdrop);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'site-menu-close';
  closeButton.textContent = 'Close menu';
  nav.prepend(closeButton);
  header.classList.add('site-nav-enhanced');

  function setOpen(open, restoreFocus = false) {
    header.classList.toggle('site-nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) closeButton.focus();
    else if (restoreFocus) button.focus();
  }
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  closeButton.addEventListener('click', () => setOpen(false, true));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false, true);
    }
  });
  document.addEventListener('click', event => {
    if (button.getAttribute('aria-expanded') === 'true' &&
        !nav.contains(event.target) && !button.contains(event.target)) {
      setOpen(false, true);
    }
  });
  window.matchMedia('(min-width: 1201px)').addEventListener('change', () => setOpen(false));
}

function setupLocationMenu(nav) {
  const locationsLink = Array.from(nav.querySelectorAll('a')).find(link =>
    new URL(link.href, document.baseURI).pathname.endsWith('/locations.html'));
  if (!locationsLink || nav.querySelector('.site-location-menu')) return;

  const menu = document.createElement('details');
  menu.className = 'site-location-menu';
  const summary = document.createElement('summary');
  summary.textContent = 'Locations';
  if (locationsLink.classList.contains('nav-current')) summary.classList.add('nav-current');
  const panel = document.createElement('div');
  panel.className = 'site-location-panel';
  const allLink = locationsLink.cloneNode(true);
  allLink.classList.remove('nav-current');
  allLink.textContent = 'All locations';
  panel.appendChild(allLink);
  const currentHeading = document.createElement('h3');
  currentHeading.textContent = 'Current locations';
  panel.appendChild(currentHeading);
  const currentPanel = document.createElement('div');
  currentPanel.className = 'site-location-group';
  panel.appendChild(currentPanel);
  const historyMenu = document.createElement('details');
  historyMenu.className = 'site-location-history';
  const historySummary = document.createElement('summary');
  historySummary.textContent = 'Historical locations';
  const historyPanel = document.createElement('div');
  historyPanel.className = 'site-location-group';
  historyMenu.append(historySummary, historyPanel);
  panel.appendChild(historyMenu);
  menu.append(summary, panel);
  locationsLink.replaceWith(menu);

  fetch('data/locations.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Unable to load locations');
      return response.json();
    })
    .then(locations => {
      locations
        .slice()
        .sort((a, b) => (a.currentSite || 999) - (b.currentSite || 999) ||
          a.name.localeCompare(b.name))
        .forEach(location => {
          const link = document.createElement('a');
          link.href = `site.html?id=${encodeURIComponent(location.id)}`;
          link.textContent = location.name;
          (location.currentSite ? currentPanel : historyPanel).appendChild(link);
        });
    })
    .catch(error => console.warn('Unable to build location menu:', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSiteNavigation);
} else {
  setupSiteNavigation();
}
