// Search across the dashboard's existing sections, controls and settings.
// Pinned and recent destinations stay in this browser; no TV config is written.
(() => {
  const input = q('global-search-input');
  const results = q('global-search-results');
  if (!input || !results) return;

  const FAVORITES_KEY = 'glasshouse_search_favorites';
  const RECENTS_KEY = 'glasshouse_search_recents';
  const labels = ['button', 'summary', '[role="button"]', 'select', 'input[placeholder]', '.col-sec', '.apps-grp-h'];
  let favorites = readList(FAVORITES_KEY);
  let recents = readList(RECENTS_KEY);
  let index = [];
  let appsRequested = false;

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 20) : [];
    } catch (e) { return []; }
  }
  function saveList(key, values) {
    try { localStorage.setItem(key, JSON.stringify(values.slice(0, 20))); } catch (e) { /* storage may be disabled */ }
  }
  function tabFor(el) {
    const panel = el.closest('.panel');
    if (!panel) return null;
    const tab = document.querySelector(`#tabs [data-tab]`);
    const button = Array.from(document.querySelectorAll('#tabs [data-tab]')).find(b => {
      const id = ({ control: 'tab-control', metrics: 'tab-metrics', apps: 'appspane', home: 'homepane',
        oledcare: 'oledpane', game: 'gamepane', servicemenu: 'svcpane', screensaver: 'sspane',
        privacy: 'privpane', advanced: 'advpane', mqtt: 'mqttpane', server: 'serverpane', tools: 'toolspane' })[b.dataset.tab];
      return id === panel.id;
    });
    return button ? button.dataset.tab : (panel.id === 'tab-control' ? 'control' : null);
  }
  function textFor(el) {
    if (el.matches('input[placeholder]')) return el.getAttribute('aria-label') || el.placeholder;
    const labelled = el.getAttribute('aria-label') || el.getAttribute('title');
    if (labelled) return labelled.replace(/\s+/g, ' ').trim();
    return Array.from(el.childNodes).filter(node => node.nodeType === 3)
      .map(node => node.nodeValue).join(' ').replace(/\s+/g, ' ').trim();
  }
  function tabLabel(tab) {
    const button = document.querySelector(`#tabs [data-tab="${tab}"]`);
    return button ? textFor(button) : tab;
  }
  function buildIndex() {
    const seen = {};
    index = [];
    document.querySelectorAll(labels.join(',')).forEach(el => {
      if (el.closest('#global-search') || el.closest('#sidenav') || el.hidden) return;
      const panel = el.closest('.panel');
      if (!panel || el.closest('[hidden]:not(.panel)')) return;
      const title = textFor(el);
      if (!title || title.length > 80) return;
      const tab = tabFor(el);
      if (!tab) return;
      const key = (el.id || (tab + ':' + title.toLowerCase())).slice(0, 180);
      const unique = key + ':' + (seen[key] || 0);
      seen[key] = (seen[key] || 0) + 1;
      index.push({ key: unique, title, tab, tabTitle: tabLabel(tab), target: el, detail: el.closest('details') });
    });
  }
  function addRecent(item) {
    recents = [item.key].concat(recents.filter(key => key !== item.key)).slice(0, 6);
    saveList(RECENTS_KEY, recents);
    renderShortcuts();
  }
  window.recordDashboardRecent = element => {
    if (!element) return;
    buildIndex();
    const item = index.find(entry => entry.target === element) ||
      index.find(entry => entry.target.id && entry.target.id === element.id && entry.title === textFor(element));
    if (item) addRecent(item);
  };
  function openItem(item) {
    if (!item) return;
    if (typeof showTab === 'function') showTab(item.tab);
    if (item.detail) item.detail.open = true;
    if (!item.target.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SUMMARY|A)$/.test(item.target.tagName)) item.target.setAttribute('tabindex', '-1');
    setTimeout(() => {
      item.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (item.target.focus) item.target.focus();
    }, 40);
    addRecent(item);
    closeSearch();
  }
  function toggleFavorite(item) {
    favorites = favorites.includes(item.key) ? favorites.filter(key => key !== item.key) : [item.key].concat(favorites).slice(0, 12);
    saveList(FAVORITES_KEY, favorites);
    renderResults(input.value);
    renderShortcuts();
  }
  function resultRow(item) {
    const row = document.createElement('div');
    row.className = 'search-result-row';
    row.setAttribute('role', 'group');
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'search-result';
    const title = document.createElement('span');
    title.className = 'search-result-title'; title.textContent = item.title;
    const section = document.createElement('small');
    section.className = 'search-result-section'; section.textContent = item.tabTitle;
    go.appendChild(title); go.appendChild(section);
    go.addEventListener('click', () => openItem(item));
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'search-pin' + (favorites.includes(item.key) ? ' on' : '');
    pin.textContent = favorites.includes(item.key) ? '★' : '☆';
    pin.setAttribute('aria-label', favorites.includes(item.key) ? t('search.unpin', 'Remove shortcut') : t('search.pin', 'Pin shortcut'));
    pin.setAttribute('aria-pressed', String(favorites.includes(item.key)));
    pin.addEventListener('click', () => toggleFavorite(item));
    row.appendChild(go); row.appendChild(pin);
    return row;
  }
  function renderResults(query) {
    if (!appsRequested && typeof loadApps === 'function' && !appsData) {
      appsRequested = true;
      loadApps().then(() => renderResults(input.value));
    }
    buildIndex();
    const term = (query || '').trim().toLowerCase();
    results.textContent = '';
    if (!term) { results.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    const matches = index.filter(item => item.title.toLowerCase().includes(term)).slice(0, 15);
    if (!matches.length) {
      const empty = document.createElement('div'); empty.className = 'tools-term-empty';
      empty.textContent = t('search.empty', 'No matching settings, sections, apps or controls.'); results.appendChild(empty);
    } else matches.forEach(item => results.appendChild(resultRow(item)));
    results.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function renderShortcuts() {
    const host = q('nav-shortcuts');
    if (!host) return;
    buildIndex(); host.textContent = '';
    [['Pinned', favorites], ['Recent', recents]].forEach(([heading, keys]) => {
      const rows = keys.map(key => index.find(item => item.key === key)).filter(Boolean);
      if (!rows.length) return;
      const title = document.createElement('div'); title.className = 'nav-shortcuts-title';
      title.textContent = heading === 'Pinned' ? t('search.pinned', 'Pinned') : t('search.recent', 'Recent'); host.appendChild(title);
      rows.forEach(item => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'nav-shortcut';
        button.textContent = item.title; button.title = item.title; button.addEventListener('click', () => openItem(item)); host.appendChild(button);
      });
    });
  }
  function closeSearch() { results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  input.addEventListener('input', () => renderResults(input.value));
  input.addEventListener('focus', () => { if (input.value.trim()) renderResults(input.value); });
  input.addEventListener('keydown', event => {
    const rows = Array.from(results.querySelectorAll('.search-result'));
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && rows.length) {
      event.preventDefault(); rows[event.key === 'ArrowDown' ? 0 : rows.length - 1].focus();
    } else if (event.key === 'Escape') closeSearch();
  });
  results.addEventListener('keydown', event => {
    const rows = Array.from(results.querySelectorAll('.search-result'));
    const i = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
    } else if (event.key === 'Escape') { closeSearch(); input.focus(); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('#global-search')) closeSearch(); });
  document.addEventListener('keydown', event => {
    if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) && !event.target.isContentEditable) {
      event.preventDefault(); input.focus(); input.select();
    }
  });
  renderShortcuts();
})();
