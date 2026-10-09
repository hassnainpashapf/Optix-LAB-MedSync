/* Focused static regression checks for dashboard shortcuts and redundant page chrome. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const webDashboard = fs.readFileSync(path.join(root, 'assets/js/mod-dashboard.js'), 'utf8');
const desktopDashboard = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/assets/js/mod-dashboard.js'), 'utf8');
const webPatients = fs.readFileSync(path.join(root, 'assets/js/mod-patients.js'), 'utf8');
const desktopPatients = fs.readFileSync(path.join(root, 'electron-tools/installer/app-stage-win7/assets/js/mod-patients.js'), 'utf8');

for (const source of [webDashboard, desktopDashboard]) {
  if (!source.includes('href="#/samples/home"')) throw new Error('Home Sampling shortcut is missing');
  if (!source.includes('Home Sampling &amp; Dispatch')) throw new Error('Home Sampling shortcut label is missing');
  if (source.includes('Stock needs attention:')) throw new Error('Stock attention banner still appears on dashboard');
}

for (const source of [webPatients, desktopPatients]) {
  const addPage = source.match(/function renderAddPage\(\)\s*\{[\s\S]*?\n\s*\}\s*\/\* ---------- route registration/);
  if (!addPage) throw new Error('Add Patient route renderer is missing');
  if (addPage[0].includes('back-link') || addPage[0].includes('All Patients') || addPage[0].includes('<h1>')) {
    throw new Error('Add Patient still has redundant in-page navigation/title');
  }
}

console.log('PASS: dashboard shortcut/banner and Add Patient chrome checks');
