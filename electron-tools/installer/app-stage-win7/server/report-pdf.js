'use strict';

// Print the actual Lab Profile HTML; never rebuild the report with a second layout.
const MAX_HTML = 8 * 1024 * 1024;
const CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
let cachedFonts;
function fontCss() {
  if (cachedFonts) return cachedFonts;
  const fs = require('fs'), path = require('path'), directory = path.join(__dirname, 'report-fonts');
  cachedFonts = fs.readdirSync(directory).filter(file => /\.css$/.test(file)).map(file =>
    fs.readFileSync(path.join(directory, file), 'utf8').replace(/url\(([^)]+)\)/g, (_, name) =>
      'url(data:font/woff2;base64,' + fs.readFileSync(path.join(directory, name)).toString('base64') + ')')
  ).join('\n');
  return cachedFonts;
}
function documentHtml(html) {
  if (typeof html !== 'string' || !html.includes('rpt-page') || Buffer.byteLength(html) > MAX_HTML) {
    const error = new Error('A complete report HTML document (up to 8 MB) is required'); error.status = 400; throw error;
  }
  // Security policy precedes all caller-provided markup, including custom profile HTML.
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '"><meta name="referrer" content="no-referrer"><style>' + fontCss() + '</style></head><body>' + html + '</body></html>';
}
function allowedResource(url) {
  if (/^(data:|about:blank$)/i.test(url)) return true;
  try { const u = new URL(url); return u.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname); }
  catch (_) { return false; }
}
// Serialized into both Chromium renderers after fonts/images have finished loading.
async function preparePage() {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, image => {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => { image.onload = resolve; image.onerror = resolve; });
  }));
  const broken = Array.from(document.images).filter(image => !image.naturalWidth && image.getAttribute('src'));
  if (broken.length) throw new Error('A report image could not be loaded; check the saved lab logo/signatures');
  // Electron measures before printToPDF switches media; apply print rules to
  // this isolated document as well so both renderers measure identical sheets.
  const printStyles = document.createElement('style');
  printStyles.textContent = Array.from(document.styleSheets).flatMap(sheet => {
    try { return Array.from(sheet.cssRules).filter(rule => rule.media && rule.media.mediaText.includes('print')).map(rule => Array.from(rule.cssRules, child => child.cssText).join('\n')); }
    catch (_) { return []; }
  }).join('\n');
  document.body.appendChild(printStyles);
  // Paginate at the actual A4 width. Chromium cannot reliably repeat a tall
  // patient header or reserve a nested table footer; use explicit sheets instead.
  const original = document.querySelector('.rpt-page');
  const header = original.querySelector('.rpt-header-block');
  const footer = original.querySelector('.rpt-footer-block');
  const tests = original.querySelector('.rpt-tests-block');
  if (!header || !footer || !tests) throw new Error('Report layout is incomplete');
  const font = getComputedStyle(original).fontFamily;
  const style = document.createElement('style');
  style.textContent = '.rpt-page.rpt-sheet{display:block!important;width:210mm!important;max-width:210mm!important;height:297mm!important;min-height:297mm!important;padding:8mm 7mm 6mm!important;position:relative!important;break-after:page!important;page-break-after:always!important;overflow:hidden}.rpt-page.rpt-sheet:last-of-type{break-after:auto!important;page-break-after:auto!important}.rpt-sheet .rpt-header-block{padding-top:28px!important}.rpt-sheet .rpt-footer-block{position:absolute!important;bottom:6mm!important;left:7mm!important;right:7mm!important}.rpt-sheet-content{display:flow-root}';
  document.body.appendChild(style);
  let sheet, content, limit;
  function newSheet() {
    sheet = document.createElement('div');
    sheet.className = 'rpt-page rpt-sheet';
    sheet.setAttribute('style', original.getAttribute('style') || '');
    sheet.appendChild(header.cloneNode(true));
    content = document.createElement('div'); content.className = 'rpt-sheet-content';
    sheet.appendChild(content);
    const foot = footer.cloneNode(true); sheet.appendChild(foot);
    original.before(sheet);
    if (foot.getBoundingClientRect().height > 400) throw new Error('The saved report footer is too tall for A4; shorten it in Lab Profile');
    limit = foot.getBoundingClientRect().top - 16;
    if (content.getBoundingClientRect().top + 80 > limit) throw new Error('The saved report header/footer leaves no room for test results');
  }
  const fits = () => content.getBoundingClientRect().bottom <= limit;
  newSheet();
  for (const child of Array.from(tests.children)) {
    const block = child.cloneNode(true);
    content.appendChild(block);
    if (fits()) continue;
    block.remove();
    // Keep a complete test together when it fits on a fresh sheet.
    if (content.children.length) { newSheet(); content.appendChild(block); if (fits()) continue; block.remove(); }
    if (!block.classList.contains('rpt-section')) throw new Error('A report note is too tall for A4');
    // A long test continues with its heading and result stamp on each sheet.
    const parts = Array.from(block.children);
    const heading = parts.shift();
    let segment = block.cloneNode(false);
    segment.appendChild(heading.cloneNode(true)); content.appendChild(segment);
    for (const part of parts) {
      segment.appendChild(part);
      if (fits()) continue;
      part.remove();
      if (segment.children.length === 1) throw new Error('A test row is too tall for A4');
      newSheet(); segment = block.cloneNode(false);
      segment.appendChild(heading.cloneNode(true)); segment.appendChild(part); content.appendChild(segment);
      if (!fits()) throw new Error('A test row is too tall for A4');
    }
  }
  original.remove();
  return { font };
}

let active = 0;
async function chromiumPdf(html) {
  if (active >= 2) { const error = new Error('PDF renderer is busy. Please retry.'); error.status = 503; throw error; }
  active++;
  let browser;
  try {
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: process.env.REPORT_CHROMIUM_PATH || '/usr/bin/chromium-browser',
      headless: true, timeout: 20000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width: 1280, height: 1200 });
    await page.setRequestInterception(true);
    page.on('request', request => allowedResource(request.url()) ? request.continue() : request.abort());
    await page.emulateMediaType('print');
    await page.setContent(documentHtml(html), { waitUntil: 'load', timeout: 20000 });
    await page.evaluate(preparePage);
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, timeout: 20000 }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    active--;
  }
}
function register(app, needUser, renderer = chromiumPdf) {
  app.post('/api/report-pdf/render', needUser, async (req, res) => {
    try {
      const html = req.body && req.body.html;
      documentHtml(html); // Same validation for Electron and cloud.
      const pdf = Buffer.from(await renderer(html));
      if (pdf.length > 15 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF renderer returned an incomplete report');
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ dataUri: 'data:application/pdf;base64,' + pdf.toString('base64') });
    } catch (error) { res.status(error.status || 503).json({ error: error.message || 'Could not render the Lab Profile report' }); }
  });
}
module.exports = { register, chromiumPdf, documentHtml, allowedResource, preparePage };
