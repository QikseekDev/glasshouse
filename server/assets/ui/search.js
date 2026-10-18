// Search across the dashboard's existing sections, controls, settings and tabs.
// Pinned destinations stay in this browser; no TV config is written.
(() => {
  const input = q('global-search-input');
  const results = q('global-search-results');
  const clear = q('global-search-clear');
  const backdrop = q('global-search-backdrop');
  const opener = q('global-search-open');
  if (!input || !results) return;

  const FAVORITES_KEY = 'glasshouse_search_favorites';
  let favorites = readList(FAVORITES_KEY);
  let index = [];

  // Curated tab aliases to support natural term searches (e.g. 'logs' -> Tools).
  const TAB_ALIASES = {
    control: ['remote', 'power', 'volume', 'playback', 'inputs', 'hdmi', 'channels', 'panel'],
    metrics: ['telemetry', 'stats', 'cpu', 'memory', 'ram', 'temp', 'temperature', 'storage', 'hardware'],
    apps: ['applications', 'installed', 'launch', 'store', 'uninstall'],
    home: ['homebrew', 'channel', 'takeover', 'wallpapers', 'recent'],
    privacy: ['telemetry', 'logs', 'tracking', 'activity', 'data', 'privacy policy'],
    oledcare: ['oled', 'burn-in', 'gsr', 'tpc', 'asbl', 'panel', 'protection', 'orbiting', 'pixel shift', 'logo dimming'],
    game: ['game optimizer', 'vrr', 'allm', 'fps', 'gaming', 'latency'],
    screensaver: ['screensavers', 'screen saver', 'screen savers', 'display sleep', 'art', 'clock', 'fireflies', 'fireworks'],
    advanced: ['settings', 'backlight', 'picture', 'network', 'service', 'developer'],
    servicemenu: ['service menu', 'instart', 'ezadjust', 'area option'],
    mqtt: ['home assistant', 'broker', 'automation', 'pubsub'],
    server: ['version', 'update', 'ota', 'upgrade', 'restart', 'reboot', 'daemon'],
    tools: ['logs', 'log', 'syslog', 'dmesg', 'kernel', 'glasshouse log', 'terminal', 'diagnostics']
  };

  const TAB_NAMES = {
    control: 'Control', metrics: 'Metrics', apps: 'Apps', home: 'Home',
    oledcare: 'OLED Care', game: 'Game', servicemenu: 'Service menu',
    screensaver: 'Screensaver', privacy: 'Privacy', advanced: 'Advanced',
    mqtt: 'MQTT', server: 'Server', tools: 'Tools'
  };

  // Curated OLED protection entries ensure instant discovery regardless of fetch state.
  const CURATED_ITEMS = [
    {
      key: 'oled:gsr',
      title: 'Global Stress Reduction (GSR)',
      tab: 'oledcare',
      kind: 'setting',
      aliases: ['gsr', 'burn-in', 'dimming', 'stationary', 'hud', 'global stress reduction'],
      searchText: 'Global Stress Reduction GSR Dims the whole screen when it detects a stationary element',
      selector: '[data-oled="gsr"]',
      fallbackId: 'oled-rows'
    },
    {
      key: 'oled:tpc',
      title: 'Temporal Peak Control (TPC / ASBL)',
      tab: 'oledcare',
      kind: 'setting',
      aliases: ['tpc', 'asbl', 'burn-in', 'dimming', 'brightness', 'temporal peak control', 'auto static brightness limiter'],
      searchText: 'Temporal Peak Control TPC ASBL Lowers overall brightness when a bright image is held',
      selector: '[data-oled="tpc"]',
      fallbackId: 'oled-rows'
    },
    {
      key: 'oled:screenShift',
      title: 'Screen Shift',
      tab: 'oledcare',
      kind: 'setting',
      aliases: ['pixel orbiting', 'orbiting', 'burn-in', 'shift', 'screen shift'],
      searchText: 'Screen Shift Pixel orbiting Nudges the whole picture by a pixel at a time',
      selector: '[data-oled="screenShift"]',
      fallbackId: 'oled-rows'
    },
    {
      key: 'oled:logoDimming',
      title: 'Logo Dimming',
      tab: 'oledcare',
      kind: 'setting',
      aliases: ['logo dimming', 'local dimming', 'burn-in', 'logo'],
      searchText: 'Logo Dimming Local dimming Dims only the static logos and banners',
      selector: '[data-oled="logoDimming"]',
      fallbackId: 'oled-rows'
    }
  ];

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
    const tabMap = {
      'tab-control': 'control', 'tab-metrics': 'metrics', 'appspane': 'apps',
      'homepane': 'home', 'oledpane': 'oledcare', 'gamepane': 'game',
      'svcpane': 'servicemenu', 'sspane': 'screensaver', 'privpane': 'privacy',
      'advpane': 'advanced', 'mqttpane': 'mqtt', 'serverpane': 'server', 'toolspane': 'tools'
    };
    return tabMap[panel.id] || null;
  }

  function textFor(el) {
    if (!el) return '';
    if (el.matches && el.matches('input[placeholder]')) return el.getAttribute('aria-label') || el.placeholder || '';
    const labelled = el.getAttribute('aria-label') || el.getAttribute('title');
    if (labelled) return labelled.replace(/\s+/g, ' ').trim();
    const tSpan = el.querySelector ? el.querySelector('[data-t]') : null;
    if (tSpan && tSpan.textContent.trim()) return tSpan.textContent.replace(/\s+/g, ' ').trim();
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function tabLabel(tab) {
    const btn = document.querySelector(`#tabs [data-tab="${tab}"]`);
    return (btn ? textFor(btn) : '') || TAB_NAMES[tab] || tab;
  }

  function searchableText(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Normalizes query term to handle English plurals and common suffixes (stemming).
  function normalizeQuery(raw) {
    const term = (raw || '').trim().toLowerCase();
    if (!term) return [];
    const forms = [term];
    if (term.length > 3 && term.endsWith('ies')) {
      forms.push(term.slice(0, -3) + 'y');
    } else if (term.length > 3 && term.endsWith('es') && !term.endsWith('sses')) {
      forms.push(term.slice(0, -2));
      forms.push(term.slice(0, -1));
    } else if (term.length > 2 && term.endsWith('s') && !term.endsWith('ss')) {
      forms.push(term.slice(0, -1));
    }
    return forms;
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

  function isExcluded(el) {
    return !el || el.hidden || el.closest('#global-search') || el.closest('#catalog-box') || el.closest('#apps-installed-list');
  }

  function tabAvailable(tab) {
    if (tab === 'metrics' || tab === 'apps') return false;
    const button = document.querySelector(`#tabs [data-tab="${tab}"]`);
    return !!button && !button.hidden && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
  }

  function isControlDisabled(el) {
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return true;
    const controls = el.matches('button, input, select, textarea, a') ? [el] :
      Array.from(el.querySelectorAll('button, input, select, textarea, a'));
    return controls.length > 0 && controls.every(c => c.matches(':disabled') || c.getAttribute('aria-disabled') === 'true');
  }

  // 1. Index dashboard tabs as first-class searchable items.
  function indexTabs(seen) {
    document.querySelectorAll('#tabs [data-tab]').forEach(btn => {
      if (btn.hidden || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      const tab = btn.dataset.tab;
      if (!tabAvailable(tab)) return;
      const title = textFor(btn) || TAB_NAMES[tab] || tab;
      const key = 'tab:' + tab;
      seen[key] = true;
      index.push({
        key,
        title,
        kind: 'tab',
        tab,
        tabTitle: t('search.tab', 'Tab'),
        searchText: title + ' ' + (TAB_ALIASES[tab] || []).join(' '),
        aliases: TAB_ALIASES[tab] || [],
        target: btn
      });
    });
  }

  // 2. Index curated entries (OLED protections) for immediate discovery.
  function indexCurated(seen) {
    CURATED_ITEMS.forEach(c => {
      if (!tabAvailable(c.tab)) return;
      const liveTarget = c.selector ? document.querySelector(c.selector) : null;
      const fallbackTarget = c.fallbackId ? q(c.fallbackId) : null;
      const target = liveTarget || fallbackTarget || document.querySelector(`#tabs [data-tab="${c.tab}"]`);
      seen[c.key] = true;
      index.push({
        key: c.key,
        title: c.title,
        kind: c.kind,
        tab: c.tab,
        tabTitle: tabLabel(c.tab),
        searchText: c.searchText,
        aliases: c.aliases,
        target,
        detail: target ? target.closest('details') : null
      });
    });
  }

  // 3. Index discrete section headings and detail summaries.
  function indexSections(seen) {
    const sectionSelectors = ['.pv-sec', '.col-sec', 'summary', '.apps-grp-h', '.grp'];
    document.querySelectorAll(sectionSelectors.join(',')).forEach(el => {
      if (isExcluded(el) || el.closest('#sidenav')) return;
      const tab = tabFor(el);
      if (!tab || !tabAvailable(tab)) return;
      const title = textFor(el);
      if (!title || title.length > 70) return;
      const key = 'sec:' + (el.id || (tab + ':' + title.toLowerCase()));
      if (seen[key]) return;
      seen[key] = true;

      const aliases = [];
      const lower = title.toLowerCase();
      if (lower.includes('log')) aliases.push('logs', 'syslog', 'dmesg', 'kernel');
      if (lower.includes('power')) aliases.push('reboot', 'restart', 'standby');

      index.push({
        key,
        title,
        kind: 'section',
        tab,
        tabTitle: tabLabel(tab),
        searchText: searchableText(el),
        aliases,
        target: el,
        detail: el.closest('details')
      });
    });
  }

  // 4. Index setting rows (.prot-row, .oled-row, .cfg-f, .pv-row).
  function indexSettings(seen) {
    const settingSelectors = ['.prot-row', '.oled-row', '.cfg-f', '.pv-row', '.ss-level-row'];
    document.querySelectorAll(settingSelectors.join(',')).forEach(row => {
      if (isExcluded(row) || isControlDisabled(row)) return;
      const tab = tabFor(row);
      if (!tab || !tabAvailable(tab)) return;

      let title = '';
      const aliases = [];
      const oledAttr = row.querySelector('[data-oled]');
      const oledKey = oledAttr ? 'oled:' + oledAttr.getAttribute('data-oled') : null;

      // Handle rendered OLED Care protection row
      const oledName = row.querySelector('.oled-name');
      if (oledName) {
        const sub = row.querySelector('.oled-sub');
        const subText = sub ? sub.textContent.trim() : '';
        const base = oledName.firstChild ? oledName.firstChild.textContent.trim() : oledName.textContent.trim();
        title = subText ? `${base} (${subText})` : base;
        if (subText) aliases.push(subText.toLowerCase());
      } else {
        const titleEl = row.querySelector('.prot-title, .lbl, .n, label');
        if (titleEl) {
          const trans = titleEl.querySelector('[data-t]');
          title = (trans || titleEl).textContent.replace(/\s+/g, ' ').trim();
        }
      }

      if (!title || title.length > 80) return;
      const key = oledKey || ('set:' + (row.id || (tab + ':' + title.toLowerCase())));
      const existing = index.find(item => item.key === key);
      const target = row.querySelector('button, input, select') || row;

      if (existing) {
        existing.target = target;
        existing.detail = row.closest('details');
        existing.searchText = searchableText(row);
        return;
      }
      if (seen[key]) return;
      seen[key] = true;

      index.push({
        key,
        title,
        kind: 'setting',
        tab,
        tabTitle: tabLabel(tab),
        searchText: searchableText(row),
        aliases,
        target,
        detail: row.closest('details')
      });
    });
  }

  // 5. Index discrete interactive controls (buttons, inputs, selects).
  function indexControls(seen) {
    const controlSelectors = [
      '.set button[id]', '.set select[id]', '.set input[id]',
      '#ss-toggle', '#serverpane button[id]', '#toolspane .tools-toolbar button[id]'
    ];
    document.querySelectorAll(controlSelectors.join(',')).forEach(el => {
      if (isExcluded(el) || isControlDisabled(el)) return;
      const tab = tabFor(el);
      if (!tab || !tabAvailable(tab)) return;

      const title = textFor(el);
      if (!title || title.length > 60 || title.length < 2) return;

      const parentSet = el.closest('.set');
      const groupLbl = parentSet ? parentSet.querySelector('.lbl') : null;
      const groupText = groupLbl ? textFor(groupLbl) : '';

      const key = 'act:' + (el.id || (tab + ':' + title.toLowerCase()));
      if (seen[key]) return;
      seen[key] = true;

      const aliases = [];
      const lower = title.toLowerCase();
      if (el.id === 'btn_ss' || lower.includes('screensaver')) aliases.push('screensaver', 'screensavers', 'screen saver');
      if (el.id === 'btn-reboot' || lower.includes('reboot')) aliases.push('reboot', 'restart', 'reset');
      if (el.id === 'btn-off' || lower.includes('turn off')) aliases.push('power off', 'standby', 'off');

      const tabBadge = groupText ? `${tabLabel(tab)} · ${groupText}` : tabLabel(tab);

      index.push({
        key,
        title,
        kind: 'action',
        tab,
        tabTitle: tabBadge,
        searchText: title + ' ' + groupText,
        aliases,
        target: el,
        detail: el.closest('details')
      });
    });
  }

  function buildIndex() {
    index = [];
    const seen = {};
    indexTabs(seen);
    indexCurated(seen);
    indexSections(seen);
    indexSettings(seen);
    indexControls(seen);
  }

  // Scoring function with low cyclomatic complexity: flat score levels per match tier.
  function scoreItem(item, queryForms) {
    const title = (item.title || '').toLowerCase();
    const corpus = (item.searchText || '').toLowerCase();
    const aliases = item.aliases || [];
    let best = 0;

    for (let i = 0; i < queryForms.length; i++) {
      const q = queryForms[i];
      const penalty = i * 15;
      let score = 0;

      if (title === q) {
        score = 500;
      } else if (aliases.includes(q)) {
        score = 450;
      } else if (title.startsWith(q)) {
        score = 350;
      } else if (new RegExp('\\b' + escapeRegExp(q)).test(title)) {
        score = 300;
      } else if (title.includes(q)) {
        score = 200;
      } else if (aliases.some(a => a.includes(q) || q.includes(a))) {
        score = 150;
      } else if (corpus.includes(q)) {
        score = 100;
      } else if (q.length >= 5 && fuzzyMatch(q, corpus)) {
        score = 50;
      }

      if (score > 0) {
        if (item.kind === 'tab' && score >= 300) score += 20;
        score -= penalty;
        if (score > best) best = score;
      }
    }
    return best;
  }

  function openItem(item) {
    if (!item) return;
    if (item.tab && typeof showTab === 'function') showTab(item.tab);
    if (item.detail) item.detail.open = true;
    if (item.target && item.target !== document.body) {
      if (!item.target.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|SUMMARY|A)$/.test(item.target.tagName)) {
        item.target.setAttribute('tabindex', '-1');
      }
      setTimeout(() => {
        item.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (typeof item.target.focus === 'function') item.target.focus();
        item.target.classList.remove('search-highlight');
        void item.target.offsetWidth;
        item.target.classList.add('search-highlight');
        setTimeout(() => item.target.classList.remove('search-highlight'), 2400);
      }, 50);
    }
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
    go.type = 'button';
    go.className = 'search-result';

    const title = document.createElement('span');
    title.className = 'search-result-title';
    title.textContent = item.title;

    const section = document.createElement('small');
    section.className = 'search-result-section';
    section.textContent = item.tabTitle;

    go.appendChild(title);
    go.appendChild(section);
    go.addEventListener('click', () => openItem(item));

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'search-pin' + (favorites.includes(item.key) ? ' on' : '');
    pin.textContent = favorites.includes(item.key) ? '★' : '☆';
    pin.setAttribute('aria-label', favorites.includes(item.key) ? t('search.unpin', 'Remove shortcut') : t('search.pin', 'Pin shortcut'));
    pin.setAttribute('aria-pressed', String(favorites.includes(item.key)));
    pin.addEventListener('click', () => toggleFavorite(item));

    row.appendChild(go);
    row.appendChild(pin);
    return row;
  }

  function renderResults(query) {
    buildIndex();
    const raw = (query || '').trim();
    results.textContent = '';
    if (!raw) {
      results.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      if (clear) clear.hidden = true;
      return;
    }

    const queryForms = normalizeQuery(raw);
    const matches = index.map((item, order) => {
      const score = scoreItem(item, queryForms);
      return { item, score, order };
    }).filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 15)
      .map(match => match.item);

    const count = document.createElement('div');
    count.className = 'search-result-count';
    count.setAttribute('role', 'status');
    count.textContent = matches.length ? t('search.count', '{n} results', { n: matches.length }) : '';
    results.appendChild(count);

    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'tools-term-empty';
      empty.textContent = t('search.empty', 'No matches. Try port, brightness, MQTT, or network.');
      results.appendChild(empty);
    } else {
      matches.forEach(item => results.appendChild(resultRow(item)));
    }

    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (clear) clear.hidden = false;
  }

  function renderShortcuts() {
    const host = q('nav-shortcuts');
    if (!host) return;
    buildIndex();
    host.textContent = '';
    const rows = favorites.map(key => index.find(item => item.key === key)).filter(Boolean);
    if (!rows.length) return;

    const title = document.createElement('div');
    title.className = 'nav-shortcuts-title';
    title.textContent = t('search.pinned', 'Pinned');
    host.appendChild(title);

    rows.forEach(item => {
      const row = document.createElement('div');
      row.className = 'nav-shortcut-row';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-shortcut';
      button.textContent = item.title;
      button.title = item.title;
      button.addEventListener('click', () => openItem(item));

      const unpin = document.createElement('button');
      unpin.type = 'button';
      unpin.className = 'nav-shortcut-pin on';
      unpin.textContent = '★';
      unpin.title = t('search.unpin', 'Remove shortcut');
      unpin.setAttribute('aria-label', t('search.unpin', 'Remove shortcut'));
      unpin.addEventListener('click', event => {
        event.stopPropagation();
        toggleFavorite(item);
      });

      row.appendChild(button);
      row.appendChild(unpin);
      host.appendChild(row);
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
      event.preventDefault();
      rows[event.key === 'ArrowDown' || event.key === 'Home' ? 0 : rows.length - 1].focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openFirstResult();
    } else if (event.key === 'Escape') closeSearch();
  });

  results.addEventListener('keydown', event => {
    const rows = Array.from(results.querySelectorAll('.search-result'));
    const i = rows.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : i + (event.key === 'ArrowDown' ? 1 : -1);
      rows[Math.max(0, Math.min(rows.length - 1, next))].focus();
    } else if (event.key === 'Escape') {
      closeSearch();
      input.focus();
    }
  });

  if (clear) clear.addEventListener('click', clearSearch);
  if (opener) opener.addEventListener('click', openSearch);
  if (backdrop) backdrop.addEventListener('click', event => { if (event.target === backdrop) closeSearch(); });
  document.addEventListener('keydown', event => {
    if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) && !event.target.isContentEditable) {
      event.preventDefault();
      openSearch();
    }
  });

  renderShortcuts();
})();
