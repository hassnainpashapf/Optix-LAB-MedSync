/* LabPOS mail sender — password-reset emails (and other notices).
   Configure with environment variables on the server:
     SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE=1 (for port 465), MAIL_FROM ("Optix Medical Science <you@example.com>")
   Any SMTP provider works (Gmail with an app password, Brevo, Zoho, a domain mailbox...).
   MAIL_DEBUG_FILE=<path> writes each email as a JSON line instead of sending (tests / dry runs).
   nodemailer is loaded lazily, so the desktop app (which never sends mail) does not need it. */
'use strict';
const fs = require('fs');

let transporter = null, tKey = '';
let saved = null; /* settings saved from the superadmin console: { host, port, secure, user, pass, from } (override the environment) */
/* port 465 = TLS from the start; 587 / 25 = plain connection upgraded with STARTTLS. A wrong tick-box (SSL on 587) is the most common mistake, so the port decides. */
function tlsFor(port, tick) { return port === 465 ? true : ((port === 587 || port === 25) ? false : !!tick); }
function setConfig(c) { saved = (c && c.host) ? c : null; transporter = null; tKey = ''; }
function current() {
  if (saved) { const port = +saved.port || 587; return { host: saved.host, port, secure: tlsFor(port, saved.secure), user: saved.user || '', pass: saved.pass || '', from: saved.from || saved.user || '', source: 'saved' }; }
  if (process.env.SMTP_HOST) {
    const port = +process.env.SMTP_PORT || 587;
    return { host: process.env.SMTP_HOST, port, secure: tlsFor(port, process.env.SMTP_SECURE === '1'), user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '', from: process.env.MAIL_FROM || process.env.SMTP_USER || '', source: 'server' };
  }
  return null;
}
const configured = () => !!(process.env.MAIL_DEBUG_FILE || current());

async function send(m, override) {
  const conf = override || current();
  const from = (conf && conf.from) || process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  if (process.env.MAIL_DEBUG_FILE && !override) {
    fs.appendFileSync(process.env.MAIL_DEBUG_FILE, JSON.stringify({ from, fromName: m.fromName || '', replyTo: m.replyTo || '', to: m.to, subject: m.subject, text: m.text, html: m.html,
      attachments: (m.attachments || []).map((a) => ({ filename: a.filename, bytes: a.content ? a.content.length : 0, type: a.contentType })) }) + '\n');
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
  /* a lab's report mail shows the LAB's name as the sender, from the one mailbox this server uses (replies go to the lab's own address) */
  let fromField = from;
  if (m.fromName) { const a = /<([^>]+)>/.exec(from); fromField = { name: String(m.fromName).replace(/[\r\n"<>]/g, ' ').slice(0, 100), address: (a ? a[1] : from).trim() }; }
  return t.sendMail({ from: fromField, to: m.to, subject: m.subject, text: m.text, html: m.html, replyTo: m.replyTo || undefined, attachments: m.attachments || undefined });
}

/* turn the mail library's technical errors into something a shop owner can act on */
function friendlyError(e) {
  const m = String((e && e.message) || e || ''), c = String((e && e.code) || '');
  if (/wrong version number|ssl routines/i.test(m)) return 'Secure-connection mismatch. Use port 587 with the SSL/TLS box UNticked, or port 465 with it ticked.';
  if (/535|Invalid login|Username and Password not accepted|BadCredentials|authentication failed/i.test(m)) return 'The server rejected the username or password. For Gmail use a 16-letter App password (not the normal password), with 2-Step Verification turned on.';
  if (c === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/i.test(m)) return 'The SMTP server address was not found. Check the spelling (Gmail: smtp.gmail.com).';
  if (c === 'ECONNREFUSED' || c === 'ETIMEDOUT' || c === 'ESOCKET' || /ECONNREFUSED|ETIMEDOUT|timed out|Greeting never received/i.test(m)) return 'Could not reach the mail server on this port. Check the port number (587 or 465); some hosting providers block outgoing mail ports.';
  if (/Daily user sending|quota|limit exceeded/i.test(m)) return 'The mailbox reached its daily sending limit. Try again tomorrow or use another mailbox.';
  return m.replace(/\s+/g, ' ').slice(0, 200);
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* the reset email: plain, one big button, expiry stated, "ignore this if it was not you" */
function resetEmail({ labName, name, link, minutes }) {
  const subject = 'Reset your Optix Medical Science password';
  const text = `Hello ${name || ''},\n\nWe received a request to reset the password of your account at ${labName}.\n\nOpen this link to choose a new password (valid for ${minutes} minutes, works once):\n${link}\n\nIf you did not ask for this, you can ignore this email — your password stays the same.\n\nOptix Medical Science`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:24px;color:#131845">
    <h2 style="margin:0 0 12px">Reset your password</h2>
    <p>Hello ${esc(name || '')},</p>
    <p>We received a request to reset the password of your account at <b>${esc(labName)}</b>.</p>
    <p style="margin:24px 0"><a href="${esc(link)}" style="background:#131845;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;display:inline-block">Choose a new password</a></p>
    <p style="font-size:13px;color:#5b6b80">The link is valid for ${minutes} minutes and works once. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>
    <p style="font-size:13px;color:#5b6b80">If you did not ask for this, ignore this email — your password stays the same.</p>
    <p style="font-size:12px;color:#8a94a6;margin-top:24px">Optix Medical Science</p></div>`;
  return { subject, text, html };
}
function changedEmail({ labName, name }) {
  const subject = 'Your Optix Medical Science password was changed';
  const text = `Hello ${name || ''},\n\nThe password of your account at ${labName} was just changed. If this was you, nothing more to do. If it was not you, reset it again right away and tell your lab admin.\n\nOptix Medical Science`;
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:24px;color:#131845"><h2 style="margin:0 0 12px">Password changed</h2><p>Hello ${esc(name || '')},</p><p>The password of your account at <b>${esc(labName)}</b> was just changed.</p><p style="font-size:13px;color:#5b6b80">If this was you, nothing more to do. If it was not you, reset it again right away and tell your lab admin.</p></div>` };
}


/* the report mail: fixed wording (staff cannot type free text into it, so it cannot be used to send arbitrary mail), the PDF attached, plus a link */
function reportEmail({ labName, name, kind, link, invNo, labPhone, labEmail, note }) {
  const who = name ? name : (kind === 'doctor' ? 'Doctor' : 'Patient');
  const subject = (kind === 'doctor' ? 'Patient lab report' : 'Your lab report') + ' — ' + labName + (invNo ? ' (' + invNo + ')' : '');
  const lead = kind === 'doctor'
    ? 'The lab report' + (name ? ' of the patient you referred' : '') + ' is attached to this email as a PDF.'
    : 'Your lab report is ready. It is attached to this email as a PDF.';
  const contact = [labPhone ? 'Phone: ' + labPhone : '', labEmail ? 'Email: ' + labEmail : ''].filter(Boolean).join('  |  ');
  const text = 'Dear ' + who + ',\n\n' + lead + (note ? '\n\n' + note : '') + '\n\nYou can also open or download it here (works on any phone):\n' + link + '\n\n' + labName + (contact ? '\n' + contact : '') +
    '\n\nIf you were not expecting this email, you can ignore it.';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1b2540">' +
    '<h2 style="margin:0 0 14px;color:#131845">' + esc(labName) + '</h2>' +
    '<p>Dear ' + esc(who) + ',</p><p>' + esc(lead) + '</p>' + (note ? '<p>' + esc(note) + '</p>' : '') +
    '<p style="margin:22px 0"><a href="' + esc(link) + '" style="background:#131845;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Open / download report</a></p>' +
    '<p style="color:#5b6785;font-size:13px">' + esc(contact) + '</p>' +
    '<p style="color:#8a94ad;font-size:12px;margin-top:22px">If you were not expecting this email, you can ignore it.</p></div>';
  return { subject, text, html };
}
/* the portal sign-in code mail */
function portalCodeEmail({ labName, code, link }) {
  const subject = 'Your ' + labName + ' report code: ' + code;
  const text = 'Your code is ' + code + (link ? '\n\nOr tap this link to open your reports: ' + link : '') + '\n\nIt is valid for 10 minutes. Enter it on the ' + labName + ' report page.\nIf you did not ask for it, ignore this email and do not share the code.';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1b2540"><h2 style="color:#131845;margin:0 0 12px">' + esc(labName) + '</h2><p>Your report code is</p>' +
    '<p style="font-size:34px;font-weight:800;letter-spacing:6px;margin:8px 0 14px;color:#131845">' + esc(code) + '</p>' + (link ? '<p><a href="' + esc(link) + '" style="background:#131845;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Open my reports</a></p>' : '') + '<p style="color:#5b6785">It is valid for 10 minutes. If you did not ask for it, ignore this email and do not share the code.</p></div>';
  return { subject, text, html };
}
module.exports = { configured, send, setConfig, current, tlsFor, friendlyError, resetEmail, changedEmail, reportEmail, portalCodeEmail };
