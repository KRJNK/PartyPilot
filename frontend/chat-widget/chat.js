/* ============================================================
   WeddingSaaS Chat Widget v1.0
   Standalone embeddable AI chat widget — vanilla JS, no deps
   Injects its own styles, runs in IIFE to avoid global leaks
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Config
     ------------------------------------------------------------------ */
  var CONFIG = {
    apiBase: 'https://api.weddingsaas.pl/api',
    tenantId: '',
    position: 'bottom-right',
    maxMessageLength: 500,
  };

  var STATE = {
    tenant: null,
    conversationId: null,
    messages: [],
    isOpen: false,
    isWaiting: false,
    isQualified: false,
    hasOpenedOnce: false,
    unreadCount: 0,
    lastSubmitTime: 0,
    rateLimitMs: 2000,
    welcomeShown: false,
  };

  var el = {};

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function getScriptData() {
    var scripts = document.querySelectorAll('script[data-tenant-id]');
    if (!scripts.length) return;
    var s = scripts[scripts.length - 1];
    CONFIG.tenantId = s.getAttribute('data-tenant-id') || '';
    CONFIG.apiBase = s.getAttribute('data-api-base') || CONFIG.apiBase;
    CONFIG.position = s.getAttribute('data-position') || CONFIG.position;
  }

  function sanitize(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  function addClass(el, cls) {
    if (el && el.classList) el.classList.add(cls);
  }

  function removeClass(el, cls) {
    if (el && el.classList) el.classList.remove(cls);
  }

  function hasClass(el, cls) {
    return el && el.classList && el.classList.contains(cls);
  }

  function on(el, event, handler) {
    if (el) el.addEventListener(event, handler);
  }

  function off(el, event, handler) {
    if (el) el.removeEventListener(event, handler);
  }

  function createElement(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') {
          el.className = attrs[k];
        } else if (k === 'style') {
          el.style.cssText = attrs[k];
        } else if (k === 'html') {
          el.innerHTML = attrs[k];
        } else if (k === 'dataset') {
          Object.keys(attrs[k]).forEach(function (dk) {
            el.dataset[dk] = attrs[k][dk];
          });
        } else {
          el.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (typeof children[i] === 'string') {
          el.appendChild(document.createTextNode(children[i]));
        } else if (children[i]) {
          el.appendChild(children[i]);
        }
      }
    }
    return el;
  }

  function formatTime(date) {
    var h = String(date.getHours()).padStart(2, '0');
    var m = String(date.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function formatTimestamp(date) {
    var now = new Date();
    var isToday = date.getFullYear() === now.getFullYear() &&
                  date.getMonth() === now.getMonth() &&
                  date.getDate() === now.getDate();
    if (isToday) {
      return formatTime(date);
    }
    var months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
                  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    return date.getDate() + ' ' + months[date.getMonth()] + ', ' + formatTime(date);
  }

  function now() {
    return new Date();
  }

  function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.substring(0, max);
  }

  /* ------------------------------------------------------------------
     Storage (LocalStorage) — conversation_id persistence
     ------------------------------------------------------------------ */
  function storageKey() {
    return 'wsc_conv_' + CONFIG.tenantId;
  }

  function getConversationId() {
    try {
      return localStorage.getItem(storageKey()) || null;
    } catch (_) { return null; }
  }

  function setConversationId(id) {
    try {
      localStorage.setItem(storageKey(), id || '');
    } catch (_) { /* ignore */ }
  }

  function clearConversationId() {
    try {
      localStorage.removeItem(storageKey());
    } catch (_) { /* ignore */ }
  }

  /* ------------------------------------------------------------------
     API calls
     ------------------------------------------------------------------ */
  function apiUrl(path) {
    return CONFIG.apiBase.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  }

  function fetchTenantInfo() {
    return fetch(apiUrl('public/' + CONFIG.tenantId), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Błąd serwera');
        /* Handle wrapped response format: { statusCode, body } */
        if (data.body && typeof data.body === 'string') {
          try { return JSON.parse(data.body); } catch (_) { return data; }
        }
        return data;
      });
    });
  }

  function sendChatMessage(message, conversationId) {
    var body = { message: message };
    if (conversationId) {
      body.conversation_id = conversationId;
    }
    return fetch(apiUrl('public/' + CONFIG.tenantId + '/chat'), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Błąd serwera');
        /* Handle wrapped response format */
        if (data.body && typeof data.body === 'string') {
          try { return JSON.parse(data.body); } catch (_) { return data; }
        }
        return data;
      });
    });
  }

  /* ------------------------------------------------------------------
     Sound notification (optional beep using Web Audio API)
     ------------------------------------------------------------------ */
  var audioCtx = null;

  function playBeep() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 520;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (_) { /* audio not available — ignore */ }
  }

  /* ------------------------------------------------------------------
     CSS injection
     ------------------------------------------------------------------ */
  function injectCSS() {
    var id = 'wsc-widget-styles';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = getCSSContent();
    document.head.appendChild(style);
  }

  function getCSSContent() {
    /* All styles are defined in chat.css.
       Inlined here for self-contained widget embedding. */
    return '/* WeddingSaaS Chat Widget Styles */\n' +
      ':root{--wsc-primary:#C9A96E;--wsc-bg:#fff;--wsc-text:#1a1a1a;--wsc-text-secondary:#666;--wsc-bubble-bg:#f0f0f0;--wsc-input-bg:#f8f8f8;--wsc-border:#e0e0e0;--wsc-radius:12px;--wsc-radius-sm:8px;--wsc-shadow:0 8px 32px rgba(0,0,0,.15);--wsc-shadow-sm:0 2px 8px rgba(0,0,0,.08);--wsc-transition:.25s ease;--wsc-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;--wsc-z-index:999999}' +
      '.wsc-trigger-btn{position:fixed;z-index:var(--wsc-z-index);bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;border:none;background:var(--wsc-primary);color:#fff;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;transition:transform var(--wsc-transition),box-shadow var(--wsc-transition);-webkit-tap-highlight-color:transparent;padding:0;line-height:1}' +
      '.wsc-trigger-btn:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(0,0,0,.25)}' +
      '.wsc-trigger-btn:active{transform:scale(.96)}' +
      '.wsc-trigger-btn svg{width:28px;height:28px;fill:currentColor}' +
      '.wsc-unread-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#dc3545;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;box-sizing:border-box;font-family:var(--wsc-font);line-height:1;pointer-events:none}' +
      '.wsc-panel{position:fixed;z-index:calc(var(--wsc-z-index) + 1);bottom:96px;right:24px;width:380px;height:500px;max-height:calc(100vh - 140px);background:var(--wsc-bg);border-radius:var(--wsc-radius);box-shadow:var(--wsc-shadow);display:flex;flex-direction:column;overflow:hidden;font-family:var(--wsc-font);color:var(--wsc-text);opacity:0;visibility:hidden;transform:translateY(16px) scale(.97);transition:opacity var(--wsc-transition),transform var(--wsc-transition),visibility var(--wsc-transition);transform-origin:bottom right}' +
      '.wsc-panel.wsc-open{opacity:1;visibility:visible;transform:translateY(0) scale(1)}' +
      '.wsc-trigger-left .wsc-trigger-btn{left:24px;right:auto}' +
      '.wsc-trigger-left .wsc-panel{left:24px;right:auto;transform-origin:bottom left}' +
      '.wsc-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:var(--wsc-primary);color:#fff;flex-shrink:0;border-radius:var(--wsc-radius) var(--wsc-radius) 0 0}' +
      '.wsc-header-title{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:8px}' +
      '.wsc-header-close{width:32px;height:32px;border:none;background:rgba(255,255,255,.2);color:#fff;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background var(--wsc-transition);flex-shrink:0;padding:0}' +
      '.wsc-header-close:hover{background:rgba(255,255,255,.35)}' +
      '.wsc-header-close svg{width:16px;height:16px;fill:currentColor}' +
      '.wsc-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;background:var(--wsc-bg)}' +
      '.wsc-msg{max-width:80%;word-wrap:break-word;overflow-wrap:break-word;line-height:1.45;font-size:14px;animation:wsc-fadeIn .25s ease}' +
      '@keyframes wsc-fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}' +
      '.wsc-msg-user{align-self:flex-end}' +
      '.wsc-msg-ai{align-self:flex-start}' +
      '.wsc-msg-bubble{padding:10px 14px;border-radius:16px;position:relative}' +
      '.wsc-msg-user .wsc-msg-bubble{background:var(--wsc-primary);color:#fff;border-bottom-right-radius:4px}' +
      '.wsc-msg-ai .wsc-msg-bubble{background:var(--wsc-bubble-bg);color:var(--wsc-text);border-bottom-left-radius:4px}' +
      '.wsc-msg-time{font-size:11px;color:var(--wsc-text-secondary);margin-top:4px;padding:0 4px;opacity:.8}' +
      '.wsc-msg-user .wsc-msg-time{text-align:right}' +
      '.wsc-msg-system{align-self:center;text-align:center;max-width:90%}' +
      '.wsc-msg-system .wsc-msg-bubble{background:transparent;color:var(--wsc-text-secondary);font-size:13px;font-style:italic;padding:8px 12px}' +
      '.wsc-typing{align-self:flex-start;display:flex;align-items:center;gap:4px;padding:12px 16px;background:var(--wsc-bubble-bg);border-radius:16px;border-bottom-left-radius:4px;animation:wsc-fadeIn .2s ease}' +
      '.wsc-typing-dot{width:8px;height:8px;border-radius:50%;background:var(--wsc-text-secondary);animation:wsc-bounce 1.4s ease-in-out infinite}' +
      '.wsc-typing-dot:nth-child(1){animation-delay:0s}' +
      '.wsc-typing-dot:nth-child(2){animation-delay:.2s}' +
      '.wsc-typing-dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes wsc-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1}}' +
      '.wsc-quick-replies{display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 12px;flex-shrink:0;border-top:1px solid var(--wsc-border);background:var(--wsc-bg)}' +
      '.wsc-quick-chip{padding:7px 14px;border:1.5px solid var(--wsc-primary);border-radius:20px;background:transparent;color:var(--wsc-primary);font-size:13px;font-family:var(--wsc-font);cursor:pointer;transition:background var(--wsc-transition),color var(--wsc-transition);white-space:nowrap;line-height:1.3}' +
      '.wsc-quick-chip:hover{background:var(--wsc-primary);color:#fff}' +
      '.wsc-quick-chip:active{transform:scale(.96)}' +
      '.wsc-input-area{display:flex;align-items:flex-end;gap:8px;padding:10px 16px 14px;border-top:1px solid var(--wsc-border);background:var(--wsc-bg);flex-shrink:0}' +
      '.wsc-input-wrap{flex:1;position:relative}' +
      '.wsc-input{width:100%;padding:10px 12px;border:1.5px solid var(--wsc-border);border-radius:var(--wsc-radius-sm);font-size:14px;font-family:var(--wsc-font);background:var(--wsc-input-bg);color:var(--wsc-text);outline:none;resize:none;min-height:40px;max-height:120px;box-sizing:border-box;transition:border-color var(--wsc-transition);line-height:1.4}' +
      '.wsc-input:focus{border-color:var(--wsc-primary);background:var(--wsc-bg)}' +
      '.wsc-input::placeholder{color:var(--wsc-text-secondary);opacity:.7}' +
      '.wsc-input:disabled{opacity:.5;cursor:not-allowed}' +
      '.wsc-counter{position:absolute;right:8px;bottom:4px;font-size:11px;color:var(--wsc-text-secondary);opacity:.7;pointer-events:none}' +
      '.wsc-counter.wsc-counter-limit{color:#dc3545;opacity:1}' +
      '.wsc-send-btn{width:40px;height:40px;border:none;border-radius:50%;background:var(--wsc-primary);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background var(--wsc-transition),transform var(--wsc-transition),opacity var(--wsc-transition);flex-shrink:0;padding:0}' +
      '.wsc-send-btn:hover:not(:disabled){transform:scale(1.08)}' +
      '.wsc-send-btn:active:not(:disabled){transform:scale(.94)}' +
      '.wsc-send-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.wsc-send-btn svg{width:18px;height:18px;fill:currentColor}' +
      '.wsc-lead-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;text-align:center;flex:1}' +
      '.wsc-lead-icon{width:48px;height:48px;border-radius:50%;background:#d4edda;color:#155724;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px}' +
      '.wsc-lead-title{font-size:16px;font-weight:600;margin-bottom:8px;color:var(--wsc-text)}' +
      '.wsc-lead-text{font-size:14px;color:var(--wsc-text-secondary);line-height:1.5;max-width:280px}' +
      '.wsc-error-msg{text-align:center;padding:8px 16px;background:#fef2f2;color:#dc3545;font-size:13px;border-top:1px solid #fecaca;flex-shrink:0}' +
      '.wsc-messages::-webkit-scrollbar{width:5px}' +
      '.wsc-messages::-webkit-scrollbar-track{background:transparent}' +
      '.wsc-messages::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}' +
      '.wsc-messages::-webkit-scrollbar-thumb:hover{background:#aaa}' +
      '@media(max-width:480px){.wsc-panel{width:100%;height:100%;max-height:100%;bottom:0;right:0;left:0;top:0;border-radius:0;transform:translateY(20px)}.wsc-panel.wsc-open{transform:translateY(0)}.wsc-header{border-radius:0;padding:14px 16px}.wsc-trigger-btn{bottom:16px;right:16px;width:52px;height:52px}.wsc-trigger-btn svg{width:24px;height:24px}.wsc-trigger-left .wsc-trigger-btn{left:16px;right:auto}.wsc-messages{padding:12px}.wsc-input-area{padding:8px 12px 12px}}' +
      '@media(prefers-color-scheme:dark){.wsc-panel{--wsc-bg:#1e1e1e;--wsc-text:#e0e0e0;--wsc-text-secondary:#999;--wsc-bubble-bg:#2d2d2d;--wsc-input-bg:#2a2a2a;--wsc-border:#3a3a3a;--wsc-shadow:0 8px 32px rgba(0,0,0,.4)}.wsc-msg-ai .wsc-msg-bubble{color:#e0e0e0}.wsc-input{color:#e0e0e0}.wsc-input:focus{background:#2a2a2a}.wsc-quick-chip{border-color:var(--wsc-primary);color:var(--wsc-primary)}.wsc-error-msg{background:#2d1517;color:#f8a0a0;border-color:#4a2022}.wsc-lead-icon{background:#1a3a22;color:#7dda8a}}';
  }

  /* ------------------------------------------------------------------
     DOM Building
     ------------------------------------------------------------------ */
  function buildTriggerBtn() {
    var pos = CONFIG.position === 'bottom-left' ? 'left' : 'right';
    var btn = createElement('button', {
      className: 'wsc-trigger-btn',
      'aria-label': 'Czat z asystentem',
      style: pos + ': 24px',
      html: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>',
    });

    /* Unread badge (hidden by default) */
    var badge = createElement('span', {
      className: 'wsc-unread-badge',
      id: 'wsc-unread-badge',
      style: 'display: none',
      html: '0',
    });
    btn.appendChild(badge);

    return btn;
  }

  function buildChatPanel() {
    var panel = createElement('div', {
      className: 'wsc-panel',
      id: 'wsc-panel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Czat z asystentem',
    });

    /* ---------- Header ---------- */
    var header = createElement('div', { className: 'wsc-header' });
    var title = createElement('span', {
      className: 'wsc-header-title',
      html: 'Asystent',
    });
    var closeBtn = createElement('button', {
      className: 'wsc-header-close',
      'aria-label': 'Zamknij',
      html: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    });
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    /* ---------- Messages area ---------- */
    var messages = createElement('div', {
      className: 'wsc-messages',
      id: 'wsc-messages',
    });
    panel.appendChild(messages);

    /* ---------- Quick replies (hidden by default) ---------- */
    var quickReplies = createElement('div', {
      className: 'wsc-quick-replies',
      id: 'wsc-quick-replies',
      style: 'display: none',
    });
    panel.appendChild(quickReplies);

    /* ---------- Error area ---------- */
    var errorEl = createElement('div', {
      className: 'wsc-error-msg',
      id: 'wsc-error-msg',
      style: 'display: none',
    });
    panel.appendChild(errorEl);

    /* ---------- Input area ---------- */
    var inputArea = createElement('div', { className: 'wsc-input-area' });

    var inputWrap = createElement('div', { className: 'wsc-input-wrap' });
    var input = createElement('textarea', {
      className: 'wsc-input',
      id: 'wsc-input',
      placeholder: 'Napisz wiadomość...',
      rows: '1',
      'aria-label': 'Wiadomość',
    });
    inputWrap.appendChild(input);

    var counter = createElement('span', {
      className: 'wsc-counter',
      id: 'wsc-counter',
      html: '500',
    });
    inputWrap.appendChild(counter);
    inputArea.appendChild(inputWrap);

    var sendBtn = createElement('button', {
      className: 'wsc-send-btn',
      id: 'wsc-send-btn',
      'aria-label': 'Wyślij',
      html: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    });
    inputArea.appendChild(sendBtn);

    panel.appendChild(inputArea);

    document.body.appendChild(panel);

    el.panel = panel;
    el.headerTitle = title;
    el.closeBtn = closeBtn;
    el.messagesEl = messages;
    el.quickRepliesEl = quickReplies;
    el.errorEl = errorEl;
    el.input = input;
    el.counter = counter;
    el.sendBtn = sendBtn;
    el.inputArea = inputArea;

    return panel;
  }

  /* ------------------------------------------------------------------
     Message Rendering
     ------------------------------------------------------------------ */
  function addMessageEl(role, content, timestamp) {
    var msgDiv = createElement('div', {
      className: 'wsc-msg wsc-msg-' + role,
    });

    var bubble = createElement('div', {
      className: 'wsc-msg-bubble',
      html: sanitize(content),
    });
    msgDiv.appendChild(bubble);

    if (timestamp) {
      var timeEl = createElement('div', {
        className: 'wsc-msg-time',
        html: formatTimestamp(timestamp),
      });
      msgDiv.appendChild(timeEl);
    }

    el.messagesEl.appendChild(msgDiv);
    scrollToBottom();
  }

  function addSystemMessage(text) {
    var msgDiv = createElement('div', {
      className: 'wsc-msg wsc-msg-system',
    });
    var bubble = createElement('div', {
      className: 'wsc-msg-bubble',
      html: sanitize(text),
    });
    msgDiv.appendChild(bubble);
    el.messagesEl.appendChild(msgDiv);
    scrollToBottom();
  }

  function showTypingIndicator() {
    hideTypingIndicator();
    var typing = createElement('div', {
      className: 'wsc-typing',
      id: 'wsc-typing',
    });
    for (var i = 0; i < 3; i++) {
      typing.appendChild(createElement('span', { className: 'wsc-typing-dot' }));
    }
    el.messagesEl.appendChild(typing);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    var typing = document.getElementById('wsc-typing');
    if (typing) typing.remove();
  }

  function scrollToBottom() {
    setTimeout(function () {
      el.messagesEl.scrollTop = el.messagesEl.scrollHeight;
    }, 10);
  }

  /* ------------------------------------------------------------------
     Quick Replies
     ------------------------------------------------------------------ */
  function showQuickReplies() {
    var chips = [
      'Jakie macie pakiety?',
      'Czy macie wolny termin w lipcu?',
      'Jaka jest cena?',
    ];

    el.quickRepliesEl.innerHTML = '';
    el.quickRepliesEl.style.display = 'flex';

    chips.forEach(function (text) {
      var chip = createElement('button', {
        className: 'wsc-quick-chip',
        html: sanitize(text),
      });
      on(chip, 'click', function () {
        sendMessage(text);
      });
      el.quickRepliesEl.appendChild(chip);
    });
  }

  function hideQuickReplies() {
    el.quickRepliesEl.style.display = 'none';
    el.quickRepliesEl.innerHTML = '';
  }

  /* ------------------------------------------------------------------
     Lead Qualified State
     ------------------------------------------------------------------ */
  function showLeadQualified() {
    /* Clear messages area */
    el.messagesEl.innerHTML = '';

    var companyName = STATE.tenant && STATE.tenant.company_name
      ? STATE.tenant.company_name
      : 'organizatora';

    var stateDiv = createElement('div', { className: 'wsc-lead-state' });
    var icon = createElement('div', {
      className: 'wsc-lead-icon',
      html: '&#10003;',
    });
    var title = createElement('div', {
      className: 'wsc-lead-title',
      html: 'Dziękujemy za rozmowę!',
    });
    var text = createElement('div', {
      className: 'wsc-lead-text',
      html: sanitize('Świetnie! Przekazałem Twoje dane do ' + companyName + '. Skontaktują się z Tobą wkrótce.'),
    });

    stateDiv.appendChild(icon);
    stateDiv.appendChild(title);
    stateDiv.appendChild(text);
    el.messagesEl.appendChild(stateDiv);

    /* Disable input */
    el.input.disabled = true;
    el.sendBtn.disabled = true;
    hideQuickReplies();
    hideTypingIndicator();
  }

  /* ------------------------------------------------------------------
     Open / Close / Toggle
     ------------------------------------------------------------------ */
  function openChat() {
    if (STATE.isOpen) return;
    STATE.isOpen = true;
    addClass(el.panel, 'wsc-open');

    /* Clear unread badge when opening */
    STATE.unreadCount = 0;
    updateUnreadBadge();

    if (!STATE.hasOpenedOnce) {
      STATE.hasOpenedOnce = true;
      /* First open — show welcome and quick replies */
      var companyName = STATE.tenant && STATE.tenant.company_name
        ? STATE.tenant.company_name
        : 'Asystent';

      var existingConvId = getConversationId();
      if (existingConvId) {
        STATE.conversationId = existingConvId;
        addSystemMessage('Witaj ponownie!');
      } else {
        addMessageEl('ai', 'Cześć! Jestem asystentem ' + sanitize(companyName) + '. Jak mogę pomóc?', now());
      }

      showQuickReplies();
    }

    /* Focus input */
    setTimeout(function () {
      if (!el.input.disabled) el.input.focus();
    }, 350);

    document.body.style.overflow = '';
  }

  function closeChat() {
    if (!STATE.isOpen) return;
    STATE.isOpen = false;
    removeClass(el.panel, 'wsc-open');
    el.triggerBtn.focus();
  }

  function toggleChat() {
    if (STATE.isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function updateUnreadBadge() {
    var badge = document.getElementById('wsc-unread-badge');
    if (!badge) return;
    if (STATE.unreadCount > 0 && !STATE.isOpen) {
      badge.textContent = String(STATE.unreadCount);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------
     Send Message
     ------------------------------------------------------------------ */
  function sendMessage(text) {
    if (!text || !text.trim()) return;
    if (STATE.isWaiting) return;
    if (STATE.isQualified) return;

    /* Rate limiting */
    var elapsed = Date.now() - STATE.lastSubmitTime;
    if (elapsed < STATE.rateLimitMs && STATE.lastSubmitTime > 0) {
      showError('Proszę czekać przed wysłaniem kolejnej wiadomości.');
      return;
    }

    var msg = text.trim().substring(0, CONFIG.maxMessageLength);
    if (!msg) return;

    /* Hide quick replies after first user message */
    hideQuickReplies();

    /* Add user message */
    addMessageEl('user', msg, now());

    /* Clear input and reset */
    el.input.value = '';
    el.input.style.height = 'auto';
    updateCounter();

    /* Show typing indicator */
    STATE.isWaiting = true;
    el.input.disabled = true;
    el.sendBtn.disabled = true;
    showTypingIndicator();
    hideError();

    /* Send to API */
    sendChatMessage(msg, STATE.conversationId).then(function (data) {
      STATE.isWaiting = false;
      STATE.lastSubmitTime = Date.now();

      /* Store conversation_id */
      if (data.conversation_id) {
        STATE.conversationId = data.conversation_id;
        setConversationId(data.conversation_id);
      }

      hideTypingIndicator();

      /* Add AI reply */
      var reply = data.reply || '';
      addMessageEl('ai', reply, now());

      /* Play notification sound if chat is closed */
      if (!STATE.isOpen) {
        STATE.unreadCount++;
        updateUnreadBadge();
        playBeep();
      }

      /* Handle lead qualification */
      if (data.lead_qualified) {
        STATE.isQualified = true;
        /* Show qualified state after a short delay so user sees the last exchange */
        setTimeout(function () {
          showLeadQualified();
        }, 800);
      }

      /* Re-enable input */
      el.input.disabled = false;
      el.sendBtn.disabled = false;
      if (STATE.isOpen) el.input.focus();

    }).catch(function (err) {
      STATE.isWaiting = false;
      STATE.lastSubmitTime = Date.now();
      hideTypingIndicator();

      showError('Spróbuj ponownie za chwilę.');

      el.input.disabled = false;
      el.sendBtn.disabled = false;
      if (STATE.isOpen) el.input.focus();
    });
  }

  /* ------------------------------------------------------------------
     Error Display
     ------------------------------------------------------------------ */
  function showError(msg) {
    el.errorEl.textContent = msg;
    el.errorEl.style.display = 'block';
  }

  function hideError() {
    el.errorEl.style.display = 'none';
    el.errorEl.textContent = '';
  }

  /* ------------------------------------------------------------------
     Input Counter
     ------------------------------------------------------------------ */
  function updateCounter() {
    var len = el.input.value.length;
    var remaining = CONFIG.maxMessageLength - len;
    el.counter.textContent = String(remaining);
    if (remaining <= 20) {
      addClass(el.counter, 'wsc-counter-limit');
    } else {
      removeClass(el.counter, 'wsc-counter-limit');
    }
  }

  /* ------------------------------------------------------------------
     Auto-resize textarea
     ------------------------------------------------------------------ */
  function autoResize() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(el.input.scrollHeight, 120) + 'px';
  }

  /* ------------------------------------------------------------------
     Keyboard & Accessibility
     ------------------------------------------------------------------ */
  function handleKeydown(e) {
    /* Escape to close */
    if (e.key === 'Escape' && STATE.isOpen) {
      closeChat();
      return;
    }

    /* Enter to send (Shift+Enter for newline) */
    if (e.key === 'Enter' && !e.shiftKey && STATE.isOpen) {
      var target = e.target;
      if (target === el.input) {
        e.preventDefault();
        sendMessage(el.input.value);
      }
    }
  }

  /* ------------------------------------------------------------------
     Expose API
     ------------------------------------------------------------------ */
  function exposeAPI() {
    window.WeddingSaaSChat = {
      open: openChat,
      close: closeChat,
      toggle: toggleChat,
      send: function (msg) { sendMessage(msg); },
      config: CONFIG,
    };
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  function init() {
    getScriptData();

    if (!CONFIG.tenantId) {
      console.warn('[WeddingSaaS Chat] Brak atrybutu data-tenant-id. Widget nie został uruchomiony.');
      return;
    }

    injectCSS();

    /* Build trigger button */
    el.triggerBtn = buildTriggerBtn();
    document.body.appendChild(el.triggerBtn);

    /* Build chat panel */
    buildChatPanel();

    /* Set position */
    if (CONFIG.position === 'bottom-left') {
      addClass(document.body, 'wsc-trigger-left');
      el.triggerBtn.style.left = '24px';
      el.triggerBtn.style.right = 'auto';
    }

    /* Restore conversation_id */
    var savedConvId = getConversationId();
    if (savedConvId) {
      STATE.conversationId = savedConvId;
    }

    /* Fetch tenant info for styling */
    fetchTenantInfo().then(function (data) {
      STATE.tenant = data;
      if (data && data.primary_color) {
        document.documentElement.style.setProperty('--wsc-primary', data.primary_color);
      }
      if (data && data.company_name) {
        el.headerTitle.textContent = data.company_name;
      }
    }).catch(function () {
      /* Continue with defaults */
    });

    /* Event listeners */
    on(el.triggerBtn, 'click', toggleChat);
    on(el.closeBtn, 'click', closeChat);
    on(document, 'keydown', handleKeydown);

    /* Send button */
    on(el.sendBtn, 'click', function () {
      sendMessage(el.input.value);
    });

    /* Input events */
    on(el.input, 'input', function () {
      updateCounter();
      autoResize();

      /* Enforce max length */
      if (el.input.value.length > CONFIG.maxMessageLength) {
        el.input.value = el.input.value.substring(0, CONFIG.maxMessageLength);
        updateCounter();
      }
    });

    /* Handle paste to enforce max length */
    on(el.input, 'paste', function () {
      setTimeout(function () {
        if (el.input.value.length > CONFIG.maxMessageLength) {
          el.input.value = el.input.value.substring(0, CONFIG.maxMessageLength);
          updateCounter();
        }
      }, 10);
    });

    /* Expose public API */
    exposeAPI();
  }

  /* ------------------------------------------------------------------
     Boot on DOM ready
     ------------------------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
