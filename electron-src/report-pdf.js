'use strict';
const { BrowserWindow } = require('electron');
const { documentHtml, allowedResource, preparePage } = require('./server/report-pdf');
let active = 0, serial = 0;
async function render(html) {
  if (active >= 2) throw new Error('PDF renderer is busy. Please retry.');
  active++;
  let window, timer;
  try {
    window = new BrowserWindow({ show: false, width: 1280, height: 1200,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, javascript: false,
        backgroundThrottling: false, partition: 'report-pdf-' + (++serial) } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowedResource(details.url) }));
    const work = async () => {
      await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(documentHtml(html)));
      await window.webContents.executeJavaScript('(' + preparePage.toString() + ')()');
      return window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: false, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    };
    return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PDF rendering timed out. Please retry.')), 30000); })]);
  } finally {
    clearTimeout(timer);
    if (window && !window.isDestroyed()) window.destroy();
    active--;
  }
}
module.exports = { render };
