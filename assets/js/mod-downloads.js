/* Optix LAB MedSync — Downloads module (#/downloads) */
(function () {
  'use strict';

  var GH = 'https://github.com/hassnainpashapf/Optix-LAB-MedSync/releases/download/v1.0.0/';
  var DMG_URL = GH + 'Optix-LAB-MedSync-1.0.0-arm64.dmg.tar.gz';

  /* 6 distinct installer binaries; Win 10/11 64-bit share the same binary (7 cards) */
  var WIN_BUILDS = [
    { os: 'Windows 11',    arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win10-11-x64.exe' },
    { os: 'Windows 10',    arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win10-11-x64.exe' },
    { os: 'Windows 10',    arch: '32-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win10-x86.exe' },
    { os: 'Windows 8.1',   arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win8-x64.exe' },
    { os: 'Windows 8.1',   arch: '32-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win8-x86.exe' },
    { os: 'Windows 7',     arch: '64-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win7-x64.exe' },
    { os: 'Windows 7',     arch: '32-bit', file: 'Optix-LAB-MedSync-Setup-1.0.0-win7-x86.exe' }
  ];
  var WIN_SIZE = '~100 MB';

  var ICO = {
    win: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v5M8 21h8"/></svg>',
    mac: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  function osCard(b) {
    return '<div class="dl-os">' +
      '<div class="dl-os-name">' + App.esc(b.os) + '</div>' +
      '<div class="dl-os-meta">' + App.esc(b.arch) + ' &middot; ' + WIN_SIZE + '</div>' +
      '<a class="btn btn-primary dl-os-btn" href="' + GH + b.file + '" target="_blank" rel="noopener">' + ICO.dl + '<span>Download</span></a>' +
      '</div>';
  }

  function winCard() {
    var grid = WIN_BUILDS.map(osCard).join('');
    var steps = [
      'Download the <b>.exe</b> file matching your Windows version using a button above.',
      'Run it and follow the installer steps (Next &rarr; Install &rarr; Finish).',
      'Open <b>Optix LAB MedSync</b> from the Start menu or desktop shortcut.',
      'Log in with your lab account credentials.'
    ].map(function (s, i) {
      return '<li><span class="dl-step-n">' + (i + 1) + '</span><span>' + s + '</span></li>';
    }).join('');
    return '<div class="card dl-card">' +
      '<div class="card-h"><div class="dl-ico">' + ICO.win + '</div>' +
      '<div><h3>Windows</h3><p class="dl-ver">Version 1.0.0 &middot; pick the installer for your PC</p></div></div>' +
      '<div class="card-b">' +
      '<div class="dl-note">' + ICO.check + '<span><b>Not sure which to pick?</b> Most modern PCs use 64-bit. Windows 11 is 64-bit only.</span></div>' +
      '<div class="dl-os-grid">' + grid + '</div>' +
      '<div class="dl-note">' + ICO.check + '<span>The installer guides you through setup. Your existing data is kept when you reinstall.</span></div>' +
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

  function render() {
    return '<style>' +
    '.dl-wrap{max-width:960px;margin:0 auto}' +
    '.dl-head{margin-bottom:20px}' +
    '.dl-head h2{font-size:24px;letter-spacing:-.02em;color:#131845;margin:0}' +
    '.dl-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}' +
    '@media(max-width:720px){.dl-grid{grid-template-columns:1fr}}' +
    '.dl-card{overflow:hidden}' +
    '.dl-ico{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#5392ba,#3d7ea6);color:#fff;box-shadow:0 4px 12px rgba(83,146,186,.35);flex-shrink:0}' +
    '.dl-ico svg{width:24px;height:24px}' +
    '.dl-card .card-h h3{margin:0;font-size:17px;color:#131845}' +
    '.dl-ver{margin:3px 0 0;font-size:12.5px;color:var(--muted)}' +
    '.dl-btn{width:100%;justify-content:center;margin:4px 0 12px}' +
    '.dl-btn svg{width:16px;height:16px}' +
    '.dl-note{display:flex;gap:8px;align-items:flex-start;background:#ebf4f8;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#3d5a73;margin-bottom:12px}' +
    '.dl-note svg{width:15px;height:15px;flex:none;color:#5392ba;margin-top:1px}' +
    '.dl-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}' +
    '.dl-steps li{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--ink)}' +
    '.dl-step-n{width:22px;height:22px;border-radius:50%;background:#131845;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;flex:none}' +
    '.dl-os-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:4px 0 14px}' +
    '@media(max-width:720px){.dl-os-grid{grid-template-columns:repeat(2,1fr)}}' +
    '@media(max-width:460px){.dl-os-grid{grid-template-columns:1fr}}' +
    '.dl-os{border:1px solid #e6ecf2;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:4px;background:#fbfcfe}' +
    '.dl-os-name{font-weight:700;font-size:14px;color:#131845}' +
    '.dl-os-meta{font-size:12.5px;color:var(--muted)}' +
    '.dl-os-btn{width:100%;justify-content:center;margin-top:10px}' +
    '.dl-os-btn svg{width:15px;height:15px}' +
    '</style>' +

    '<div class="dl-wrap">' +
    '<div class="dl-head"><h2>Downloads</h2></div>' +

    winCard() +

    '<div class="dl-grid">' +
    dlCard({
      title: 'Mac (Apple Silicon)', version: '1.0.0', size: '~109 MB', file: 'for Mac (.dmg)', url: DMG_URL, icon: ICO.mac,
      note: ICO.check + '<span>The download is a compressed <b>.dmg.tar.gz</b> — double-click it after downloading to extract the <b>.dmg</b> inside.</span>',
      steps: [
        'Download the <b>.dmg.tar.gz</b> file and double-click it to extract the .dmg.',
        'Open the .dmg and drag <b>Optix LAB MedSync</b> into Applications.',
        'On first launch: right-click the app &rarr; <b>Open</b> (the app is not Apple-notarized yet).',
        'Log in with your lab account credentials.'
      ]
    }) +

    '<div class="card"><div class="card-h"><h3>System requirements</h3></div>' +
    '<div class="card-b"><div class="tbl-wrap"><table class="table"><tbody>' +
    '<tr><th style="width:140px">Windows</th><td>Windows 7, 8.1, 10 or 11 (64-bit and 32-bit builds available), 4 GB RAM, 500 MB free disk space</td></tr>' +
    '<tr><th>Mac</th><td>macOS 12 or newer, Apple Silicon (M1/M2/M3) — Intel build available on the GitHub release page</td></tr>' +
    '<tr><th>Network</th><td>Internet needed only for the first download; the app works fully offline</td></tr>' +
    '</tbody></table></div></div></div>' +

    '</div>' +
    '</div>';
  }

  App.route('/downloads', render);
})();
