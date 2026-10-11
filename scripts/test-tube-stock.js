'use strict';

// Automatic tube / consumable stock deduction (assets/js/samples-core.js): idempotent per tube, reversal on delete / reject,
// unmapped = nothing deducted, clamp at 0 with a shortfall flag, usage totals, low-stock alerts fed by the new movements.
// Run: node scripts/test-tube-stock.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function suite(base) {
  const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  let tables, seq, toasts;
  const reset = () => {
    seq = 0; toasts = [];
    tables = { settings: { id: 'main' }, samples: [], stock_items: [], stock_moves: [], invoices: [], tests: [], patients: [{ id: 'P1', name: 'Ayesha' }], results: [] };
    tables.tests = [
      { id: 't-cbc', name: 'CBC', category: 'Hematology' }, { id: 't-hb', name: 'Hemoglobin', category: 'Hematology' },
      { id: 't-lft', name: 'LFT', category: 'Biochemistry' }, { id: 't-lipid', name: 'Lipid Profile', category: 'Biochemistry' },
      { id: 't-urine', name: 'Urine R/E', category: 'Urinalysis', sampleType: 'Urine' }
    ];
    tables.stock_items = [
      { id: 'SI-EDTA', name: 'EDTA tubes', unit: 'pcs', reorderLevel: 5, active: true },
      { id: 'SI-SER', name: 'Serum tubes', unit: 'pcs', reorderLevel: 4, active: true },
      { id: 'SI-URI', name: 'Urine cups', unit: 'pcs', reorderLevel: 0, active: true }
    ];
  };
  const receive = (itemId, qty) => tables.stock_moves.push({ id: 'SM-in-' + itemId, itemId, type: 'in', qty, date: '2026-10-01', createdAt: '2026-10-01T08:00:00.000Z' });
  const DB = {
    all: t => t === 'settings' ? [copy(tables.settings)] : copy(tables[t] || []),
    get: (t, id) => t === 'settings' ? copy(tables.settings) : copy((tables[t] || []).find(r => r.id === id)) || null,
    insert(t, o) { const r = Object.assign(copy(o), { id: 'X' + (++seq) }); tables[t].push(r); return copy(r); },
    put(t, o) { const r = copy(o), i = tables[t].findIndex(x => x.id === r.id); if (i >= 0) tables[t][i] = r; else tables[t].push(r); return copy(r); },
    update(t, id, patch) {
      if (t === 'settings') { Object.assign(tables.settings, copy(patch)); return copy(tables.settings); }
      const r = tables[t].find(x => x.id === id); if (!r) return null; Object.assign(r, copy(patch)); return copy(r);
    },
    remove(t, id) { const i = tables[t].findIndex(x => x.id === id); if (i < 0) return false; tables[t].splice(i, 1); return true; }
  };
  const App = { toast: (m, k) => toasts.push(m), esc: String };
  const window_ = { DB, App };
  const context = vm.createContext({ window: window_, DB, App, console, localStorage: { getItem: () => null }, setTimeout: fn => fn() });
  window_.window = window_;
  vm.runInContext(fs.readFileSync(path.join(root, base, 'assets/js/samples-core.js'), 'utf8'), context, { filename: 'samples-core.js' });
  const S = window_.Samples;

  // stockState from the real app.js (what the Stock pages / notifications use for low-stock alerts)
  const appSrc = fs.readFileSync(path.join(root, base, 'assets/js/app.js'), 'utf8');
  const a = appSrc.indexOf('App.stockState = function'), b = appSrc.indexOf('/* a finished result uses the stock', a);
  assert.ok(a > 0 && b > a, 'App.stockState found');
  vm.runInContext(appSrc.slice(a, b), context);

  const eq = (a, b, m) => assert.deepEqual(copy(a), copy(b), m);
  const inv = (id, ...testIds) => { const o = { id, no: id, patientId: 'P1', items: testIds.map(t => ({ testId: t, name: t })) }; tables.invoices.push(o); return o; };
  const onHand = id => S.onHandOf(id);
  const autoMoves = () => tables.stock_moves.filter(m => m.auto);
  const link = (map) => DB.update('settings', 'main', { tubeStock: map });
  const FULL = { 'EDTA (Lavender)': { itemId: 'SI-EDTA', qty: 1 }, 'Serum (Red/Gold)': { itemId: 'SI-SER', qty: 2 }, 'Urine container': { itemId: 'SI-URI', qty: 1 } };

  // ---- 1. nothing mapped (default): nothing deducted, billing unchanged, no notice ----
  reset(); receive('SI-EDTA', 50);
  let made = S.createForInvoice(inv('INV-1', 't-cbc', 't-lft'));
  assert.equal(made.length, 2, 'tubes still created');
  assert.equal(autoMoves().length, 0, 'no mapping = no deduction');
  assert.equal(onHand('SI-EDTA'), 50);
  assert.ok(tables.samples.every(s => Array.isArray(s.stockUsed) && s.stockUsed.length === 0), 'new samples are marked as looked-at');
  eq(toasts, [], 'no notice for a lab that never set up tube mapping');
  let u = S.usage('2000-01-01', '2999-12-31');
  assert.equal(u.totalTubes, 2, 'usage view still counts tubes without any mapping');
  assert.equal(u.units, 0); assert.equal(u.unlinked, 2);
  eq(u.tubes.map(r => r.tube + ':' + r.tubes).sort(), ['EDTA (Lavender):1', 'Serum (Red/Gold):1']);

  // ---- 2. mapped: one deduction per tube ----
  reset(); receive('SI-EDTA', 50); receive('SI-SER', 20); receive('SI-URI', 10); link(FULL);
  made = S.createForInvoice(inv('INV-2', 't-cbc', 't-hb', 't-lft', 't-lipid', 't-urine'));
  assert.equal(made.length, 3, 'CBC+Hb share one EDTA tube, LFT+Lipid one serum tube, one urine cup');
  assert.equal(onHand('SI-EDTA'), 49); assert.equal(onHand('SI-SER'), 18); assert.equal(onHand('SI-URI'), 9);
  const mv = autoMoves();
  assert.equal(mv.length, 3);
  for (const m of mv) {
    assert.equal(m.type, 'out'); assert.equal(m.invoiceId, 'INV-2'); assert.ok(m.sampleId && m.ref === 'smp:' + m.sampleId, 'ref ties the movement to the tube');
    assert.match(m.note, /^Auto: tube used/); assert.ok(m.by && m.date && m.createdAt, 'who / when recorded');
  }
  assert.equal(mv.find(m => m.itemId === 'SI-SER').qty, 2, 'units per tube honoured');
  const ser = tables.samples.find(s => s.tube === 'Serum (Red/Gold)');
  eq(ser.stockUsed.map(l => [l.itemId, l.qty, l.short]), [['SI-SER', 2, 0]]);

  // ---- 3. idempotent ----
  assert.equal(S.createForInvoice(tables.invoices[0]).length, 0, 'second createForInvoice is a no-op');
  assert.equal(S.applyStock(tables.samples[0]), null, 'a marked tube is never deducted twice');
  S.syncInvoice(tables.invoices[0]); S.syncInvoice(tables.invoices[0]);
  assert.equal(autoMoves().length, 3, 'edits / re-saves without changes deduct nothing');
  assert.equal(onHand('SI-EDTA'), 49);

  // ---- 4. invoice edited: new tube type deducts, removed tube returns ----
  tables.invoices[0].items.push({ testId: 't-urine2', name: 'x' });   // unknown test: falls into "Other" (unlinked)
  S.syncInvoice(tables.invoices[0]);
  assert.equal(autoMoves().filter(m => m.type === 'out').length, 3, 'an unlinked tube type deducts nothing');
  tables.invoices[0].items = tables.invoices[0].items.filter(i => !['t-urine', 't-urine2'].includes(i.testId));
  S.syncInvoice(tables.invoices[0]);
  assert.equal(onHand('SI-URI'), 10, 'urine cup returned when its only test was removed');
  S.syncInvoice(tables.invoices[0]);
  assert.equal(autoMoves().filter(m => m.type === 'adjust').length, 1, 'returned once');
  tables.invoices[0].items.push({ testId: 't-urine', name: 'Urine R/E' });
  S.syncInvoice(tables.invoices[0]);
  assert.equal(onHand('SI-URI'), 9, 'adding the test back creates a new tube that deducts again');

  // ---- 5. reject -> returned once; re-collect -> deducts again ----
  const edta = tables.samples.find(s => s.tube === 'EDTA (Lavender)');
  S.setStatus(edta.id, 'rejected', { reason: 'Haemolysed' });
  assert.equal(onHand('SI-EDTA'), 50, 'rejected tube returns its unit');
  S.setStatus(edta.id, 'rejected', { reason: 'again' });
  assert.equal(onHand('SI-EDTA'), 50, 'rejecting twice returns once');
  const redraw = S.recollect(edta.id);
  assert.equal(onHand('SI-EDTA'), 49, 're-draw is a new tube and deducts');
  assert.equal(S.get(edta.id).stockReturned ? true : false, true);
  assert.ok(autoMoves().some(m => m.ref === 'smp:' + redraw.id));
  S.setStatus(redraw.id, 'collected'); S.setStatus(redraw.id, 'received');
  assert.equal(onHand('SI-EDTA'), 49, 'normal status changes never touch stock');

  // ---- 6. invoice deleted -> everything returned, once ----
  S.removeForInvoice('INV-2');
  assert.equal(tables.samples.length, 0);
  assert.equal(onHand('SI-EDTA'), 50); assert.equal(onHand('SI-SER'), 20); assert.equal(onHand('SI-URI'), 10);
  S.removeForInvoice('INV-2');
  assert.equal(onHand('SI-EDTA'), 50, 'second delete cannot return twice');
  const sumNet = id => tables.stock_moves.filter(m => m.itemId === id && m.auto).reduce((t, m) => t + (m.type === 'out' ? m.qty : -m.qty), 0);
  assert.equal(sumNet('SI-EDTA') + sumNet('SI-SER') + sumNet('SI-URI'), 0, 'auto movements net to zero');
  // an invoice removed on another PC leaves orphan tubes: cleanup returns their stock too
  tables.invoices = [];
  reset(); receive('SI-EDTA', 5); link(FULL); S.createForInvoice(inv('INV-O', 't-cbc'));
  assert.equal(onHand('SI-EDTA'), 4); tables.invoices = [];
  assert.equal(S.cleanupOrphans(), 1); assert.equal(onHand('SI-EDTA'), 5);

  // ---- 7. clamp at 0 + shortfall flag, billing never blocked ----
  reset(); receive('SI-SER', 1); link(FULL);
  made = S.createForInvoice(inv('INV-3', 't-lft'));      // wants 2, has 1
  assert.equal(made.length, 1, 'billing continues with too little stock');
  assert.equal(onHand('SI-SER'), 0, 'clamped at 0, never negative');
  let m1 = autoMoves()[0];
  assert.equal(m1.qty, 1); assert.equal(m1.short, 1); assert.match(m1.note, /shortfall 1/);
  assert.ok(toasts.some(t => /Serum tubes is out of stock — billed anyway, 1 pcs not deducted/.test(t)), 'non-blocking shortfall notice: ' + toasts.join('|'));
  made = S.createForInvoice(inv('INV-4', 't-lft'));      // nothing left at all
  assert.equal(made.length, 1); assert.equal(onHand('SI-SER'), 0);
  const m2 = autoMoves()[1]; assert.equal(m2.qty, 0); assert.equal(m2.short, 2);
  u = S.usage('2000-01-01', '2999-12-31');
  assert.equal(u.short, 3, 'usage view totals the shortfall'); assert.equal(u.units, 1);
  S.removeForInvoice('INV-3'); S.removeForInvoice('INV-4');
  assert.equal(onHand('SI-SER'), 1, 'only what was really deducted comes back');

  // ---- 8. notices: unlinked tube type once a mapping exists; low stock after the deduction ----
  reset(); receive('SI-EDTA', 6); link({ 'EDTA (Lavender)': { itemId: 'SI-EDTA', qty: 1 } });
  S.createForInvoice(inv('INV-5', 't-cbc', 't-lft'));
  assert.ok(toasts.some(t => /No stock item linked for Serum \(Red\/Gold\) tubes — set it in Stock → Tube Mapping/.test(t)), toasts.join('|'));
  assert.ok(toasts.some(t => /Low stock: EDTA tubes — 5 pcs left/.test(t)), 'low-stock notice at the reorder level (5): ' + toasts.join('|'));
  const st = context.App.stockState();
  const row = st.rows.find(r => r.item.id === 'SI-EDTA');
  assert.equal(row.onHand, 5); assert.equal(row.low, true, 'the real low-stock alert fires from the auto deduction');
  S.createForInvoice(inv('INV-6', 't-cbc'));
  S.createForInvoice(inv('INV-7', 't-cbc')); S.createForInvoice(inv('INV-8', 't-cbc')); S.createForInvoice(inv('INV-9', 't-cbc')); S.createForInvoice(inv('INV-10', 't-cbc'));
  assert.equal(context.App.stockState().rows.find(r => r.item.id === 'SI-EDTA').out, true, 'and out-of-stock after the last one');
  assert.equal(onHand('SI-EDTA'), 0);
  S.createForInvoice(inv('INV-11', 't-cbc'));
  assert.equal(onHand('SI-EDTA'), 0, 'stays at 0');

  // ---- 9. usage totals + date range + removed / inactive items ----
  reset(); receive('SI-EDTA', 100); receive('SI-SER', 100); link(FULL);
  S.createForInvoice(inv('INV-A', 't-cbc', 't-lft')); S.createForInvoice(inv('INV-B', 't-cbc'));
  tables.samples.find(s => s.invoiceId === 'INV-B').createdAt = '2026-01-05T10:00:00.000Z';
  tables.stock_moves.filter(m => m.invoiceId === 'INV-B').forEach(m => { m.createdAt = '2026-01-05T10:00:00.000Z'; m.date = '2026-01-05'; });
  u = S.usage('2026-01-01', '2026-01-31');
  assert.equal(u.totalTubes, 1); assert.equal(u.units, 1); assert.equal(u.tubes.length >= 1, true);
  assert.equal(u.items.length, 1); assert.equal(u.items[0].item.id, 'SI-EDTA'); assert.equal(u.items[0].net, 1);
  u = S.usage('2026-02-01', '2999-12-31');
  assert.equal(u.totalTubes, 2); assert.equal(u.units, 3);
  const eRow = u.tubes.find(r => r.tube === 'EDTA (Lavender)'), sRow = u.tubes.find(r => r.tube === 'Serum (Red/Gold)');
  eq([eRow.tubes, eRow.used, eRow.perTube, eRow.itemName, eRow.onHand], [1, 1, 1, 'EDTA tubes', 98]);
  eq([sRow.tubes, sRow.used, sRow.perTube, sRow.itemName, sRow.onHand], [1, 2, 2, 'Serum tubes', 98]);
  assert.equal(u.unlinked, 0);
  S.removeForInvoice('INV-A');
  u = S.usage('2026-02-01', '2999-12-31');
  assert.equal(u.totalTubes, 0); assert.equal(u.units, 0, 'returned units net out of the usage totals');
  // an item removed from stock after being linked: not linked any more, tube still counted
  tables.stock_items.find(i => i.id === 'SI-SER').active = false;
  S.createForInvoice(inv('INV-C', 't-lft'));
  assert.equal(S.usage('2026-02-01', '2999-12-31').tubes.find(r => r.tube === 'Serum (Red/Gold)').linked, false);
  // old samples without the marker are never touched
  tables.samples.push({ id: 'S-OLD', invoiceId: 'INV-OLD', tube: 'EDTA (Lavender)', status: 'pending', testIds: [], createdAt: '2025-01-01T00:00:00.000Z' });
  const before = autoMoves().length;
  S.removeForInvoice('INV-OLD'); S.setStatus('S-OLD', 'rejected', {});
  assert.equal(autoMoves().length, before, 'pre-feature samples: no deduction and no return');

  console.log('PASS: ' + (base || 'web') + ' tube stock: per-tube deduction, idempotent, edit / reject / delete reversal, unmapped = nothing, clamp at 0 + shortfall, notices, usage totals, low-stock alert.');
}
suite('');
for (const base of ['electron-src', 'electron-tools/installer/app-stage-win7']) suite(base);
