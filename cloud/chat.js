// Optix Assistant — /api/chat router (worker 3).
// POST / — chat proxy backed by the FreeLLM router via chat-llm.js.
// Mounted by worker 7: app.use('/api/chat', require('./chat'))

const express = require('express');

const { chatLlm } = require('./chat-llm');
const { buildWebsitePrompt, buildAppPrompt, websiteFallback, appFallback } = require('./chat-prompts');
const { getAppStats } = require('./chat-stats');

const router = express.Router();

// --- Simple in-memory per-IP rate limiter: 20 requests/minute ---
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;
const hits = new Map(); // ip -> array of timestamps

function isRateLimited(ip) {
  const now = Date.now();
  const list = hits.get(ip) || [];
  const recent = list.filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Prune stale entries opportunistically
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v[v.length - 1] < now - RATE_WINDOW_MS) hits.delete(k);
    }
  }
  return recent.length > RATE_MAX;
}

function getFallback(context) {
  return context === 'app' ? appFallback() : websiteFallback();
}

// --- Body validation ---
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;

  const rawMessage = body.message;
  if (typeof rawMessage !== 'string') return null;
  const message = rawMessage.trim();
  if (!message || message.length > 2000) return null;

  let history = [];
  if (Array.isArray(body.history)) {
    history = body.history
      .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.trim() }));
  }

  const context = body.context === 'app' ? 'app' : 'website';

  let labId = null;
  if (typeof body.labId === 'string' && body.labId.trim()) labId = body.labId.trim().slice(0, 100);

  let labName = null;
  if (typeof body.labName === 'string' && body.labName.trim()) labName = body.labName.trim().slice(0, 150);

  return { message, history, context, labId, labName };
}

router.post('/', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  // Rate limit check first
  if (isRateLimited(ip)) {
    const ctx = req.body && req.body.context === 'app' ? 'app' : 'website';
    return res.status(429).json({ reply: getFallback(ctx) });
  }

  const parsed = sanitizeBody(req.body);
  if (!parsed) {
    return res.status(400).json({ reply: 'I didn\'t quite catch that. Could you please rephrase your question?' });
  }

  const { message, history, context, labId, labName } = parsed;

  const labInfo = {
    name: labName || 'Optix Lab',
    phone: '',
    address: '',
    hours: '',
  };

  // App context: attach live lab stats (best effort, never fail the request)
  // PRIVACY INVARIANT: getAppStats() is called ONLY for context === 'app'.
  // The website context NEVER receives any patient/operational data — the
  // website system prompt is built with buildWebsitePrompt(labInfo) only,
  // where labInfo carries nothing but public company info (name, phone,
  // address, hours). Keep this split; do not add stats or store reads here.
  let stats = null;
  if (context === 'app') {
    try {
      stats = await getAppStats(labId);
    } catch (e) {
      stats = null;
    }
  }

  const system = context === 'app'
    ? buildAppPrompt(labInfo, stats)
    : buildWebsitePrompt(labInfo);

  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: message },
  ];

  let reply;
  try {
    reply = await chatLlm(messages);
  } catch (e) {
    reply = getFallback(context);
  }

  if (typeof reply !== 'string' || !reply.trim()) {
    reply = getFallback(context);
  }

  return res.status(200).json({ reply: reply.trim() });
});

module.exports = router;
