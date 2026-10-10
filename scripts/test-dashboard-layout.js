/* Focused static regression checks for dashboard shortcuts and redundant page chrome. */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const webDashboard = fs.readFileSync(path.join(root, 'assets/js/mod-dashboard.js'), 'utf8');
const desktopDashboard = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/assets/js/mod-dashboard.js'), 'utf8');
const webPatients = fs.readFileSync(path.join(root, 'assets/js/mod-patients.js'), 'utf8');
const desktopPatients = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/assets/js/mod-patients.js'), 'utf8');

for (const source of [webDashboard, desktopDashboard]) {
  if (!source.includes('href="#/samples/home"')) throw new Error('Home Sampling shortcut is missing');
  if (!source.includes('Home Sampling &amp; Dispatch')) throw new Error('Home Sampling shortcut label is missing');
  if (source.includes('Stock needs attention:')) throw new Error('Stock attention banner still appears on dashboard');
  const start = source.indexOf('var quickCss =');
  const end = source.indexOf('/* Recent Patients', start);
  assert.ok(start >= 0 && end > start);
  for (const isTech of [false, true]) {
    const context = { isTech, App: { icon: () => '<svg aria-hidden="true"></svg>' } };
    vm.runInNewContext(source.slice(start, end), context);
    const bodyStyle = context.quickCss.match(/\.dbq-card \.card-b\{([^}]+)\}/)[1];
    assert.match(bodyStyle, /flex-direction:column/);
    assert.match(bodyStyle, /align-items:center/);
    assert.match(bodyStyle, /text-align:center/);
    assert.match(bodyStyle, /padding:10px!important/);
    assert.match(bodyStyle, /gap:6px!important/);
    assert.match(context.quickCss, /min-height:96px/);
    assert.match(context.quickCss, /width:32px!important;height:32px!important/);
    const cards = [...context.quickAccess.matchAll(/<a href="([^"]+)" class="card dbq-card"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.equal(cards.length, isTech ? 7 : 8);
    for (const [, , body] of cards) {
      assert.ok(body.indexOf('<svg') < body.indexOf('<b '), 'icon precedes title');
      assert.ok(body.indexOf('<b ') < body.indexOf('<small '), 'description follows title');
      assert.doesNotMatch(body, /flex-direction\s*:\s*row/, 'no inline row override');
    }
    assert.ok(cards.some(card => card[1] === '#/samples/home'));
    assert.equal(cards.some(card => card[1] === '#/finance'), !isTech);
  }
}

for (const source of [webPatients, desktopPatients]) {
  const addPage = source.match(/function renderAddPage\(\)\s*\{[\s\S]*?\n\s*\}\s*\/\* ---------- route registration/);
  if (!addPage) throw new Error('Add Patient route renderer is missing');
  if (addPage[0].includes('back-link') || addPage[0].includes('All Patients') || addPage[0].includes('<h1>')) {
    throw new Error('Add Patient still has redundant in-page navigation/title');
  }
}

console.log('PASS: dashboard vertical icon/text layout, role-specific shortcuts, banner removal and Add Patient chrome checks');
