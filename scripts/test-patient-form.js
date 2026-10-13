'use strict';

// Patient form: CNIC text field (optional, 13 digits, dashes) and the required blood group.
// Real assets/js/mod-patients.js against an in-memory DB and DOM fixture. Run: node scripts/test-patient-form.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLOODS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function run(base) {
  const tables = { tests: [], patients: [], invoices: [], results: [], doctors: [], panels: [], branches: [] };
  const routes = {}; let elements = {}, focused = null, toasts = [], modalHtml = '', modalOpen = null, closed = 0, saved = [];
  function element(attrs = {}) {
    const listeners = {}, el = {
      value: attrs.value || '', checked: false, hidden: false, style: {}, innerHTML: '', textContent: '', id: attrs.id,
      classList: { toggle(cls, on) { el.invalid = !!on; } }, getAttribute: key => attrs[key],
      addEventListener(type, cb) { (listeners[type] || (listeners[type] = [])).push(cb); },
      fire(type) { (listeners[type] || []).forEach(cb => cb({ preventDefault() {} })); },
      focus() { focused = attrs.id; }, insertBefore() {}, insertAdjacentHTML() {}, querySelector() { return null; }, querySelectorAll() { return []; }
    };
    el.parentElement = { querySelector: () => el.field || null };
    return el;
  }
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  function build(html) {
    elements = {};
    const tags = html.match(/<(?:input|select|textarea|div|form|button)[^>]*\bid="[^"]+"[^>]*>/g) || [];
    for (const tag of tags) { const a = attributes(tag); elements[a.id] = element(a); }
    for (const id of Object.keys(elements)) {
      const m = /^ptf-e-(.+)$/.exec(id);   // error box -> the field it belongs to (setErr finds it through parentElement)
      if (m && elements['ptf-' + m[1]]) { elements[id].field = elements['ptf-' + m[1]]; elements[id].parentElement = { querySelector: () => elements['ptf-' + m[1]] }; }
    }
    // defaults the markup carries (selected option / value) so an untouched form reads like the browser would
    const sel = id => { const m = new RegExp('<select[^>]*id="' + id + '"[\\s\\S]*?</select>').exec(html); const o = m && /<option value="([^"]*)" selected/.exec(m[0]); return o ? o[1] : ''; };
    ['ptf-blood', 'ptf-gender', 'ptf-doctor'].forEach(id => { if (elements[id]) elements[id].value = sel(id); });
    if (elements['ptf-regdate']) elements['ptf-regdate'].value = '2026-10-10T10:00';
    if (elements['ptf-tlist']) elements['ptf-tlist'].querySelectorAll = () => [];
    if (elements['ptf-ttype']) elements['ptf-ttype'].value = 'regular';
    return html;
  }
  const view = element();
  Object.defineProperty(view, 'innerHTML', { set(html) { build(html); }, get() { return ''; } });
  const document = {
    getElementById: id => id === 'view' ? view : elements[id] || null,
    createElement: () => element(), addEventListener() {}, querySelectorAll() { return []; }
  };
  const DB = {
    all: name => tables[name] || [],
    get: (name, id) => (tables[name] || []).find(x => x.id === id) || null,
    insert(name, data) { const item = Object.assign({ id: 'P' + ((tables[name] || []).length + 1) }, data); (tables[name] || (tables[name] = [])).push(item); saved.push(item); return item; },
    update(name, id, patch) { Object.assign(this.get(name, id), patch); saved.push(patch); }
  };
  const App = {
    esc, route(name, cb) { routes[name] = cb; }, nav() {}, toast: m => toasts.push(m), normWa: () => '', money: v => 'Rs ' + v, icon: () => '',
    optionsHtml: (key, cur, blank) => '<option value="">' + blank + '</option>' + BLOODS.map(x => '<option value="' + x + '"' + (x === cur ? ' selected' : '') + '>' + x + '</option>').join(''),
    datalistHtml: () => '', toLocalInput: () => '2026-10-10T10:00', fromLocalInput: () => '2026-10-10T05:00:00.000Z', visitDefaults: () => ({}),
    listOptions: () => [], nextVisitNos: () => ({ labNo: 1, caseNo: 1 }), outsourceSync() {}, testCatalog: { templates: () => [] },
    session: () => ({ role: 'admin' }), canPage: () => true, dt: () => '', d: () => '', empty: t => t, confirm: async () => true,
    modal(title, html, opts) { modalHtml = build(html); modalOpen = () => opts.onOpen({}, () => { closed++; }); return () => {}; }
  };
  const context = vm.createContext({ App, DB, document, console, setTimeout() {}, location: { hash: '' }, localStorage: { getItem: () => '{"role":"admin"}' } });
  context.window = context; context.scrollTo = () => {};
  const source = fs.readFileSync(path.join(root, base, 'assets/js/mod-patients.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'App.testOpen = openPatientModal; })();');
  vm.runInContext(source, context, { filename: 'mod-patients.js' });

  const fill = (v) => Object.keys(v).forEach(k => { elements['ptf-' + k].value = v[k]; });
  const fillValid = (extra = {}) => fill(Object.assign({ name: 'Ayesha Khan', age: '30', gender: 'Female', blood: 'O+', whatsapp: '0300-1234567' }, extra));
  const submit = () => { toasts = []; focused = null; elements['ptf-form'].fire('submit'); };
  const openAdd = () => { tables.patients.length = 0; saved = []; closed = 0; App.testOpen(null); modalOpen(); };
  const errText = id => elements['ptf-e-' + id].textContent;

  // ---- Add form: markup ----
  openAdd();
  assert.ok(/for="ptf-cnic">CNIC/.test(modalHtml), 'CNIC label');
  assert.ok(/id="ptf-cnic"[^>]*placeholder="00000-0000000-0"/.test(modalHtml), 'CNIC placeholder');
  assert.ok(/for="ptf-blood">Blood Group<\/label>/.test(modalHtml), 'Blood group label is not required');
  assert.ok(!/for="ptf-blood">Blood Group \*/.test(modalHtml), 'Blood group is not marked required');
  assert.ok(/<option value="">Select blood group<\/option>/.test(modalHtml), 'Blood group starts on the placeholder');
  assert.ok(!/<option value="Unknown"/.test(modalHtml), 'No Unknown option');
  assert.equal(elements['ptf-blood'].value, '', 'Nothing preselected');
  assert.ok(modalHtml.indexOf('id="ptf-whatsapp"') < modalHtml.indexOf('id="ptf-cnic"'), 'CNIC after the mobile number');

  // ---- blood group is optional: allowed, no inline error, patient saves cleanly ----
  fillValid({ blood: '' });
  submit();
  assert.equal(errText('blood'), '', 'no blood group error');
  assert.equal(tables.patients.length, 1, 'saved without a blood group');
  assert.equal(tables.patients[0].blood, '', 'saved with empty blood group');
  assert.equal(closed, 1);
  // "Unknown" (legacy value) saves as empty without blocking
  openAdd(); fillValid({ blood: 'Unknown' }); submit();
  assert.equal(tables.patients.length, 1, 'saved cleanly');
  assert.equal(tables.patients[0].blood, '', 'Unknown normalized to empty');
  // the first invalid field gets the focus (name before blood)
  openAdd(); fillValid({ name: '', blood: '' }); submit();
  assert.equal(focused, 'ptf-name');
  assert.ok(errText('name'));
  assert.equal(errText('blood'), '');
  // picking a group saves properly
  openAdd(); fillValid({ blood: 'B-' }); submit();
  assert.equal(tables.patients[0].blood, 'B-');
  assert.equal(errText('blood'), '');

  // ---- every one of the 8 groups saves ----
  for (const g of BLOODS) { openAdd(); fillValid({ blood: g }); submit(); assert.equal(tables.patients.length, 1, g + ' saves'); assert.equal(tables.patients[0].blood, g); assert.equal(closed, 1); }

  // ---- CNIC: optional, auto-dashes, 13 digits ----
  openAdd(); fillValid({ cnic: '3520212345671' }); elements['ptf-cnic'].fire('input');
  assert.equal(elements['ptf-cnic'].value, '35202-1234567-1', 'dashes inserted while typing');
  elements['ptf-cnic'].value = '35202 1234567 1'; elements['ptf-cnic'].fire('input');
  assert.equal(elements['ptf-cnic'].value, '35202-1234567-1', 'spaces / pasted separators normalised');
  elements['ptf-cnic'].value = '352021234567190'; elements['ptf-cnic'].fire('input');
  assert.equal(elements['ptf-cnic'].value, '35202-1234567-1', 'more than 13 digits ignored');
  submit();
  assert.equal(tables.patients.length, 1); assert.equal(tables.patients[0].cnic, '35202-1234567-1', 'CNIC saved on the patient');
  openAdd(); fillValid({ cnic: '' }); submit();
  assert.equal(tables.patients.length, 1, 'CNIC is optional'); assert.equal(tables.patients[0].cnic, '');
  openAdd(); fillValid({ cnic: '35202-12345' }); submit();
  assert.equal(tables.patients.length, 0, 'short CNIC blocked'); assert.match(errText('cnic'), /13 digits/); assert.equal(focused, 'ptf-cnic');
  openAdd(); fillValid({ cnic: '35202-1234567-1', blood: '' }); submit();
  assert.equal(tables.patients.length, 1, 'valid CNIC and empty blood saves'); assert.equal(errText('cnic'), ''); assert.equal(errText('blood'), '');

  // ---- Edit form ----
  const existing = { id: 'PX', name: 'Old Patient', age: 40, gender: 'Male', blood: '', phone: '0300-1111111', whatsapp: '0300-1111111', cnic: '' };
  tables.patients = [existing]; closed = 0;
  App.testOpen(existing); modalOpen();
  assert.ok(/<option value="">Select blood group<\/option>/.test(modalHtml) && !/ selected>/.test(modalHtml.match(/<select[^>]*id="ptf-blood"[\s\S]*?<\/select>/)[0]), 'Old patient without a blood group starts on the placeholder');
  submit();
  assert.equal(errText('blood'), '', 'Saving the edit form does not force a blood group');
  assert.equal(existing.blood, '');
  assert.equal(closed, 1);
  App.testOpen(existing); modalOpen();
  elements['ptf-blood'].value = 'AB+'; elements['ptf-cnic'].value = '3520112345679'; elements['ptf-cnic'].fire('input'); submit();
  assert.equal(existing.blood, 'AB+'); assert.equal(existing.cnic, '35201-1234567-9', 'Edit saves CNIC');
  // existing legacy "Unknown" blood group is not offered as a choice
  const legacy = { id: 'PY', name: 'Legacy', age: 20, gender: 'Female', blood: 'Unknown', phone: '', cnic: '35202-1234567-1' };
  tables.patients.push(legacy);
  App.testOpen(legacy); modalOpen();
  assert.equal(elements['ptf-blood'].value, '', 'Unknown is not preselected');
  assert.equal(elements['ptf-cnic'].value, '35202-1234567-1', 'Edit shows the saved CNIC');
  // an old non-13-digit CNIC that is not touched does not block the save
  const odd = { id: 'PZ', name: 'Odd Cnic', age: 20, gender: 'Female', blood: 'A+', phone: '', cnic: 'PK-pending' };
  tables.patients.push(odd);
  App.testOpen(odd); modalOpen(); fillValid({ blood: 'A+' }); elements['ptf-cnic'].value = 'PK-pending'; submit();
  assert.equal(errText('cnic'), '', 'untouched old value tolerated');
  console.log('PASS: ' + (base || 'web') + ' patient form: CNIC field (optional, auto-dash, 13 digits, saved on add + edit) and optional blood group (saved with or without group, no Unknown, edit untouched).');
}
run('');
for (const base of ['electron-src', 'electron-tools/installer/app-stage-win7']) run(base);
