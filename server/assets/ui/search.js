// Search across the dashboard's existing sections, controls and settings.
// Pinned destinations stay in this browser; no TV config is written.
(() => {
  const input = q('global-search-input');
  const results = q('global-search-results');
  const clear = q('global-search-clear');
  const backdrop = q('global-search-backdrop');
  const opener = q('global-search-open');
  if (!input || !results) return;
  try { localStorage.removeItem('glasshouse_search_recents'); } catch (e) { /* storage may be disabled */ }

  const FAVORITES_KEY = 'glasshouse_search_favorites';
  const labels = ['button', 'summary', '[role="button"]', 'select', 'label', '.col-sec', '.apps-grp-h'];
  const settingRows = ['.prot-row', '.set', '.cfg-f', '.pv-row'];
  let favorites = readList(FAVORITES_KEY);
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
  function settingTitle(row) {
    const title = row.querySelector('.prot-title, .lbl, .n, label');
    if (!title) return '';
    const translated = title.querySelector('[data-t]');
    return (translated || title).textContent.replace(/\s+/g, ' ').trim();
  }
  function searchableText(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function oneEditAway(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }
  function fuzzyMatch(query, text) {
    return query.split(/\s+/).every(term => {
      if (term.length < 5) return false;
      return text.split(/[^a-z0-9]+/).some(word => word && oneEditAway(term, word));
    });
  }
  function unavailable(el, tab) {
    const tabButton = document.querySelector(`#tabs [data-tab="${tab}"]`);
    if (tab === 'metrics' || tab === 'apps' || !tabButton || tabButton.hidden || tabButton.disabled ||
        tabButton.getAttribute('aria-disabled') === 'true' || el.hidden || el.matches(':disabled')) return true;
    const controls = el.matches('button, input, select, textarea, a') ? [el] :
      Array.from(el.querySelectorAll('button, input, select, textarea, a'));
    return controls.length > 0 && controls.every(control =>
      control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true');
  }
  function buildIndex() {
    const seen = {};
    index = [];
    document.querySelectorAll(settingRows.join(',')).forEach(row => {
      if (row.hidden || row.closest('#global-search') || row.closest('#sidenav') || row.closest('[hidden]:not(.panel)')) return;
      const title = settingTitle(row);
      const tab = tabFor(row);
      if (!title || !tab || unavailable(row, tab)) return;
      const key = (row.id || (tab + ':' + title.toLowerCase())).slice(0, 180);
      const unique = key + ':' + (seen[key] || 0);
      seen[key] = (seen[key] || 0) + 1;
      index.push({ key: unique, title, searchText: searchableText(row), tab, tabTitle: tabLabel(tab), target: row, detail: row.closest('details') });
    });
    document.querySelectorAll(labels.join(',')).forEach(el => {
      if (el.closest('#global-search') || el.closest('#sidenav') || el.hidden) return;
      const panel = el.closest('.panel');
      if (!panel || el.closest('[hidden]:not(.panel)')) return;
      if (el.closest(settingRows.join(','))) return;
      const title = textFor(el);
      if (!title || title.length > 80) return;
      const tab = tabFor(el);
      if (!tab || unavailable(el, tab)) return;
      const key = (el.id || (tab + ':' + title.toLowerCase())).slice(0, 180);
      const unique = key + ':' + (seen[key] || 0);
      seen[key] = (seen[key] || 0) + 1;
      index.push({ key: unique, title, searchText: title, tab, tabTitle: tabLabel(tab), target: el, detail: el.closest('details') });
    });
  }
  function openItem(item) {
    if (!item) return;
    if (typeof showTab === 'function') showTab(item.tab);
    if (item.detail) item.detail.open = true;
    if (!item.target.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SUMMARY|A)$/.test(item.target.tagName)) item.target.setAttribute('tabindex', '-1');
    setTimeout(() => {
      item.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (item.target.focus) item.target.focus();
      item.target.classList.remove('search-highlight');
      // Restart the animation when a destination is selected repeatedly.
      void item.target.offsetWidth;
      item.target.classList.add('search-highlight');
      setTimeout(() => item.target.classList.remove('search-highlight'), 2400);
    }, 40);
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
    if (!term) { results.hidden = true; input.setAttribute('aria-expanded', 'false'); if (clear) clear.hidden = true; return; }
    const matches = index.map((item, order) => {
      const title = item.title.toLowerCase();
      const corpus = item.searchText.toLowerCase();
      let score = 0;
      if (title === term) score = 400;
      else if (title.indexOf(term) === 0) score = 300;
      else if (title.includes(term)) score = 200;
      else if (corpus.includes(term)) score = 100;
      else if (fuzzyMatch(term, corpus)) score = 50;
      return { item, score, order };
    }).filter(match => match.score).sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 15).map(match => match.item);
    const count = document.createElement('div');
    count.className = 'search-result-count';
    count.setAttribute('role', 'status');
    count.textContent = matches.length ? t('search.count', '{n} results', { n: matches.length }) : '';
    results.appendChild(count);
    if (!matches.length) {
      const empty = document.createElement('div'); empty.className = 'tools-term-empty';
      empty.textContent = t('search.empty', 'No matches. Try port, brightness, MQTT, or network.'); results.appendChild(empty);
    } else matches.forEach(item => results.appendChild(resultRow(item)));
    results.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (clear) clear.hidden = !term;
  }
  function renderShortcuts() {
    const host = q('nav-shortcuts');
    if (!host) return;
    buildIndex(); host.textContent = '';
    [['Pinned', favorites]].forEach(([heading, keys]) => {
      const rows = keys.map(key => index.find(item => item.key === key)).filter(Boolean);
      if (!rows.length) return;
      const title = document.createElement('div'); title.className = 'nav-shortcuts-title';
      title.textContent = t('search.pinned', 'Pinned'); host.appendChild(title);
      rows.forEach(item => {
        const row = document.createElement('div'); row.className = 'nav-shortcut-row';
        const button = document.createElement('button'); button.type = 'button'; button.className = 'nav-shortcut';
        button.textContent = item.title; button.title = item.title; button.addEventListener('click', () => openItem(item));
        const unpin = document.createElement('button');
        unpin.type = 'button'; unpin.className = 'nav-shortcut-pin on'; unpin.textContent = '★';
        unpin.title = t('search.unpin', 'Remove shortcut');
        unpin.setAttribute('aria-label', t('search.unpin', 'Remove shortcut'));
        unpin.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(item); });
        row.appendChild(button); row.appendChild(unpin); host.appendChild(row);
      });
    });
  }
  function openSearch() {
    if (backdrop) backdrop.hidden = false;
    if (typeof closeNav === 'function') closeNav();
    input.focus();
    input.select();
    if (input.value.trim()) renderResults(input.value);
  }
  function closeSearch() {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (backdrop) backdrop.hidden = true;
  }
  function openFirstResult() {
    const first = results.querySelector('.search-result');
    if (first) first.click();
  }
  function clearSearch() {
    input.value = '';
    renderResults('');
    input.focus();
  }
  input.addEventListener('input', () => renderResults(input.value));
  input.addEventListener('focus', () => { if (input.value.trim()) renderResults(input.value); });
  input.addEventListener('keydown', event => {
    const rows = Array.from(results.querySelectorAll('.search-result'));
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') && rows.length) {
      event.preventDefault(); rows[event.key === 'ArrowDown' || event.key === 'Home' ? 0 : rows.length - 1].focus();
    } else if (event.key === 'Enter') {
      event.preventDefault(); openFirstResult();
    } else if (event.key === 'Escape') closeSearch();
  });
  results.addEventListener('keydown', event => {
    const rows = Array.from(results.querySelectorAll('.search-result'));
    const i = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : i + (event.key === 'ArrowDown' ? 1 : -1);
      rows[Math.max(0, Math.min(rows.length - 1, next))].focus();
    } else if (event.key === 'Escape') { closeSearch(); input.focus(); }
  });
  if (clear) clear.addEventListener('click', clearSearch);
  if (opener) opener.addEventListener('click', openSearch);
  if (backdrop) backdrop.addEventListener('click', event => { if (event.target === backdrop) closeSearch(); });
  document.addEventListener('keydown', event => {
    if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) && !event.target.isContentEditable) {
      event.preventDefault(); openSearch();
    }
  });
  renderShortcuts();
})();
