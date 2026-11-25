document.addEventListener('hhw-data-ready', () => {
  const filters = document.getElementById('filters');
  const location = document.getElementById('location-select');
  const parameter = document.getElementById('param-select');
  const apply = document.getElementById('apply-filters');
  const reset = document.getElementById('reset-filters');
  const chartControls = document.querySelector('.chart-controls');
  const dateControls = document.getElementById('date-slider-container');
  const dateApply = document.createElement('button');
  dateApply.type = 'button';
  dateApply.className = 'mobile-date-apply';
  dateApply.textContent = 'Apply date range';
  dateApply.addEventListener('click', () => apply.click());
  dateControls.append(dateApply);
  const mobile = window.matchMedia('(max-width: 700px)');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-filter-toggle';
  toggle.setAttribute('aria-controls', 'filters');
  toggle.setAttribute('aria-expanded', 'false');
  const title = document.createElement('strong');
  title.textContent = 'Filters';
  const summary = document.createElement('span');
  summary.className = 'mobile-filter-summary';
  toggle.append(title, summary);
  filters.before(toggle);

  function makePicker(select, label) {
    const picker = document.createElement('details');
    picker.className = 'mobile-picker';
    const heading = document.createElement('summary');
    const options = document.createElement('div');
    options.className = 'mobile-picker-options';
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'mobile-picker-all';
    allButton.textContent = select === location ? 'Use all sites' : 'Use all measurements';
    allButton.addEventListener('click', () => {
      Array.from(select.options).forEach(option => { option.selected = !option.value && select === location; });
      sync();
    });
    picker.append(heading, options, allButton);
    select.parentElement.after(picker);

    function sync() {
      options.replaceChildren();
      const selected = Array.from(select.selectedOptions).filter(option => option.value);
      heading.textContent = `${label} · ${selected.length ? `${selected.length} selected` : 'All'}`;
      Array.from(select.options).filter(option => option.value && !option.disabled && !option.hidden).forEach(option => {
        const row = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = option.selected;
        checkbox.addEventListener('change', () => {
          option.selected = checkbox.checked;
          if (select === location) {
            const all = Array.from(select.options).find(item => !item.value);
            if (all) all.selected = !Array.from(select.selectedOptions).some(item => item.value);
          }
          const count = Array.from(select.selectedOptions).filter(item => item.value).length;
          heading.textContent = `${label} · ${count ? `${count} selected` : 'All'}`;
        });
        const text = document.createElement('span');
        text.textContent = option.textContent;
        row.append(checkbox, text);
        options.append(row);
      });
      if (!options.children.length) options.textContent = 'No options available.';
    }
    select.addEventListener('change', sync);
    sync();
    return sync;
  }

  const syncLocation = makePicker(location, 'Sampling sites');
  const syncParameter = makePicker(parameter, 'Measurements');
  function selectedNames(select, allText) {
    const names = Array.from(select.selectedOptions).filter(option => option.value).map(option => option.textContent);
    return names.length ? names.join(', ') : allText;
  }
  function updateSummary() {
    summary.textContent = `${selectedNames(location, 'All sites')} · ${selectedNames(parameter, 'All measurements')}`;
  }
  function setOpen(open) {
    document.body.classList.toggle('mobile-filters-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    if (open) {
      syncLocation();
      syncParameter();
      setOpen(true);
    } else {
      apply.click();
    }
  });
  apply.addEventListener('click', () => {
    updateSummary();
    if (mobile.matches) setOpen(false);
  });
  reset.addEventListener('click', () => {
    syncLocation();
    syncParameter();
    updateSummary();
  });
  chartControls.addEventListener('click', event => {
    if (mobile.matches && document.body.classList.contains('mobile-filters-open') &&
        event.target.closest('button')) apply.click();
  }, true);
  function placeControls() {
    if (mobile.matches) {
      filters.after(dateControls);
      dateControls.after(chartControls);
    } else {
      filters.insertBefore(chartControls, filters.querySelector('.filter-actions'));
      chartControls.after(dateControls);
    }
  }
  mobile.addEventListener('change', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') apply.click();
    syncLocation();
    syncParameter();
    placeControls();
    setOpen(false);
  });
  placeControls();
  updateSummary();
  document.body.classList.add('mobile-data-enhanced');
});
