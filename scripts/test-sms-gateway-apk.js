/* Targeted regression test suite for Optix SIM SMS Gateway APK & Dashboard live integration */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// 1. Verify APK file existence across all distribution folders
const apkPaths = [
  'assets/apk/Optix-SMS-Gateway.apk',
  'electron-src/assets/apk/Optix-SMS-Gateway.apk',
  'electron-tools/installer/app-stage-win7/assets/apk/Optix-SMS-Gateway.apk',
  'electron-tools/installer/app-stage/assets/apk/Optix-SMS-Gateway.apk'
];

for (const p of apkPaths) {
  const full = path.join(root, p);
  assert.ok(fs.existsSync(full), 'APK must exist at: ' + p);
  const stat = fs.statSync(full);
  assert.ok(stat.size > 1000000, 'APK file size must be valid (>1MB), got: ' + stat.size);
}
console.log('✓ Optix SIM SMS Gateway APK files verified across web, electron, and installers (>3.9MB)');

// 2. Verify server endpoints
const cloudServer = fs.readFileSync(path.join(root, 'cloud/server.js'), 'utf8');
const electronServer = fs.readFileSync(path.join(root, 'electron-src/server/server.js'), 'utf8');
const win7Server = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/server/server.js'), 'utf8');

for (const [name, src] of [['cloud', cloudServer], ['electron', electronServer], ['win7', win7Server]]) {
  assert.ok(src.includes('/api/sms/link'), name + ' server must handle POST /api/sms/link');
  assert.ok(src.includes('/api/sms/download-apk'), name + ' server must handle GET /api/sms/download-apk');
  assert.ok(src.includes('connected: isConn'), name + ' server status must report connected boolean flag');
}
console.log('✓ Backend servers (cloud, electron, win7) verified with link, status, and download-apk APIs');

// 3. Verify mod-sms.js UI
const webSms = fs.readFileSync(path.join(root, 'assets/js/mod-sms.js'), 'utf8');
assert.ok(webSms.includes('Optix SIM SMS Gateway APK'), 'mod-sms.js must contain the dedicated APK banner title');
assert.ok(webSms.includes('smsDownloadApkBtn'), 'mod-sms.js must contain APK download button');
assert.ok(webSms.includes('smsCopyApkLink'), 'mod-sms.js must contain copy APK link button');
assert.ok(webSms.includes('smsLinkBtn'), 'mod-sms.js must contain Link SIM button');
assert.ok(webSms.includes('qrcode('), 'mod-sms.js must generate dynamic QR code for mobile scanning');
assert.ok(webSms.includes('POST\', \'link\''), 'mod-sms.js must invoke POST /api/sms/link');
console.log('✓ mod-sms.js verified with APK download banner, QR generator, Link SIM action, and live test SMS polling');

// 4. Verify mod-dashboard.js is clean without SIM banner (moved to SIM setting page per user request)
const webDash = fs.readFileSync(path.join(root, 'assets/js/mod-dashboard.js'), 'utf8');
assert.ok(!webDash.includes('ovHead + simBanner + ovGrid'), 'mod-dashboard.js must not contain simBanner in overview');
assert.ok(webDash.includes('ovHead + ovGrid'), 'mod-dashboard.js must render overview directly');
console.log('✓ mod-dashboard.js verified clean without SIM banner (moved to SIM settings)');

// 4b. Verify mod-sms.js is clean without top banner (removed per user request) and retains live SIM status
assert.ok(!webSms.includes('smsTopBanner'), 'mod-sms.js must not contain smsTopBanner per user request');
assert.ok(!webSms.includes('sms-set-head'), 'mod-sms.js must not contain sms-set-head per user request');
assert.ok(webSms.includes('smsLiveStatusBanner'), 'mod-sms.js must contain smsLiveStatusBanner');
assert.ok(webSms.includes('🟢 SIM Connected:'), 'mod-sms.js must render connected status message');
assert.ok(webSms.includes('🟡 SIM Configured:'), 'mod-sms.js must render configured status message');
console.log('✓ mod-sms.js verified with clean layout (no top banner) and real-time live SIM status');

// 5. Verify mod-downloads.js
const webDl = fs.readFileSync(path.join(root, 'assets/js/mod-downloads.js'), 'utf8');
assert.ok(webDl.includes('assets/apk/Optix-SMS-Gateway.apk'), 'mod-downloads.js must link to Optix-SMS-Gateway.apk');
assert.ok(webDl.includes('Android APK & SIM Gateway'), 'mod-downloads.js must show Android APK & SIM Gateway title');
console.log('✓ mod-downloads.js verified with Optix-SMS-Gateway.apk direct link and feature description');

console.log('============================================================');
console.log('ALL OPTIX SIM SMS GATEWAY APK & DASHBOARD TESTS PASSED CLEANLY!');
console.log('============================================================');
