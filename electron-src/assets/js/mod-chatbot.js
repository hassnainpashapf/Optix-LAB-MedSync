/* Optix Assistant chat widget — vanilla JS, no dependencies.
 * Exposes window.OptixChat:
 *   OptixChat.init({ endpoint, context, labName, labId })
 *   OptixChat.show() / hide() / toggle()
 * Talks only to our own backend endpoint; no API keys or secrets in this file.
 */
(function () {
  'use strict';

  var state = {
    initialized: false,
    endpoint: '',
    context: 'website',
    labName: 'Optix LAB',
    labId: null,
    open: false,
    sending: false,
    exchanges: [] // last 10 { role: 'user'|'assistant', content } pairs
  };

  var els = {};

  var CSS = [
    '.oxc-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;',
    'border:none;cursor:pointer;z-index:99990;display:flex;align-items:center;justify-content:center;',
    'background:#0d6efd;color:#fff;box-shadow:0 6px 20px rgba(13,110,253,.4);transition:transform .15s ease}',
    '.oxc-fab:hover{transform:scale(1.06)}',
    '.oxc-fab svg{width:26px;height:26px}',
    '.oxc-panel{position:fixed;right:20px;bottom:88px;width:380px;max-width:calc(100vw - 40px);',
    'height:520px;max-height:calc(100vh - 120px);z-index:99991;background:#fff;border-radius:16px;',
    'box-shadow:0 12px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;',
    'font-family:inherit}',
    '.oxc-panel.oxc-open{display:flex}',
    '.oxc-header{display:flex;align-items:center;gap:10px;padding:12px 14px;',
    'background:#0d6efd;color:#fff;flex:0 0 auto}',
    '.oxc-header-avatar{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);',
    'display:flex;align-items:center;justify-content:center;flex:0 0 auto}',
    '.oxc-header-avatar svg{width:20px;height:20px}',
    '.oxc-header-titles{flex:1 1 auto;min-width:0}',
    '.oxc-header-lab{font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.oxc-header-title{font-size:15px;font-weight:700;line-height:1.2}',
    '.oxc-header-close{background:none;border:none;color:#fff;font-size:20px;line-height:1;cursor:pointer;',
    'padding:4px 8px;border-radius:8px}',
    '.oxc-header-close:hover{background:rgba(255,255,255,.15)}',
    '.oxc-messages{flex:1 1 auto;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;',
    'background:#f4f6fb}',
    '.oxc-msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;',
    'white-space:pre-wrap;word-break:break-word}',
    '.oxc-msg-user{align-self:flex-end;background:#0d6efd;color:#fff;border-bottom-right-radius:4px}',
    '.oxc-msg-assistant{align-self:flex-start;background:#fff;color:#1a1a1a;border-bottom-left-radius:4px;',
    'box-shadow:0 1px 4px rgba(0,0,0,.08)}',
    '.oxc-typing{display:none;align-self:flex-start;background:#fff;border-radius:14px;',
    'border-bottom-left-radius:4px;padding:12px 14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}',
    '.oxc-typing.oxc-show{display:inline-flex;gap:5px}',
    '.oxc-typing span{width:7px;height:7px;border-radius:50%;background:#9aa3b2;animation:oxc-bounce 1.2s infinite}',
    '.oxc-typing span:nth-child(2){animation-delay:.15s}',
    '.oxc-typing span:nth-child(3){animation-delay:.3s}',
    '@keyframes oxc-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}',
    '30%{transform:translateY(-6px);opacity:1}}',
    '.oxc-inputrow{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e6e9f0;flex:0 0 auto;background:#fff}',
    '.oxc-input{flex:1 1 auto;border:1px solid #d7dce5;border-radius:10px;padding:10px 12px;font-size:14px;',
    'outline:none;font-family:inherit;resize:none}',
    '.oxc-input:focus{border-color:#0d6efd}',
    '.oxc-send{border:none;border-radius:10px;background:#0d6efd;color:#fff;cursor:pointer;padding:0 16px;',
    'font-size:14px;font-weight:600}',
    '.oxc-send:disabled{opacity:.55;cursor:default}',
    '@media (max-width:480px){',
    '.oxc-panel{left:0;right:0;bottom:0;width:100%;max-width:100%;height:78vh;max-height:78vh;',
    'border-radius:18px 18px 0 0}',
    '.oxc-fab{right:16px;bottom:16px}}'
  ].join('\n');

  var CHAT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var BOT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>' +
    '<circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>';

  function injectCss() {
    var style = document.createElement('style');
    style.setAttribute('data-oxc', '1');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scrollBottom() {
    var m = els.messages;
    if (m) m.scrollTop = m.scrollHeight;
  }

  function addMessage(role, text) {
    var bubble = el('div', 'oxc-msg ' + (role === 'user' ? 'oxc-msg-user' : 'oxc-msg-assistant'));
    bubble.textContent = text;
    els.messages.insertBefore(bubble, els.typing);
    scrollBottom();
  }

  function setTyping(on) {
    els.typing.classList.toggle('oxc-show', !!on);
    if (on) scrollBottom();
  }

  function pushExchange(role, content) {
    state.exchanges.push({ role: role, content: content });
    while (state.exchanges.length > 20) state.exchanges.shift(); // last 10 exchanges = 20 messages
  }

  function send() {
    var text = els.input.value.trim();
    if (!text || state.sending) return;
    if (!state.endpoint) return;

    els.input.value = '';
    addMessage('user', text);
    pushExchange('user', text);
    state.sending = true;
    els.send.disabled = true;
    setTyping(true);

    var payload = {
      message: text,
      history: state.exchanges.slice(0, -1).map(function (e) { return { role: e.role, content: e.content }; }),
      context: state.context,
      labId: state.labId,
      labName: state.labName
    };

    fetch(state.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(function (data) {
      var reply = (data && (data.reply || data.message)) || '';
      if (!reply) throw new Error('empty');
      addMessage('assistant', reply);
      pushExchange('assistant', reply);
    }).catch(function () {
      addMessage('assistant', 'Assistant is offline right now, please try again.');
    }).then(function () {
      state.sending = false;
      els.send.disabled = false;
      setTyping(false);
      els.input.focus();
    });
  }

  function show() {
    if (!state.initialized) return;
    state.open = true;
    els.panel.classList.add('oxc-open');
  }

  function hide() {
    if (!state.initialized) return;
    state.open = false;
    els.panel.classList.remove('oxc-open');
  }

  function toggle() {
    if (state.open) hide(); else show();
  }

  function init(opts) {
    if (state.initialized) return; // silent no-op on re-init
    opts = opts || {};
    state.endpoint = opts.endpoint || '';
    state.context = opts.context || 'website';
    state.labName = opts.labName || 'Optix LAB';
    state.labId = opts.labId != null ? opts.labId : null;

    injectCss();

    var fab = el('button', 'oxc-fab', CHAT_ICON);
    fab.setAttribute('type', 'button');
    fab.setAttribute('aria-label', 'Open Optix Assistant');
    fab.addEventListener('click', toggle);

    var panel = el('div', 'oxc-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Optix Assistant chat');

    var header = el('div', 'oxc-header');
    var avatar = el('div', 'oxc-header-avatar', BOT_ICON);
    var titles = el('div', 'oxc-header-titles');
    var labLine = el('div', 'oxc-header-lab', escapeHtml(state.labName));
    var titleLine = el('div', 'oxc-header-title', 'Optix Assistant');
    titles.appendChild(labLine);
    titles.appendChild(titleLine);
    var closeBtn = el('button', 'oxc-header-close', '&times;');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.addEventListener('click', hide);
    header.appendChild(avatar);
    header.appendChild(titles);
    header.appendChild(closeBtn);

    var messages = el('div', 'oxc-messages');
    var typing = el('div', 'oxc-typing', '<span></span><span></span><span></span>');
    messages.appendChild(typing);

    var inputRow = el('div', 'oxc-inputrow');
    var input = el('textarea', 'oxc-input');
    input.setAttribute('rows', '1');
    input.setAttribute('placeholder', 'Type your message...');
    input.setAttribute('aria-label', 'Chat message');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    var sendBtn = el('button', 'oxc-send', 'Send');
    sendBtn.setAttribute('type', 'button');
    sendBtn.addEventListener('click', send);
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputRow);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    els = { fab: fab, panel: panel, messages: messages, typing: typing, input: input, send: sendBtn };
    state.initialized = true;

    addMessage('assistant', 'Hi, I am Optix Assistant. How can I help you today?');
  }

  window.OptixChat = {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle
  };
})();
