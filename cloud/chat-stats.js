/* Optix Assistant — read-only lab stats for the /api/chat endpoint.
   Mirrors the dashboard formulas from assets/js/mod-dashboard.js exactly:
     today's collection = sum of payments dated today (dayKey(p.date) === today)
     today's tests     = sum of items.length over invoices created today
     pending results   = count of results with status === 'pending'
   Lab scoping follows the server's own path: the saas lab registry resolves a
   labId (or slug) to a tenant, and saas.storeFor(lab) returns that tenant's
   isolated store (tenant-store.js + sync-store.js), exactly like cloud/server.js.
   Strictly read-only — only .all() is ever called; nothing is written anywhere.
   NEVER throws: any failure (bad labId, unreachable DB, missing adapter, ...)
   resolves to the zero stats object. */
'use strict';

const path = require('path');

/* "today" is the lab's calendar day. The dashboard computes it in the browser
   (the user's local timezone — Pakistan); the server itself may run on UTC, so
   pin the day boundary to Asia/Karachi, overridable via CHAT_STATS_TZ. */
const TZ = process.env.CHAT_STATS_TZ || 'Asia/Karachi';

function dayKey(d) { return String(d || '').slice(0, 10); }

function todayKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (e) {
    const t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
}

function zeroStats() { return { todayCollection: 0, pendingResults: 0, todayTests: 0 }; }

/* Lazy singleton: the DB connection is opened once per process (same lifecycle
   as the main server's own store) so every chat message does not pay for a new
   connection. Opened read-only in spirit — this module only ever calls .all(). */
let cached = null;
async function getSaas() {
  if (cached) return cached;
  const adapter = String(process.env.DB_ADAPTER || 'pg').toLowerCase();
  const mod = adapter === 'pg' ? require('./db-pg') : require('./db-sqlite');
  const raw = await mod.openStore(
    adapter === 'pg' ? (process.env.DATABASE_URL || '') : (process.env.SQLITE_PATH || path.join(__dirname, 'labpos-cloud.db'))
  );
  /* hashPassword / defaultsFor are only used by the signup paths (createLab),
     which this read-only module never touches. */
  const saas = require('./saas').create({
    raw,
    TABLES: mod.TABLES,
    hashPassword: function () { throw new Error('chat-stats: read-only'); },
    defaultsFor: function () { return {}; },
  });
  cached = saas;
  return saas;
}

async function getAppStats(labId) {
  try {
    if (typeof labId !== 'string' || !labId || labId.length > 64 || !/^[A-Za-z0-9_.:-]{1,64}$/.test(labId)) return zeroStats();
    const saas = await getSaas();
    let lab = await saas.getLab(labId);
    if (!lab) lab = await saas.findBySlug(labId);
    if (!lab) return zeroStats();
    const st = saas.storeFor(lab);
    const today = todayKey();
    const payments = (await st.all('payments')) || [];
    const invoices = (await st.all('invoices')) || [];
    const results = (await st.all('results')) || [];

    let todayCollection = 0;
    for (const p of payments) {
      if (dayKey(p.date || p._c || p.createdAt) === today) todayCollection += +p.amount || 0;
    }
    /* match the dashboard: count ordered tests as the line items of today's invoices */
    let todayTests = 0;
    for (const i of invoices) {
      if (dayKey(i._c || i.createdAt) === today) todayTests += (i.items ? i.items.length : 0);
    }
    let pendingResults = 0;
    for (const r of results) {
      if (r.status === 'pending') pendingResults++;
    }
    return {
      todayCollection: Math.round(todayCollection * 100) / 100,
      pendingResults: pendingResults,
      todayTests: todayTests,
    };
  } catch (e) {
    return zeroStats();
  }
}

module.exports = { getAppStats };
