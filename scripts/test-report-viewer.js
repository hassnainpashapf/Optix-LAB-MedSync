'use strict';
// Dependency-free VM checks, following the scripts/ browser/route extraction harness.
// Every PDF, identity and filesystem entry below is synthetic and stays in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const bases = ['cloud', 'electron-tools/installer/app-stage-win7/server'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function element(tag) {
  return {
    tag, children: [], style: {}, attrs: {}, listeners: {}, clientWidth: 390, scrollLeft: 0, scrollTop: 0,
    set innerHTML(value) { this.html = value; this.children = []; },
    get innerHTML() { return this.html || ''; },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(key, cb) { this.listeners[key] = cb; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: 800 }; },
    getContext() { return { canvas: this }; }
  };
}

function viewer(html, options = {}) {
  const ids = Object.fromEntries(['scroller', 'pages', 'dl', 'zin', 'zout', 'share'].map(id => [id, element('div')]));
  const timers = new Map(), tasks = [], requested = [], shares = [], canvases = [];
  let timerId = 0, active = 0, maxActive = 0, documentOptions;
  const count = options.count || 3;
  const pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument(opts) {
      documentOptions = opts;
      if (options.documentError) return { promise: Promise.reject(new Error('synthetic document failure')) };
      return { promise: Promise.resolve({ numPages: count, getPage(n) {
        requested.push(n);
        if (options.pageError === n) return Promise.reject(new Error('synthetic page failure'));
        const [w, h] = options.dimensions || [600, 850];
        return Promise.resolve({
          getViewport({ scale }) { return { width: w * scale, height: h * scale }; },
          render({ canvasContext }) {
            if (options.throwPage === n) throw new Error('synthetic synchronous render failure');
            let resolve, reject;
            const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
            const task = { n, canvas: canvasContext.canvas, promise, cancelled: false, done: false,
              finish(error) {
                if (this.done) return;
                this.done = true; active--;
                if (error) reject(new Error('synthetic render failure')); else resolve();
              },
              cancel() { this.cancelled = true; if (!options.delayedCancel) this.finish(true); }
            };
            tasks.push(task); active++; maxActive = Math.max(maxActive, active);
            if (!options.manual) task.finish(options.rejectPage === n);
            return task;
          }
        });
      } }) };
    }
  };
  const window = { pdfjsLib: options.noLibrary ? null : pdfjsLib, devicePixelRatio: 3, listeners: {},
    addEventListener(key, cb) { this.listeners[key] = cb; } };
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], {
    window, pdfjsLib, location: { pathname: '/r/SYNTHETIC', href: 'https://example.invalid/r/SYNTHETIC?test=1' },
    navigator: { share(data) { shares.push(data); return Promise.resolve(); } },
    document: { getElementById: id => ids[id], createElement(tag) {
      const el = element(tag); if (tag === 'canvas') canvases.push(el); return el;
    } },
    setTimeout(cb) { timers.set(++timerId, cb); return timerId; }, clearTimeout(id) { timers.delete(id); }
  }, { filename: 'report-viewer.html:inline' });
  return { ids, tasks, requested, shares, canvases, window,
    maxActive: () => maxActive, url: () => documentOptions.url,
    tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(cb => cb()); }
  };
}

async function viewerChecks(html) {
  let h = viewer(html);
  await flush();
  assert.deepEqual(h.requested, [1, 2, 3]);
  assert.deepEqual(h.tasks.map(t => t.n), [1, 2, 3]);
  assert.equal(h.maxActive(), 1);
  assert.equal(h.ids.pages.children.length, 3);
  h.ids.pages.children.forEach((el, i) => {
    assert.equal(el.attrs['aria-label'], `Page ${i + 1} of 3`);
    assert.equal(el.children[0], h.tasks[i].canvas);
  });
  assert.match(h.url(), /^\/r\/SYNTHETIC\?raw=1&v=\w+$/);
  assert.equal(h.ids.dl.href, h.url() + '&dl=1');
  h.ids.share.onclick();
  assert.equal(h.shares[0].url, 'https://example.invalid/r/SYNTHETIC');
  for (const options of [{ rejectPage: 2 }, { throwPage: 2 }]) {
    h = viewer(html, options); await flush();
    assert.match(h.ids.pages.children[1].innerHTML, /Page 2 could not be displayed/);
    assert.ok(h.ids.pages.children[1].innerHTML.includes('href="' + h.url() + '"'));
    assert.equal(h.ids.pages.children[0].children.length, 1);
    assert.equal(h.ids.pages.children[2].children.length, 1, 'later pages still render after failure');
  }
  for (const options of [{ documentError: true }, { pageError: 2 }, { noLibrary: true }]) {
    h = viewer(html, options); await flush();
    assert.match(h.ids.pages.innerHTML, /We could not display.*Open the PDF/);
  }
  h = viewer(html, { manual: true, delayedCancel: true }); await flush();
  const old = h.tasks[0];
  h.ids.zin.onclick();
  assert.ok(old.cancelled, 'cancel immediately, before debounce');
  old.finish(); await flush();
  assert.equal(h.ids.pages.children[0].children.length, 0, 'obsolete completion never swaps during debounce');
  assert.equal(old.canvas.width, 0, 'release obsolete canvas');
  h.tick(); await flush();
  const superseded = h.tasks[1];
  h.ids.zin.onclick(); h.tick(); await flush();
  assert.equal(h.tasks.length, 2, 'new render waits for cancelled work to settle');
  superseded.finish(); await flush();
  assert.equal(h.ids.pages.children[0].children.length, 0, 'late cancelled success never swaps');
  for (let n = 1; n <= 3; n++) {
    const task = h.tasks[h.tasks.length - 1];
    assert.equal(task.n, n); task.finish(); await flush();
  }
  assert.equal(h.maxActive(), 1);
  assert.ok(h.ids.pages.children.every(el => el.children.length === 1));
  h = viewer(html, { manual: true }); await flush();
  h.ids.zin.onclick(); await flush(); h.tick(); await flush();
  assert.ok(!h.ids.pages.children[0].innerHTML.includes('could not'), 'expected cancellation is not shown as failure');
  for (let n = 1; n <= 3; n++) { h.tasks[h.tasks.length - 1].finish(); await flush(); }
  assert.equal(h.maxActive(), 1);

  for (const dimensions of [[600, 850], [600, 12000], [12000, 600]]) {
    h = viewer(html, { count: 12, dimensions }); await flush();
    for (let i = 0; i < 6; i++) h.ids.zin.onclick();
    h.tick(); await flush();
    let total = 0;
    h.ids.pages.children.forEach(el => {
      const cv = el.children[0];
      assert.ok(cv.width > 0 && cv.width <= 3072);
      assert.ok(cv.height > 0 && cv.height <= 3072);
      assert.ok(cv.width * cv.height <= 2 * 1024 * 1024);
      total += cv.width * cv.height;
    });
    assert.ok(total <= 16 * 1024 * 1024, 'retained report pixel budget');
    h.ids.scroller.clientWidth = 0;
    h.window.listeners.resize(); h.tick(); await flush();
    assert.ok(h.ids.pages.children.every(el => parseFloat(el.style.width) > 0), 'fit width remains positive');
  }
  h = viewer(html); await flush();
  h.ids.scroller.listeners.touchstart({ touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }] });
  let prevented = false;
  h.ids.scroller.listeners.touchmove({ touches: [{ clientX: 0, clientY: 0 }, { clientX: 200, clientY: 0 }], preventDefault() { prevented = true; } });
  h.tick(); await flush();
  assert.ok(prevented);
  assert.equal(h.ids.pages.children[0].style.width, '748px', 'pinch zoom retained');
  h.ids.zout.onclick(); h.tick(); await flush();
  assert.ok(parseFloat(h.ids.pages.children[0].style.width) < 748);
}

function routeBlock(source, marker) {
  const start = source.indexOf(marker), end = source.indexOf('\n  });', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end + '\n  });'.length);
}
async function routeChecks(source, desktopMode) {
  const files = new Map(), routes = {}, needUser = () => {}, fetches = [], saves = [];
  const context = {
    app: { get(route, ...handlers) { routes[route] = handlers; }, post(route, ...handlers) { routes[route] = handlers; } },
    needUser, path, Buffer, REPORT_PDFS_DIR: '/synthetic', viewerHtml: '<html>synthetic viewer</html>',
    DESKTOP: desktopMode, PUBLIC_API_URL: 'https://example.invalid', DESKTOP_CLOUD_URL: 'https://example.invalid',
    desktop: { async fetchPdf(key) { fetches.push(key); return false; }, onPdfSaved(key) { saves.push(key); } },
    fs: { existsSync: file => files.has(file), readFileSync: file => files.get(file),
      writeFileSync(file, data) { files.set(file, data); },
      createReadStream(file) { return { pipe(res) { res.body = files.get(file); } }; } }
  };
  const uploadStart = source.indexOf('  const REPORT_KEY_RE =');
  const uploadEnd = source.indexOf('\n  });', source.indexOf("  app.post('/api/report-pdfs'", uploadStart));
  vm.runInNewContext(source.slice(uploadStart, uploadEnd + '\n  });'.length) + '\n' + routeBlock(source, "  app.get('/r/:key'"), context);
  assert.equal(routes['/api/report-pdfs'][0], needUser, 'upload still requires authentication');
  assert.equal(routes['/r/:key'].length, 1, 'public route registration unchanged');
  function response() {
    return { headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; },
      vary(v) { this.headers.Vary = v; }, type(v) { this.headers['Content-Type'] = v; return this; },
      status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
  }
  async function upload(text, lab = 'main') {
    const res = response();
    await routes['/api/report-pdfs'][1]({ body: { key: 'SYNTHETIC', pdfBase64: Buffer.from(text).toString('base64') }, lab: { id: lab } }, res);
    return res;
  }
  async function get(query = {}, accept = '', key = 'SYNTHETIC') {
    const res = response();
    await routes['/r/:key'][0]({ params: { key }, query, get: () => accept }, res);
    assert.match(res.headers['Cache-Control'], /private/);
    assert.match(res.headers['Cache-Control'], /no-store/);
    assert.match(res.headers['Cache-Control'], /max-age=0/);
    assert.equal(res.headers.Vary, 'Accept');
    return res;
  }
  assert.equal((await upload('%PDF synthetic version 1')).code, 200);
  assert.equal((await get()).body.toString(), '%PDF synthetic version 1');
  assert.equal((await upload('%PDF synthetic version 2')).code, 200);
  for (const accept of ['', '*/*', 'application/pdf']) {
    const res = await get({}, accept);
    assert.equal(res.body.toString(), '%PDF synthetic version 2');
    assert.equal(res.headers['Content-Type'], 'application/pdf');
    assert.match(res.headers['Content-Disposition'], /^inline;/);
  }
  assert.equal((await get({}, 'text/html')).body, context.viewerHtml);
  assert.equal((await get({ dl: '1' }, 'text/html')).body, context.viewerHtml, 'HTML Accept semantics preserved');
  assert.equal((await get({ raw: '1' }, 'text/html')).headers['Content-Type'], 'application/pdf');
  const download = await get({ raw: '1', dl: '1' }, 'text/html');
  assert.equal(download.headers['Content-Disposition'], 'attachment; filename="lab-report-SYNTHETIC.pdf"');
  assert.equal((await get({}, '', '../escape')).code, 400);
  assert.equal((await get({}, 'text/html', 'MISSING')).code, 404);
  assert.equal((await upload('%PDF other lab', 'other-lab')).code, 409, 'tenant ownership unchanged');
  assert.equal((await get()).body.toString(), '%PDF synthetic version 2');
  assert.deepEqual(fetches, desktopMode ? ['MISSING'] : []);
  assert.equal(saves.length, desktopMode ? 2 : 0);
}

(async () => {
  assert.equal(read(bases[0] + '/report-viewer.html'), read(bases[1] + '/report-viewer.html'), 'active viewer copies stay identical');
  for (const base of bases) {
    await viewerChecks(read(base + '/report-viewer.html'));
    await routeChecks(read(base + '/server.js'), false);
    await routeChecks(read(base + '/server.js'), true);
    console.log('PASS: ' + base + ' viewer rendering, cancellation, budgets, fallback and mutable QR cache/route semantics');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
