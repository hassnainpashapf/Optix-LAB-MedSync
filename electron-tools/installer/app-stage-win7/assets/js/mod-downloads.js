/* Optix LAB MedSync — Downloads module (#/downloads) */
(function () {
  'use strict';

  var GH = 'https://labpos-api.150.230.52.29.sslip.io/releases/';
  var DMG_URL = GH + 'Optix-LAB-MedSync-1.3.1-arm64.dmg.tar.gz';
  /* TODO(parent): replace with the real published APK URL */
  var APK_URL = 'https://labpos-api.150.230.52.29.sslip.io/releases/Optix-LAB-MedSync-2.0.2.apk';

  /* 6 distinct installer binaries (Windows 11 and Windows 10 64-bit share one) */
  var WIN_OPTS = [
    { os: 'Windows 11 / 10', arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.3.1-win10-11-x64.exe' },
    { os: 'Windows 10',      arch: '32-bit', file: 'Optix-LAB-MedSync-Setup-1.3.1-win10-x86.exe' },
    { os: 'Windows 8.1',     arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.3.1-win7-8-x64.exe' },
    { os: 'Windows 8.1',     arch: '32-bit', file: 'Optix-LAB-MedSync-Setup-1.3.1-win7-8-x86.exe' },
    { os: 'Windows 7',       arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.3.1-win7-8-x64.exe' },
    { os: 'Windows 7',       arch: '32-bit', file: 'Optix-LAB-MedSync-Setup-1.3.1-win7-8-x86.exe' }
  ];
  var WIN_SIZE = '~100 MB';

  var ICO = {
    win: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v5M8 21h8"/></svg>',
    mac: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    android: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="9" width="10" height="11" rx="2"/><path d="M4 12.5v2M20 12.5v2M9.5 9 8 6.5M14.5 9 16 6.5M10 14.5h4"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    chev: '<svg class="dl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
  };

  function osCard(b) {
    return '<div class="dl-os">' +
      '<div class="dl-os-name">' + App.esc(b.os) + '</div>' +
      '<div class="dl-os-meta">' + App.esc(b.arch) + ' &middot; ' + WIN_SIZE + '</div>' +
      '<a class="btn btn-primary dl-os-btn" href="' + GH + b.file + '" target="_blank" rel="noopener">' + ICO.dl + '<span>Download</span></a>' +
      '</div>';
  }

  function winCard() {
    var grid = WIN_OPTS.map(osCard).join('');
    var steps = [
      'Expand <b>Choose your Windows version</b> and download the <b>.exe</b> matching your Windows version.',
      'Run it and follow the installer steps (Next &rarr; Install &rarr; Finish).',
      'Open <b>Optix LAB MedSync</b> from the Start menu or desktop shortcut.',
      'Log in with your lab account credentials.'
    ].map(function (s, i) {
      return '<li><span class="dl-step-n">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('');
    return '<div class="card dl-card">' +
      '<div class="card-h"><div class="dl-ico">' + ICO.win + '</div>' +
      '<div><h3>Windows</h3><p class="dl-ver">Windows 7, 8.1, 10, 11 &middot; Version 1.3.1 (cloud sync)</p></div></div>' +
      '<div class="card-b">' +
      '<button type="button" class="btn btn-primary dl-btn dl-win-toggle">' + ICO.dl +
        '<span class="dl-win-toggle-tx">Choose your Windows version</span>' + ICO.chev + '</button>' +
      '<div class="dl-win-opts" id="dlWinOpts" aria-hidden="true">' +
        '<div class="dl-note">' + ICO.check + '<span><b>Not sure which to pick?</b> Most modern PCs use 64-bit. Windows 11 is 64-bit only.</span></div>' +
        '<div class="dl-os-grid">' + grid + '</div>' +
      '</div>' +
      '<div class="dl-note">' + ICO.check + '<span>Every Windows build (7, 8.1, 10, 11 &middot; 64 and 32-bit) keeps its own copy of your data, works offline and syncs with the cloud, so the same account works on the web, the app and the phone.</span></div>' +
      '<ol class="dl-steps">' + steps + '</ol>' +
      '</div></div>';
  }

  function dlCard(o) {
    var steps = o.steps.map(function (s, i) {
      return '<li><span class="dl-step-n">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('');
    return '<div class="card dl-card">' +
      '<div class="card-h"><div class="dl-ico">' + o.icon + '</div>' +
      '<div><h3>' + App.esc(o.title) + '</h3><p class="dl-ver">Version ' + App.esc(o.version) + ' &middot; ' + App.esc(o.size) + '</p></div></div>' +
      '<div class="card-b">' +
      '<a class="btn btn-primary dl-btn" href="' + o.url + '" target="_blank" rel="noopener">' + ICO.dl + '<span>Download ' + App.esc(o.file) + '</span></a>' +
      '<div class="dl-note">' + o.note + '</div>' +
      '<ol class="dl-steps">' + steps + '</ol>' +
      '</div></div>';
  }

  /* expand / collapse for the Windows version options (delegated, survives re-render) */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.dl-win-toggle') : null;
    if (!t) return;
    var opts = document.getElementById('dlWinOpts');
    if (!opts) return;
    var open = opts.classList.toggle('open');
    t.classList.toggle('open', open);
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
    opts.setAttribute('aria-hidden', open ? 'false' : 'true');
    var tx = t.querySelector('.dl-win-toggle-tx');
    if (tx) tx.textContent = open ? 'Hide Windows versions' : 'Choose your Windows version';
  });

  /* installable web app: capture the browser's install prompt */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__pwaPrompt = e; });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#dlPwaInstall') : null;
    if (!b) return;
    var hint = document.getElementById('dlPwaHint');
    if (window.__pwaPrompt) {
      window.__pwaPrompt.prompt();
      window.__pwaPrompt.userChoice.then(function () { window.__pwaPrompt = null; });
    } else if (hint) {
      hint.style.display = '';
    }
  });
  function pwaCard() {
    var steps = [
      'Open <b>optix-lab-medsync.pages.dev/app/</b> in Chrome / Edge (PC or Android) or Safari (iPhone).',
      'Tap <b>Install Web App</b> below, or use the browser menu &rarr; <b>Install app</b> / <b>Add to Home Screen</b>.',
      'Open <b>Optix LAB MedSync</b> from your desktop or home screen.',
      'Log in with your lab account credentials.'
    ].map(function (s, i) {
      return '<li><span class="dl-step-n">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('');
    return '<div class="card dl-card">' +
      '<div class="card-h"><div class="dl-ico">' + ICO.dl + '</div>' +
      '<div><h3>Web App</h3><p class="dl-ver">Any PC or phone &middot; no download</p></div></div>' +
      '<div class="card-b">' +
      '<button type="button" id="dlPwaInstall" class="btn btn-primary dl-btn">' + ICO.dl + '<span>Install Web App</span></button>' +
      '<div class="dl-note" id="dlPwaHint" style="display:none">' + ICO.check + '<span>Use your browser menu &rarr; <b>Install app</b> (Chrome/Edge) or <b>Share &rarr; Add to Home Screen</b> (iPhone).</span></div>' +
      '<div class="dl-note">' + ICO.check + '<span>Always up to date and uses the same cloud data as the desktop app. Needs an internet connection.</span></div>' +
      '<ol class="dl-steps">' + steps + '</ol>' +
      '</div></div>';
  }

  function render() {
    return '<style>' +
    '.dl-wrap{max-width:1100px;margin:0 auto}' +
    '.dl-head{margin-bottom:20px}' +
    '.dl-head h2{font-size:24px;letter-spacing:-.02em;color:#131845;margin:0}' +
    '.dl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:18px}' +
    '@media(max-width:900px){.dl-grid{grid-template-columns:1fr}}' +
    '.dl-card{overflow:hidden}' +
    '.dl-ico{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#5392ba,#3d7ea6);color:#fff;box-shadow:0 4px 12px rgba(83,146,186,.35);flex-shrink:0}' +
    '.dl-ico svg{width:24px;height:24px}' +
    '.dl-card .card-h h3{margin:0;font-size:17px;color:#131845}' +
    '.dl-ver{margin:3px 0 0;font-size:12.5px;color:var(--muted)}' +
    '.dl-btn{width:100%;justify-content:center;margin:4px 0 12px}' +
    '.dl-btn svg{width:16px;height:16px}' +
    '.dl-win-toggle{gap:8px}' +
    '.dl-win-toggle .dl-chev{transition:transform .3s ease;margin-left:auto}' +
    '.dl-win-toggle.open .dl-chev{transform:rotate(180deg)}' +
    '.dl-win-opts{max-height:0;overflow:hidden;opacity:0;transition:max-height .45s ease,opacity .35s ease,margin .3s ease}' +
    '.dl-win-opts.open{max-height:1400px;opacity:1;margin-bottom:4px}' +
    '.dl-note{display:flex;gap:8px;align-items:flex-start;background:#ebf4f8;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#3d5a73;margin-bottom:12px}' +
    '.dl-note svg{width:15px;height:15px;flex:none;color:#5392ba;margin-top:1px}' +
    '.dl-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}' +
    '.dl-steps li{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--ink)}' +
    '.dl-step-n{width:22px;height:22px;border-radius:50%;background:#131845;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;flex:none}' +
    '.dl-os-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:4px 0 14px}' +
    '@media(max-width:900px){.dl-os-grid{grid-template-columns:repeat(3,1fr)}}' +
    '@media(max-width:560px){.dl-os-grid{grid-template-columns:repeat(2,1fr)}}' +
    '@media(max-width:400px){.dl-os-grid{grid-template-columns:1fr}}' +
    '.dl-os{border:1px solid #e6ecf2;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:4px;background:#fbfcfe}' +
    '.dl-os-name{font-weight:700;font-size:14px;color:#131845}' +
    '.dl-os-meta{font-size:12.5px;color:var(--muted)}' +
    '.dl-os-btn{width:100%;justify-content:center;margin-top:10px}' +
    '.dl-os-btn svg{width:15px;height:15px}' +
    '.dl-sys{margin-top:18px}' +
    '</style>' +

    '<div class="dl-wrap">' +
    '<div class="dl-head"><h2>Downloads</h2></div>' +

    '<div class="dl-grid">' +
    winCard() +
    dlCard({
      title: 'Mac (Apple Silicon &amp; Intel)', version: '1.3.1', size: '~119 MB', file: 'for Mac (.dmg)', url: DMG_URL, icon: ICO.mac,
      note: ICO.check + '<span>The download is a compressed <b>.dmg.tar.gz</b> — double-click it after downloading to extract the <b>.dmg</b> inside.</span>',
      steps: [
        'Download the <b>.dmg.tar.gz</b> file (Apple Silicon M1/M2/M3 above; <a href="' + GH + 'Optix-LAB-MedSync-1.3.1-x64.dmg.tar.gz" style="font-weight:700">Intel Mac here</a>) and double-click it to extract the .dmg.',
        'Open the .dmg and drag <b>Optix LAB MedSync</b> into Applications.',
        'On first launch: right-click the app &rarr; <b>Open</b> (the app is not Apple-notarized yet).',
        'Log in with your lab account credentials.'
      ]
    }) +
    dlCard({
      title: 'Android APK', version: '2.0.2', size: '~3 MB', file: 'APK', url: APK_URL, icon: ICO.android,
      note: ICO.check + '<span>Install the <b>Optix LAB MedSync</b> mobile app on your Android phone. It opens like an app and uses the same cloud account and data (internet needed).</span>',
      steps: [
        'Download the <b>.apk</b> file on your Android phone.',
        'In Chrome tap <b>Download anyway</b>, then open the file and allow <b>install from unknown sources</b> if prompted.',
        'Tap <b>Install</b>, then open Optix LAB MedSync.',
        'Log in with your lab account credentials.'
      ]
    }) +
    pwaCard() +
    '</div>' +

    '<div class="card dl-sys"><div class="card-h"><h3>System requirements</h3></div>' +
    '<div class="card-b"><div class="tbl-wrap"><table class="table"><tbody>' +
    '<tr><th style="width:140px">Windows</th><td>Windows 7, 8.1, 10 or 11 (64-bit and 32-bit builds available), 4 GB RAM, 500 MB free disk space</td></tr>' +
    '<tr><th>Mac</th><td>macOS 12 or newer, Apple Silicon (M1/M2/M3) or Intel</td></tr>' +
    '<tr><th>Web App</th><td>Chrome, Edge or Safari on any PC or phone</td></tr><tr><th>Android</th><td>Android 6.0 or newer, internet connection</td></tr>' +
    '<tr><th>Network</th><td>Desktop apps work offline and sync with the cloud when online (first sign-in on a new PC needs internet). The Android app and the Web App use the cloud directly and need internet</td></tr>' +
    '</tbody></table></div></div></div>' +

    '</div>';
  }

  App.route('/downloads', render);
})();
