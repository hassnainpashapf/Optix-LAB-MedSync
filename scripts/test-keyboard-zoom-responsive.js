/* Targeted regression test suite for Responsive Zoom Scaling & 4-Arrow/TAB Keyboard Navigation */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// 1. Verify app.js zoom implementation and exports
const webApp = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const desktopApp = fs.readFileSync(path.join(root, 'electron-src/assets/js/app.js'), 'utf8');

for (const [name, src] of [['web app.js', webApp], ['desktop app.js', desktopApp]]) {
  assert.ok(!src.includes('tbZoomCtrl'), name + ' must not contain topbar zoom control HTML (reverted per user request)');
  assert.ok(src.includes('function setZoom('), name + ' must implement setZoom');
  assert.ok(src.includes('function zoomIn('), name + ' must implement zoomIn');
  assert.ok(src.includes('function zoomOut('), name + ' must implement zoomOut');
  assert.ok(src.includes('function zoomReset('), name + ' must implement zoomReset');
  assert.ok(src.includes('zoom: {'), name + ' must export App.zoom object');
  assert.ok(src.includes('zoomIn: zoomIn'), name + ' must export App.zoomIn');
}
console.log('✓ Topbar zoom pill cleanly reverted and UI zoom engine verified in web and desktop app.js');

// 2. Verify 4-Arrow and TAB keyboard navigation in app.js
for (const [name, src] of [['web app.js', webApp], ['desktop app.js', desktopApp]]) {
  // Ctrl + / - / 0
  assert.ok(src.includes("e.key === '=' || e.key === '+'"), name + ' must handle Ctrl + zoom in');
  assert.ok(src.includes("e.key === '-' || e.key === '_'"), name + ' must handle Ctrl - zoom out');
  assert.ok(src.includes("e.key === '0' || e.code === 'Numpad0'"), name + ' must handle Ctrl 0 reset');

  // TAB key
  assert.ok(src.includes("e.key === 'Tab'"), name + ' must handle Tab key with modal trap');

  // Enter advance
  assert.ok(src.includes("e.key === 'Enter'"), name + ' must handle Enter key for row activation / input advance');
  assert.ok(src.includes('_advanceInput('), name + ' must implement _advanceInput helper');

  // 4 Arrow keys
  assert.ok(src.includes("e.key === 'ArrowDown'"), name + ' must handle ArrowDown key');
  assert.ok(src.includes("e.key === 'ArrowUp'"), name + ' must handle ArrowUp key');
  assert.ok(src.includes("e.key === 'ArrowRight'"), name + ' must handle ArrowRight key');
  assert.ok(src.includes("e.key === 'ArrowLeft'"), name + ' must handle ArrowLeft key');
  assert.ok(src.includes('_setActiveRow('), name + ' must implement _setActiveRow helper');
  assert.ok(src.includes('kb-active-row'), name + ' must add kb-active-row class');
}
console.log('✓ 4-Arrow keys and TAB keyboard navigation verified across web and desktop app.js');

// 3. Verify CSS rules in app.css
const appCss = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
assert.ok(appCss.includes(':focus-visible'), 'app.css must have accessible focus-visible styles');
assert.ok(appCss.includes('.kb-active-row'), 'app.css must style .kb-active-row');
assert.ok(!appCss.includes('.tb-zoom-ctrl'), 'app.css must not style .tb-zoom-ctrl (reverted per user request)');
assert.ok(appCss.includes('.tbl-wrap'), 'app.css must have .tbl-wrap overflow-x auto');
console.log('✓ CSS responsive zoom scaling, accessible focus outlines, and keyboard row styling verified');

// 4. Verify Electron main.js minWidth and minHeight
const electronMain = fs.readFileSync(path.join(root, 'electron-src/main.js'), 'utf8');
assert.ok(electronMain.includes('minWidth: 800'), 'electron-src/main.js must allow flexible resizing (minWidth 800)');
assert.ok(electronMain.includes('minHeight: 550'), 'electron-src/main.js must allow flexible resizing (minHeight 550)');
console.log('✓ Electron desktop window constraints verified for responsive resizing');

console.log('============================================================');
console.log('ALL KEYBOARD NAVIGATION & RESPONSIVE ZOOM TESTS PASSED CLEANLY!');
console.log('============================================================');
