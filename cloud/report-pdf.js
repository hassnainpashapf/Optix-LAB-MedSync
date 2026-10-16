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
  // Keep the original grid markup/styles, but give Chromium a repeating section
  // heading when one test's rows continue onto another sheet.
  document.querySelectorAll('.rpt-tests-block > .rpt-section').forEach(section => {
    const children = Array.from(section.children);
    if (!children.length || children[0].style.display !== 'grid') return;
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border:0;border-collapse:collapse;margin:0;padding:0;table-layout:fixed;font-size:inherit';
    children.forEach((child, i) => {
      const group = i === 0 ? document.createElement('thead') : (table.tBodies[0] || document.createElement('tbody'));
      group.style.display = i === 0 ? 'table-header-group' : 'table-row-group';
      const row = document.createElement('tr'), cell = document.createElement('td');
      cell.style.cssText = 'border:0;padding:0;vertical-align:top;font-size:inherit;line-height:inherit';
      cell.appendChild(child); row.appendChild(cell); group.appendChild(row);
      if (!group.parentNode) table.appendChild(group);
    });
    section.appendChild(table);
  });
  const footer = document.querySelector('.rpt-footer-block');
  const height = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;
  if (height > 400) throw new Error('The saved report footer is too tall for A4; shorten it in Lab Profile');
  // The existing template repeats its header and reserves a footer on every page.
  // Measure the saved footer instead of assuming that every lab uses a 48mm footer.
  const style = document.createElement('style');
  style.textContent = '@media print{.rpt-header-block{padding-top:28px!important}.rpt-section>div{break-inside:avoid;page-break-inside:avoid}.rpt-section>div:first-child{break-after:avoid;page-break-after:avoid}.rpt-foot-spacer{height:' + (height + 16) + 'px!important;min-height:' + (height + 16) + 'px!important}}';
  document.head.appendChild(style);
  return { footerHeight: height, font: getComputedStyle(document.querySelector('.rpt-page')).fontFamily };
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
    await page.setContent(documentHtml(html), { waitUntil: 'networkidle0', timeout: 20000 });
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
