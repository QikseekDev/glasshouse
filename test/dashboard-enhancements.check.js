/* Focused regression tests for the dashboard audit fixes. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var apps = fs.readFileSync(path.join(root, 'server/assets/ui/apps.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'server/assets/ui/ui.css'), 'utf8');
var page = fs.readFileSync(path.join(root, 'server/assets/ui.html'), 'utf8');

function declaration(source, start, end) {
  var from = source.indexOf(start);
  assert.notStrictEqual(from, -1, 'declaration exists: ' + start);
  var to = source.indexOf(end, from);
  assert.notStrictEqual(to, -1, 'declaration end exists: ' + end);
  return source.slice(from, to);
}

async function testAppsLoadFailureHasRetry() {
  var list = { innerHTML: '' };
  var source = declaration(apps, 'async function loadApps()', '// Do not depend on CSS :has()');
  var sandbox = {
    appsLoading: false,
    q: function (id) { return id === 'apps-installed-list' ? list : null; },
    api: function (url) { return url; },
    fetch: function () { return Promise.reject(new Error('<offline>')); },
    esc: function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    console: { error: function () {} },
    renderAppsPanel: function () {},
    updateAppsGroups: function () {}
  };
  await vm.runInNewContext(source + '\nloadApps();', sandbox);
  assert.ok(list.innerHTML.indexOf('role="alert"') !== -1, 'failure is announced');
  assert.ok(list.innerHTML.indexOf('Retry') !== -1, 'failure offers retry');
  assert.ok(list.innerHTML.indexOf('&lt;offline&gt;') !== -1, 'error text is escaped');
  assert.strictEqual(sandbox.appsLoading, false, 'loading lock is released');
}

function testEmptyAppsGroupsWithoutHas() {
  var source = declaration(apps, 'function updateAppsGroups()', "document.addEventListener('change'");
  function group(hidden) {
    var value = false;
    var result = {
      sections: [],
      classList: { toggle: function (name, on) { if (name === 'is-empty') value = on; } },
      querySelectorAll: function () { return this.sections; },
      empty: function () { return value; }
    };
    result.sections.push({ hidden: hidden, parentNode: result });
    return result;
  }
  var noSections = group(true), hasSection = group(false);
  var sandbox = { document: { querySelectorAll: function () { return [noSections, hasSection]; } } };
  vm.runInNewContext(source + '\nupdateAppsGroups();', sandbox);
  assert.strictEqual(noSections.empty(), true, 'group with no available section is hidden');
  assert.strictEqual(hasSection.empty(), false, 'group with an available section stays visible');
  assert.ok(!/:has\(/.test(css), 'stylesheet does not depend on unsupported :has()');
}

function testSearchIsIntegrated() {
  assert.ok(page.indexOf('id="global-search-input"') !== -1, 'search input exists');
  assert.ok(page.indexOf('/assets/ui/search.js') !== -1, 'search code is loaded into the panel');
  var search = fs.readFileSync(path.join(root, 'server/assets/ui/search.js'), 'utf8');
  assert.ok(search.indexOf('glasshouse_search_favorites') !== -1, 'pinned destinations persist locally');
  assert.ok(search.indexOf('glasshouse_search_recents') !== -1, 'recent destinations persist locally');
  assert.ok(page.indexOf('/assets/ui/tools.js') < page.indexOf('/assets/ui/tabs.js'), 'tab startup runs after Tools state is initialized');
}

(async function () {
  await testAppsLoadFailureHasRetry();
  console.log('  ✓ Apps load failures show an escaped error and release the loading lock');
  testEmptyAppsGroupsWithoutHas();
  console.log('  ✓ empty Apps groups work without CSS :has()');
  testSearchIsIntegrated();
  console.log('  ✓ global search is present and shortcut lists use local storage');
  console.log('ALL test-dashboard-enhancements.js assertions passed!\n');
})().catch(function (error) {
  console.error(error.stack || error);
  process.exit(1);
});
