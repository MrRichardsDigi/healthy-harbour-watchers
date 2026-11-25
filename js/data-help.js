(function () {
  const help = document.getElementById('data-help');
  try {
    if (localStorage.getItem('hhw-data-help-seen') === 'yes') {
      help.open = false;
    } else {
      localStorage.setItem('hhw-data-help-seen', 'yes');
    }
  } catch (error) {
    console.warn('Unable to remember data page help preference:', error);
  }
})();
