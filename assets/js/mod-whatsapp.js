/* Optix Medical Sync — WhatsApp Center (#/whatsapp, admin + reception)
   Includes:
   - 📤 Ready-to-send reports (one click / bulk)
   - 📋 Message log with retry & search
   - 🌙 Daily Night Digest on Owner's WhatsApp (#/whatsapp/digest & #/digest)
   - ⚙️ Editable message templates + sending rules (#/whatsapp/templates)
*/
(function () {
  'use strict';
  var esc = App.esc;
  var tab = 'ready', sel = {}, logF = { status: '', kind: '', q: '' }, tplDraft = null;
  var digestDate = '';
  var digestOpts = { fin: true, exp: true, dues: true, ops: true, crit: true, home: true, docs: true };

  var CSS = '' +
    '.wc-cur{display:flex;align-items:baseline;gap:10px;margin-bottom:14px}.wc-cur b{font-size:17px;font-weight:800;color:var(--brand)}.wc-cur span{font-size:13px;color:var(--muted)}' +
    '.wc-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}' +
    '.wc-tabs button{border:1px solid var(--bd);background:#fff;border-radius:99px;padding:8px 18px;font-weight:700;font-size:13.5px;color:var(--ink2);cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;transition:all .15s}' +
    '.wc-tabs button:hover{background:#f8fafc;border-color:#cbd5e1}' +
    '.wc-tabs button.on{background:var(--brand);color:#fff;border-color:var(--brand)}.wc-tabs b{margin-left:6px;font-size:12px;opacity:.85}' +
    '.wc-st{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.wc-st .card{padding:14px 16px}.wc-st .k{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}.wc-st b{display:block;font-size:24px;font-weight:800;margin-top:4px}' +
    '.wc-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap}' +
    '.wc-chip.g{background:#e6f7f0;color:#047857}.wc-chip.r{background:#fdecec;color:#b91c1c}.wc-chip.o{background:#fef4e2;color:#b45309}.wc-chip.n{background:#f1f5f9;color:#475569}.wc-chip.b{background:#e8f0fe;color:#1d4ed8}' +
    '.wc-sub{font-size:12px;color:var(--muted)}.wc-tests{max-width:260px;font-size:13px;color:var(--ink2)}' +
    '.wc-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--line2)}.wc-bar .grow{flex:1}' +
    '.wc-tpl{display:grid;grid-template-columns:1.2fr 1fr;gap:18px}.wc-tpl textarea{width:100%;min-height:190px;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical}' +
    '.wc-ph{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px}.wc-ph button{border:1px dashed #9db0d3;background:#f4f7fc;border-radius:8px;padding:4px 9px;font-size:12px;font-weight:700;color:#1e3a8a;cursor:pointer;font-family:inherit}' +
    '.wc-bub{background:#e7ffdb;border:1px solid #cfe9c3;border-radius:14px 14px 14px 4px;padding:12px 14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.08)}' +
    '.wc-rules label.r{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-bottom:12px;cursor:pointer}.wc-rules input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}' +
    /* Night Digest CSS */
    '.wnd-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;background:#fff;padding:14px 18px;border-radius:14px;border:1px solid var(--bd)}' +
    '.wnd-date-wrap{display:flex;align-items:center;gap:6px}' +
    '.wnd-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}' +
    '.wnd-kpi{background:#fff;border:1px solid var(--bd);border-radius:14px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.03)}' +
    '.wnd-kpi .k{font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}' +
    '.wnd-kpi b{display:block;font-size:23px;font-weight:900;margin:4px 0 2px}' +
    '.wnd-kpi .sub{font-size:12px;color:var(--muted)}' +
    '.wnd-grid{display:grid;grid-template-columns:430px 1fr;gap:20px;align-items:start}' +
    '.wnd-phone{background:#0b141a;border-radius:36px;padding:12px;box-shadow:0 20px 40px -10px rgba(0,0,0,.35),0 0 0 2px #222d34;width:100%;max-width:430px;margin:0 auto}' +
    '.wnd-screen{background:#e5ddd5;border-radius:24px;overflow:hidden;display:flex;flex-direction:column;min-height:560px}' +
    '.wnd-notch{height:22px;background:#0b141a;display:flex;justify-content:center;align-items:center}' +
    '.wnd-notch-bar{width:60px;height:4px;background:#2a3942;border-radius:99px}' +
    '.wnd-wa-top{background:#005c4b;color:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px}' +
    '.wnd-wa-avatar{width:36px;height:36px;border-radius:50%;background:#128c7e;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:14px;flex-shrink:0}' +
    '.wnd-wa-meta{flex:1;overflow:hidden}' +
    '.wnd-wa-meta b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.wnd-wa-meta span{display:block;font-size:11px;opacity:.85}' +
    '.wnd-chat{flex:1;padding:12px;overflow-y:auto;max-height:480px;display:flex;flex-direction:column;background:#efeae2}' +
    '.wnd-bubble{background:#d9fdd3;border-radius:12px 12px 2px 12px;padding:12px 14px;margin-left:auto;max-width:98%;font-size:12px;line-height:1.45;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:pre-wrap;word-break:break-word}' +
    '.wnd-bubble-time{text-align:right;font-size:10.5px;color:#667781;margin-top:4px;display:flex;align-items:center;justify-content:flex-end;gap:3px}' +
    '.wnd-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
    '.wnd-pill{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:4px 10px;font-size:11.5px;font-weight:700;color:#475569;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all .15s}' +
    '.wnd-pill.on{background:#047857;color:#fff;border-color:#047857}' +
    '.wnd-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px}' +
    '.wnd-row:last-child{border-bottom:none}' +
    '@media(max-width:1100px){.wnd-grid{grid-template-columns:1fr}.wnd-kpis{grid-template-columns:1fr 1fr}}' +
    '@media(max-width:900px){.wc-st{grid-template-columns:1fr 1fr}.wc-tpl{grid-template-columns:1fr}.wc-tests{max-width:none}}' +
    '@media(max-width:600px){.wnd-kpis{grid-template-columns:1fr}}';

  function css() { if (document.getElementById('wcCss')) return; var s = document.createElement('style'); s.id = 'wcCss'; s.textContent = CSS; document.head.appendChild(s); }

  function ensure(cb) {
    if (App.wa) { cb(); return; }
    App.loadScript('assets/js/mod-results.js').then(function () { if (App.wa) cb(); else App.toast('Could not load WhatsApp module', 'err'); }, function () { App.toast('Could not load WhatsApp module', 'err'); });
  }

  function ts(t) { var d = new Date(t); if (isNaN(d)) return ''; return App.d(d) + ' <span class="wc-sub">' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</span>'; }
  function logs() { try { return DB.all('wa_log').slice().sort(function (a, b) { return a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0); }); } catch (e) { return []; } }
  function sentAt(invId, role, kind) {
    var l = logs().filter(function (e) { return e.invoiceId === invId && e.toRole === role && (e.kind || 'report') === kind && e.status === 'sent'; });
    return l.length ? l[0].ts : '';
  }
  function readyInvoices() {
    var out = [], seen = {};
    (DB.all('results') || []).forEach(function (r) { if (r.invoiceId && !seen[r.invoiceId]) { seen[r.invoiceId] = 1; } });
    Object.keys(seen).forEach(function (id) {
      var inv = DB.get('invoices', id);
      if (!inv || !App.wa.allReady(id)) return;
      out.push(inv);
    });
    out.sort(function (a, b) { return String(b.createdAt) < String(a.createdAt) ? -1 : 1; });
    return out.slice(0, 300);
  }

  function tabsHtml(curTab, rdyCount, logCount) {
    return '';
  }

  /* =========================================================================
     NIGHT DIGEST DATA AGGREGATION & FORMATTER
     ========================================================================= */

  function getOwnerDigestSettings() {
    var set = DB.get('settings', 'main') || {};
    var w = set.whatsapp || {};
    var ownerObj = w.ownerDigest || {};
    return {
      ownerPhone: ownerObj.ownerPhone || w.ownerPhone || w.labNumber || '',
      ownerName: ownerObj.ownerName || w.ownerName || 'Dr. Tariq Mahmood (Owner)',
      ownerTime: ownerObj.ownerTime || w.ownerTime || '21:30',
      ownerAuto: (ownerObj.ownerAuto != null ? !!ownerObj.ownerAuto : !!w.ownerAuto),
      sections: Object.assign({ fin: true, exp: true, dues: true, ops: true, crit: true, home: true, docs: true }, ownerObj.sections || w.ownerSections || {})
    };
  }

  function saveOwnerDigestSettings(data) {
    var set = DB.get('settings', 'main') || {};
    var w = Object.assign({}, set.whatsapp || {});
    w.ownerPhone = data.ownerPhone;
    w.ownerName = data.ownerName;
    w.ownerTime = data.ownerTime;
    w.ownerAuto = data.ownerAuto;
    w.ownerSections = data.sections;
    w.ownerDigest = data;
    set.whatsapp = w;
    DB.update('settings', 'main', set);
    App.toast('Owner Night Digest settings saved ✓');
  }

  function getNightDigestMetrics(date) {
    date = date || App.today();
    var set = DB.get('settings', 'main') || {};

    // 1. Invoices
    var invs = (DB.all('invoices') || []).filter(function (i) {
      return String(i.createdAt || i.date || '').slice(0, 10) === date;
    });
    var invoicesCount = invs.length;
    var totalBilled = 0, grossBilled = 0, discountsTotal = 0, duesTotal = 0, dueInvoicesCount = 0;
    invs.forEach(function (i) {
      var tot = +i.total || 0;
      var sub = +i.subtotal || tot;
      var disc = +i.discount || 0;
      var due = +i.due || 0;
      totalBilled += tot;
      grossBilled += sub;
      discountsTotal += disc;
      if (due > 0.01) {
        duesTotal += due;
        dueInvoicesCount++;
      }
    });

    // 2. Payments (Cash & Bank/Online)
    var pays = (DB.all('payments') || []).filter(function (p) {
      return String(p.ts || p.createdAt || p.date || '').slice(0, 10) === date;
    });
    var cashCollected = 0, onlineCollected = 0, totalCollections = 0;
    if (pays.length > 0) {
      pays.forEach(function (p) {
        var amt = Math.abs(+p.amount || 0);
        var isRef = (p.type === 'refund') || (+p.amount < 0);
        var m = String(p.method || 'cash').toLowerCase();
        var isOnline = (m === 'bank' || m === 'online' || m === 'card' || m === 'easypaisa' || m === 'jazzcash' || m === 'cheque');
        if (isRef) {
          if (isOnline) onlineCollected -= amt; else cashCollected -= amt;
          totalCollections -= amt;
        } else {
          if (isOnline) onlineCollected += amt; else cashCollected += amt;
          totalCollections += amt;
        }
      });
    } else {
      // Fallback: sum from invoices
      invs.forEach(function (i) {
        var p = +i.paid || 0;
        var m = String(i.paymentMethod || 'cash').toLowerCase();
        var isOnline = (m === 'bank' || m === 'online' || m === 'card' || m === 'easypaisa' || m === 'jazzcash');
        if (isOnline) onlineCollected += p; else cashCollected += p;
        totalCollections += p;
      });
    }
    if (totalCollections < 0) totalCollections = 0;
    if (cashCollected < 0) cashCollected = 0;
    if (onlineCollected < 0) onlineCollected = 0;

    // 3. Expenses
    var exps = (DB.all('expenses') || []).filter(function (e) {
      return String(e.date || e.ts || e.createdAt || '').slice(0, 10) === date;
    });
    var totalExpenses = 0, expByCategory = {};
    exps.forEach(function (e) {
      var amt = +e.amount || 0;
      totalExpenses += amt;
      var cat = e.category || 'General';
      expByCategory[cat] = (expByCategory[cat] || 0) + amt;
    });

    // 4. Net Surplus / Profit
    var netSurplus = totalCollections - totalExpenses;
    var profitMargin = totalCollections > 0 ? Math.round((netSurplus / totalCollections) * 100) : 0;

    // 5. Test Operations
    var allResults = DB.all('results') || [];
    var dayResults = allResults.filter(function (r) {
      var rd = String(r.createdAt || r.ts || '').slice(0, 10);
      if (rd === date) return true;
      var inv = r.invoiceId ? DB.get('invoices', r.invoiceId) : null;
      return inv && String(inv.createdAt || inv.date || '').slice(0, 10) === date;
    });
    var testsTotal = dayResults.length;
    var testsReady = dayResults.filter(function (r) { return r.status === 'ready'; }).length;
    var testsPending = testsTotal - testsReady;
    var completionRate = testsTotal > 0 ? Math.round((testsReady / testsTotal) * 100) : 100;

    // 6. Critical Value Alerts
    var criticals = [];
    dayResults.forEach(function (r) {
      if (r.critical && r.critical.length > 0) {
        var inv = r.invoiceId ? DB.get('invoices', r.invoiceId) : null;
        var pat = inv ? (DB.get('patients', inv.patientId) || {}) : {};
        var tName = (r.item && r.item.name) || (r.test && r.test.name) || 'Test';
        r.critical.forEach(function (c) {
          criticals.push({
            patientName: pat.name || 'Patient',
            patientPhone: pat.phone || pat.whatsapp || '',
            invoiceNo: inv ? (inv.no || inv.id) : '',
            testName: tName,
            paramName: c.name || '',
            value: c.value || '',
            unit: c.unit || '',
            dir: c.dir || 'high',
            ref: c.ref || ''
          });
        });
      }
    });

    // 7. Home Sampling
    var homeBookings = (DB.all('home_sampling') || []).filter(function (b) {
      return String(b.date || b.bookingDate || b.createdAt || '').slice(0, 10) === date;
    });
    var homeTotal = homeBookings.length;
    var homeCollected = homeBookings.filter(function (b) { return b.status === 'collected' || b.status === 'received_in_lab'; }).length;
    var homeDispatched = homeBookings.filter(function (b) { return b.status === 'dispatched'; }).length;

    // 8. Top Referring Doctors
    var docMap = {};
    invs.forEach(function (i) {
      var dId = i.doctorId || 'self';
      var dName = 'Self / Walk-in';
      if (dId && dId !== 'self') {
        var doc = DB.get('doctors', dId);
        dName = (doc && doc.name) || i.doctorName || 'Dr. ' + dId;
      }
      if (!docMap[dName]) docMap[dName] = { name: dName, patients: 0, revenue: 0 };
      docMap[dName].patients++;
      docMap[dName].revenue += (+i.total || 0);
    });
    var topDoctors = Object.keys(docMap).map(function (k) { return docMap[k]; });
    topDoctors.sort(function (a, b) { return b.revenue - a.revenue; });

    return {
      date: date,
      labName: set.labName || 'City Clinical Laboratory',
      labAddress: set.address || '',
      labPhone: set.phone || '',
      invoicesCount: invoicesCount,
      grossBilled: grossBilled,
      discountsTotal: discountsTotal,
      totalBilled: totalBilled,
      duesTotal: duesTotal,
      dueInvoicesCount: dueInvoicesCount,
      cashCollected: cashCollected,
      onlineCollected: onlineCollected,
      totalCollections: totalCollections,
      totalExpenses: totalExpenses,
      expByCategory: expByCategory,
      netSurplus: netSurplus,
      profitMargin: profitMargin,
      testsTotal: testsTotal,
      testsReady: testsReady,
      testsPending: testsPending,
      completionRate: completionRate,
      criticals: criticals,
      homeTotal: homeTotal,
      homeCollected: homeCollected,
      homeDispatched: homeDispatched,
      topDoctors: topDoctors.slice(0, 5)
    };
  }

  function formatNightDigestMessage(m, opts) {
    opts = opts || {};
    var incFin = opts.fin !== false;
    var incExp = opts.exp !== false;
    var incDues = opts.dues !== false;
    var incOps = opts.ops !== false;
    var incCrit = opts.crit !== false;
    var incHome = opts.home !== false;
    var incDocs = opts.docs !== false;

    var dObj = new Date(m.date + 'T12:00:00');
    var dayStr = isNaN(dObj) ? m.date : dObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    var now = new Date();
    var timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    var lines = [];
    lines.push('🌙 *DAILY NIGHT DIGEST — LAB CLOSING*');
    lines.push('🏥 *' + m.labName + '*');
    lines.push('📅 ' + dayStr + ' (Closing: ' + timeStr + ')');
    lines.push('━━━━━━━━━━━━━━━━━━━━━');

    if (incFin) {
      lines.push('💰 *FINANCIAL SUMMARY*');
      lines.push('• Total Invoices: ' + m.invoicesCount + ' patient' + (m.invoicesCount === 1 ? '' : 's'));
      lines.push('• Gross Billed: ' + App.money(m.grossBilled));
      if (m.discountsTotal > 0) {
        lines.push('• Discounts Granted: ' + App.money(m.discountsTotal));
      }
      lines.push('• Net Billed: ' + App.money(m.totalBilled));
      lines.push('• Cash In-Hand: ' + App.money(m.cashCollected));
      if (m.onlineCollected > 0) {
        lines.push('• Online / Bank: ' + App.money(m.onlineCollected));
      }
      lines.push('• *Total Collections: ' + App.money(m.totalCollections) + '*');
    }

    if (incDues && m.duesTotal > 0) {
      lines.push('• ⚠️ Outstanding Dues: ' + App.money(m.duesTotal) + ' (' + m.dueInvoicesCount + ' invoices)');
    }

    if (incExp) {
      lines.push('• Operational Expenses: ' + App.money(m.totalExpenses));
      var surplusSign = m.netSurplus >= 0 ? '🟢 *NET LAB SURPLUS: ' : '🔴 *NET LAB DEFICIT: ';
      lines.push('═════════════════════');
      lines.push(surplusSign + App.money(m.netSurplus) + '* (' + m.profitMargin + '% margin)');
    }

    if (incOps) {
      lines.push('━━━━━━━━━━━━━━━━━━━━━');
      lines.push('🧪 *LAB & CLINICAL WORKFLOW*');
      lines.push('• Tests Processed: ' + m.testsTotal + ' tests');
      lines.push('• Reports Finalized: ' + m.testsReady + ' (' + m.completionRate + '%)');
      if (m.testsPending > 0) {
        lines.push('• In-Progress / Pending: ' + m.testsPending);
      }
    }

    if (incHome && m.homeTotal > 0) {
      lines.push('• 🛵 Home Collections: ' + m.homeCollected + ' collected / ' + m.homeTotal + ' booked');
    }

    if (incCrit) {
      if (m.criticals.length > 0) {
        lines.push('━━━━━━━━━━━━━━━━━━━━━');
        lines.push('🚨 *CRITICAL VALUE ALERTS (' + m.criticals.length + ')*');
        m.criticals.forEach(function (c, idx) {
          lines.push((idx + 1) + '. ' + c.patientName + ' — ' + c.testName);
          lines.push('   ' + c.paramName + ': ' + c.value + ' ' + c.unit + ' (' + (c.dir === 'high' ? '↑ HIGH' : '↓ LOW') + ')');
        });
      } else {
        lines.push('• Critical Values: None flagged today ✓');
      }
    }

    if (incDocs && m.topDoctors.length > 0) {
      lines.push('━━━━━━━━━━━━━━━━━━━━━');
      lines.push('👨‍⚕️ *TOP REFERRING DOCTORS*');
      m.topDoctors.forEach(function (doc, idx) {
        lines.push((idx + 1) + '. ' + doc.name + ' — ' + doc.patients + ' pts (' + App.money(doc.revenue) + ')');
      });
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🔒 *STATUS: CASH & ACCOUNTS RECONCILED*');
    lines.push('Automated via Optix LAB MedSync ERP');

    return lines.join('\n');
  }

  function logDigestDispatch(m, phone, method, status, text) {
    try {
      DB.insert('wa_digest_log', {
        date: m.date,
        sentAt: new Date().toISOString(),
        ownerPhone: phone,
        ownerName: (getOwnerDigestSettings().ownerName || 'Owner'),
        totalBilled: m.totalBilled,
        collections: m.totalCollections,
        expenses: m.totalExpenses,
        surplus: m.netSurplus,
        invoicesCount: m.invoicesCount,
        testsCount: m.testsTotal,
        criticalCount: m.criticals.length,
        method: method,
        status: status,
        text: text
      });
      DB.insert('wa_log', {
        kind: 'digest',
        to: phone,
        toName: (getOwnerDigestSettings().ownerName || 'Lab Owner'),
        toRole: 'owner',
        status: status === 'dispatched' ? 'sent' : status,
        error: '',
        ts: new Date().toISOString()
      });
    } catch (e) {}
  }

  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () {
        App.toast('Digest copied to clipboard! 📋');
      }, function () {
        fallbackCopy(txt);
      });
    } else {
      fallbackCopy(txt);
    }
  }

  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      App.toast('Digest copied to clipboard! 📋');
    } catch (e) {
      App.toast('Could not copy automatically', 'err');
    }
    document.body.removeChild(ta);
  }

  function sendDigestToOwner(date, method) {
    var m = getNightDigestMetrics(date);
    var oCfg = getOwnerDigestSettings();
    var phone = oCfg.ownerPhone;
    if (!phone) {
      App.toast('Please configure the Owner WhatsApp number first', 'err');
      var phInput = document.getElementById('wndOwnerPhone');
      if (phInput) phInput.focus();
      return;
    }
    var normPhone = App.normWa(phone);
    var text = formatNightDigestMessage(m, digestOpts);
    var cfg = App.wa ? App.wa.cfg() : {};

    if (method === 'web') {
      var waUrl = 'https://wa.me/' + normPhone + '?text=' + encodeURIComponent(text);
      window.open(waUrl, '_blank');
      logDigestDispatch(m, phone, 'web', 'dispatched', text);
      App.toast('Opened WhatsApp with tonight\'s digest! 📲');
      paint();
      return;
    }

    if (App.wa && App.wa.ready(cfg)) {
      App.toast('Sending Night Digest to ' + (oCfg.ownerName || phone) + '…', 'info');
      App.wa.send(cfg, normPhone, text, function (err, info) {
        if (err) {
          App.toast('WhatsApp API error: ' + String(err.message || err).slice(0, 100) + ' — Opening WhatsApp Web as fallback…', 'err');
          var waUrl = 'https://wa.me/' + normPhone + '?text=' + encodeURIComponent(text);
          window.open(waUrl, '_blank');
          logDigestDispatch(m, phone, 'web_fallback', 'dispatched', text);
        } else {
          App.toast('🌙 Night Digest delivered to Owner WhatsApp (' + (info && info.queued ? 'queued' : 'sent') + ')! ✓✓');
          logDigestDispatch(m, phone, 'api', 'sent', text);
          var set = DB.get('settings', 'main') || {};
          set.whatsapp = set.whatsapp || {};
          set.whatsapp.lastDigestDate = m.date;
          DB.update('settings', 'main', set);
        }
        paint();
      }, { kind: 'digest' });
    } else {
      var waUrl = 'https://wa.me/' + normPhone + '?text=' + encodeURIComponent(text);
      window.open(waUrl, '_blank');
      logDigestDispatch(m, phone, 'web', 'dispatched', text);
      App.toast('Opened WhatsApp Web with tonight\'s digest! 📲');
      paint();
    }
  }

  function printNightClosingSheet(m) {
    var s = DB.get('settings', 'main') || {};
    var dObj = new Date(m.date + 'T12:00:00');
    var dayStr = isNaN(dObj) ? m.date : dObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    var genAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    var html = ''
      + '<div style="max-width:720px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;color:#131845;padding:16px">'
      + '<div style="border-bottom:3px solid #131845;padding-bottom:12px;margin-bottom:14px;text-align:center">'
      +   '<div style="font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:.02em">' + App.esc(s.labName || 'Optix Medical Sync') + '</div>'
      +   '<div style="font-size:12px;color:#64748b;margin-top:2px">' + App.esc(s.address || '') + (s.phone ? ' • Phone: ' + App.esc(s.phone) : '') + '</div>'
      +   '<div style="display:inline-block;background:#131845;color:#fff;font-weight:800;font-size:12.5px;padding:4px 14px;border-radius:12px;letter-spacing:.05em;margin-top:8px">DAILY EVENING CASH CLOSING &amp; EXECUTIVE DIGEST</div>'
      + '</div>'

      + '<div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:13px;background:#f8fafc;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0">'
      +   '<div><strong>Business Date:</strong> ' + App.esc(dayStr) + '</div>'
      +   '<div><strong>Generated At:</strong> ' + App.esc(genAt) + '</div>'
      +   '<div><strong>Verified Status:</strong> <span style="color:#047857;font-weight:800">BALANCED ✓</span></div>'
      + '</div>'

      + '<h4 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#1e3a8a">1. Financial Revenue &amp; Collections</h4>'
      + '<table class="table" style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">'
      +   '<tbody>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Total Invoices Booked:</td><td style="text-align:right;font-weight:700;padding:6px 8px">' + m.invoicesCount + ' patients</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Gross Diagnostic Charges:</td><td style="text-align:right;font-weight:700;padding:6px 8px">' + App.money(m.grossBilled) + '</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Discounts Concessions:</td><td style="text-align:right;font-weight:700;color:#b91c1c;padding:6px 8px">- ' + App.money(m.discountsTotal) + '</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0;background:#f1f5f9"><td style="padding:7px 8px;font-weight:800">Net Billed Revenue:</td><td style="text-align:right;font-weight:900;padding:7px 8px">' + App.money(m.totalBilled) + '</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Cash Received (In-Hand):</td><td style="text-align:right;font-weight:700;color:#047857;padding:6px 8px">' + App.money(m.cashCollected) + '</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Online / Bank Transfers:</td><td style="text-align:right;font-weight:700;color:#1d4ed8;padding:6px 8px">' + App.money(m.onlineCollected) + '</td></tr>'
      +     '<tr style="border-bottom:1.5px solid #cbd5e1;background:#e6f7f0"><td style="padding:8px;font-weight:900;color:#047857">TOTAL CASH &amp; BANK COLLECTIONS:</td><td style="text-align:right;font-weight:900;color:#047857;font-size:15px;padding:8px">' + App.money(m.totalCollections) + '</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Unpaid Receivables (Dues):</td><td style="text-align:right;font-weight:700;color:#b45309;padding:6px 8px">' + App.money(m.duesTotal) + ' (' + m.dueInvoicesCount + ' invoices)</td></tr>'
      +     '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px 8px">Today\'s Lab Operational Expenses:</td><td style="text-align:right;font-weight:700;color:#b91c1c;padding:6px 8px">- ' + App.money(m.totalExpenses) + '</td></tr>'
      +     '<tr style="border-top:2px solid #131845;background:#eff6ff"><td style="padding:10px 8px;font-weight:900;font-size:14.5px">NET LAB SURPLUS / OPERATING PROFIT:</td><td style="text-align:right;font-weight:900;font-size:16px;color:' + (m.netSurplus >= 0 ? '#047857' : '#b91c1c') + ';padding:10px 8px">' + App.money(m.netSurplus) + ' (' + m.profitMargin + '%)</td></tr>'
      +   '</tbody>'
      + '</table>'

      + '<h4 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#1e3a8a">2. Diagnostic Operations &amp; Clinical Summary</h4>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;text-align:center">'
      +   '<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:8px"><div style="font-size:11px;color:#64748b">Tests Ordered</div><div style="font-size:18px;font-weight:900">' + m.testsTotal + '</div></div>'
      +   '<div style="background:#f0fdf4;border:1px solid #86efac;padding:8px;border-radius:8px"><div style="font-size:11px;color:#15803d">Reports Ready</div><div style="font-size:18px;font-weight:900;color:#15803d">' + m.testsReady + ' (' + m.completionRate + '%)</div></div>'
      +   '<div style="background:#fffbeb;border:1px solid #fde68a;padding:8px;border-radius:8px"><div style="font-size:11px;color:#b45309">Pending / In-Lab</div><div style="font-size:18px;font-weight:900;color:#b45309">' + m.testsPending + '</div></div>'
      +   '<div style="background:#fef2f2;border:1px solid #fecaca;padding:8px;border-radius:8px"><div style="font-size:11px;color:#b91c1c">Critical Alerts</div><div style="font-size:18px;font-weight:900;color:#b91c1c">' + m.criticals.length + '</div></div>'
      + '</div>'

      + (m.criticals.length ? ''
      + '<div style="border:1.5px solid #fca5a5;border-radius:8px;background:#fef2f2;padding:10px;margin-bottom:16px">'
      +   '<div style="font-weight:800;color:#991b1b;font-size:12px;text-transform:uppercase;margin-bottom:6px">🚨 Critical Patient Alerts Summary:</div>'
      +   m.criticals.map(function (c, i) {
            return '<div style="font-size:12px;margin-bottom:4px"><strong>' + (i+1) + '. ' + App.esc(c.patientName) + '</strong> (' + App.esc(c.testName) + '): <span style="font-weight:800;color:#b91c1c">' + App.esc(c.paramName) + ' = ' + App.esc(c.value) + ' ' + App.esc(c.unit) + ' (' + (c.dir === 'high' ? '↑ HIGH' : '↓ LOW') + ')</span> normal ' + App.esc(c.ref || '—') + '</div>';
          }).join('')
      + '</div>' : '')

      + (m.topDoctors.length ? ''
      + '<h4 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#1e3a8a">3. Referring Doctors Breakdown</h4>'
      + '<table class="table" style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12.5px">'
      +   '<thead><tr style="background:#f8fafc;border-bottom:1px solid #cbd5e1"><th style="text-align:left;padding:6px">Doctor / Clinic</th><th style="text-align:center;padding:6px">Patients</th><th style="text-align:right;padding:6px">Revenue Generated</th></tr></thead>'
      +   '<tbody>'
      +   m.topDoctors.map(function (d) {
            return '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:700">' + App.esc(d.name) + '</td><td style="text-align:center;padding:6px">' + d.patients + '</td><td style="text-align:right;font-weight:800;padding:6px">' + App.money(d.revenue) + '</td></tr>';
          }).join('')
      +   '</tbody></table>' : '')

      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:36px">'
      +   '<div style="border-top:1.5px solid #333;padding-top:4px;font-size:11.5px;text-align:center">Reception / Cashier</div>'
      +   '<div style="border-top:1.5px solid #333;padding-top:4px;font-size:11.5px;text-align:center">Lab Manager / Quality Incharge</div>'
      +   '<div style="border-top:1.5px solid #333;padding-top:4px;font-size:11.5px;text-align:center">Managing Director / Owner</div>'
      + '</div>'
      + '</div>';

    App.print('Night Closing Summary — ' + m.date, html);
  }

  /* Periodic background check: auto-send if enabled and evening time reached */
  function checkEveningAutoDigest() {
    try {
      var oCfg = getOwnerDigestSettings();
      if (!oCfg.ownerAuto || !oCfg.ownerPhone) return;
      var today = App.today();
      var set = DB.get('settings', 'main') || {};
      var w = set.whatsapp || {};
      if (w.lastDigestDate === today) return;

      var targetTime = oCfg.ownerTime || '21:30';
      var parts = targetTime.split(':');
      var targetH = parseInt(parts[0], 10) || 21;
      var targetM = parseInt(parts[1], 10) || 30;

      var now = new Date();
      var curH = now.getHours();
      var curM = now.getMinutes();

      if (curH > targetH || (curH === targetH && curM >= targetM)) {
        var cfg = App.wa ? App.wa.cfg() : {};
        if (App.wa && App.wa.ready(cfg)) {
          sendDigestToOwner(today, 'api');
        }
      }
    } catch (e) {}
  }
  setInterval(checkEveningAutoDigest, 60000);

  /* =========================================================================
     NIGHT DIGEST DASHBOARD HTML
     ========================================================================= */

  function digestHtml(cfg) {
    var curDate = digestDate || App.today();
    var m = getNightDigestMetrics(curDate);
    var oCfg = getOwnerDigestSettings();
    var msgText = formatNightDigestMessage(m, digestOpts);
    var ready = App.wa && App.wa.ready(cfg);
    var digestLogs = [];
    try {
      digestLogs = (DB.all('wa_digest_log') || []).slice().sort(function (a, b) { return a.sentAt < b.sentAt ? 1 : -1; });
    } catch (e) {}
    var isToday = (curDate === App.today());
    var dObj = new Date(curDate + 'T12:00:00');
    var dateLabel = isNaN(dObj) ? curDate : dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    var h = ''
      /* 4 Executive KPI Cards */
      + '<div class="kpi-grid" style="margin-bottom:18px">'
      +   '<div class="kpi t-navy" style="border-left:4px solid #0284c7 !important">'
      +     '<div class="kpi-ic">' + App.icon('file', 18) + '</div>'
      +     '<div class="kpi-lb">TODAY\'S NET BILLED</div>'
      +     '<div class="kpi-nm" style="color:#0284c7">' + App.money(m.totalBilled) + '</div>'
      +     '<div class="kpi-sb">' + m.invoicesCount + ' Invoices • Disc: ' + App.money(m.discountsTotal) + '</div>'
      +   '</div>'
      +   '<div class="kpi t-green" style="border-left:4px solid #16a34a !important">'
      +     '<div class="kpi-ic">' + App.icon('wallet', 18) + '</div>'
      +     '<div class="kpi-lb">TOTAL COLLECTIONS (IN-HAND)</div>'
      +     '<div class="kpi-nm" style="color:#16a34a">' + App.money(m.totalCollections) + '</div>'
      +     '<div class="kpi-sb">Cash: ' + App.money(m.cashCollected) + ' • Online: ' + App.money(m.onlineCollected) + (m.duesTotal > 0 ? ' • Dues: ' + App.money(m.duesTotal) : '') + '</div>'
      +   '</div>'
      +   '<div class="kpi t-amber" style="border-left:4px solid #d97706 !important">'
      +     '<div class="kpi-ic">' + App.icon('chart', 18) + '</div>'
      +     '<div class="kpi-lb">NET LAB SURPLUS (PROFIT)</div>'
      +     '<div class="kpi-nm" style="color:#d97706">' + App.money(m.netSurplus) + '</div>'
      +     '<div class="kpi-sb">Collections - Expenses (' + App.money(m.totalExpenses) + ') • ' + m.profitMargin + '% Margin</div>'
      +   '</div>'
      +   '<div class="kpi t-purple" style="border-left:4px solid #7c3aed !important">'
      +     '<div class="kpi-ic">' + App.icon('flask', 18) + '</div>'
      +     '<div class="kpi-lb">DIAGNOSTIC OPS &amp; ALERTS</div>'
      +     '<div class="kpi-nm" style="color:#7c3aed">' + m.testsTotal + ' <span style="font-size:14px;font-weight:600;color:var(--muted)">Tests</span></div>'
      +     '<div class="kpi-sb">' + m.testsReady + ' Ready (' + m.completionRate + '%) • '
      +       (m.criticals.length ? '<span style="color:#b91c1c;font-weight:800">🚨 ' + m.criticals.length + ' Critical</span>' : '<span style="color:#047857">0 Critical</span>') + '</div>'
      +   '</div>'
      + '</div>'

      /* Action & Date Controls below cards */
      + '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px">'
      +   '<button class="btn btn-ghost btn-sm" id="wndDateToday"' + (isToday ? ' style="font-weight:800;color:var(--brand)"' : '') + '>Today</button>'
      +   '<button class="btn btn-ghost btn-sm" id="wndDateYest">Yesterday</button>'
      +   '<input type="date" class="input" id="wndDateInput" value="' + esc(curDate) + '" style="padding:5px 10px;font-size:13px;width:145px">'
      +   '<button class="btn btn-ghost btn-sm" id="wndPrintClosing">🖨️ Print Closing Sheet</button>'
      +   '<button class="btn btn-primary btn-sm" id="wndSendNow">📲 Send Digest to Owner</button>'
      + '</div>'

      /* Split Cockpit: Phone Simulator on Left, Controls & Insights on Right */
      + '<div class="wnd-grid">'

      /* LEFT: Phone Simulator */
      +   '<div>'
      +     '<div style="margin-bottom:8px;font-size:13px;font-weight:800;color:var(--ink)">LIVE WHATSAPP PREVIEW (PHONE SIMULATOR)</div>'
      +     '<div class="wnd-pills">'
      +       '<span class="wnd-pill' + (digestOpts.fin ? ' on' : '') + '" data-wnd-opt="fin">' + (digestOpts.fin ? '✓ ' : '') + 'Financials</span>'
      +       '<span class="wnd-pill' + (digestOpts.exp ? ' on' : '') + '" data-wnd-opt="exp">' + (digestOpts.exp ? '✓ ' : '') + 'Expenses</span>'
      +       '<span class="wnd-pill' + (digestOpts.dues ? ' on' : '') + '" data-wnd-opt="dues">' + (digestOpts.dues ? '✓ ' : '') + 'Dues</span>'
      +       '<span class="wnd-pill' + (digestOpts.ops ? ' on' : '') + '" data-wnd-opt="ops">' + (digestOpts.ops ? '✓ ' : '') + 'Tests Ops</span>'
      +       '<span class="wnd-pill' + (digestOpts.crit ? ' on' : '') + '" data-wnd-opt="crit">' + (digestOpts.crit ? '✓ ' : '') + 'Criticals</span>'
      +       '<span class="wnd-pill' + (digestOpts.docs ? ' on' : '') + '" data-wnd-opt="docs">' + (digestOpts.docs ? '✓ ' : '') + 'Top Doctors</span>'
      +     '</div>'

      +     '<div class="wnd-phone">'
      +       '<div class="wnd-screen">'
      +         '<div class="wnd-notch"><div class="wnd-notch-bar"></div></div>'
      +         '<div class="wnd-wa-top">'
      +           '<div class="wnd-wa-avatar">OP</div>'
      +           '<div class="wnd-wa-meta">'
      +             '<b>' + esc(oCfg.ownerName || 'Dr. Tariq Mahmood (Owner)') + '</b>'
      +             '<span>' + esc(oCfg.ownerPhone ? oCfg.ownerPhone + ' • ' : '') + 'online</span>'
      +           '</div>'
      +           '<div style="display:flex;gap:12px;opacity:.9">'
      +             '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>'
      +             '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
      +           '</div>'
      +         '</div>'
      +         '<div class="wnd-chat">'
      +           '<div class="wnd-bubble">'
      +             esc(msgText)
      +             '<div class="wnd-bubble-time">'
      +               '<span>' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</span>'
      +               '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#53bdeb" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>'
      +             '</div>'
      +           '</div>'
      +         '</div>'
      +       '</div>'
      +     '</div>'

      +     '<div style="margin-top:12px;display:flex;gap:8px;flex-direction:column">'
      +       '<button class="btn btn-primary" id="wndSendApiBtn"' + (ready ? '' : ' disabled title="Connect WhatsApp gateway in Settings"') + '>📲 Dispatch via WhatsApp Gateway / API</button>'
      +       '<div style="display:flex;gap:8px">'
      +         '<button class="btn btn-ghost" id="wndSendWebBtn" style="flex:1">🌐 Open in WhatsApp Web / App</button>'
      +         '<button class="btn btn-ghost" id="wndCopyBtn" style="flex:1">📋 Copy Message Text</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'

      /* RIGHT: Configuration, Delivery Status & Details Breakdown */
      +   '<div>'

      /* Owner Configuration & Schedule */
      +     '<div class="card" style="margin-bottom:16px">'
      +       '<div class="card-h"><h3>⚙️ Owner Recipient &amp; Evening Scheduler</h3></div>'
      +       '<div class="card-b">'
      +         '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
      +           '<div>'
      +             '<label class="label" style="font-weight:700">Owner WhatsApp Mobile Number'
      +               '<input type="tel" class="input" id="wndOwnerPhone" placeholder="0300 1234567" value="' + esc(oCfg.ownerPhone) + '">'
      +             '</label>'
      +           '</div>'
      +           '<div>'
      +             '<label class="label" style="font-weight:700">Owner / Director Name'
      +               '<input type="text" class="input" id="wndOwnerName" placeholder="Dr. Tariq Mahmood (Owner)" value="' + esc(oCfg.ownerName) + '">'
      +             '</label>'
      +           '</div>'
      +         '</div>'
      +         '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;align-items:center">'
      +           '<div>'
      +             '<label class="label" style="font-weight:700">Scheduled Night Delivery Time'
      +               '<input type="time" class="input" id="wndOwnerTime" value="' + esc(oCfg.ownerTime) + '">'
      +             '</label>'
      +           '</div>'
      +           '<div style="padding-top:16px">'
      +             '<label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;cursor:pointer">'
      +               '<input type="checkbox" id="wndOwnerAuto"' + (oCfg.ownerAuto ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--green)">'
      +               'Enable Night Auto-Dispatch'
      +             '</label>'
      +             '<div class="muted" style="font-size:11.5px;margin-left:26px">Automatically triggers at scheduled time if lab is open.</div>'
      +           '</div>'
      +         '</div>'
      +         '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--bd);padding-top:12px">'
      +           '<span class="muted" style="font-size:12.5px">Delivers to WhatsApp numbers in Pakistan (+92) and worldwide.</span>'
      +           '<button class="btn btn-primary btn-sm" id="wndSaveSettings">Save Preferences</button>'
      +         '</div>'
      +       '</div>'
      +     '</div>'

      /* Financial & Reconciliation Breakdown */
      +     '<div class="card" style="margin-bottom:16px">'
      +       '<div class="card-h"><h3>💰 Today\'s Revenue &amp; Collections Breakdown (' + esc(dateLabel) + ')</h3></div>'
      +       '<div class="card-b" style="padding:12px 18px">'
      +         '<div class="wnd-row"><span>Gross Billed Tests:</span><b>' + App.money(m.grossBilled) + '</b></div>'
      +         '<div class="wnd-row"><span>Discounts Concessions:</span><b style="color:#b91c1c">- ' + App.money(m.discountsTotal) + '</b></div>'
      +         '<div class="wnd-row" style="font-weight:800;background:#f8fafc;padding:7px 8px;border-radius:6px"><span>Net Billed Revenue:</span><b>' + App.money(m.totalBilled) + '</b></div>'
      +         '<div class="wnd-row"><span>Cash Received (In-Hand):</span><b style="color:#047857">' + App.money(m.cashCollected) + '</b></div>'
      +         '<div class="wnd-row"><span>Online / Bank Transfer:</span><b style="color:#1d4ed8">' + App.money(m.onlineCollected) + '</b></div>'
      +         '<div class="wnd-row" style="font-weight:900;background:#e6f7f0;padding:8px;border-radius:6px"><span>TOTAL CASH &amp; BANK INFLOW:</span><b style="color:#047857">' + App.money(m.totalCollections) + '</b></div>'
      +         '<div class="wnd-row"><span>Outstanding Unpaid Dues:</span><b style="color:#b45309">' + App.money(m.duesTotal) + ' (' + m.dueInvoicesCount + ' invoices)</b></div>'
      +         '<div class="wnd-row"><span>Operational Lab Expenses:</span><b style="color:#b91c1c">- ' + App.money(m.totalExpenses) + '</b></div>'
      +         '<div class="wnd-row" style="font-weight:900;background:#eff6ff;padding:9px 8px;border-radius:6px;font-size:14.5px">'
      +           '<span>NET LAB SURPLUS (PROFIT):</span><b style="color:' + (m.netSurplus >= 0 ? '#047857' : '#b91c1c') + '">' + App.money(m.netSurplus) + ' (' + m.profitMargin + '%)</b>'
      +         '</div>'
      +       '</div>'
      +     '</div>'

      /* Critical Results Alert Card (If any) */
      +     (m.criticals.length ? ''
      +     '<div class="card" style="margin-bottom:16px;border-color:#fca5a5;background:#fff5f5">'
      +       '<div class="card-h" style="border-color:#fed7d7"><h3 style="color:#991b1b">🚨 Critical Value Alerts Today (' + m.criticals.length + ')</h3></div>'
      +       '<div class="card-b">'
      +         m.criticals.map(function (c, idx) {
                  return '<div style="background:#fff;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12.5px">'
                    + '<b>' + (idx + 1) + '. ' + esc(c.patientName) + '</b> (' + esc(c.testName) + ')'
                    + '<div style="margin-top:2px;font-size:13px"><b style="color:#b91c1c">' + esc(c.paramName) + ': ' + esc(c.value) + ' ' + esc(c.unit) + ' (' + (c.dir === 'high' ? '↑ HIGH' : '↓ LOW') + ')</b> <span class="muted">(normal ' + esc(c.ref || '—') + ')</span></div>'
                    + '</div>';
                }).join('')
      +       '</div>'
      +     '</div>' : '')

      /* Top Referring Doctors Card */
      +     (m.topDoctors.length ? ''
      +     '<div class="card" style="margin-bottom:16px">'
      +       '<div class="card-h"><h3>👨‍⚕️ Top Referring Doctors Today</h3></div>'
      +       '<div class="card-b" style="padding:10px 18px">'
      +         m.topDoctors.map(function (d, idx) {
                  return '<div class="wnd-row"><span><b>' + (idx + 1) + '. ' + esc(d.name) + '</b> <span class="muted">(' + d.patients + ' patients)</span></span><b>' + App.money(d.revenue) + '</b></div>';
                }).join('')
      +       '</div>'
      +     '</div>' : '')

      +   '</div>' // End RIGHT
      + '</div>' // End wnd-grid

      /* Historical Night Digest Dispatch Log */
      + '<div class="card" style="margin-top:20px">'
      +   '<div class="card-h"><h3>📜 Night Digest Dispatch History</h3><span class="muted" style="font-size:12.5px">' + digestLogs.length + ' previous digest' + (digestLogs.length === 1 ? '' : 's') + '</span></div>'
      +   (digestLogs.length ? ''
      +   '<div class="tbl-wrap"><table class="table"><thead><tr><th>Sent Date &amp; Time</th><th>Recipient</th><th>Billed</th><th>Collections</th><th>Surplus</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>'
      +     digestLogs.slice(0, 50).map(function (l) {
              return '<tr>'
                + '<td>' + ts(l.sentAt) + '<div class="wc-sub">Date: ' + esc(l.date) + '</div></td>'
                + '<td><b>' + esc(l.ownerName || 'Owner') + '</b><div class="wc-sub">' + esc(l.ownerPhone || '—') + '</div></td>'
                + '<td>' + App.money(l.totalBilled) + '</td>'
                + '<td style="font-weight:700;color:#047857">' + App.money(l.collections) + '</td>'
                + '<td style="font-weight:800;color:' + (l.surplus >= 0 ? '#047857' : '#b91c1c') + '">' + App.money(l.surplus) + '</td>'
                + '<td><span class="wc-chip ' + (l.method === 'api' ? 'g' : 'b') + '">' + (l.method === 'api' ? 'WhatsApp API' : 'Direct Link') + '</span></td>'
                + '<td><span class="wc-chip g">✓ ' + esc(l.status || 'Sent') + '</span></td>'
                + '<td style="white-space:nowrap">'
                +   '<button class="btn btn-ghost btn-sm" data-wnd-view="' + esc(l.id) + '">View</button> '
                +   '<button class="btn btn-ghost btn-sm" data-wnd-resend="' + esc(l.date) + '">Resend</button>'
                + '</td>'
                + '</tr>';
            }).join('')
      +   '</tbody></table></div>' : '<div class="card-b">' + App.empty('No previous digests dispatched yet.') + '</div>')
      + '</div>';

    return h;
  }

  /* =========================================================================
     STANDARD WHATSAPP CENTER TABS (READY, LOG, TEMPLATES)
     ========================================================================= */

  function readyHtml(rdy, ready) {
    var n = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
    return '<div class="card"><div class="wc-bar"><b>Finished reports</b><span class="wc-sub">Reports whose every test is ready</span><span class="grow"></span>' +
      '<button class="btn btn-primary btn-sm" id="wcSendSel"' + (n && ready ? '' : ' disabled') + '>Send selected to patients' + (n ? ' (' + n + ')' : '') + '</button></div>' +
      (rdy.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th style="width:34px"><input type="checkbox" id="wcAll"></th><th>Invoice</th><th>Patient</th><th>Tests</th><th>Payment</th><th>Patient</th><th>Doctor</th><th></th></tr></thead><tbody>' +
        rdy.map(function (inv) {
          var pat = DB.get('patients', inv.patientId) || {}, doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
          var sp = sentAt(inv.id, 'patient', 'report'), sd = sentAt(inv.id, 'doctor', 'report'), sn = sentAt(inv.id, 'patient', 'due');
          var owes = (+inv.due || 0) > 0.009;
          return '<tr><td><input type="checkbox" class="wcRow" data-id="' + esc(inv.id) + '"' + (sel[inv.id] ? ' checked' : '') + (sp ? ' disabled' : '') + '></td>' +
            '<td><b>' + esc(inv.no || inv.id) + '</b><div class="wc-sub">' + App.d(inv.createdAt) + '</div></td>' +
            '<td><b>' + esc(pat.name || '—') + '</b><div class="wc-sub">' + esc(pat.whatsapp || pat.phone || 'no number') + '</div></td>' +
            '<td class="wc-tests">' + esc(App.wa.testNames(inv.id).join(', ')) + '</td>' +
            '<td>' + (owes ? '<span class="wc-chip o">Due ' + esc(App.money(inv.due)) + '</span>' : '<span class="wc-chip g">Paid</span>') + '</td>' +
            '<td>' + (sp ? '<span class="wc-chip g">✓ Sent</span><div class="wc-sub">' + ts(sp) + '</div>' : (sn ? '<span class="wc-chip b">Balance note sent</span>' : '<span class="wc-chip n">Not sent</span>')) + '</td>' +
            '<td>' + (doc ? (sd ? '<span class="wc-chip g">✓ Sent</span><div class="wc-sub">' + ts(sd) + '</div>' : '<span class="wc-chip n">Not sent</span>') + '<div class="wc-sub">' + esc(doc.name) + '</div>' : '<span class="wc-sub">—</span>') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-send="' + esc(inv.id) + '|patient"' + (ready ? '' : ' disabled') + '>' + (sp ? 'Resend' : 'Send') + ' to patient</button>' +
            (doc ? ' <button class="btn btn-ghost btn-sm" data-send="' + esc(inv.id) + '|doctor"' + (ready ? '' : ' disabled') + '>Doctor</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No finished reports yet') + '</div>') + '</div>';
  }

  var KIND = { report: 'Report', due: 'Balance note', critical: 'Critical alert', digest: 'Night Digest' };
  function logHtml(L) {
    var q = logF.q.toLowerCase();
    var rows = L.filter(function (e) {
      if (logF.status && e.status !== logF.status) return false;
      if (logF.kind && (e.kind || 'report') !== logF.kind) return false;
      if (q) { var inv = e.invoiceId ? DB.get('invoices', e.invoiceId) : null; if ((String(e.toName) + ' ' + String(e.to) + ' ' + String(e.invoiceId) + ' ' + String(inv && inv.no)).toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
    var failedN = rows.filter(function (e) { return e.status === 'failed' && (e.kind || 'report') !== 'critical'; }).length;
    return '<div class="card"><div class="wc-bar"><select class="select" id="lgStatus" style="width:140px"><option value="">All status</option><option value="sent"' + (logF.status === 'sent' ? ' selected' : '') + '>Sent</option><option value="failed"' + (logF.status === 'failed' ? ' selected' : '') + '>Failed</option></select>' +
      '<select class="select" id="lgKind" style="width:160px"><option value="">All types</option>' + Object.keys(KIND).map(function (k) { return '<option value="' + k + '"' + (logF.kind === k ? ' selected' : '') + '>' + KIND[k] + '</option>'; }).join('') + '</select>' +
      '<input class="input grow" id="lgQ" placeholder="Search name, number, invoice…" value="' + esc(logF.q) + '" style="min-width:180px">' +
      '<button class="btn btn-ghost btn-sm" id="wcRetryAll"' + (failedN ? '' : ' disabled') + '>Retry all failed (' + failedN + ')</button></div>' +
      (rows.length ? '<div class="tbl-wrap"><table class="table"><thead><tr><th>When</th><th>To</th><th>Type</th><th>Invoice</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 200).map(function (e) {
          var inv = e.invoiceId ? DB.get('invoices', e.invoiceId) : null, k = e.kind || 'report';
          return '<tr><td>' + ts(e.ts) + '</td><td><b>' + esc(e.toName || '—') + '</b><div class="wc-sub">' + esc(e.toRole || '') + (e.to ? ' · ' + esc(e.to) : '') + '</div></td><td>' + esc(KIND[k] || k) + '</td><td>' + esc(inv ? (inv.no || inv.id) : (e.invoiceId || '—')) + '</td>' +
            '<td>' + (e.status === 'sent' ? '<span class="wc-chip g">Sent</span>' : '<span class="wc-chip r">Failed</span>' + (e.error ? '<div class="wc-sub" style="max-width:260px">' + esc(e.error) + '</div>' : '')) + '</td>' +
            '<td>' + (e.status === 'failed' && k !== 'critical' && e.invoiceId ? '<button class="btn btn-ghost btn-sm" data-retry="' + esc(e.invoiceId) + '|' + esc(e.toRole || 'patient') + '">Retry</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card-b">' + App.empty('No messages yet') + '</div>') + '</div>';
  }

  var PH = ['patient', 'doctor', 'lab', 'invoice', 'date', 'tests', 'total', 'due', 'linkline', 'link'];
  var SAMPLE = { lab: 'Your Lab', patient: 'Ayesha Khan', doctor: 'Dr. Ahmed', invoice: 'INV-0142', date: '06 Oct 2026', tests: 'CBC, Blood Sugar', total: 'Rs 1,800', due: 'Rs 800', link: 'https://…/r/rpt-INV-0142-x7Kp2q' };
  function tplHtml(cfg) {
    var d = tplDraft || { tplPatient: App.wa.tplText('tplPatient'), tplDoctor: App.wa.tplText('tplDoctor'), tplDue: App.wa.tplText('tplDue') };
    var rule = cfg.dueRule || 'note';
    function box(key, title, hint) {
      return '<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>' + title + '</h3><span class="sp"></span><button class="btn btn-ghost btn-sm" data-reset="' + key + '">Reset</button></div><div class="card-b"><p class="muted" style="margin:0 0 8px;font-size:13px">' + hint + '</p>' +
        '<div class="wc-tpl"><div><textarea class="input" id="t_' + key + '">' + esc(d[key]) + '</textarea><div class="wc-ph">' + PH.map(function (p) { return '<button type="button" data-ins="' + key + '|{' + p + '}">{' + p + '}</button>'; }).join('') + '</div></div>' +
        '<div><div class="wc-sub" style="margin-bottom:6px">Preview</div><div class="wc-bub" id="pv_' + key + '"></div></div></div></div></div>';
    }
    return '<div class="card wc-rules" style="margin-bottom:16px"><div class="card-h"><h3>Sending rules</h3></div><div class="card-b">' +
      '<label class="r"><input type="checkbox" id="rAutoP"' + (cfg.autoPatient !== false ? ' checked' : '') + '><span><b>Auto-send report to the patient</b><br><span class="muted" style="font-size:13px">As soon as every test of an invoice is ready.</span></span></label>' +
      '<label class="r"><input type="checkbox" id="rAutoD"' + (cfg.autoDoctor === true ? ' checked' : '') + '><span><b>Auto-send report to the referring doctor</b></span></label>' +
      '<label class="r"><input type="checkbox" id="rCrit"' + (cfg.autoCritical !== false ? ' checked' : '') + '><span><b>Critical value alerts</b> to the doctor and the lab number</span></label>' +
      '<label class="label" style="max-width:520px">When the invoice still has a balance due<select class="select" id="rDue">' +
      '<option value="note"' + (rule === 'note' ? ' selected' : '') + '>Tell the patient a balance is pending — send the report automatically once paid (recommended)</option>' +
      '<option value="hold"' + (rule === 'hold' ? ' selected' : '') + '>Send nothing until it is fully paid</option>' +
      '<option value="send"' + (rule === 'send' ? ' selected' : '') + '>Send the report anyway</option></select></label>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" id="wcSaveRules">Save rules &amp; templates</button> <button class="btn btn-ghost" id="wcTest"' + (cfg.labNumber ? '' : ' disabled title="Set your lab WhatsApp number in Settings first"') + '>Send test to lab number</button></div></div></div>' +
      box('tplPatient', 'Report message — patient', 'Sent when the report is ready.') + box('tplDoctor', 'Report message — doctor', 'Sent to the referring doctor.') + box('tplDue', 'Balance pending message', 'Sent instead of the report while a balance is due (rule above).');
  }

  function readDraft() {
    var d = {};
    ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) { var e = document.getElementById('t_' + k); d[k] = e ? e.value : App.wa.tplText(k); });
    return d;
  }
  function preview() {
    ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) {
      var e = document.getElementById('t_' + k), p = document.getElementById('pv_' + k); if (!e || !p) return;
      var v = Object.assign({}, SAMPLE); if (k === 'tplDue') v.link = '';
      p.textContent = App.wa.render(e.value, v);
    });
  }

  function saveRules() {
    var st = DB.get('settings', 'main') || {}, w = Object.assign({}, st.whatsapp || {});
    var d = readDraft();
    ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) { w[k] = (d[k] === App.wa.tpl[k]) ? '' : d[k]; });
    w.autoPatient = document.getElementById('rAutoP').checked; w.autoDoctor = document.getElementById('rAutoD').checked; w.autoCritical = document.getElementById('rCrit').checked;
    w.dueRule = document.getElementById('rDue').value;
    st.whatsapp = w; DB.update('settings', 'main', st); tplDraft = null; App.toast('WhatsApp rules saved'); paint();
  }
  function sendOne(invId, role, cb) { App.wa.manual(invId, role); if (cb) setTimeout(cb, 900); }

  var qTimer = null;
  function pollQueue() {
    clearInterval(qTimer);
    function once() {
      var box = document.getElementById('wcQueue'); if (!box || !/#\/whatsapp/.test(location.hash)) { clearInterval(qTimer); return; }
      DB.waGw('GET', 'outbox').then(function (o) {
        var fails = (o.recent || []).filter(function (x) { return !x.ok; });
        if (!o.waiting && !fails.length) { box.style.display = 'none'; return; }
        box.style.display = '';
        var wait = o.waiting ? '<b>' + o.waiting + ' message' + (o.waiting === 1 ? '' : 's') + ' waiting</b> in the sending line — next one in about ' + o.nextInSec + ' s. They go out one by one (one every ' + (o.gapSec >= 60 ? Math.round(o.gapSec / 60) + ' min' : o.gapSec + ' s') + ') to keep your WhatsApp number safe.' : '';
        var bad = fails.length ? '<div style="margin-top:6px;color:#b91c1c;font-size:13px">Could not send: ' + fails.slice(0, 3).map(function (x) { return esc(x.to) + ' (' + esc(x.error || 'error') + ')'; }).join('; ') + '</div>' : '';
        box.firstChild.innerHTML = '<div style="font-size:13.5px">' + wait + '</div>' + bad;
      }, function () {});
    }
    once(); qTimer = setInterval(once, 5000);
  }

  /* =========================================================================
     MAIN RENDERER
     ========================================================================= */

  function render() {
    css();
    var s = App.session();
    if (!s || (s.role !== 'admin' && s.role !== 'reception' && !(s.role === 'custom' && App.canPage('whatsapp')))) {
      return '<div class="card"><div class="card-b">' + App.empty('You do not have access to WhatsApp Center.') + '</div></div>';
    }
    if (!App.wa) { ensure(paint); return '<div class="card"><div class="card-b">' + App.empty('Loading…') + '</div></div>'; }
    var cfg = App.wa.cfg(), ready = App.wa.ready(cfg), today = App.today();
    var L = logs(), sentToday = L.filter(function (e) { return e.status === 'sent' && String(e.ts).slice(0, 10) === today; }).length;
    var failed = L.filter(function (e) { return e.status === 'failed'; }).length;
    var rdy = readyInvoices(), waiting = rdy.filter(function (i) { return !sentAt(i.id, 'patient', 'report'); }).length;

    if (tab === 'digest') {
      setTimeout(wire, 0);
      return digestHtml(cfg);
    }
    if (tab === 'settings') { if (s.role === 'admin') renderSetWhatsapp(); return ''; }

    var h = (ready ? '' : '<div class="card" style="margin-bottom:14px;border-color:#f6c6c6;background:#fff6f6"><div class="card-b"><b style="color:#b91c1c">WhatsApp sending is not configured yet.</b> <span class="muted">Link the lab WhatsApp number in Tools → WhatsApp → Settings (scan a QR code). Reports can still be printed and shared manually.</span></div></div>') +
      '<div class="kpi-grid" style="margin-bottom:18px">' +
        '<div class="kpi t-green" style="border-left:4px solid #16a34a !important">' +
          '<div class="kpi-ic">' + App.icon('check', 18) + '</div>' +
          '<div class="kpi-lb">SENT TODAY</div>' +
          '<div class="kpi-nm" style="color:#16a34a">' + sentToday + '</div>' +
          '<div class="kpi-sb">Delivered via WhatsApp</div>' +
        '</div>' +
        '<div class="kpi t-amber" style="border-left:4px solid #d97706 !important">' +
          '<div class="kpi-ic">' + App.icon('clock', 18) + '</div>' +
          '<div class="kpi-lb">WAITING TO SEND</div>' +
          '<div class="kpi-nm" style="color:#d97706">' + waiting + '</div>' +
          '<div class="kpi-sb">Ready reports queued</div>' +
        '</div>' +
        '<div class="kpi t-red" style="border-left:4px solid #dc2626 !important">' +
          '<div class="kpi-ic">' + App.icon('alert', 18) + '</div>' +
          '<div class="kpi-lb">FAILED (ALL TIME)</div>' +
          '<div class="kpi-nm" style="color:' + (failed ? '#dc2626' : 'var(--muted)') + '">' + failed + '</div>' +
          '<div class="kpi-sb">Delivery failures</div>' +
        '</div>' +
        '<div class="kpi t-blue" style="border-left:4px solid #2563eb !important">' +
          '<div class="kpi-ic">' + App.icon('chat', 18) + '</div>' +
          '<div class="kpi-lb">AUTO-SEND</div>' +
          '<div class="kpi-nm" style="color:#2563eb;font-size:18px">' + (cfg.autoPatient !== false ? 'Patient ✓ ' : '') + (cfg.autoDoctor === true ? 'Doctor ✓' : '') + ((cfg.autoPatient === false && cfg.autoDoctor !== true) ? 'Off' : '') + '</div>' +
          '<div class="kpi-sb">Auto dispatch rules</div>' +
        '</div>' +
      '</div>' +
      '<div class="wc-cur"><b>' + (tab === 'tpl' ? 'Templates &amp; rules' : (tab === 'log' ? 'Message log' : 'Ready to send')) + '</b><span>' + (tab === 'tpl' ? 'Messages and sending rules' : (tab === 'log' ? L.length + ' message' + (L.length === 1 ? '' : 's') : waiting + ' waiting')) + '</span></div>';
    if (cfg.provider === 'gateway') h = h.replace('<div class="wc-cur">', '<div id="wcQueue" class="card" style="margin-bottom:14px;display:none"><div class="card-b" style="padding:12px 16px"></div></div><div class="wc-cur">');
    if (tab === 'tpl' && s.role === 'admin') h += tplHtml(cfg);
    else if (tab === 'log') h += logHtml(L);
    else h += readyHtml(rdy, ready);
    setTimeout(wire, 0);
    return h;
  }

  function paint() {
    if (tab === 'settings') return; /* settings tab manages its own DOM + polling */
    var v = document.getElementById('view');
    if (v && (/#\/whatsapp/.test(location.hash) || /#\/digest/.test(location.hash))) {
      v.innerHTML = render();
    }
  }

  /* =========================================================================
     EVENT WIRING
     ========================================================================= */

  function wire() {
    var v = document.getElementById('view'); if (!v || !App.wa) return;
    if (document.getElementById('wcQueue')) pollQueue();
    function on(id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }

    // Tab buttons
    Array.prototype.forEach.call(v.querySelectorAll('[data-tab-nav]'), function (b) {
      b.addEventListener('click', function () {
        var target = b.getAttribute('data-tab-nav');
        if (target === 'digest') App.nav('#/whatsapp/digest');
        else if (target === 'log') App.nav('#/whatsapp/log');
        else if (target === 'tpl') App.nav('#/whatsapp/templates');
        else App.nav('#/whatsapp');
      });
    });

    if (tab === 'digest') {
      // Date Picker & Quick Selectors
      on('wndDateInput', 'change', function (e) { digestDate = e.target.value; paint(); });
      on('wndDateToday', 'click', function () { digestDate = App.today(); paint(); });
      on('wndDateYest', 'click', function () {
        var d = new Date(); d.setDate(d.getDate() - 1);
        digestDate = d.toISOString().slice(0, 10);
        paint();
      });

      // Section Toggle Pills
      Array.prototype.forEach.call(v.querySelectorAll('[data-wnd-opt]'), function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-wnd-opt');
          digestOpts[key] = !digestOpts[key];
          paint();
        });
      });

      // Dispatch Actions
      on('wndSendNow', 'click', function () { sendDigestToOwner(digestDate || App.today()); });
      on('wndSendApiBtn', 'click', function () { sendDigestToOwner(digestDate || App.today(), 'api'); });
      on('wndSendWebBtn', 'click', function () { sendDigestToOwner(digestDate || App.today(), 'web'); });
      on('wndCopyBtn', 'click', function () {
        var m = getNightDigestMetrics(digestDate || App.today());
        var txt = formatNightDigestMessage(m, digestOpts);
        copyText(txt);
      });
      on('wndPrintClosing', 'click', function () {
        var m = getNightDigestMetrics(digestDate || App.today());
        printNightClosingSheet(m);
      });

      // Save Owner Settings
      on('wndSaveSettings', 'click', function () {
        var phone = document.getElementById('wndOwnerPhone').value.trim();
        var name = document.getElementById('wndOwnerName').value.trim();
        var time = document.getElementById('wndOwnerTime').value.trim();
        var auto = document.getElementById('wndOwnerAuto').checked;
        saveOwnerDigestSettings({
          ownerPhone: phone,
          ownerName: name,
          ownerTime: time,
          ownerAuto: auto,
          sections: digestOpts
        });
        paint();
      });

      // Historical log view & resend
      Array.prototype.forEach.call(v.querySelectorAll('[data-wnd-resend]'), function (b) {
        b.addEventListener('click', function () {
          var d = b.getAttribute('data-wnd-resend');
          sendDigestToOwner(d);
        });
      });

      Array.prototype.forEach.call(v.querySelectorAll('[data-wnd-view]'), function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-wnd-view');
          var l = DB.get('wa_digest_log', id);
          if (!l) return;
          App.modal('Night Digest Summary (' + (l.date || '') + ')',
            '<div style="font-family:system-ui;font-size:13px;line-height:1.5;white-space:pre-wrap;background:#f8fafc;padding:14px;border-radius:10px;border:1px solid #cbd5e1;max-height:450px;overflow-y:auto">' +
            esc(l.text || 'No text stored') + '</div>' +
            '<div class="modal-actions" style="margin-top:14px">' +
            '<button class="btn btn-ghost" id="wndCopyModal">Copy</button>' +
            '<button class="btn btn-primary" id="wndCloseModal">Close</button></div>',
            { onOpen: function (ov, close) {
                ov.querySelector('#wndCloseModal').addEventListener('click', close);
                ov.querySelector('#wndCopyModal').addEventListener('click', function () { copyText(l.text || ''); });
              }
            }
          );
        });
      });
    }

    // Ready Tab Actions
    Array.prototype.forEach.call(v.querySelectorAll('[data-send]'), function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-send').split('|'); sendOne(p[0], p[1], paint); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('[data-retry]'), function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-retry').split('|'); sendOne(p[0], p[1], function () { setTimeout(paint, 1500); }); });
    });
    Array.prototype.forEach.call(v.querySelectorAll('.wcRow'), function (c) {
      c.addEventListener('change', function () { sel[c.getAttribute('data-id')] = c.checked; paint(); });
    });
    on('wcAll', 'change', function (e) {
      Array.prototype.forEach.call(v.querySelectorAll('.wcRow:not(:disabled)'), function (c) { sel[c.getAttribute('data-id')] = e.target.checked; }); paint();
    });
    on('wcSendSel', 'click', function () {
      var ids = Object.keys(sel).filter(function (k) { return sel[k]; }), i = 0;
      sel = {}; App.toast('Sending ' + ids.length + ' report' + (ids.length === 1 ? '' : 's') + '…');
      (function next() { if (i >= ids.length) { setTimeout(paint, 1200); return; } App.wa.manual(ids[i++], 'patient'); setTimeout(next, 1500); })();
    });
    on('wcRetryAll', 'click', function () {
      var seen = {}, jobs = [];
      logs().forEach(function (e) { var k = (e.kind || 'report'); if (e.status === 'failed' && k !== 'critical' && e.invoiceId) { var key = e.invoiceId + '|' + e.toRole; if (!seen[key] && !App.wa.alreadySent(e.invoiceId, e.toRole || 'patient')) { seen[key] = 1; jobs.push(key.split('|')); } } });
      if (!jobs.length) { App.toast('Nothing to retry'); return; }
      var i = 0; App.toast('Retrying ' + jobs.length + '…');
      (function next() { if (i >= jobs.length) { setTimeout(paint, 1500); return; } App.wa.manual(jobs[i][0], jobs[i][1]); i++; setTimeout(next, 1500); })();
    });

    // Log Filters
    on('lgStatus', 'change', function (e) { logF.status = e.target.value; paint(); });
    on('lgKind', 'change', function (e) { logF.kind = e.target.value; paint(); });
    on('lgQ', 'input', function (e) {
      logF.q = e.target.value.trim(); clearTimeout(wire.t);
      wire.t = setTimeout(function () { paint(); var q = document.getElementById('lgQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300);
    });

    // Template Tab Actions
    if (tab === 'tpl') {
      ['tplPatient', 'tplDoctor', 'tplDue'].forEach(function (k) { on('t_' + k, 'input', preview); });
      preview();
      Array.prototype.forEach.call(v.querySelectorAll('[data-ins]'), function (b) {
        b.addEventListener('click', function () {
          var p = b.getAttribute('data-ins').split('|'), t = document.getElementById('t_' + p[0]); if (!t) return;
          var a = t.selectionStart || 0, z = t.selectionEnd || 0; t.value = t.value.slice(0, a) + p[1] + t.value.slice(z); t.focus(); t.setSelectionRange(a + p[1].length, a + p[1].length); preview();
        });
      });
      Array.prototype.forEach.call(v.querySelectorAll('[data-reset]'), function (b) {
        b.addEventListener('click', function () { var k = b.getAttribute('data-reset'); document.getElementById('t_' + k).value = App.wa.tpl[k]; preview(); });
      });
      on('wcSaveRules', 'click', saveRules);
      on('wcTest', 'click', function () {
        var cfg = App.wa.cfg(), to = App.wa.phone(cfg.labNumber);
        if (!App.wa.ready(cfg)) { App.toast('WhatsApp API is not configured', 'err'); return; }
        var d = readDraft(); App.toast('Sending test…', 'info');
        App.wa.send(cfg, to, '🧪 TEST\n\n' + App.wa.render(d.tplPatient, SAMPLE), function (err) {
          if (err) App.toast('Test failed: ' + String(err.message || err).slice(0, 100), 'err');
          else App.toast('Test message sent to ' + cfg.labNumber);
        });
      });
    }
  }

  function go(t) {
    if (tab === 'tpl' && document.getElementById('t_tplPatient')) tplDraft = readDraft();
    var me = App.session();
    if ((t === 'tpl' || t === 'settings') && !(me && me.role === 'admin')) { App.nav('#/whatsapp'); return ''; }
    tab = t;
    sel = {};
    return render();
  }

  /* ---- WhatsApp Settings (moved from Settings > WhatsApp Automation) ---- */
  /* ---- WhatsApp API (admin only) ---- */
  function waDefaults() {
    return { provider: 'ultramsg', instanceId: '', token: '', baseUrl: '', labNumber: '', autoPatient: true, autoDoctor: false, autoCritical: true, autoReceipt: false, autoDueReminder: false, dueReminderDay: 1, autoOwnerSummary: false, ownerSummaryHour: 21, ownerNumber: '', autoFeedback: false, googleReviewUrl: '', autoRetest: false };
  }
  /* ---- Link the lab's own WhatsApp number with a QR code (the server then sends from it) ---- */
  function wireGateway() {
    var box = document.getElementById('waGwBox'); if (!box) return;
    if (!(DB.isCloud && DB.isCloud()) || (window.labposDesktop && window.labposDesktop.isDesktop)) { box.remove(); return; }
    var timer = null, last = '';
    function setCfg(patch) { var st = DB.get('settings', 'main') || {}, ww = Object.assign(waDefaults(), st.whatsapp || {}); Object.assign(ww, patch); st.whatsapp = ww; DB.update('settings', 'main', st); }
    function qrImg(str) { try { var q = qrcode(0, 'L'); q.addData(str); q.make(); return q.createDataURL(5, 4); } catch (e) { return ''; } }
    function draw(st) {
      var sig = JSON.stringify([st.state, st.qr, st.number, st.err]); if (sig === last) return; last = sig;
      var w = (DB.get('settings', 'main') || {}).whatsapp || {};
      var head = '<div class="card wa-card" style="margin-bottom:16px"><div class="card-h"><h3>Connect your WhatsApp number</h3><span class="badge ' + (st.state === 'open' ? 'b-ready' : 'b-pending') + '" style="margin-left:8px">' + (st.state === 'open' ? 'CONNECTED' : 'NOT CONNECTED') + '</span></div><div class="card-b">';
      var body = '';
      if (st.enabled === false) body = '<p class="muted" style="margin:0">Linking a WhatsApp number is not available on this server.</p>';
      else if (st.state === 'open') {
        body = '<p style="margin-top:0">Connected: <b>+' + App.esc(st.number) + '</b>. These messages are now sent from this number:</p>' +
          '<ul style="margin:0 0 12px;padding-left:18px;line-height:1.75;font-size:13.5px"><li><b>Report ready</b> to the patient (and, if switched on below, the referring doctor)</li><li><b>Balance pending</b> note to the patient</li><li><b>Critical result</b> alert to the referring doctor and your lab number</li><li><b>Sign-in code and link</b> when a patient or doctor opens the reports portal</li><li><b>Doctor statements</b>, when you press Send on WhatsApp</li></ul>' +
          '<div style="margin:0 0 12px"><label class="label" for="gwGap">Sending speed (protects your number from being blocked)</label><select class="select" id="gwGap" style="max-width:380px">' +
          [[30, 'One message every 30 seconds'], [60, 'One message every minute (recommended)'], [120, 'One message every 2 minutes'], [300, 'One message every 5 minutes']].map(function (o) { return '<option value="' + o[0] + '"' + ((+w.gapSeconds || 60) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<div class="muted" style="font-size:12.5px;margin-top:5px">When many reports are sent together they wait in a line and leave one by one. <b>Sign-in codes and critical alerts are never delayed.</b></div></div>' +
          '<p class="muted" style="margin:0 0 12px;font-size:13px">You can change the wording in <b>WhatsApp → Templates &amp; rules</b>. Messages go only to people with a phone number saved in your records.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="gwTest">Send a test message to this number</button><button class="btn btn-ghost" id="gwOff" style="margin-left:auto;color:#b91c1c">Disconnect</button></div><p class="muted" id="gwMsg" style="margin:10px 0 0;font-size:13px"></p>';
      } else if (st.state === 'qr' && st.qr) {
        body = '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start"><img alt="QR" style="width:230px;height:230px;border:1px solid var(--line);border-radius:12px;padding:6px;background:#fff" src="' + qrImg(st.qr) + '">' +
          '<ol style="margin:0;padding-left:18px;line-height:1.9;font-size:14px;flex:1;min-width:210px"><li>Open <b>WhatsApp</b> on the lab\'s phone</li><li>Tap <b>Settings → Linked devices</b></li><li>Tap <b>Link a device</b> and scan this code</li></ol></div><p class="muted" style="margin:10px 0 0;font-size:13px">Waiting for the scan… the code refreshes by itself.</p>';
      } else if (st.state === 'connecting') {
        body = '<p class="muted" style="margin:0">Connecting to WhatsApp…</p>';
      } else {
        body = '<p class="muted" style="margin-top:0">Link <b>your lab\'s own WhatsApp number</b> by scanning a QR code, just like WhatsApp Web. After that, report links and sign-in codes go out from your number automatically. No paid API needed.</p>' +
          '<div style="background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.55;margin-bottom:12px"><b>Please note:</b> this works like WhatsApp Web, it is not the official WhatsApp Business API. Use a <b>separate number kept for the lab</b>, message only your own patients, and avoid bulk or promotional messages, otherwise WhatsApp can block the number.</div>' +
          (st.err ? '<p style="color:#b45309;margin:0 0 10px;font-size:13.5px">' + App.esc(st.err) + '</p>' : '') + '<button class="btn btn-primary" id="gwOn">Link my WhatsApp number</button>';
      }
      box.innerHTML = head + body + '</div></div>';
      var on = document.getElementById('gwOn'); if (on) on.addEventListener('click', function () { on.disabled = true; last = ''; DB.waGw('POST', 'connect', {}).then(function (s) { draw(s); poll(); }, function (e) { on.disabled = false; App.toast(e.message, 'err'); }); });
      var gp = document.getElementById('gwGap'); if (gp) gp.addEventListener('change', function () { setCfg({ gapSeconds: +gp.value }); App.toast('Sending speed saved: one message every ' + (+gp.value >= 60 ? (gp.value / 60) + ' min' : gp.value + ' seconds')); });
      var test = document.getElementById('gwTest'); if (test) test.addEventListener('click', function () { test.disabled = true; DB.waGw('POST', 'send', { to: st.number, text: '*' + ((DB.get('settings', 'main') || {}).labName || 'Your lab') + '*\n\nThis is a test message. Your WhatsApp number is linked and ready to send reports.' }).then(function () { document.getElementById('gwMsg').textContent = 'Sent! Check WhatsApp (it may appear in "Message yourself").'; test.disabled = false; }, function (e) { document.getElementById('gwMsg').textContent = e.message; document.getElementById('gwMsg').style.color = '#b91c1c'; test.disabled = false; }); });
      var off = document.getElementById('gwOff'); if (off) off.addEventListener('click', function () { App.confirm('Disconnect this WhatsApp number? Reports will stop going out on WhatsApp until you link a number again.').then(function (ok) { if (!ok) return; DB.waGw('POST', 'disconnect', {}).then(function () { setCfg({ provider: (w.instanceId && w.token) ? 'ultramsg' : '', gatewayNumber: '' }); last = ''; draw({ enabled: true, state: 'idle', qr: '', number: '', err: '' }); }, function (e) { App.toast(e.message, 'err'); }); }); });
    }
    function poll() {
      clearInterval(timer);
      timer = setInterval(function () {
        if (!document.getElementById('waGwBox')) { clearInterval(timer); return; }
        DB.waGw('GET', 'status').then(function (st) {
          var w = (DB.get('settings', 'main') || {}).whatsapp || {};
          if (st.state === 'open' && (w.provider !== 'gateway' || w.gatewayNumber !== st.number)) { setCfg({ provider: 'gateway', gatewayNumber: st.number, labNumber: w.labNumber || st.number }); App.toast('WhatsApp number linked'); }
          draw(st); if (st.state === 'open' || st.state === 'idle' || st.state === 'loggedout') clearInterval(timer);
        }, function () {});
      }, 2000);
    }
    DB.waGw('GET', 'status').then(function (st) {
      var w = (DB.get('settings', 'main') || {}).whatsapp || {};
      if (st.state === 'open' && (w.provider !== 'gateway' || w.gatewayNumber !== st.number)) setCfg({ provider: 'gateway', gatewayNumber: st.number, labNumber: w.labNumber || st.number });
      if (st.state === 'loggedout' && w.provider === 'gateway') setCfg({ provider: (w.instanceId && w.token) ? 'ultramsg' : '', gatewayNumber: '' });
      draw(st); if (st.state === 'qr' || st.state === 'connecting') poll();
    }, function (e) { box.innerHTML = ''; });
  }

  function renderSetWhatsapp() {
    var s = DB.get('settings', 'main') || {};
    var w = Object.assign(waDefaults(), s.whatsapp || {});
    var autoPat = w.autoPatient !== false;   /* default ON */
    var autoDoc = w.autoDoctor === true;     /* default OFF */
    var autoCrit = w.autoCritical !== false; /* default ON */

    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var hours = [18, 19, 20, 21, 22, 23].map(function (h) {
      return '<option value="' + h + '"' + ((+w.ownerSummaryHour || 21) === h ? ' selected' : '') + '>' + (h - 12) + ':00 PM</option>';
    }).join('');

    function rowSwitch(id, checked, title, desc, badge, extra) {
      return '<div class="wa-row-item">'
        + '<div class="wa-row-content">'
        + '  <div class="wa-row-title">'
        + '    <span>' + title + '</span>'
        +      (badge ? (' ' + badge) : '')
        + '  </div>'
        + '  <p class="wa-row-desc">' + desc + '</p>'
        +    (extra ? ('<div class="wa-sub-box">' + extra + '</div>') : '')
        + '</div>'
        + '<label class="wa-switch" title="Toggle ' + App.esc(title) + '">'
        + '  <input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>'
        + '  <span class="wa-slider"></span>'
        + '</label>'
        + '</div>';
    }

    var html =
      '<style>'
      + '.wa-set-wrap{max-width:820px;margin:0}'
      + '.wa-set-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;background:linear-gradient(135deg,#f0fdf4 0%,#e6f7ec 100%);border:1.5px solid #bbf7d0;border-radius:14px;margin-bottom:18px}'
      + '.wa-set-head-left{display:flex;align-items:center;gap:14px}'
      + '.wa-brand-ico{width:46px;height:46px;border-radius:12px;background:#25D366;color:#fff;display:grid;place-items:center;box-shadow:0 4px 14px rgba(37,211,102,.35);flex:none}'
      + '.wa-set-title{font-size:18px;font-weight:800;color:#14532d;margin:0 0 3px}'
      + '.wa-set-sub{font-size:13px;color:#166534;margin:0}'
      + '.wa-card{margin-bottom:16px;border-radius:14px;box-shadow:0 1px 4px rgba(15,30,46,.04)}'
      + '.wa-card .card-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px}'
      + '.wa-card-title-group{display:flex;align-items:center;gap:9px}'
      + '.wa-card-ic{font-size:16px}'
      + '.wa-row-item{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid var(--line2)}'
      + '.wa-row-item:first-of-type{border-top:none;padding-top:2px}'
      + '.wa-row-content{flex:1;min-width:0}'
      + '.wa-row-title{font-size:14px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px;margin-bottom:2px}'
      + '.wa-row-desc{font-size:12.5px;color:var(--muted);line-height:1.45;margin:0}'
      + '.wa-sub-box{margin-top:10px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}'
      + '.wa-switch{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;cursor:pointer;margin-top:2px}'
      + '.wa-switch input{opacity:0;width:0;height:0;position:absolute}'
      + '.wa-slider{position:absolute;inset:0;background-color:#cbd5e1;border-radius:99px;transition:.2s ease}'
      + '.wa-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:#fff;border-radius:50%;transition:.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.25)}'
      + '.wa-switch input:checked + .wa-slider{background-color:#16a34a}'
      + '.wa-switch input:checked + .wa-slider:before{transform:translateX(20px)}'
      + '.wa-badge-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}'
      + '.wa-badge-alert{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}'
      + '.wa-badge-green{background:#dcfce7;color:#15803d;border:1px solid #86efac}'
      + '.wa-action-bar{display:flex;align-items:center;gap:14px;margin-top:20px;padding:16px 20px;background:#f8fafc;border:1px solid var(--line);border-radius:14px;flex-wrap:wrap}'
      + '@media(max-width:640px){.wa-set-head{flex-direction:column;align-items:flex-start}.wa-row-item{flex-direction:column-reverse;align-items:flex-end;gap:8px}}'
      + '</style>'
      + '<div class="wa-set-wrap">'
      + '<div class="wa-set-head">'
      + '  <div class="wa-set-head-left">'
      + '    <div class="wa-brand-ico">'
      + '      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.41a8.17 8.17 0 0 1 2.4 5.83c0 4.54-3.7 8.24-8.24 8.24-1.44 0-2.86-.38-4.12-1.1l-.3-.17-3.12.82.83-3.04-.19-.31a8.16 8.16 0 0 1-1.25-4.44c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08s.89 2.41 1.01 2.58c.13.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.3"/></svg>'
      + '    </div>'
      + '    <div>'
      + '      <h2 class="wa-set-title">WhatsApp Automation &amp; Alerts</h2>'
      + '      <p class="wa-set-sub">Deliver reports, billing receipts, dues reminders and critical clinical alerts automatically.</p>'
      + '    </div>'
      + '  </div>'
      + '  <div>'
      + '    <a href="#/whatsapp" class="btn btn-sm btn-ghost" style="font-weight:700">Open WhatsApp Center &rarr;</a>'
      + '  </div>'
      + '</div>'
      + '<div id="waGwBox"></div>'
      + '<div class="card wa-card">'
      + '  <div class="card-h">'
      + '    <div class="wa-card-title-group"><span class="wa-card-ic">📱</span><h3 style="margin:0">Lab WhatsApp Number</h3></div>'
      + '    <span class="badge ' + (w.labNumber ? 'b-ready' : 'b-pending') + '">' + (w.labNumber ? 'NUMBER SET' : 'NOT SET') + '</span>'
      + '  </div>'
      + '  <div class="card-b">'
      + '    <p class="muted" style="font-size:13px;margin:0 0 10px">This number represents your lab on WhatsApp — printed on bills and invoices, and used as the sender contact.</p>'
      + '    <div style="display:flex;gap:10px;align-items:center;max-width:440px">'
      + '      <input class="input" id="waLabNum" placeholder="e.g. 0300-1234567 or 923001234567" value="' + App.esc(w.labNumber || '') + '" style="font-size:14px;font-weight:600">'
      + '      <button class="btn btn-primary" id="waLabNumSave" type="button" style="flex:none">Save</button>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '<div class="card wa-card">'
      + '  <div class="card-h">'
      + '    <div class="wa-card-title-group"><span class="wa-card-ic">👤</span><h3 style="margin:0">Patient Automated Messages</h3></div>'
      + '    <span class="muted" style="font-size:12.5px">Sent to patient\'s mobile number</span>'
      + '  </div>'
      + '  <div class="card-b">'
      +     rowSwitch('waAutoPatient', autoPat, 'Auto-send Report when Ready', 'Automatically send the PDF report download link to the patient on WhatsApp as soon as all test results are ready and finalized.', '<span class="wa-badge-pill wa-badge-green">Instant</span>')
      +     rowSwitch('waAutoReceipt', w.autoReceipt === true, 'Billing Receipt on Registration', 'A few minutes after an invoice is created, send the patient an instant digital receipt with invoice no., total billed, amount paid, and balance.')
      +     rowSwitch('waAutoDue', w.autoDueReminder === true, 'Weekly Outstanding Balance Reminder', 'Send a polite weekly balance reminder with the remaining amount to patients who have unpaid dues (sent at most 4 times per invoice).', '',
              '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><label class="label" for="waDueDay" style="margin:0">Send weekly on:</label><select class="select" id="waDueDay" style="max-width:180px">' + days.map(function (d, i) { return '<option value="' + i + '"' + ((+w.dueReminderDay === i) ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>')
      + '  </div>'
      + '</div>'
      + '<div class="card wa-card">'
      + '  <div class="card-h">'
      + '    <div class="wa-card-title-group"><span class="wa-card-ic">🚨</span><h3 style="margin:0">Doctor &amp; Emergency Clinical Alerts</h3></div>'
      + '    <span class="muted" style="font-size:12.5px">Clinical safety &amp; referral sharing</span>'
      + '  </div>'
      + '  <div class="card-b">'
      +     rowSwitch('waAutoCritical', autoCrit, 'Critical Value Panic Alerts', 'When a recorded test result is far outside the safe biological limit, immediately alert the referring doctor and your lab number.', '<span class="wa-badge-pill wa-badge-alert">Urgent Safety</span>')
      +     rowSwitch('waAutoDoctor', autoDoc, 'Auto-send Report to Referring Doctor', 'Automatically send a digital copy of the finalized test report to the patient\'s referring doctor on WhatsApp.')
      + '  </div>'
      + '</div>'
      + '<div class="card wa-card">'
      + '  <div class="card-h">'
      + '    <div class="wa-card-title-group"><span class="wa-card-ic">📈</span><h3 style="margin:0">Owner Summary &amp; Patient Retention</h3></div>'
      + '    <span class="muted" style="font-size:12.5px">Business intelligence &amp; follow-ups</span>'
      + '  </div>'
      + '  <div class="card-b">'
      +     rowSwitch('waAutoOwner', w.autoOwnerSummary === true, 'Daily Business Summary to Owner', 'Every evening, receive an automated WhatsApp report of today\'s total patients, total billing, cash collected, and outstanding dues.', '',
              '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end"><div><label class="label" for="waOwnerHour" style="margin-bottom:3px">Delivery Time</label><select class="select" id="waOwnerHour">' + hours + '</select></div>'
              + '<div style="flex:1;min-width:200px"><label class="label" for="waOwnerNum" style="margin-bottom:3px">Owner WhatsApp Number</label><input class="input" id="waOwnerNum" placeholder="Leave blank to use lab number above" value="' + App.esc(w.ownerNumber || '') + '"></div>'
              + '<button class="btn btn-ghost btn-sm" id="waOwnerTest" type="button" style="font-weight:600">Send Today\'s Summary Now</button></div>')
      +     rowSwitch('waAutoFeedback', w.autoFeedback === true, 'Feedback &amp; Google 5-Star Review Request', 'A day after a fully paid report, thank the patient and invite them to leave a review on your Google Maps profile.', '',
              '<div><label class="label" for="waReviewUrl" style="margin-bottom:3px">Google Review Link <span class="muted" style="font-weight:400">(e.g. https://g.page/r/...)</span></label><input class="input" id="waReviewUrl" placeholder="https://g.page/r/..." value="' + App.esc(w.googleReviewUrl || '') + '"></div>')
      +     rowSwitch('waAutoRetest', w.autoRetest === true, 'Periodic Repeat-Test Reminder', 'Remind chronic patients a few days before a test is due again (e.g. HbA1c after 3 months, Lipid after 6 months).', '',
              '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" id="waRetestFill" type="button" style="font-weight:600">Auto-fill common repeat days on tests</button><span class="muted" id="waRetestMsg" style="font-size:12.5px"></span></div>')
      + '  </div>'
      + '</div>'
      + '<div class="wa-action-bar">'
      + '  <button class="btn btn-primary" id="waSaveAll" type="button" style="padding:10px 24px;font-weight:700;font-size:14px;background:#16a34a;border-color:#16a34a">'
      + '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px;vertical-align:middle"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save WhatsApp Settings'
      + '  </button>'
      + '  <span class="muted" style="font-size:12.5px">Switches auto-save immediately on toggle. Delivery schedules are in Pakistan Standard Time (PKT).</span>'
      + '</div>'
      + '</div>';

    document.getElementById('view').innerHTML = html;
    wireGateway();

    function saveAllWhatsApp(notify) {
      var g = function (id) { return document.getElementById(id); };
      var st = DB.get('settings', 'main') || {};
      var ww = Object.assign(waDefaults(), st.whatsapp || {});

      var labNumEl = g('waLabNum');
      if (labNumEl) ww.labNumber = labNumEl.value.trim();

      var apEl = g('waAutoPatient'); if (apEl) ww.autoPatient = apEl.checked;
      var adEl = g('waAutoDoctor'); if (adEl) ww.autoDoctor = adEl.checked;
      var acEl = g('waAutoCritical'); if (acEl) ww.autoCritical = acEl.checked;

      var arEl = g('waAutoReceipt'); if (arEl) ww.autoReceipt = arEl.checked;
      var aduEl = g('waAutoDue'); if (aduEl) ww.autoDueReminder = aduEl.checked;
      var ddEl = g('waDueDay'); if (ddEl) ww.dueReminderDay = +ddEl.value;

      var aoEl = g('waAutoOwner'); if (aoEl) ww.autoOwnerSummary = aoEl.checked;
      var ohEl = g('waOwnerHour'); if (ohEl) ww.ownerSummaryHour = +ohEl.value;
      var onEl = g('waOwnerNum'); if (onEl) ww.ownerNumber = onEl.value.trim();

      var afEl = g('waAutoFeedback'); if (afEl) ww.autoFeedback = afEl.checked;
      var ruEl = g('waReviewUrl');
      if (ruEl) {
        var rUrl = ruEl.value.trim();
        if (rUrl && !/^https:\/\//i.test(rUrl)) {
          App.toast('Google review link must start with https://', 'err');
          return false;
        }
        ww.googleReviewUrl = rUrl;
      }

      var atEl = g('waAutoRetest'); if (atEl) ww.autoRetest = atEl.checked;

      st.whatsapp = ww;
      DB.update('settings', 'main', st);
      if (notify !== false) App.toast('WhatsApp settings saved successfully!');
      return true;
    }

    var saveBtn = document.getElementById('waSaveAll');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveAllWhatsApp(true); });

    var labNumBtn = document.getElementById('waLabNumSave');
    if (labNumBtn) labNumBtn.addEventListener('click', function () { saveAllWhatsApp(true); });

    ['waAutoPatient', 'waAutoDoctor', 'waAutoCritical', 'waAutoReceipt', 'waAutoDue', 'waAutoOwner', 'waAutoFeedback', 'waAutoRetest'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          if (saveAllWhatsApp(false)) {
            App.toast((this.checked ? 'Switched ON' : 'Switched OFF') + ' — saved');
          }
        });
      }
    });

    ['waDueDay', 'waOwnerHour'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          saveAllWhatsApp(false);
        });
      }
    });

    var ownerTestBtn = document.getElementById('waOwnerTest');
    if (ownerTestBtn) {
      ownerTestBtn.addEventListener('click', function () {
        var b = this;
        if (!saveAllWhatsApp(false)) return;
        b.disabled = true;
        DB.waGw('POST', 'auto/test', {}).then(function () {
          b.disabled = false;
          App.toast('Summary sent to owner number');
        }, function (e) {
          b.disabled = false;
          App.toast(e && e.message ? e.message : 'Could not send — is WhatsApp connected?');
        });
      });
    }

    var retestFillBtn = document.getElementById('waRetestFill');
    if (retestFillBtn) {
      retestFillBtn.addEventListener('click', function () {
        var rules = [
          [/hba1c|glycosylated|glycated/i, 90],
          [/lipid|cholesterol/i, 180],
          [/tsh|thyroid|\bt3\b|\bt4\b/i, 180],
          [/vitamin\s*d|25.?oh/i, 180],
          [/vitamin\s*b.?12|b12/i, 180],
          [/ferritin|iron/i, 180],
          [/\bhb\b|cbc|complete blood/i, 0],
          [/creatinine|urea|kft|rft|renal/i, 180],
          [/lft|liver|alt|sgpt/i, 180],
          [/psa/i, 365]
        ];
        var n = 0;
        DB.all('tests').forEach(function (t) {
          if (+t.retestDays > 0 || t.isPackage) return;
          for (var i = 0; i < rules.length; i++) {
            if (rules[i][1] && rules[i][0].test(t.name || '')) {
              DB.update('tests', t.id, Object.assign({}, t, { retestDays: rules[i][1] }));
              n++;
              break;
            }
          }
        });
        var msgEl = document.getElementById('waRetestMsg');
        if (msgEl) {
          msgEl.textContent = n ? (n + ' test(s) updated (HbA1c 3 months; lipid, thyroid, vit D/B12, kidney, liver 6 months).') : 'Nothing to change — matching tests already have repeat days.';
        }
      });
    }
  }

  App.route('/whatsapp/settings', function () { return go('settings'); });
  App.route('/whatsapp', function () { return go('ready'); });
  App.route('/whatsapp/log', function () { return go('log'); });
  App.route('/whatsapp/digest', function () { return go('digest'); });
  App.route('/digest', function () { return go('digest'); });
  App.route('/whatsapp/templates', function () { return go('tpl'); });
})();
