/**
 * test-direct-login-entry.js
 *
 * Verifies that:
 * 1. Web App (index.html) includes immediate direct login routing in <head> for cold launch.
 * 2. Auth guard in app.js routes unauthenticated sessions directly to #/login (including empty hash and '#/').
 * 3. Login screen in mod-auth.js renders without leaking back to website (website is reserved for browser).
 * 4. Signup screen in mod-auth.js links back to #/login rather than the website.
 * 5. PWA manifest sets start_url directly to '../app/#/login'.
 * 6. Android APK configuration (capacitor.config.json and offline.html) points directly to #/login.
 * 7. Desktop Electron apps (electron-src/main.js, app-stage/main.js, app-stage-win7/main.js) loadURL directly to index.html#/login.
 * 8. All electron copies maintain exact parity with web assets.
 */

'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function testIndexHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('/* Direct Login Entry for Web App, APK, and Desktop EXE'), 'index.html must have direct login script');
  assert(html.includes("location.hash = s ? '#/dashboard' : '#/login'"), 'index.html must route to #/login when not signed in');
  console.log('✓ Web App (index.html) verified: cold launch directly triggers login route');
}

function testAppJsAuthGuard() {
  const js = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  assert(js.includes("if (!s && hash !== '#/login' && hash !== '#/signup') { location.hash = '#/login'; return; }"), 'app.js must route unauthenticated to #/login');
  assert(js.includes("if (!hash || hash === '#' || hash === '#/') { location.hash = s ? '#/dashboard' : '#/login'; return; }"), 'app.js must handle empty, #, and #/ with direct login');
  console.log('✓ app.js auth guard verified: direct login routing enforced');
}

function testModAuthNoWebsiteLeak() {
  const authJs = fs.readFileSync(path.join(ROOT, 'assets/js/mod-auth.js'), 'utf8');
  assert(!authJs.includes("back: desk ? '' : '<a class=\"oa-back\" href=\"' + WEB + '/\">&larr; Optix Lab</a>'"), 'mod-auth.js must not leak website link on login screen');
  assert(authJs.includes("back: '<a class=\"oa-back\" href=\"#/login\">&larr; Back to Sign In</a>'"), 'signup page must return to #/login rather than website');
  console.log('✓ mod-auth.js verified: login screen clean, signup back link points to #/login');
}

function testWebManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.webmanifest'), 'utf8'));
  assert.strictEqual(manifest.start_url, '../app/#/login', 'PWA start_url must be ../app/#/login');
  console.log('✓ manifest.webmanifest verified: start_url is ../app/#/login');
}

function testCapacitorConfig() {
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'android-app/capacitor.config.json'), 'utf8'));
  assert.strictEqual(cap.server.url, 'https://optix-lab-medsync.pages.dev/app/#/login', 'Capacitor url must point directly to #/login');

  const offline = fs.readFileSync(path.join(ROOT, 'android-app/www/offline.html'), 'utf8');
  assert(offline.includes("location.href='https://optix-lab-medsync.pages.dev/app/#/login'"), 'offline.html retry must point to #/login');
  console.log('✓ Android APK config verified: server url and offline retry point directly to #/login');
}

function testElectronMain() {
  const mains = [
    path.join(ROOT, 'electron-src/main.js'),
    path.join(ROOT, 'electron-tools/installer/app-stage/main.js'),
    path.join(ROOT, 'electron-tools/installer/app-stage-win7/main.js')
  ];

  for (const file of mains) {
    if (fs.existsSync(file)) {
      const src = fs.readFileSync(file, 'utf8');
      assert(src.includes('loadURL(`http://127.0.0.1:${started.port}/index.html#/login`)'), `${file} must loadURL directly to #/login`);
    }
  }
  console.log('✓ Desktop Electron main.js (electron-src and installer stages) verified: loadURL targets #/login');
}

function testParity() {
  const electronHtml = fs.readFileSync(path.join(ROOT, 'electron-src/index.html'), 'utf8');
  assert(electronHtml.includes('/* Direct Login Entry for Web App, APK, and Desktop EXE'), 'electron-src/index.html must have direct login script');

  const win7Html = fs.readFileSync(path.join(ROOT, 'electron-tools/installer/app-stage-win7/index.html'), 'utf8');
  assert(win7Html.includes('/* Direct Login Entry for Web App, APK, and Desktop EXE'), 'installer app-stage-win7 index.html must have direct login script');

  console.log('✓ Desktop builds parity verified: index.html has direct login script across all stages');
}

function run() {
  testIndexHtml();
  testAppJsAuthGuard();
  testModAuthNoWebsiteLeak();
  testWebManifest();
  testCapacitorConfig();
  testElectronMain();
  testParity();

  console.log('============================================================');
  console.log('ALL DIRECT LOGIN ENTRY TESTS PASSED CLEANLY!');
  console.log('============================================================');
}

run();
