function setupSiteNavigation() {
  const header = document.querySelector('.site-header');
  const nav = header && header.querySelector('nav');
  if (!nav || header.querySelector('.site-menu-toggle')) return;

  nav.id = 'site-navigation';
  nav.setAttribute('aria-label', 'Main navigation');
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
  window.matchMedia('(min-width: 701px)').addEventListener('change', () => setOpen(false));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSiteNavigation);
} else {
  setupSiteNavigation();
}
