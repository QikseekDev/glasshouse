// The theme toggle: auto, dark or light. And the language, chosen on the Server tab.

// ---- theme toggle (auto / dark / light) ----
(function initTheme() {
  const html = document.documentElement;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  // Browsers without prefers-color-scheme report the query as "not all";
  // they default to dark, the theme the dashboard is designed around.
  const mqSupported = mq.media !== 'not all';
  const urlTheme = new URLSearchParams(location.search).get('theme');
  let stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) { /* private window */ }
  let setting = urlTheme || stored || 'auto';
  if (setting !== 'auto' && setting !== 'dark' && setting !== 'light') setting = 'auto';
  apply();

  function themeName(s) {
    return s === 'light' ? t('theme.light', 'Light') : s === 'dark' ? t('theme.dark', 'Dark') : t('theme.auto', 'Auto');
  }

  function resolved() {
    if (setting !== 'auto') return setting;
    if (!mqSupported) return 'dark';
    return mq.matches ? 'dark' : 'light';
  }

  function apply() {
    const mode = resolved();
    if (mode === 'light') html.setAttribute('data-theme', 'light');
    else html.removeAttribute('data-theme');
    const btn = q('theme-toggle');
    if (btn) {
      btn.textContent = setting === 'auto' ? '◐' : (mode === 'light' ? '☀' : '☾');
      const label = t('theme.toggle', 'Theme: {setting} (click for {next})',
                      { setting: themeName(setting), next: themeName(nextSetting()) });
      btn.title = label;
      btn.setAttribute('aria-label', label);
    }
    // The Server tab's explicit choice, kept in step with the footer button.
    document.querySelectorAll('[data-theme-set]').forEach(b => {
      const on = b.dataset.themeSet === setting;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.content = mode === 'light' ? '#f5f5f5' : '#000000';
    html.style.colorScheme = mode;
  }

  function nextSetting() {
    const order = ['auto', 'dark', 'light'];
    return order[(order.indexOf(setting) + 1) % order.length];
  }

  function onMediaChange() { if (setting === 'auto') apply(); }
  if (mq.addEventListener) mq.addEventListener('change', onMediaChange);
  else if (mq.addListener) mq.addListener(onMediaChange);   // Chrome <= 68 (webOS 5.x)

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('#theme-toggle, [data-theme-set]');
    if (!btn) return;
    e.preventDefault();
    setting = btn.dataset.themeSet || nextSetting();
    try { localStorage.setItem('theme', setting); } catch (err) { /* private window */ }
    apply();
  });
})();

// ---- language (auto / a language) ----
(function initLanguage() {
  const chosen = I18N.stored();
  document.querySelectorAll('[data-lang-set]').forEach(b => {
    const on = b.dataset.langSet === chosen;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-lang-set]');
    if (!btn || btn.dataset.langSet === I18N.stored()) return;
    e.preventDefault();
    I18N.choose(btn.dataset.langSet);
    // Every string is set once, as the page loads, so a new language needs a
    // fresh load. A ?lang= in the address would override the choice.
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    location.replace(url.toString());
  });
})();

// A local presentation preference only: it never writes TV configuration.
(function initDensity() {
  let density = 'comfortable';
  try { density = localStorage.getItem('density') || density; } catch (e) { /* private window */ }
  if (density !== 'compact') density = 'comfortable';
  function apply() {
    document.documentElement.classList.toggle('compact-ui', density === 'compact');
    document.querySelectorAll('[data-density-set]').forEach(button => {
      const on = button.dataset.densitySet === density;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
  }
  apply();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-density-set]');
    if (!button) return;
    density = button.dataset.densitySet === 'compact' ? 'compact' : 'comfortable';
    try { localStorage.setItem('density', density); } catch (e) { /* private window */ }
    apply();
  });
})();
