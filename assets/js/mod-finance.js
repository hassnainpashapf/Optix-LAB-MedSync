/* ============================================================
   Optix Medical Sync — Finance module: Daily Cash Closing + Profit & Loss
   Routes: #/finance (closing tab, admin + reception), #/finance/profit (admin only)
   Depends on: window.DB, window.App. ES5-style (no ?. / ?? / replaceAll).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- tiny helpers ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function toDay(v) {
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var d = new Date(v);
    return isNaN(d) ? '' : ymd(d);
  }
  function parseDay(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((+n || 0) * 100) / 100; }
  function esc(s) { return App.esc(s); }
  function money(n) { return App.money(n); }
  function moneyN(n) { n = r2(n); return (n < 0 ? '\u2212' : '') + money(Math.abs(n)); }
  function sgnMoney(n) { n = r2(n); return (n > 0 ? '+' : (n < 0 ? '−' : '')) + money(Math.abs(n)); }
  function sess() { try { return App.session() || {}; } catch (e) { return {}; } }
  function role() { return sess().role || ''; }
  function isAdmin() { return role() === 'admin'; }
  function canClosing() { var r = role(); return r === 'admin' || r === 'reception' || (r === 'custom' && App.canPage('finance')); }
  function canProfit() { return role() === 'admin'; }
  function username() {
    var s = sess(), u = null;
    try { u = s.userId ? DB.get('users', s.userId) : null; } catch (e) {}
    return (u && u.username) || s.username || s.name || 'staff';
  }
  function userLabel() { return sess().name || username(); }
  function labSettings() { var s = {}; try { s = DB.get('settings', 'main') || {}; } catch (e) {} return s; }
  function fmtDay(s) { return App.d(parseDay(s)); }
  function longDay(s) {
    return parseDay(s).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function csvEsc(v) { var s = (v === null || v === undefined) ? '' : String(v); return '"' + s.replace(/"/g, '""') + '"'; }
  function downloadCsv(name, rows) {
    try {
      var csv = rows.map(function (r) { return r.map(csvEsc).join(','); }).join('\r\n');
      var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 600);
      App.toast('CSV exported.');
    } catch (e) { App.toast('Export failed: ' + e.message, 'err'); }
  }
  function view() { return document.getElementById('view'); }

  /* ---------------- data model helpers ---------------- */
  var KNOWN_METHODS = { cash: 'Cash', bank: 'Bank', card: 'Card', online: 'Online', jazzcash: 'JazzCash', easypaisa: 'Easypaisa' };
  function methodOf(p) {
    var m = String((p && p.method) || 'Cash').replace(/^\s+|\s+$/g, '');
    if (!m) m = 'Cash';
    var k = m.toLowerCase().replace(/\s+/g, '');
    return KNOWN_METHODS[k] || (m.charAt(0).toUpperCase() + m.slice(1));
  }
  function payDay(p) { return toDay(p.date || p.createdAt); }
  function isRefund(p) { return (+p.amount || 0) < 0 || p.type === 'refund' || p.refund === true; }
  function payAmt(p) { return Math.abs(+p.amount || 0); } /* magnitude; sign comes from isRefund */
  function signedAmt(p) { return isRefund(p) ? -payAmt(p) : payAmt(p); }
  function expIsCash(e) {
    var m = String(e.method || e.paidFrom || 'Cash').toLowerCase();
    return m === 'cash' || m === '';
  }
  function expDay(e) { return toDay(e.date); }
  function invDay(iv) { return toDay(iv.createdAt); }
  function sum(arr, fn) { var t = 0; for (var i = 0; i < arr.length; i++) t += fn(arr[i]); return t; }
  function closings() { try { return DB.all('closings') || []; } catch (e) { return []; } }
  function closingFor(date) {
    var l = closings();
    for (var i = 0; i < l.length; i++) if (l[i].date === date) return l[i];
    return null;
  }
  function prevClosing(date) {
    var best = null;
    closings().forEach(function (c) { if (c.date < date && (!best || c.date > best.date)) best = c; });
    return best;
  }
  function activityDays() {
    var set = {};
    DB.all('payments').forEach(function (p) { var d = payDay(p); if (d) set[d] = true; });
    DB.all('expenses').forEach(function (e) { var d = expDay(e); if (d) set[d] = true; });
    return set;
  }
  function unclosedBefore(date) {
    var act = activityDays(), closed = {}, out = [];
    closings().forEach(function (c) { closed[c.date] = true; });
    Object.keys(act).sort().forEach(function (d) { if (d < date && !closed[d]) out.push(d); });
    return out;
  }

  /* ---------------- one day's figures (live from payments + expenses) ---------------- */
  function dayFigures(date) {
    var pays = DB.all('payments').filter(function (p) { return payDay(p) === date; });
    var exps = DB.all('expenses').filter(function (e) { return expDay(e) === date; });
    var invs = DB.all('invoices').filter(function (iv) { return invDay(iv) === date; });
    var recv = {}, cnt = {}, refundsBy = {}, totalRecv = 0, totalRef = 0;
    pays.forEach(function (p) {
      var m = methodOf(p), a = payAmt(p);
      if (isRefund(p)) { refundsBy[m] = (refundsBy[m] || 0) + a; totalRef += a; }
      else { recv[m] = (recv[m] || 0) + a; totalRecv += a; }
      cnt[m] = (cnt[m] || 0) + 1;
    });
    var cashExps = exps.filter(expIsCash);
    var cashExp = sum(cashExps, function (e) { return +e.amount || 0; });
    var expTotal = sum(exps, function (e) { return +e.amount || 0; });
    var cashIn = recv.Cash || 0, cashRef = refundsBy.Cash || 0;
    var prev = prevClosing(date);
    return {
      date: date, pays: pays, exps: exps, invs: invs,
      recv: recv, cnt: cnt, refundsBy: refundsBy,
      refunds: r2(totalRef), received: r2(totalRecv),
      cashIn: r2(cashIn), cashRefunds: r2(cashRef), cashExp: r2(cashExp),
      cashOut: r2(cashRef + cashExp), expTotal: r2(expTotal),
      nonCashExp: r2(expTotal - cashExp),
      invoicesCount: invs.length,
      billed: r2(sum(invs, function (i) { return +i.total || 0; })),
      dues: r2(sum(invs, function (i) { return Math.max(0, +i.due || 0); })),
      collected: r2(totalRecv - totalRef),
      prev: prev, autoOpening: prev ? r2(prev.countedCash) : null
    };
  }
  function methodList(rec, refBy) {
    var keys = {}, out = [];
    Object.keys(rec || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(refBy || {}).forEach(function (k) { keys[k] = true; });
    ['Cash', 'Bank', 'Card'].forEach(function (k) { if (keys[k]) { out.push(k); delete keys[k]; } });
    return out.concat(Object.keys(keys).sort());
  }

  /* ---------------- module state ---------------- */
  var DENS = [5000, 1000, 500, 100, 50, 20, 10];
  var S = {
    date: null, mode: 'count', den: {}, coins: '', direct: '', notes: '', opening: '',
    histMonth: null
  };
  var P = { preset: 'thisMonth', from: null, to: null, basis: 'cash' };
  function resetCount() { S.mode = 'count'; S.den = {}; S.coins = ''; S.direct = ''; S.notes = ''; S.opening = ''; }
  function countedNow() {
    if (S.mode === 'direct') return r2(num(S.direct));
    var t = 0;
    DENS.forEach(function (d) { t += d * Math.max(0, Math.floor(num(S.den[d]))); });
    return r2(t + Math.max(0, num(S.coins)));
  }
  function hasCountEntry() {
    if (S.mode === 'direct') return String(S.direct).replace(/\s/g, '') !== '';
    return countedNow() > 0;
  }

  /* ---------------- CSS (scoped) ---------------- */
  var CSS = '' +
    '.fn-page{max-width:1280px;margin:0 auto}' +
    '.fn-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}' +
    '.fn-bar .sp{flex:1}' +
    '.fn-tabs a.tab{text-decoration:none;display:inline-flex;align-items:center;gap:8px}' +
    '.fn-date{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.fn-date .input{width:auto;min-width:150px}' +
    '.fn-ib{width:38px;height:38px;border-radius:10px;border:2px solid var(--bd);background:#fff;color:var(--ink2);font-weight:800;font-size:16px;display:grid;place-items:center;padding:0}' +
    '.fn-ib:hover{background:var(--brand-soft)}' +
    '.fn-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:18px;align-items:start;margin-bottom:18px}' +
    '.fn-col{display:flex;flex-direction:column;gap:18px;min-width:0}' +
    '.fn-grid .card,.fn-col .card{margin-bottom:0}' +
    '.fn-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:18px;align-items:stretch}' +
    '.fn-grid2 .card{margin-bottom:0;min-width:0}' +
    '.fn-kpi{grid-template-columns:repeat(3,1fr)}' +
    '.fn-banner{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:11px 14px;margin-bottom:14px;font-size:13.5px;font-weight:600;line-height:1.45;border:1px solid}' +
    '.fn-banner svg{flex:none;margin-top:2px}' +
    '.fn-b-warn{background:var(--amber-soft);border-color:#f3ddae;color:#92400e}' +
    '.fn-b-ok{background:var(--green-soft);border-color:#bfe6d4;color:#065f46}' +
    '.fn-b-info{background:var(--blue-soft);border-color:#c7d7f5;color:#1e3a8a}' +
    '.fn-chip{display:inline-flex;align-items:center;border:1.5px solid #e3c27a;background:#fff;color:#92400e;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;margin:3px 4px 0 0;cursor:pointer;font-family:inherit}' +
    '.fn-chip:hover{background:#fff4d6}' +
    '.fn-rec{width:100%;border-collapse:collapse}' +
    '.fn-rec td{padding:9px 0;border-bottom:1px solid var(--line2);font-size:14px}' +
    '.fn-rec td:last-child{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.fn-rec tr.fn-t td{border-top:2px solid var(--line);border-bottom:none;font-size:15.5px;font-weight:800;padding-top:12px}' +
    '.fn-seg{display:inline-flex;border:2px solid var(--bd);border-radius:10px;overflow:hidden}' +
    '.fn-seg button{border:0;background:#fff;padding:7px 14px;font-weight:700;font-size:13px;color:var(--muted)}' +
    '.fn-seg button.on{background:var(--brand-soft);color:var(--brand-d)}' +
    '.fn-den{display:grid;grid-template-columns:78px 18px minmax(70px,100px) 1fr;gap:8px 10px;align-items:center}' +
    '.fn-den .dn{font-weight:800;font-size:14px;white-space:nowrap}' +
    '.fn-den .x{color:var(--faint);text-align:center}' +
    '.fn-den .st{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink2)}' +
    '.fn-den .input{padding:7px 10px;text-align:right}' +
    '.fn-count-tot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:2px solid var(--line);font-weight:800;font-size:16px}' +
    '.fn-diff{border-radius:14px;padding:14px 16px;margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;border:2px solid;flex-wrap:wrap}' +
    '.fn-diff small{display:block;font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;opacity:.85}' +
    '.fn-diff b{font-size:24px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}' +
    '.fn-diff.neu{background:#f8fafc;border-color:var(--line);color:var(--muted)}' +
    '.fn-diff.ok{background:var(--green-soft);border-color:#9fd8b8;color:#047857}' +
    '.fn-diff.short{background:var(--red-soft);border-color:#e6aaaa;color:#b91c1c}' +
    '.fn-diff.over{background:var(--green-soft);border-color:#9fd8b8;color:#047857}' +
    '.fn-neg{color:var(--red);font-weight:800}.fn-pos{color:var(--green);font-weight:800}.fn-zero{color:var(--muted);font-weight:700}' +
    '.fn-tot td{font-weight:800;background:#f8fafc}' +
    '.fn-d{font-weight:800}.fn-d-g{color:var(--green)}.fn-d-r{color:var(--red)}.fn-d-n{color:var(--muted)}' +
    '.fn-seg2{display:flex;gap:6px;flex-wrap:wrap}' +
    '.fn-pill{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:7px 15px;font-weight:700;font-size:13px;color:var(--ink2)}' +
    '.fn-pill.on{border-color:var(--brand);background:var(--brand-soft);color:var(--brand-d)}' +
    '.fn-chart{position:relative;width:100%}' +
    '.fn-chart svg{display:block;width:100%;height:auto;overflow:visible}' +
    '.fn-tip{position:absolute;z-index:5;pointer-events:none;background:#0f1e2e;color:#fff;border-radius:10px;padding:8px 11px;font-size:12px;line-height:1.5;box-shadow:0 8px 22px rgba(15,30,46,.3);white-space:nowrap;display:none}' +
    '.fn-tip b{display:block;margin-bottom:2px}' +
    '.fn-leg{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:6px}' +
    '.fn-leg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}' +
    '.fn-hist-sum{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}' +
    '.fn-hs{border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;background:#fff;min-width:0}' +
    '.fn-hs small{display:block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;color:var(--muted)}' +
    '.fn-hs b{font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.fn-note{font-size:12.5px;color:var(--muted)}' +
    '.fn-lockbox{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
    '.fn-grid2.fn-wide{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)}' +
    '@media(max-width:1100px){.fn-grid2.fn-wide{grid-template-columns:1fr}.fn-grid{grid-template-columns:1fr}.fn-grid2{grid-template-columns:1fr}.fn-hist-sum{grid-template-columns:repeat(3,1fr)}.fn-kpi{grid-template-columns:repeat(2,1fr)}}' +
    '@media(max-width:640px){.fn-hist-sum{grid-template-columns:repeat(2,1fr)}.fn-date{flex:1 1 100%}.fn-date .input{flex:1 1 120px;min-width:120px}.fn-bar .btn{flex:1 1 auto}.fn-tabs{overflow-x:auto}.fn-tabs a.tab{padding:10px 12px;white-space:nowrap}.fn-den{grid-template-columns:74px 12px minmax(60px,1fr) minmax(70px,auto)}.fn-diff b{font-size:21px}}' +
    '@media(max-width:560px){.fn-kpi,.stat-grid.fn-k4{grid-template-columns:repeat(2,1fr)}}';
  function ensureCss() {
    if (document.getElementById('fn-style')) return;
    var st = document.createElement('style');
    st.id = 'fn-style';
    st.appendChild(document.createTextNode(CSS));
    document.head.appendChild(st);
  }

  /* ---------------- shared bits ---------------- */
  var IC = {
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14l-3-3"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    cash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    in: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    out: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9m0 0 4 4m-4-4-4 4"/><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/></svg>',
    safe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V10M12 14v1.5M8.5 12H10M14 12h1.5"/></svg>',
    trend: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    receipt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6"/></svg>',
    pct: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/></svg>',
    wallet: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a2 2 0 0 1 0-4h14v4"/><path d="M4 7v12a2 2 0 0 0 2 2h14V7"/><circle cx="17" cy="14" r="1.4"/></svg>',
    file: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>'
  };
  function stat(icon, tint, label, value, sub, valStyle) {
    return '<div class="stat" data-tint="' + tint + '" style="--sc:var(--' + tint + ')">' +
      '<div class="stat-ico" style="--sc:var(--' + tint + ');--sc-soft:var(--' + tint + '-soft)">' + icon + '</div>' +
      '<div class="lb">' + esc(label) + '</div>' +
      '<div class="vl"' + (valStyle ? ' style="' + valStyle + '"' : '') + '>' + value + '</div>' +
      '<div class="dl">' + sub + '</div></div>';
  }
  function banner(kind, html) {
    return '<div class="fn-banner fn-b-' + kind + '">' + (kind === 'warn' ? IC.warn : (kind === 'ok' ? IC.ok : IC.info)) + '<div>' + html + '</div></div>';
  }
  function diffHtml(d, plain) {
    d = r2(d);
    if (d === 0) return '<span class="fn-zero">Balanced</span>';
    return '<span class="' + (d < 0 ? 'fn-neg' : 'fn-pos') + '">' + (d < 0 ? 'Short ' : 'Over ') + money(Math.abs(d)) + '</span>';
  }
  function tabsHtml(active) {
    return ''; /* the two pages are now sub-menu items under "Cash & Profit" in the sidebar */
    return '<div class="tabs fn-tabs">' +
      '<a class="tab' + (active === 'closing' ? ' on' : '') + '" href="#/finance" data-fntab="closing">Daily Cash Closing</a>' +
      (canProfit() ? '<a class="tab' + (active === 'profit' ? ' on' : '') + '" href="#/finance/profit" data-fntab="profit">Profit &amp; Loss</a>' : '') +
      '</div>';
  }

  /* ============================================================
     A. DAILY CASH CLOSING
     ============================================================ */
  function liveView(fig) {
    var opening = fig.prev ? fig.autoOpening : r2(num(S.opening));
    var expected = r2(opening + fig.cashIn - fig.cashRefunds - fig.cashExp);
    return {
      closed: false, date: fig.date, openingCash: opening, cashIn: fig.cashIn, cashOut: fig.cashOut,
      expectedCash: expected, breakdown: fig.recv, refunds: fig.refunds,
      invoicesCount: fig.invoicesCount, billed: fig.billed, collected: fig.collected,
      dues: fig.dues, expensesTotal: fig.expTotal
    };
  }
  function draftRow(fig) {
    var v = liveView(fig), counted = countedNow();
    return {
      id: '', date: fig.date, openingCash: v.openingCash, cashIn: v.cashIn, cashOut: v.cashOut,
      expectedCash: v.expectedCash, countedCash: counted, difference: r2(counted - v.expectedCash),
      breakdown: fig.recv, refunds: fig.refunds, refundsBy: fig.refundsBy,
      invoicesCount: v.invoicesCount, billed: v.billed, collected: v.collected, dues: v.dues,
      expensesTotal: v.expensesTotal, notes: S.notes,
      closedBy: username(), closedByName: userLabel(), closedAt: '',
      denominations: denomSnapshot()
    };
  }
  function denomSnapshot() {
    var o = { mode: S.mode };
    if (S.mode === 'direct') { o.direct = r2(num(S.direct)); return o; }
    DENS.forEach(function (d) { o[d] = Math.max(0, Math.floor(num(S.den[d]))); });
    o.coins = r2(Math.max(0, num(S.coins)));
    return o;
  }

  function renderClosing() {
    var today = App.today();
    if (!S.date) S.date = today;
    var date = S.date;
    var fig = dayFigures(date);
    var row = closingFor(date);
    var V = row ? {
      closed: true, date: date, openingCash: row.openingCash, cashIn: row.cashIn, cashOut: row.cashOut,
      expectedCash: row.expectedCash, breakdown: row.breakdown || {}, refunds: r2(row.refunds || 0),
      invoicesCount: row.invoicesCount, billed: row.billed, collected: row.collected, dues: row.dues,
      expensesTotal: row.expensesTotal
    } : liveView(fig);
    var admin = isAdmin();
    var future = date > today;

    /* ---- banners ---- */
    var banners = '';
    if (row) {
      banners += banner('ok', '<b>Day closed</b> by ' + esc(row.closedByName || row.closedBy) + ' on ' + esc(App.dt(row.closedAt)) +
        '. This closing is read-only' + (admin ? ' &mdash; use Reopen to change it.' : '. Ask an admin to reopen it if a correction is needed.'));
      var liveExpected = r2((fig.prev ? fig.autoOpening : row.openingCash) + fig.cashIn - fig.cashRefunds - fig.cashExp);
      if (r2(row.expectedCash) !== r2(row.openingCash + fig.cashIn - fig.cashRefunds - fig.cashExp)) {
        banners += banner('warn', 'Payments or expenses for this date changed after it was closed. Expected cash would now be <b>' +
          money(row.openingCash + fig.cashIn - fig.cashRefunds - fig.cashExp) + '</b> (closed at ' + money(row.expectedCash) + ').');
      }
    } else {
      var un = unclosedBefore(date);
      if (un.length) {
        banners += banner('warn', '<b>' + un.length + ' earlier day' + (un.length > 1 ? 's have' : ' has') + ' not been closed:</b> ' +
          un.slice(-6).map(function (d) { return '<button class="fn-chip" data-goto="' + d + '">' + esc(fmtDay(d)) + '</button>'; }).join('') +
          (un.length > 6 ? ' <span class="fn-note">+' + (un.length - 6) + ' older</span>' : '') +
          '<div class="fn-note" style="margin-top:4px">Close them first so the opening cash carries forward correctly.</div>');
      }
      if (future) banners += banner('info', 'This date is in the future &mdash; a day can only be closed on or after it happens.');
    }

    /* ---- stat cards ---- */
    var stats =
      stat(IC.safe, 'brand', 'Opening Cash', money(V.openingCash), row || fig.prev ? 'carried from ' + esc(fmtDay((row ? (prevClosing(date) || {}).date : fig.prev.date) || date)) : 'first day — set manually') +
      stat(IC.in, 'green', 'Cash Received', money(V.cashIn), (fig.cnt.Cash || 0) + ' cash payment' + ((fig.cnt.Cash || 0) === 1 ? '' : 's')) +
      stat(IC.out, 'red', 'Cash Paid Out', money(V.cashOut), 'cash expenses + refunds') +
      stat(IC.cash, 'blue', 'Expected in Drawer', money(V.expectedCash), 'opening + in − out');

    /* ---- opening cash editor (very first day only) ---- */
    var openingBox = '';
    if (!row && !fig.prev) {
      openingBox = '<div class="card"><div class="card-b"><div class="fn-lockbox">' +
        '<div style="flex:1;min-width:200px"><label class="label" for="fnOpening">Opening cash in drawer (Rs)</label>' +
        '<div class="fn-note" style="margin-top:2px">No earlier closing exists, so there is nothing to carry forward. ' +
        (admin ? 'Enter the cash already in the drawer at the start of this day.' : 'Only an admin can set the starting balance.') + '</div></div>' +
        '<input class="input" id="fnOpening" type="number" min="0" step="any" inputmode="decimal" style="width:160px;text-align:right" value="' + esc(S.opening) + '" placeholder="0"' + (admin ? '' : ' disabled') + '></div></div></div>';
    }

    /* ---- collections by method ---- */
    var methods = methodList(V.breakdown, fig.refundsBy);
    var mRows = methods.map(function (m) {
      var amt = V.breakdown[m] || 0, rf = (fig.refundsBy[m] || 0);
      return '<tr><td>' + esc(m) + (m === 'Cash' ? ' <span class="badge b-teal" style="font-size:10.5px;padding:2px 8px">in drawer</span>' : '') + '</td>' +
        '<td class="num">' + (fig.cnt[m] || 0) + '</td>' +
        '<td class="num">' + money(amt) + (rf ? '<div class="fn-neg" style="font-size:11.5px">− ' + money(rf) + ' refunded</div>' : '') + '</td></tr>';
    }).join('');
    var recvTotal = r2(sum(Object.keys(V.breakdown), function (k) { return +V.breakdown[k] || 0; }));
    if (!mRows) mRows = '<tr><td colspan="3">' + App.empty('No payments recorded on this date.') + '</td></tr>';
    else mRows += '<tr class="fn-tot"><td>Total received</td><td class="num">' + fig.pays.length + '</td><td class="num">' + money(recvTotal) + '</td></tr>' +
      (V.refunds ? '<tr class="fn-tot"><td>Net collected (after refunds)</td><td></td><td class="num">' + money(r2(recvTotal - V.refunds)) + '</td></tr>' : '');
    var methodCard = '<div class="card"><div class="card-h"><h3>Collections by payment method</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr>' +
      '<th>Method</th><th style="text-align:right">Payments</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + mRows + '</tbody></table></div></div></div>';

    /* ---- day summary ---- */
    var summaryCard = '<div class="card"><div class="card-h"><h3>Day summary</h3></div><div class="card-b"><table class="fn-rec">' +
      '<tr><td>Invoices created</td><td>' + V.invoicesCount + '</td></tr>' +
      '<tr><td>Billed (after discounts)</td><td>' + money(V.billed) + '</td></tr>' +
      '<tr><td>Collected (all methods, net of refunds)</td><td>' + money(V.collected) + '</td></tr>' +
      '<tr><td>Dues on today\'s invoices</td><td>' + (V.dues > 0 ? '<span class="fn-neg">' + money(V.dues) + '</span>' : money(0)) + '</td></tr>' +
      '<tr><td>Expenses (all methods)</td><td>' + money(V.expensesTotal) + '</td></tr>' +
      '</table></div></div>';

    /* ---- expenses of the day ---- */
    var expRows = fig.exps.map(function (e) {
      var cash = expIsCash(e);
      return '<tr><td><strong>' + esc(e.title) + '</strong></td><td>' + esc(e.category || 'Other') + '</td>' +
        '<td><span class="badge ' + (cash ? 'b-teal' : 'b-info') + '" style="font-size:11px">' + (cash ? 'Cash' : esc(e.method || e.paidFrom)) + '</span></td>' +
        '<td class="num">' + money(e.amount) + '</td></tr>';
    }).join('');
    if (!expRows) expRows = '<tr><td colspan="4">' + App.empty('No expenses on this date.') + '</td></tr>';
    var expCard = '<div class="card"><div class="card-h"><h3>Expenses paid</h3><span class="sp"></span><a class="btn btn-ghost btn-sm" href="#/expenses">Open Expenses</a></div>' +
      '<div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr><th>Title</th><th>Category</th><th>Paid from</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + expRows + '</tbody></table></div></div></div>';

    /* ---- cash count card ---- */
    var countCard = '<div class="card" id="fnCountCard"><div class="card-h"><h3>Cash count</h3><span class="sp"></span>' +
      (row ? '<span class="badge b-paid">Closed</span>' : '<span class="badge b-pending">Open</span>') + '</div><div class="card-b">';
    var den = row ? (row.denominations || {}) : null;
    var ro = !!row;
    var mode = ro ? (den.mode || 'count') : S.mode;
    if (!ro) {
      countCard += '<div class="fn-seg" id="fnMode" style="margin-bottom:14px"><button data-mode="count" class="' + (mode === 'count' ? 'on' : '') + '">Count notes</button>' +
        '<button data-mode="direct" class="' + (mode === 'direct' ? 'on' : '') + '">Enter total</button></div>';
    }
    if (mode === 'direct') {
      var dv = ro ? den.direct : S.direct;
      countCard += '<div><label class="label" for="fnDirect">Total counted cash (Rs)</label>' +
        '<input class="input" id="fnDirect" type="number" min="0" step="any" inputmode="decimal" value="' + esc(ro ? (dv == null ? row.countedCash : dv) : dv) + '" placeholder="0"' + (ro ? ' disabled' : '') + '></div>';
    } else {
      countCard += '<div class="fn-den">';
      DENS.forEach(function (d) {
        var q = ro ? (den[d] || 0) : (S.den[d] === undefined ? '' : S.den[d]);
        countCard += '<span class="dn">Rs ' + d.toLocaleString('en-US') + '</span><span class="x">×</span>' +
          '<input class="input fn-q" data-den="' + d + '" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="' + esc(q === 0 && !ro ? '' : (q === 0 ? 0 : q)) + '"' + (ro ? ' disabled' : '') + '>' +
          '<span class="st" id="fnSt' + d + '">' + money(d * Math.max(0, Math.floor(num(q)))) + '</span>';
      });
      var cv = ro ? (den.coins || 0) : S.coins;
      countCard += '<span class="dn">Coins</span><span class="x">Rs</span>' +
        '<input class="input" id="fnCoins" type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="' + esc(cv) + '"' + (ro ? ' disabled' : '') + '>' +
        '<span class="st" id="fnStC">' + money(Math.max(0, num(cv))) + '</span></div>';
    }
    var countedShow = ro ? row.countedCash : countedNow();
    var diffShow = ro ? row.difference : r2(countedNow() - V.expectedCash);
    countCard += '<div class="fn-count-tot"><span>Counted cash</span><span id="fnCounted">' + money(countedShow) + '</span></div>' +
      '<div class="fn-count-tot" style="border:0;margin:0;padding-top:6px;font-size:14px;font-weight:700;color:var(--muted)"><span>Expected cash</span><span>' + money(V.expectedCash) + '</span></div>' +
      '<div class="fn-diff" id="fnDiff"></div>' +
      '<div style="margin-top:14px"><label class="label" for="fnNotes">Notes</label>' +
      '<textarea class="input" id="fnNotes" rows="2" placeholder="Reason for any difference, handover remarks..."' + (ro ? ' disabled' : '') + '>' + esc(ro ? (row.notes || '') : S.notes) + '</textarea></div>';
    countCard += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">';
    if (!ro) countCard += '<button class="btn btn-primary" id="fnClose" style="flex:1 1 180px"' + (future ? ' disabled' : '') + '>Close day</button>';
    else if (admin) countCard += '<button class="btn btn-danger" id="fnReopen" style="flex:1 1 180px">Reopen day</button>';
    countCard += '<button class="btn" id="fnPrintA4" style="flex:1 1 120px">' + App.icon('printer', 15) + ' Slip A4</button>' +
      '<button class="btn" id="fnPrint80" style="flex:1 1 120px">' + App.icon('printer', 15) + ' Slip 80mm</button></div>';
    if (ro) countCard += '<div class="fn-note" style="margin-top:10px">Closed by ' + esc(row.closedByName || row.closedBy) + ' (' + esc(row.closedBy) + ')</div>';
    countCard += '</div></div>';

    /* ---- history ---- */
    var hm = S.histMonth === null ? date.slice(0, 7) : S.histMonth;
    var hist = histRows(hm);
    var hs = histSummary(hist);
    var hRows = hist.map(function (c) {
      return '<tr class="rowlink">' +
        '<td><strong>' + esc(fmtDay(c.date)) + '</strong></td>' +
        '<td class="num">' + money(c.openingCash) + '</td>' +
        '<td class="num">' + money(c.cashIn) + '</td>' +
        '<td class="num">' + money(c.cashOut) + '</td>' +
        '<td class="num">' + money(c.expectedCash) + '</td>' +
        '<td class="num">' + money(c.countedCash) + '</td>' +
        '<td class="num">' + diffHtml(c.difference) + '</td>' +
        '<td>' + esc(c.closedByName || c.closedBy || '—') + '</td>' +
        '<td class="actions" style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-view="' + esc(c.date) + '">View</button> ' +
        '<button class="btn btn-ghost btn-sm" data-hprint="' + esc(c.date) + '">Print</button></td></tr>';
    }).join('');
    if (!hRows) hRows = '<tr><td colspan="9">' + App.empty('No closed days in this period yet.') + '</td></tr>';
    var histCard = '<div class="card"><div class="card-h"><h3>Closing history</h3><span class="sp"></span>' +
      '<input class="input" type="month" id="fnHistMonth" value="' + esc(hm) + '" style="width:auto;min-width:150px">' +
      '<button class="btn btn-ghost btn-sm" id="fnHistAll">All</button>' +
      '<button class="btn btn-sm" id="fnHistCsv">' + App.icon('download', 14) + ' Export CSV</button></div><div class="card-b">' +
      '<div class="fn-hist-sum">' +
      '<div class="fn-hs"><small>Days closed</small><b>' + hist.length + '</b></div>' +
      '<div class="fn-hs"><small>Cash collected</small><b>' + money(hs.cashIn) + '</b></div>' +
      '<div class="fn-hs"><small>Total short</small><b class="' + (hs.short ? 'fn-neg' : 'fn-zero') + '">' + money(hs.short) + '</b></div>' +
      '<div class="fn-hs"><small>Total over</small><b class="' + (hs.over ? 'fn-pos' : 'fn-zero') + '">' + money(hs.over) + '</b></div>' +
      '<div class="fn-hs"><small>Net difference</small><b class="' + (hs.net < 0 ? 'fn-neg' : (hs.net > 0 ? 'fn-pos' : 'fn-zero')) + '">' + sgnMoney(hs.net) + '</b></div></div>' +
      '<div class="tbl-wrap"><table class="table"><thead><tr><th>Date</th><th style="text-align:right">Opening</th><th style="text-align:right">Cash in</th><th style="text-align:right">Cash out</th>' +
      '<th style="text-align:right">Expected</th><th style="text-align:right">Counted</th><th style="text-align:right">Difference</th><th>Closed by</th><th style="text-align:right">Actions</th></tr></thead><tbody>' + hRows + '</tbody></table></div></div></div>';

    view().innerHTML = '<div class="fn-page">' + tabsHtml('closing') +
      '<div class="fn-bar"><div class="fn-date"><button class="fn-ib" id="fnPrev" aria-label="Previous day">‹</button>' +
      '<input class="input" type="date" id="fnDate" value="' + esc(date) + '" max="' + esc(addDays(today, 0)) + '">' +
      '<button class="fn-ib" id="fnNext" aria-label="Next day">›</button>' +
      '<button class="btn btn-sm" id="fnToday">Today</button></div><span class="sp"></span>' +
      '<span class="fn-note" style="font-weight:700">' + esc(longDay(date)) + '</span></div>' +
      '<div class="stat-grid fn-k4">' + stats + '</div>' + banners + /* the figures come first, the "earlier days not closed" notice sits below them */
      '<div class="fn-grid"><div class="fn-col">' + openingBox + methodCard + summaryCard + expCard + '</div><div class="fn-col">' + countCard + '</div></div>' + histCard + '</div>';

    paintDiff(V.expectedCash, row ? row.difference : null, row ? row.countedCash : null);
    wireClosing(fig, row, V, hist, hm);
  }

  function paintDiff(expected, fixedDiff, fixedCounted) {
    var box = document.getElementById('fnDiff');
    if (!box) return;
    var counted = fixedCounted === null ? countedNow() : fixedCounted;
    var d = fixedDiff === null ? r2(counted - expected) : fixedDiff;
    var entered = fixedCounted !== null || hasCountEntry();
    var cls = !entered ? 'neu' : (d === 0 ? 'ok' : (d < 0 ? 'short' : 'over'));
    var label = !entered ? 'Difference' : (d === 0 ? 'Balanced' : (d < 0 ? 'Short' : 'Over'));
    box.className = 'fn-diff ' + cls;
    box.innerHTML = '<div><small>' + label + '</small><span class="fn-note" style="color:inherit;opacity:.85">' +
      (!entered ? 'Count the drawer to see the difference' : 'counted − expected') + '</span></div><b>' +
      (entered ? (d === 0 ? money(0) : (d < 0 ? '− ' : '+ ') + money(Math.abs(d))) : '—') + '</b>';
    var c = document.getElementById('fnCounted');
    if (c) c.textContent = money(counted);
  }

  function histRows(hm) {
    var l = closings().slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    if (hm) l = l.filter(function (c) { return String(c.date).slice(0, 7) === hm; });
    return l;
  }
  function histSummary(l) {
    var s = { cashIn: 0, short: 0, over: 0, net: 0 };
    l.forEach(function (c) {
      s.cashIn += +c.cashIn || 0;
      var d = +c.difference || 0;
      if (d < 0) s.short += -d; else if (d > 0) s.over += d;
      s.net += d;
    });
    s.cashIn = r2(s.cashIn); s.short = r2(s.short); s.over = r2(s.over); s.net = r2(s.net);
    return s;
  }

  function goDate(d) {
    S.date = d; resetCount(); renderClosing();
  }

  function wireClosing(fig, row, V, hist, hm) {
    var v = view();
    function $(id) { return document.getElementById(id); }
    $('fnDate').addEventListener('change', function (e) { if (e.target.value) goDate(e.target.value); });
    $('fnPrev').addEventListener('click', function () { goDate(addDays(S.date, -1)); });
    $('fnNext').addEventListener('click', function () { goDate(addDays(S.date, 1)); });
    $('fnToday').addEventListener('click', function () { goDate(App.today()); });
    Array.prototype.forEach.call(v.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { goDate(b.getAttribute('data-goto')); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-view]'), function (b) {
      b.addEventListener('click', function () { goDate(b.getAttribute('data-view')); window.scrollTo(0, 0); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-hprint]'), function (b) {
      b.addEventListener('click', function () { var c = closingFor(b.getAttribute('data-hprint')); if (c) printSlip(c, 'a4'); });
    });
    $('fnHistMonth').addEventListener('change', function (e) { S.histMonth = e.target.value || ''; renderClosing(); });
    $('fnHistAll').addEventListener('click', function () { S.histMonth = ''; renderClosing(); });
    $('fnHistCsv').addEventListener('click', function () { exportHistoryCsv(hist, hm); });
    $('fnPrintA4').addEventListener('click', function () { printSlip(row || draftRow(fig), 'a4', !row); });
    $('fnPrint80').addEventListener('click', function () { printSlip(row || draftRow(fig), '80', !row); });
    if (row) {
      var ro = $('fnReopen');
      if (ro) ro.addEventListener('click', function () { reopenDay(row); });
      return;
    }
    var op = $('fnOpening');
    if (op) op.addEventListener('input', function () { S.opening = op.value; renderClosingKeepFocus('fnOpening'); });
    var modeBox = $('fnMode');
    if (modeBox) modeBox.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-mode]') : null;
      if (!b) return;
      S.mode = b.getAttribute('data-mode'); renderClosing();
    });
    function recompute() {
      var cur = liveView(dayFigures(S.date));
      paintDiff(cur.expectedCash, null, null);
    }
    Array.prototype.forEach.call(v.querySelectorAll('.fn-q'), function (inp) {
      inp.addEventListener('input', function () {
        var d = inp.getAttribute('data-den');
        S.den[d] = inp.value;
        var st = $('fnSt' + d);
        if (st) st.textContent = money(+d * Math.max(0, Math.floor(num(inp.value))));
        recompute();
      });
    });
    var coins = $('fnCoins');
    if (coins) coins.addEventListener('input', function () {
      S.coins = coins.value;
      $('fnStC').textContent = money(Math.max(0, num(coins.value)));
      recompute();
    });
    var direct = $('fnDirect');
    if (direct) direct.addEventListener('input', function () { S.direct = direct.value; recompute(); });
    $('fnNotes').addEventListener('input', function (e) { S.notes = e.target.value; });
    $('fnClose').addEventListener('click', closeDay);
  }
  function renderClosingKeepFocus(id) {
    renderClosing();
    var el = document.getElementById(id);
    if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
  }

  /* ---- close / reopen ---- */
  function closeDay() {
    if (!canClosing()) return denied();
    var date = S.date, today = App.today();
    if (date > today) return App.toast('You cannot close a future date.', 'err');
    if (closingFor(date)) { App.toast('This day is already closed.', 'err'); return renderClosing(); }
    var fig = dayFigures(date), v = liveView(fig);
    if (!hasCountEntry() || (S.mode === 'count' && countedNow() <= 0 && v.expectedCash > 0)) {
      return App.toast('Count the cash in the drawer (or enter the total) before closing.', 'err');
    }
    var counted = countedNow();
    if (counted < 0) return App.toast('Counted cash cannot be negative.', 'err');
    var diff = r2(counted - v.expectedCash);
    var msgs = [];
    var un = unclosedBefore(date);
    if (un.length) msgs.push(un.length + ' earlier day' + (un.length > 1 ? 's are' : ' is') + ' still unclosed (' + un.slice(-3).map(fmtDay).join(', ') + (un.length > 3 ? ', ...' : '') + ').');
    if (diff !== 0) msgs.push('The drawer is ' + (diff < 0 ? 'SHORT' : 'OVER') + ' by ' + money(Math.abs(diff)) + '.' + (S.notes.replace(/\s/g, '') ? '' : ' No note was entered.'));
    var go = function () {
      var rowData = {
        date: date, openingCash: v.openingCash, cashIn: v.cashIn, cashOut: v.cashOut,
        expectedCash: v.expectedCash, countedCash: counted, difference: diff,
        breakdown: fig.recv, refunds: fig.refunds, refundsBy: fig.refundsBy,
        invoicesCount: fig.invoicesCount, billed: fig.billed, collected: fig.collected, dues: fig.dues,
        expensesTotal: fig.expTotal, notes: S.notes.replace(/^\s+|\s+$/g, ''),
        closedBy: username(), closedByName: userLabel(), closedAt: new Date().toISOString(),
        denominations: denomSnapshot()
      };
      if (closingFor(date)) { App.toast('This day is already closed.', 'err'); return renderClosing(); }
      DB.insert('closings', rowData);
      App.toast('Day closed — ' + fmtDay(date) + '.');
      resetCount();
      renderClosing();
    };
    if (!msgs.length) {
      App.confirm('Close ' + fmtDay(date) + ' with counted cash ' + money(counted) + '? The day becomes read-only.').then(function (ok) { if (ok) go(); });
    } else {
      App.confirm(msgs.join(' ') + ' Close ' + fmtDay(date) + ' anyway?').then(function (ok) { if (ok) go(); });
    }
  }
  function reopenDay(row) {
    if (!isAdmin()) return denied();
    var later = closings().filter(function (c) { return c.date > row.date; }).length;
    App.confirm('Reopen ' + fmtDay(row.date) + '? This deletes its closing record (counted ' + money(row.countedCash) + ').' +
      (later ? ' ' + later + ' later closing(s) used it as their opening cash and are not recalculated.' : '')).then(function (ok) {
      if (!ok) return;
      DB.remove('closings', row.id);
      App.toast('Day reopened.');
      resetCount();
      renderClosing();
    });
  }
  function denied() { App.toast('Access denied for your role.', 'err'); App.nav('#/dashboard'); }

  function exportHistoryCsv(list, hm) {
    if (!canClosing()) return denied();
    var rows = [['Date', 'Opening cash', 'Cash in', 'Cash out', 'Expected cash', 'Counted cash', 'Difference', 'Status', 'Invoices', 'Billed', 'Collected', 'Dues', 'Expenses', 'Closed by', 'Closed at', 'Notes']];
    list.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (c) {
      rows.push([c.date, r2(c.openingCash), r2(c.cashIn), r2(c.cashOut), r2(c.expectedCash), r2(c.countedCash), r2(c.difference),
        c.difference < 0 ? 'Short' : (c.difference > 0 ? 'Over' : 'Balanced'), c.invoicesCount, r2(c.billed), r2(c.collected), r2(c.dues), r2(c.expensesTotal),
        c.closedBy, c.closedAt, c.notes || '']);
    });
    downloadCsv('cash-closings-' + (hm || 'all') + '.csv', rows);
  }

  /* ---- closing slip (A4 / 80mm) ---- */
  function printSlip(c, fmt, draft) {
    if (!canClosing()) return denied();
    var s = labSettings();
    var den = c.denominations || {};
    var methods = methodList(c.breakdown || {}, c.refundsBy || {});
    var status = draft ? 'DRAFT - day not closed yet' : 'CLOSED';
    var closedAt = c.closedAt ? App.dt(c.closedAt) : '—';
    var denRows = '';
    if (den.mode === 'direct') denRows = '<tr><td>Total entered directly</td><td></td><td style="text-align:right">' + money(c.countedCash) + '</td></tr>';
    else DENS.concat(['coins']).forEach(function (d) {
      if (d === 'coins') { if (+den.coins) denRows += '<tr><td>Coins</td><td></td><td style="text-align:right">' + money(den.coins) + '</td></tr>'; return; }
      if (+den[d]) denRows += '<tr><td>Rs ' + d.toLocaleString('en-US') + '</td><td style="text-align:right">× ' + den[d] + '</td><td style="text-align:right">' + money(d * den[d]) + '</td></tr>';
    });
    var diffTxt = c.difference === 0 ? 'Balanced' : (c.difference < 0 ? 'SHORT ' : 'OVER ') + (c.difference === 0 ? '' : money(Math.abs(c.difference)));
    var cashRef = (c.refundsBy && c.refundsBy.Cash) || 0;
    var cashExpOnly = r2(c.cashOut - cashRef);
    if (fmt === '80') {
      var line = function (a, b, bold) { return '<div style="display:flex;justify-content:space-between;gap:6px;' + (bold ? 'font-weight:bold;' : '') + '"><span>' + a + '</span><span>' + b + '</span></div>'; };
      var hr = '<div style="border-top:1px dashed #000;margin:5px 0"></div>';
      var html = '<style>@page{size:80mm auto;margin:2mm}body{padding:0!important;font-size:11px}</style>' +
        '<div style="width:72mm;margin:0 auto;font-family:\'Courier New\',monospace;font-size:11px;line-height:1.45;color:#000">' +
        '<div style="text-align:center"><b style="font-size:14px">' + esc(s.labName || 'Optix Medical Sync') + '</b><br>' + esc(s.phone || '') + '</div>' + hr +
        '<div style="text-align:center;font-weight:bold">DAILY CASH CLOSING</div>' +
        '<div style="text-align:center">' + esc(fmtDay(c.date)) + '</div>' +
        '<div style="text-align:center">' + esc(status) + '</div>' + hr +
        line('Opening cash', money(c.openingCash)) + line('+ Cash received', money(c.cashIn)) +
        (cashRef ? line('- Cash refunds', money(cashRef)) : '') + line('- Cash expenses', money(cashExpOnly)) +
        hr + line('Expected cash', money(c.expectedCash), true) + line('Counted cash', money(c.countedCash), true) +
        line(c.difference === 0 ? 'Difference' : (c.difference < 0 ? 'SHORT' : 'OVER'), c.difference === 0 ? money(0) : money(Math.abs(c.difference)), true) + hr +
        methods.map(function (m) { return line(esc(m), money((c.breakdown || {})[m] || 0)); }).join('') + hr +
        line('Invoices', String(c.invoicesCount)) + line('Billed', money(c.billed)) + line('Collected', money(c.collected)) +
        line('Dues', money(c.dues)) + line('Expenses', money(c.expensesTotal)) + hr +
        (c.notes ? '<div>Note: ' + esc(c.notes) + '</div>' + hr : '') +
        '<div>Closed by: ' + esc(c.closedByName || c.closedBy) + '</div><div>At: ' + esc(closedAt) + '</div>' +
        '<div style="margin-top:22px;border-top:1px solid #000;padding-top:2px;text-align:center">Cashier signature</div>' +
        '<div style="margin-top:22px;border-top:1px solid #000;padding-top:2px;text-align:center">Manager signature</div>' +
        '</div>';
      App.print('Cash Closing 80mm ' + c.date, html, { noHeader: true });
      return;
    }
    var T = function (rows) { return '<table>' + rows + '</table>'; };
    var html2 = '<h2 style="text-align:center;letter-spacing:.5px;margin:4px 0 2px">DAILY CASH CLOSING</h2>' +
      '<div style="text-align:center;margin-bottom:10px;color:#555">' + esc(longDay(c.date)) + (draft ? ' &nbsp;&bull;&nbsp; <b style="color:#b45309">DRAFT &mdash; not closed yet</b>' : '') + '</div>' +
      '<div class="pt"><div>Business date<br><b>' + esc(fmtDay(c.date)) + '</b></div><div>Status<br><b>' + (draft ? 'Draft' : 'Closed') + '</b></div>' +
      '<div>Closed by<br><b>' + esc(c.closedByName || c.closedBy) + '</b></div><div>Closed at<br><b>' + esc(closedAt) + '</b></div></div>' +
      '<h3 style="margin:12px 0 4px;font-size:14px">Cash reconciliation</h3>' +
      T('<tr><td>Opening cash</td><td style="text-align:right">' + money(c.openingCash) + '</td></tr>' +
        '<tr><td>+ Cash received</td><td style="text-align:right">' + money(c.cashIn) + '</td></tr>' +
        (cashRef ? '<tr><td>&minus; Cash refunds</td><td style="text-align:right">' + money(cashRef) + '</td></tr>' : '') +
        '<tr><td>&minus; Cash expenses paid</td><td style="text-align:right">' + money(cashExpOnly) + '</td></tr>' +
        '<tr><th>Expected cash in drawer</th><th style="text-align:right">' + money(c.expectedCash) + '</th></tr>' +
        '<tr><th>Counted cash</th><th style="text-align:right">' + money(c.countedCash) + '</th></tr>' +
        '<tr><th>Difference</th><th style="text-align:right;color:' + (c.difference < 0 ? '#b91c1c' : (c.difference > 0 ? '#047857' : '#111')) + '">' + esc(diffTxt) + '</th></tr>') +
      '<h3 style="margin:12px 0 4px;font-size:14px">Collections by payment method</h3>' +
      T('<tr><th>Method</th><th style="text-align:right">Amount</th></tr>' +
        (methods.map(function (m) { return '<tr><td>' + esc(m) + '</td><td style="text-align:right">' + money((c.breakdown || {})[m] || 0) + '</td></tr>'; }).join('') || '<tr><td colspan="2">No payments</td></tr>') +
        (c.refunds ? '<tr><td>Refunds</td><td style="text-align:right">&minus; ' + money(c.refunds) + '</td></tr>' : '') +
        '<tr><th>Net collected</th><th style="text-align:right">' + money(c.collected) + '</th></tr>') +
      '<h3 style="margin:12px 0 4px;font-size:14px">Day summary</h3>' +
      T('<tr><td>Invoices created</td><td style="text-align:right">' + c.invoicesCount + '</td></tr>' +
        '<tr><td>Billed</td><td style="text-align:right">' + money(c.billed) + '</td></tr>' +
        '<tr><td>Dues on the day\'s invoices</td><td style="text-align:right">' + money(c.dues) + '</td></tr>' +
        '<tr><td>Expenses (all methods)</td><td style="text-align:right">' + money(c.expensesTotal) + '</td></tr>') +
      (denRows ? '<h3 style="margin:12px 0 4px;font-size:14px">Cash count</h3>' + T('<tr><th>Denomination</th><th style="text-align:right">Qty</th><th style="text-align:right">Amount</th></tr>' + denRows +
        '<tr><th colspan="2">Total counted</th><th style="text-align:right">' + money(c.countedCash) + '</th></tr>') : '') +
      (c.notes ? '<div class="note" style="border-top:0"><b>Notes:</b> ' + esc(c.notes) + '</div>' : '') +
      '<div class="pf" style="margin-top:46px;gap:18px">' +
      ['Prepared by (Cashier)', 'Verified by (Manager)', 'Owner / Admin'].map(function (t) {
        return '<div style="flex:1;border-top:1px solid #333;padding-top:5px;text-align:center;color:#333">' + t + '</div>';
      }).join('') + '</div>';
    App.print('Cash Closing ' + c.date, html2);
  }

  /* ============================================================
     B. PROFIT & LOSS  (admin only)
     ============================================================ */
  function monday(s) { var d = parseDay(s), k = (d.getDay() + 6) % 7; return addDays(s, -k); }
  function presetRange(p) {
    var t = App.today();
    if (p === 'today') return [t, t];
    if (p === 'thisWeek') return [monday(t), t];
    if (p === 'thisMonth') return [t.slice(0, 8) + '01', t];
    if (p === 'lastMonth') { var e = addDays(t.slice(0, 8) + '01', -1); return [e.slice(0, 8) + '01', e]; }
    if (p === 'thisYear') return [t.slice(0, 4) + '-01-01', t];
    return null;
  }
  var PRESETS = [['today', 'Today'], ['thisWeek', 'This week'], ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['thisYear', 'This year'], ['custom', 'Custom range']];
  function plInit() {
    if (!P.from) { var r = presetRange(P.preset); P.from = r[0]; P.to = r[1]; }
  }
  function inRange(d, a, b) { return d && d >= a && d <= b; }
  function docById() { var m = {}; DB.all('doctors').forEach(function (d) { m[d.id] = d; }); return m; }

  function computePL(from, to, basis) {
    var cash = basis === 'cash';
    var invAll = DB.all('invoices'), payAll = DB.all('payments'), expAll = DB.all('expenses');
    var docs = docById();
    var invs = invAll.filter(function (i) { return inRange(invDay(i), from, to); });
    var pays = payAll.filter(function (p) { return inRange(payDay(p), from, to); });
    var exps = expAll.filter(function (e) { return inRange(expDay(e), from, to); });
    var revenue = cash ? sum(pays, signedAmt) : sum(invs, function (i) { return +i.total || 0; });
    var billed = sum(invs, function (i) { return +i.total || 0; });
    var collected = sum(pays, signedAmt);
    var byCat = {};
    exps.forEach(function (e) { var k = e.category || 'Other'; byCat[k] = (byCat[k] || 0) + (+e.amount || 0); });
    /* doctor commission: accrued on billed invoices (accrual) or actually paid out (cash) */
    var commission = 0, commByDay = {};
    var hasComm = false;
    if (cash) {
      DB.all('doctors').forEach(function (d) {
        (d.commissionPaid || []).forEach(function (x) {
          var dd = toDay(x.date);
          if (inRange(dd, from, to)) { var a = +x.amount || 0; commission += a; commByDay[dd] = (commByDay[dd] || 0) + a; hasComm = true; }
        });
      });
    } else {
      var tById = App.testsById();
      invs.forEach(function (i) {
        var d = i.doctorId ? docs[i.doctorId] : null;
        var a = d ? App.commissionOf(i, d, tById) : 0;
        if (a > 0) { commission += a; commByDay[invDay(i)] = (commByDay[invDay(i)] || 0) + a; hasComm = true; }
      });
    }
    if (commission > 0) byCat['Doctor commission'] = commission;
    /* tests sent to reference labs: accrued when sent (accrual) or when actually paid to the reference lab (cash) */
    var outsrc = 0;
    if (cash) {
      (DB.all('ref_labs') || []).forEach(function (l) { (l.payments || []).forEach(function (x) { var dd = toDay(x.date); if (inRange(dd, from, to)) { var a2 = +x.amount || 0; outsrc += a2; commByDay[dd] = (commByDay[dd] || 0) + a2; } }); });
    } else {
      var liveInv = {}; (DB.all('invoices') || []).forEach(function (i) { liveInv[i.id] = 1; });
      (DB.all('outsourced') || []).forEach(function (j) { if (!liveInv[j.invoiceId] || (j.status !== 'sent' && j.status !== 'received')) return; var dd = toDay(j.sentAt); if (inRange(dd, from, to)) { var a3 = +j.cost || 0; outsrc += a3; commByDay[dd] = (commByDay[dd] || 0) + a3; } });
    }
    if (outsrc > 0) byCat['Outsourced tests'] = outsrc;
    var opExp = sum(exps, function (e) { return +e.amount || 0; });
    var expTotal = opExp + commission + outsrc;
    var net = revenue - expTotal;
    var dues = sum(invs, function (i) { return Math.max(0, +i.due || 0); });
    return {
      from: from, to: to, basis: basis, invs: invs, pays: pays, exps: exps,
      revenue: r2(revenue), billed: r2(billed), collected: r2(collected), expTotal: r2(expTotal), opExp: r2(opExp),
      commission: r2(commission), hasComm: hasComm, byCat: byCat, net: r2(net),
      margin: revenue > 0 ? net / revenue * 100 : null, dues: r2(dues),
      count: invs.length, avg: invs.length ? billed / invs.length : 0, commByDay: commByDay
    };
  }

  function buildBuckets(from, to, cur) {
    var span = daysBetween(from, to) + 1;
    var monthly = span > 62;
    var keys = [], map = {};
    function keyOf(d) { return monthly ? d.slice(0, 7) : d; }
    if (monthly) {
      var y = +from.slice(0, 4), m = +from.slice(5, 7), ey = +to.slice(0, 4), em = +to.slice(5, 7);
      while (y < ey || (y === ey && m <= em)) { var k = y + '-' + pad(m); keys.push(k); map[k] = { key: k, rev: 0, exp: 0 }; m++; if (m > 12) { m = 1; y++; } }
    } else {
      for (var i = 0; i < span; i++) { var dk = addDays(from, i); keys.push(dk); map[dk] = { key: dk, rev: 0, exp: 0 }; }
    }
    var cash = cur.basis === 'cash';
    if (cash) cur.pays.forEach(function (p) { var b = map[keyOf(payDay(p))]; if (b) b.rev += signedAmt(p); });
    else cur.invs.forEach(function (iv) { var b = map[keyOf(invDay(iv))]; if (b) b.rev += (+iv.total || 0); });
    cur.exps.forEach(function (e) { var b = map[keyOf(expDay(e))]; if (b) b.exp += (+e.amount || 0); });
    Object.keys(cur.commByDay).forEach(function (d) { var b = map[keyOf(d)]; if (b) b.exp += cur.commByDay[d]; });
    return { monthly: monthly, list: keys.map(function (k) { return map[k]; }) };
  }

  /* ---- hand-written SVG charts ---- */
  var C_REV = '#2563eb', C_EXP = '#d97706';
  function niceMax(v) {
    if (v <= 0) return 1000;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p;
    var m = n <= 1 ? 1 : (n <= 2 ? 2 : (n <= 2.5 ? 2.5 : (n <= 5 ? 5 : 10)));
    return m * p;
  }
  function short(n) {
    n = Math.round(n);
    if (n >= 10000000) return (n / 10000000).toFixed(n % 10000000 ? 1 : 0) + 'Cr';
    if (n >= 100000) return (n / 100000).toFixed(n % 100000 ? 1 : 0) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k';
    return String(n);
  }
  function topRound(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function bucketLabel(k, monthly) {
    if (monthly) return MON[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4);
    return (+k.slice(8, 10)) + ' ' + MON[+k.slice(5, 7) - 1];
  }
  function trendSvg(bk, W, H, interactive) {
    var L = 50, R = 8, T = 10, B = 28, iw = W - L - R, ih = H - T - B, n = bk.list.length;
    var mx = 0; bk.list.forEach(function (b) { mx = Math.max(mx, b.rev, b.exp); });
    var top = niceMax(mx), band = iw / n;
    var bw = Math.max(2, Math.min(20, (band - 6) / 2 - 1));
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenue versus expenses" font-family="inherit">';
    for (var g = 0; g <= 4; g++) {
      var gy = T + ih - ih * g / 4;
      out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + (g === 0 ? '#94a3b8' : '#e8eef4') + '" stroke-width="1"/>' +
        '<text x="' + (L - 7) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="#64748b">' + short(top * g / 4) + '</text>';
    }
    var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 54))));
    bk.list.forEach(function (b, i) {
      var cx = L + band * i + band / 2;
      var hr = ih * b.rev / top, he = ih * b.exp / top;
      var x1 = cx - bw - 1, x2 = cx + 1;
      out += '<path d="' + topRound(x1, T + ih - hr, bw, hr, 4) + '" fill="' + C_REV + '"/>' +
        '<path d="' + topRound(x2, T + ih - he, bw, he, 4) + '" fill="' + C_EXP + '"/>';
      if (i % every === 0) out += '<text x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle" font-size="11" fill="#64748b">' + esc(bucketLabel(b.key, bk.monthly)) + '</text>';
      if (interactive) out += '<rect class="fn-hit" data-i="' + i + '" x="' + (L + band * i) + '" y="' + T + '" width="' + band + '" height="' + ih + '" fill="transparent"/>';
    });
    return out + '</svg>';
  }
  function catSvg(rows, W) {
    var rowH = 42, H = Math.max(rowH, rows.length * rowH) + 4, total = sum(rows, function (r) { return r.v; }) || 1, mx = rows.length ? rows[0].v : 1;
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Expenses by category" font-family="inherit">';
    rows.forEach(function (r, i) {
      var y = i * rowH, bw = Math.max(3, (W - 2) * r.v / mx);
      var fill = r.name === 'Doctor commission' ? '#7c3aed' : C_EXP;
      out += '<text x="0" y="' + (y + 14) + '" font-size="13" font-weight="700" fill="#0f1e2e">' + esc(r.name) + '</text>' +
        '<text x="' + W + '" y="' + (y + 14) + '" text-anchor="end" font-size="13" fill="#334155">' + esc(money(r.v)) + '  <tspan fill="#64748b">' + Math.round(r.v / total * 1000) / 10 + '%</tspan></text>' +
        '<rect x="0" y="' + (y + 21) + '" width="' + (W) + '" height="8" rx="4" fill="#eef2f7"/>' +
        '<rect x="0" y="' + (y + 21) + '" width="' + bw + '" height="8" rx="4" fill="' + fill + '"><title>' + esc(r.name + ': ' + money(r.v)) + '</title></rect>';
    });
    return out + '</svg>';
  }

  function deltaHtml(cur, prev, goodUp, pp) {
    cur = +cur || 0; prev = +prev || 0;
    var r, txt;
    if (pp) { r = Math.round((cur - prev) * 10) / 10; txt = Math.abs(r) + ' pp'; }
    else {
      if (!prev) return cur ? '<span class="fn-d fn-d-n">new</span> vs prev' : '<span class="fn-d fn-d-n">no change</span>';
      r = Math.round((cur - prev) / Math.abs(prev) * 1000) / 10; txt = Math.abs(r) + '%';
    }
    if (r === 0) return '<span class="fn-d fn-d-n">• 0%</span> vs prev';
    var cls = ((r > 0) === goodUp) ? 'g' : 'r';
    return '<span class="fn-d fn-d-' + cls + '">' + (r > 0 ? '▲' : '▼') + ' ' + txt + '</span> vs prev';
  }

  function testRows(invs) {
    var map = {};
    invs.forEach(function (iv) {
      var sub = +iv.subtotal || sum(iv.items || [], function (it) { return +it.price || 0; });
      var f = sub > 0 ? (+iv.total || 0) / sub : 1;
      (iv.items || []).forEach(function (it) {
        var k = it.code || it.name || '—';
        if (!map[k]) map[k] = { code: it.code || '', name: it.name || k, count: 0, rev: 0 };
        map[k].count++; map[k].rev += (+it.price || 0) * f;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.rev - a.rev; });
  }
  function doctorRows(invs) {
    var tById = App.testsById();
    var docs = docById(), map = {}, self = { name: 'Self / no referral', n: 0, billed: 0, pct: 0, comm: 0 };
    invs.forEach(function (iv) {
      var t = +iv.total || 0;
      if (!iv.doctorId) { self.n++; self.billed += t; return; }
      var d = docs[iv.doctorId];
      if (!map[iv.doctorId]) map[iv.doctorId] = { name: d ? d.name : 'Unknown doctor', n: 0, billed: 0, pct: d ? (+d.commissionPct || 0) : 0, comm: 0 };
      var m = map[iv.doctorId]; m.n++; m.billed += t; m.comm += d ? App.commissionOf(iv, d, tById) : 0; m.pct = m.billed > 0 ? Math.round(m.comm / m.billed * 1000) / 10 : m.pct;
    });
    var l = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.billed - a.billed; });
    if (self.n) l.push(self);
    return l;
  }
  function methodRows(pays) {
    var map = {}, tot = 0;
    pays.forEach(function (p) {
      var m = methodOf(p); if (!map[m]) map[m] = { name: m, n: 0, amt: 0 };
      map[m].n++; map[m].amt += signedAmt(p); tot += signedAmt(p);
    });
    return { list: Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.amt - a.amt; }), total: tot };
  }
  function agingRows() {
    var t = App.today(), b = [{ name: '0–30 days', n: 0, amt: 0 }, { name: '31–60 days', n: 0, amt: 0 }, { name: '60+ days', n: 0, amt: 0 }];
    DB.all('invoices').forEach(function (iv) {
      var due = r2(+iv.due || 0);
      if (due <= 0) return;
      var d = invDay(iv), age = d ? daysBetween(d, t) : 0, i = age <= 30 ? 0 : (age <= 60 ? 1 : 2);
      b[i].n++; b[i].amt += due;
    });
    return b;
  }

  function renderProfit() {
    plInit();
    var from = P.from, to = P.to, basis = P.basis;
    if (from > to) { var tmp = from; from = to; to = tmp; P.from = from; P.to = to; }
    var cur = computePL(from, to, basis);
    var span = daysBetween(from, to) + 1;
    var pTo = addDays(from, -1), pFrom = addDays(from, -span);
    var prev = computePL(pFrom, pTo, basis);
    var allDue = r2(sum(DB.all('invoices'), function (i) { return Math.max(0, +i.due || 0); }));
    var openInv = DB.all('invoices').filter(function (i) { return (+i.due || 0) > 0; }).length;
    var cash = basis === 'cash';
    var netG = cur.net >= 0;

    var kpis =
      stat(IC.in, 'green', cash ? 'Revenue (collected)' : 'Revenue (billed)', money(cur.revenue), deltaHtml(cur.revenue, prev.revenue, true)) +
      stat(IC.receipt, 'red', 'Expenses', money(cur.expTotal), deltaHtml(cur.expTotal, prev.expTotal, false) + (cur.commission ? '<br><span class="fn-note">incl. ' + money(cur.commission) + ' doctor commission</span>' : '')) +
      stat(IC.trend, netG ? 'brand' : 'red', 'Net ' + (netG ? 'Profit' : 'Loss'), moneyN(cur.net), deltaHtml(cur.net, prev.net, true), netG ? '' : 'color:var(--red)') +
      stat(IC.pct, 'blue', 'Margin', cur.margin === null ? '—' : (Math.round(cur.margin * 10) / 10) + '%', cur.margin === null || prev.margin === null ? '<span class="fn-d fn-d-n">no comparison</span>' : deltaHtml(cur.margin, prev.margin, true, true)) +
      stat(IC.wallet, 'amber', 'Outstanding Dues', money(cur.dues), 'on this period\'s bills &bull; ' + deltaHtml(cur.dues, prev.dues, false) + '<br><span class="fn-note">' + money(allDue) + ' owed in total (' + openInv + ' invoices)</span>') +
      stat(IC.file, 'brand', 'Average Invoice', money(cur.avg), cur.count + ' invoice' + (cur.count === 1 ? '' : 's') + ' &bull; ' + deltaHtml(cur.avg, prev.avg, true));

    var bk = buildBuckets(from, to, cur);
    var catList = Object.keys(cur.byCat).map(function (k) { return { name: k, v: cur.byCat[k] }; }).sort(function (a, b) { return b.v - a.v; });

    var tests = testRows(cur.invs).slice(0, 10);
    var tRows = tests.map(function (t, i) {
      return '<tr><td><strong>' + (i + 1) + '. ' + esc(t.name) + '</strong>' + (t.code ? ' <span class="fn-note">' + esc(t.code) + '</span>' : '') + '</td><td class="num">' + t.count + '</td><td class="num">' + money(t.rev) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">' + App.empty('No invoices in this period.') + '</td></tr>';
    var docs = doctorRows(cur.invs);
    var dRows = docs.map(function (d) {
      return '<tr><td><strong>' + esc(d.name) + '</strong></td><td class="num">' + d.n + '</td><td class="num">' + money(d.billed) + '</td><td class="num">' + (d.pct ? d.pct + '%' : '—') + '</td><td class="num">' + (d.comm ? money(d.comm) : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="5">' + App.empty('No referrals in this period.') + '</td></tr>';
    var mm = methodRows(cur.pays);
    var mRows = mm.list.map(function (m) {
      return '<tr><td><strong>' + esc(m.name) + '</strong></td><td class="num">' + m.n + '</td><td class="num">' + money(m.amt) + '</td><td class="num">' + (mm.total ? Math.round(m.amt / mm.total * 1000) / 10 : 0) + '%</td></tr>';
    }).join('') || '<tr><td colspan="4">' + App.empty('No payments in this period.') + '</td></tr>';
    var ag = agingRows(), agTotal = sum(ag, function (b) { return b.amt; });
    var aRows = ag.map(function (b) {
      return '<tr><td><strong>' + b.name + '</strong></td><td class="num">' + b.n + '</td><td class="num">' + (b.amt ? '<span class="' + (b.name === '60+ days' ? 'fn-neg' : '') + '">' + money(b.amt) + '</span>' : money(0)) + '</td><td class="num">' + (agTotal ? Math.round(b.amt / agTotal * 1000) / 10 : 0) + '%</td></tr>';
    }).join('') + '<tr class="fn-tot"><td>Total outstanding</td><td class="num">' + sum(ag, function (b) { return b.n; }) + '</td><td class="num">' + money(agTotal) + '</td><td class="num">100%</td></tr>';

    var presetBtns = PRESETS.map(function (p) {
      return '<button class="fn-pill' + (P.preset === p[0] ? ' on' : '') + '" data-preset="' + p[0] + '">' + p[1] + '</button>';
    }).join('');
    var custom = P.preset === 'custom' ?
      '<div class="fn-date"><input class="input" type="date" id="plFrom" value="' + esc(P.from) + '"><span class="fn-note">to</span><input class="input" type="date" id="plTo" value="' + esc(P.to) + '"></div>' : '';

    view().innerHTML = '<div class="fn-page">' + tabsHtml('profit') +
      '<div class="stat-grid fn-kpi">' + kpis + '</div>' +
      '<div class="card" style="margin-bottom:10px"><div class="card-b" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">' +
      '<div class="fn-seg2">' + presetBtns + '</div>' + custom + '<span style="flex:1"></span>' +
      '<div class="fn-seg" id="plBasis"><button data-basis="cash" class="' + (cash ? 'on' : '') + '">Cash basis</button><button data-basis="accrual" class="' + (!cash ? 'on' : '') + '">Accrual basis</button></div>' +
      '<button class="btn btn-sm" id="plCsv">' + App.icon('download', 14) + ' Export CSV</button>' +
      '<button class="btn btn-sm" id="plPrint">' + App.icon('printer', 14) + ' Print</button></div></div>' +
      '<div class="fn-note" style="margin:0 2px 16px">' + esc(fmtDay(from)) + ' – ' + esc(fmtDay(to)) + ' (' + span + ' day' + (span === 1 ? '' : 's') + ') compared with ' + esc(fmtDay(pFrom)) + ' – ' + esc(fmtDay(pTo)) + '. ' +
      (cash ? 'Cash basis: revenue is money actually collected (net of refunds); doctor commission counts only when paid.' : 'Accrual basis: revenue is the value billed (after discounts); doctor commission is accrued on each referred invoice.') + '</div>' +
      '<div class="fn-grid2 fn-wide">' +
      '<div class="card"><div class="card-h"><h3>' + (bk.monthly ? 'Monthly' : 'Daily') + ' revenue vs expenses</h3></div><div class="card-b">' +
      '<div class="fn-leg"><span><i style="background:' + C_REV + '"></i>Revenue</span><span><i style="background:' + C_EXP + '"></i>Expenses</span></div>' +
      '<div class="fn-chart" id="plTrend"></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Expenses by category</h3></div><div class="card-b">' +
      (catList.length ? '<div class="fn-chart" id="plCats"></div>' : App.empty('No expenses in this period.')) + '</div></div></div>' +
      '<div class="fn-grid2">' +
      '<div class="card"><div class="card-h"><h3>Top 10 tests by revenue</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr><th>Test</th><th style="text-align:right">Count</th><th style="text-align:right">Revenue</th></tr></thead><tbody>' + tRows + '</tbody></table></div>' +
      '<div class="fn-note" style="padding:8px 16px 12px">Billed invoices in the period, net of discounts.</div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Revenue by doctor / referral</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr><th>Doctor</th><th style="text-align:right">Referrals</th><th style="text-align:right">Billed</th><th style="text-align:right">Rate</th><th style="text-align:right">Commission</th></tr></thead><tbody>' + dRows + '</tbody></table></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Revenue by payment method</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr><th>Method</th><th style="text-align:right">Payments</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th></tr></thead><tbody>' + mRows + '</tbody></table></div></div></div>' +
      '<div class="card"><div class="card-h"><h3>Receivables aging</h3></div><div class="card-b flush"><div class="tbl-wrap"><table class="table"><thead><tr><th>Age of invoice</th><th style="text-align:right">Invoices</th><th style="text-align:right">Outstanding</th><th style="text-align:right">Share</th></tr></thead><tbody>' + aRows + '</tbody></table></div>' +
      '<div class="fn-note" style="padding:8px 16px 12px">All unpaid balances today, by invoice age. Not limited to the period.</div></div></div>' +
      '</div></div>';

    paintCharts(bk, catList);
    wireProfit(cur, prev, bk, catList, tests, docs, mm, ag);
  }

  function paintCharts(bk, catList) {
    var host = document.getElementById('plTrend');
    if (host) {
      var W = Math.max(300, Math.round(host.clientWidth || 600)), H = W < 480 ? 230 : 280;
      var hasData = bk.list.some(function (b) { return b.rev || b.exp; });
      if (!hasData) host.innerHTML = App.empty('No revenue or expenses in this period.');
      else {
        host.innerHTML = trendSvg(bk, W, H, true) + '<div class="fn-tip" id="plTip"></div>';
        var tip = document.getElementById('plTip');
        var show = function (e) {
          var t = e.target;
          if (!t || !t.getAttribute || t.getAttribute('class') !== 'fn-hit') { tip.style.display = 'none'; return; }
          var b = bk.list[+t.getAttribute('data-i')];
          tip.innerHTML = '<b>' + esc(bucketLabel(b.key, bk.monthly)) + '</b><span style="color:#93c5fd">■</span> Revenue ' + money(b.rev) + '<br><span style="color:#fbbf24">■</span> Expenses ' + money(b.exp) + '<br>Net ' + sgnMoney(b.rev - b.exp);
          tip.style.display = 'block';
          var hr = host.getBoundingClientRect(), tr = t.getBoundingClientRect();
          var z = (hr.width && host.clientWidth) ? hr.width / host.clientWidth : 1;
          var left = (tr.left - hr.left) / z + tr.width / z / 2 - tip.offsetWidth / 2;
          left = Math.max(0, Math.min(host.clientWidth - tip.offsetWidth, left));
          tip.style.left = left + 'px';
          tip.style.top = '0px';
        };
        host.addEventListener('mousemove', show);
        host.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
        host.addEventListener('click', show);
      }
    }
    var ch = document.getElementById('plCats');
    if (ch) ch.innerHTML = catSvg(catList, Math.max(260, Math.round(ch.clientWidth || 360)));
  }

  function wireProfit(cur, prev, bk, catList, tests, docs, mm, ag) {
    var v = view();
    Array.prototype.forEach.call(v.querySelectorAll('[data-preset]'), function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-preset');
        P.preset = p;
        var r = presetRange(p);
        if (r) { P.from = r[0]; P.to = r[1]; }
        renderProfit();
      });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-basis]'), function (b) {
      b.addEventListener('click', function () { P.basis = b.getAttribute('data-basis'); renderProfit(); });
    });
    var f = document.getElementById('plFrom'), t = document.getElementById('plTo');
    if (f) f.addEventListener('change', function () { if (f.value) { P.from = f.value; renderProfit(); } });
    if (t) t.addEventListener('change', function () { if (t.value) { P.to = t.value; renderProfit(); } });
    document.getElementById('plCsv').addEventListener('click', function () { exportPlCsv(cur, prev, bk, catList, tests, docs, mm, ag); });
    document.getElementById('plPrint').addEventListener('click', function () { printPl(cur, prev, bk, catList, tests, docs, mm, ag); });
    if (!v.__fnResize) {
      v.__fnResize = true;
      var tm = null;
      window.addEventListener('resize', function () {
        clearTimeout(tm);
        tm = setTimeout(function () {
          if (document.getElementById('plTrend') && canProfit()) renderProfit();
        }, 250);
      });
    }
  }

  function plTitle(cur) { return (cur.basis === 'cash' ? 'Cash basis' : 'Accrual basis') + ', ' + cur.from + ' to ' + cur.to; }
  function exportPlCsv(cur, prev, bk, catList, tests, docs, mm, ag) {
    if (!canProfit()) return denied();
    var rows = [['Profit & Loss'], ['Period', cur.from + ' to ' + cur.to], ['Basis', cur.basis === 'cash' ? 'Cash (collected)' : 'Accrual (billed)'], [],
      ['Summary', 'This period', 'Previous period'],
      ['Revenue', cur.revenue, prev.revenue], ['Expenses (total)', cur.expTotal, prev.expTotal]];
    rows.push(['Net profit', cur.net, prev.net]);
    rows.push(['Margin %', cur.margin === null ? '' : Math.round(cur.margin * 10) / 10, prev.margin === null ? '' : Math.round(prev.margin * 10) / 10]);
    rows.push(['Outstanding dues (period bills)', cur.dues, prev.dues], ['Invoices', cur.count, prev.count], ['Average invoice', r2(cur.avg), r2(prev.avg)], [],
      ['Expenses by category', 'Amount']);
    catList.forEach(function (c) { rows.push([c.name, r2(c.v)]); });
    rows.push([], ['Trend (' + (bk.monthly ? 'monthly' : 'daily') + ')', 'Revenue', 'Expenses', 'Net']);
    bk.list.forEach(function (b) { rows.push([b.key, r2(b.rev), r2(b.exp), r2(b.rev - b.exp)]); });
    rows.push([], ['Top 10 tests', 'Count', 'Revenue']);
    tests.forEach(function (t) { rows.push([t.name, t.count, r2(t.rev)]); });
    rows.push([], ['Doctor / referral', 'Referrals', 'Billed', 'Rate %', 'Commission']);
    docs.forEach(function (d) { rows.push([d.name, d.n, r2(d.billed), d.pct, r2(d.comm)]); });
    rows.push([], ['Payment method', 'Payments', 'Amount']);
    mm.list.forEach(function (m) { rows.push([m.name, m.n, r2(m.amt)]); });
    rows.push([], ['Receivables aging (today)', 'Invoices', 'Outstanding']);
    ag.forEach(function (b) { rows.push([b.name, b.n, r2(b.amt)]); });
    downloadCsv('profit-loss-' + cur.basis + '-' + cur.from + '-to-' + cur.to + '.csv', rows);
  }
  function printPl(cur, prev, bk, catList, tests, docs, mm, ag) {
    if (!canProfit()) return denied();
    var tb = function (head, body) { return '<table><tr>' + head.map(function (h, i) { return '<th' + (i ? ' style="text-align:right"' : '') + '>' + h + '</th>'; }).join('') + '</tr>' + body + '</table>'; };
    var td = function (cells) { return '<tr>' + cells.map(function (c, i) { return '<td' + (i ? ' style="text-align:right"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; };
    var hasData = bk.list.some(function (b) { return b.rev || b.exp; });
    var html = '<h2 style="text-align:center;margin:4px 0 2px">PROFIT &amp; LOSS STATEMENT</h2>' +
      '<div style="text-align:center;color:#555;margin-bottom:10px">' + esc(plTitle(cur)) + '</div>' +
      tb(['Summary', 'This period', 'Previous period'],
        td(['Revenue', money(cur.revenue), money(prev.revenue)]) + td(['Expenses', money(cur.expTotal), money(prev.expTotal)]) +
        td(['<b>Net ' + (cur.net >= 0 ? 'profit' : 'loss') + '</b>', '<b>' + moneyN(cur.net) + '</b>', moneyN(prev.net)]) +
        td(['Margin', cur.margin === null ? '—' : (Math.round(cur.margin * 10) / 10) + '%', prev.margin === null ? '—' : (Math.round(prev.margin * 10) / 10) + '%']) +
        td(['Outstanding dues (period bills)', money(cur.dues), money(prev.dues)]) + td(['Invoices / average', cur.count + ' / ' + money(cur.avg), prev.count + ' / ' + money(prev.avg)])) +
      (hasData ? '<h3 style="margin:14px 0 4px;font-size:14px">' + (bk.monthly ? 'Monthly' : 'Daily') + ' revenue vs expenses</h3>' +
        '<div style="font-size:11px;margin-bottom:2px"><span style="color:' + C_REV + '">■</span> Revenue &nbsp; <span style="color:' + C_EXP + '">■</span> Expenses</div>' + trendSvg(bk, 720, 240, false) : '') +
      '<h3 style="margin:14px 0 4px;font-size:14px">Expenses by category</h3>' +
      tb(['Category', 'Amount'], catList.map(function (c) { return td([esc(c.name), money(c.v)]); }).join('') || td(['None', money(0)])) +
      '<h3 style="margin:14px 0 4px;font-size:14px">Top 10 tests by revenue</h3>' +
      tb(['Test', 'Count', 'Revenue'], tests.map(function (t) { return td([esc(t.name), t.count, money(t.rev)]); }).join('') || td(['None', '', ''])) +
      '<h3 style="margin:14px 0 4px;font-size:14px">Revenue by doctor / referral</h3>' +
      tb(['Doctor', 'Referrals', 'Billed', 'Rate', 'Commission'], docs.map(function (d) { return td([esc(d.name), d.n, money(d.billed), d.pct ? d.pct + '%' : '—', d.comm ? money(d.comm) : '—']); }).join('') || td(['None', '', '', '', ''])) +
      '<h3 style="margin:14px 0 4px;font-size:14px">Revenue by payment method</h3>' +
      tb(['Method', 'Payments', 'Amount'], mm.list.map(function (m) { return td([esc(m.name), m.n, money(m.amt)]); }).join('') || td(['None', '', ''])) +
      '<h3 style="margin:14px 0 4px;font-size:14px">Receivables aging (as of today)</h3>' +
      tb(['Age', 'Invoices', 'Outstanding'], ag.map(function (b) { return td([b.name, b.n, money(b.amt)]); }).join(''));
    App.print('Profit and Loss ' + cur.from + ' to ' + cur.to, html);
  }

  /* ============================================================
     routing
     ============================================================ */
  function show(tab) {
    if (!canClosing()) return denied();
    ensureCss();
    if (tab === 'profit') {
      if (!canProfit()) { App.toast('The Profit & Loss report is for admins only.', 'err'); App.nav('#/finance'); return; }
      return renderProfit();
    }
    renderClosing();
  }
  App.route('#/finance', function () { show('closing'); });
  App.route('#/finance/:tab', function (p) { show(p && p.tab === 'profit' ? 'profit' : 'closing'); });
})();
