/* LabPOS mail sender — password-reset emails (and other notices).
   Configure with environment variables on the server:
     SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE=1 (for port 465), MAIL_FROM ("Optix LAB MedSync <you@example.com>")
   Any SMTP provider works (Gmail with an app password, Brevo, Zoho, a domain mailbox...).
   MAIL_DEBUG_FILE=<path> writes each email as a JSON line instead of sending (tests / dry runs).
   nodemailer is loaded lazily, so the desktop app (which never sends mail) does not need it. */
'use strict';
const fs = require('fs');

let transporter = null, tKey = '';
let saved = null; /* settings saved from the superadmin console: { host, port, secure, user, pass, from } (override the environment) */
function setConfig(c) { saved = (c && c.host) ? c : null; transporter = null; tKey = ''; }
function current() {
  if (saved) return { host: saved.host, port: +saved.port || 587, secure: !!saved.secure, user: saved.user || '', pass: saved.pass || '', from: saved.from || saved.user || '', source: 'saved' };
  if (process.env.SMTP_HOST) {
    const port = +process.env.SMTP_PORT || 587;
    return { host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === '1' || port === 465, user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '', from: process.env.MAIL_FROM || process.env.SMTP_USER || '', source: 'server' };
  }
  return null;
}
const configured = () => !!(process.env.MAIL_DEBUG_FILE || current());

async function send(m, override) {
  const conf = override || current();
  const from = (conf && conf.from) || process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  if (process.env.MAIL_DEBUG_FILE && !override) {
    fs.appendFileSync(process.env.MAIL_DEBUG_FILE, JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text, html: m.html }) + '\n');
    return { debug: true };
  }
  if (!conf || !conf.host) throw new Error('mail is not configured');
  const key = JSON.stringify([conf.host, conf.port, conf.secure, conf.user, conf.pass]);
  let t = transporter;
  if (override || !t || tKey !== key) {
    t = require('nodemailer').createTransport({
      host: conf.host, port: conf.port, secure: !!conf.secure,
      auth: conf.user ? { user: conf.user, pass: conf.pass || '' } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    });
    if (!override) { transporter = t; tKey = key; }
  }
  return t.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* the reset email: plain, one big button, expiry stated, "ignore this if it was not you" */
function resetEmail({ labName, name, link, minutes }) {
  const subject = 'Reset your Optix LAB MedSync password';
  const text = `Hello ${name || ''},\n\nWe received a request to reset the password of your account at ${labName}.\n\nOpen this link to choose a new password (valid for ${minutes} minutes, works once):\n${link}\n\nIf you did not ask for this, you can ignore this email — your password stays the same.\n\nOptix LAB MedSync`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:24px;color:#131845">
    <h2 style="margin:0 0 12px">Reset your password</h2>
    <p>Hello ${esc(name || '')},</p>
    <p>We received a request to reset the password of your account at <b>${esc(labName)}</b>.</p>
    <p style="margin:24px 0"><a href="${esc(link)}" style="background:#131845;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;display:inline-block">Choose a new password</a></p>
    <p style="font-size:13px;color:#5b6b80">The link is valid for ${minutes} minutes and works once. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>
    <p style="font-size:13px;color:#5b6b80">If you did not ask for this, ignore this email — your password stays the same.</p>
    <p style="font-size:12px;color:#8a94a6;margin-top:24px">Optix LAB MedSync</p></div>`;
  return { subject, text, html };
}
function changedEmail({ labName, name }) {
  const subject = 'Your Optix LAB MedSync password was changed';
  const text = `Hello ${name || ''},\n\nThe password of your account at ${labName} was just changed. If this was you, nothing more to do. If it was not you, reset it again right away and tell your lab admin.\n\nOptix LAB MedSync`;
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:24px;color:#131845"><h2 style="margin:0 0 12px">Password changed</h2><p>Hello ${esc(name || '')},</p><p>The password of your account at <b>${esc(labName)}</b> was just changed.</p><p style="font-size:13px;color:#5b6b80">If this was you, nothing more to do. If it was not you, reset it again right away and tell your lab admin.</p></div>` };
}

module.exports = { configured, send, setConfig, current, resetEmail, changedEmail };
