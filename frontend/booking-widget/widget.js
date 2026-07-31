/* ============================================================
   PartyPilot Booking Widget v1.0
   Standalone embeddable booking widget — vanilla JS, no deps
   Injects its own styles, runs in IIFE to avoid global leaks
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Config
     ------------------------------------------------------------------ */
  var CONFIG = {
    apiBase: 'https://api.partypilot.pl/api',
    tenantId: '',
    position: 'bottom-right',
    storageKey: 'ws_booking_form',
    rateLimitMs: 30000,
  };

  var STATE = {
    step: 1,
    tenant: null,
    packages: [],
    bookedDates: [],
    selectedDate: null,
    month: null,
    submitting: false,
    lastSubmitTime: 0,
    formData: {},
  };

  var el = {}; // DOM refs
  var currentScript = null;

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function getScriptData() {
    var scripts = document.querySelectorAll('script[data-tenant-id]');
    if (!scripts.length) return;
    var s = scripts[scripts.length - 1];
    currentScript = s;
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

  function isoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatDatePL(d) {
    var months = [
      'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
      'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'
    ];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatMonthPL(year, month) {
    var names = [
      'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
    ];
    return names[month] + ' ' + year;
  }

  function addClass(el, cls) {
    if (el.classList) el.classList.add(cls);
  }

  function removeClass(el, cls) {
    if (el.classList) el.classList.remove(cls);
  }

  function hasClass(el, cls) {
    return el.classList && el.classList.contains(cls);
  }

  function qs(selector, ctx) {
    return (ctx || document).querySelector(selector);
  }

  function qsa(selector, ctx) {
    return (ctx || document).querySelectorAll(selector);
  }

  function closest(el, selector) {
    if (el.closest) return el.closest(selector);
    var p = el;
    while (p) {
      if (p.matches && p.matches(selector)) return p;
      p = p.parentElement;
    }
    return null;
  }

  function on(el, event, handler) {
    if (el) el.addEventListener(event, handler);
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

  /* ------------------------------------------------------------------
     Storage (LocalStorage)
     ------------------------------------------------------------------ */
  function saveFormData(data) {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
    } catch (_) { /* quota exceeded — ignore */ }
  }

  function loadFormData() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function clearFormData() {
    try {
      localStorage.removeItem(CONFIG.storageKey);
    } catch (_) { /* */ }
  }

  /* ------------------------------------------------------------------
     API calls
     ------------------------------------------------------------------ */
  function apiUrl(path) {
    return CONFIG.apiBase.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  }

  function apiFetch(path) {
    return fetch(apiUrl(path), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Błąd serwera');
        return data;
      });
    });
  }

  function apiPost(path, body) {
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Błąd serwera');
        return data;
      });
    });
  }

  /* ------------------------------------------------------------------
     CSS injection
     ------------------------------------------------------------------ */
  function injectCSS() {
    var id = 'ws-widget-styles';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = getCSSContent();
    document.head.appendChild(style);
  }

  function getCSSContent() {
    /* The CSS is inlined here for self-contained widget.
       In dev you can also load widget.css separately. */
    return '/* PartyPilot Widget Styles */\n' +
':root{--ws-primary:#C9A96E;--ws-bg:#fff;--ws-text:#1a1a1a;--ws-text-secondary:#666;--ws-border:#e0e0e0;--ws-error:#dc3545;--ws-error-bg:#fef2f2;--ws-success:#28a745;--ws-radius:8px;--ws-radius-lg:12px;--ws-shadow:0 8px 32px rgba(0,0,0,.15);--ws-shadow-sm:0 2px 8px rgba(0,0,0,.08);--ws-transition:.2s ease;--ws-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;--ws-z-index:999999}.ws-trigger-btn{position:fixed;z-index:var(--ws-z-index);bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;border:none;background:var(--ws-primary);color:#fff;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;transition:transform var(--ws-transition),box-shadow var(--ws-transition);font-size:24px;line-height:1;padding:0;-webkit-tap-highlight-color:transparent}.ws-trigger-btn:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(0,0,0,.25)}.ws-trigger-btn:active{transform:scale(.96)}.ws-trigger-btn svg{width:28px;height:28px;fill:currentColor}.ws-overlay{position:fixed;inset:0;z-index:calc(var(--ws-z-index) + 1);background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;opacity:0;visibility:hidden;transition:opacity var(--ws-transition),visibility var(--ws-transition)}.ws-overlay.ws-open{opacity:1;visibility:visible}.ws-modal{background:var(--ws-bg);width:100%;max-width:500px;max-height:90vh;border-radius:var(--ws-radius-lg) var(--ws-radius-lg) 0 0;box-shadow:var(--ws-shadow);display:flex;flex-direction:column;transform:translateY(100%);transition:transform .3s ease;overflow:hidden;font-family:var(--ws-font);color:var(--ws-text);position:relative}.ws-open .ws-modal{transform:translateY(0)}@media(min-width:640px){.ws-overlay{align-items:center}.ws-modal{max-height:85vh;border-radius:var(--ws-radius-lg);transform:translateY(20px) scale(.97)}.ws-open .ws-modal{transform:translateY(0) scale(1)}}.ws-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--ws-border);flex-shrink:0}.ws-modal-header h2{margin:0;font-size:18px;font-weight:600;line-height:1.3;color:var(--ws-text)}.ws-close-btn{background:0 0;border:none;cursor:pointer;font-size:22px;color:var(--ws-text-secondary);padding:4px;line-height:1;border-radius:4px;transition:color var(--ws-transition);-webkit-tap-highlight-color:transparent}.ws-close-btn:hover{color:var(--ws-text)}.ws-step-indicator{display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;border-bottom:1px solid var(--ws-border);flex-shrink:0}.ws-step-dot{width:8px;height:8px;border-radius:50%;background:var(--ws-border);transition:background var(--ws-transition)}.ws-step-dot.ws-active{background:var(--ws-primary);width:24px;border-radius:4px}.ws-step-dot.ws-completed{background:var(--ws-primary)}.ws-modal-body{flex:1;overflow-y:auto;padding:20px;-webkit-overflow-scrolling:touch}.ws-step{display:none}.ws-step.ws-visible{display:block}.ws-calendar-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.ws-calendar-nav button{background:0 0;border:1px solid var(--ws-border);border-radius:var(--ws-radius);cursor:pointer;padding:6px 12px;font-size:16px;color:var(--ws-text);transition:background var(--ws-transition),border-color var(--ws-transition);-webkit-tap-highlight-color:transparent}.ws-calendar-nav button:hover{background:#f5f5f5;border-color:var(--ws-primary)}.ws-calendar-nav .ws-month-label{font-size:16px;font-weight:600;text-transform:capitalize}.ws-today-btn{background:0 0;border:1px solid var(--ws-border);border-radius:var(--ws-radius);cursor:pointer;padding:4px 10px;font-size:12px;color:var(--ws-text-secondary);margin-left:8px;transition:background var(--ws-transition)}.ws-today-btn:hover{background:#f5f5f5}.ws-calendar-weekdays{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px}.ws-weekday{text-align:center;font-size:12px;font-weight:600;color:var(--ws-text-secondary);padding:6px 0;text-transform:uppercase}.ws-calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.ws-calendar-day{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:var(--ws-radius);font-size:14px;cursor:pointer;border:none;background:0 0;color:var(--ws-text);padding:2px;transition:background var(--ws-transition),color var(--ws-transition);position:relative;-webkit-tap-highlight-color:transparent;min-height:40px}.ws-calendar-day:hover:not(.ws-unavailable):not(.ws-empty){background:var(--ws-primary);color:#fff}.ws-calendar-day.ws-empty{cursor:default}.ws-calendar-day.ws-other-month{color:#ccc}.ws-calendar-day.ws-today{font-weight:700;text-decoration:underline;text-underline-offset:3px}.ws-calendar-day.ws-selected{background:var(--ws-primary);color:#fff;font-weight:700}.ws-calendar-day.ws-unavailable{color:#bbb;cursor:not-allowed;position:relative}.ws-calendar-day.ws-unavailable::after{content:"Zajęty";position:absolute;bottom:2px;font-size:7px;line-height:1;color:var(--ws-error);font-weight:600;text-transform:uppercase;letter-spacing:.3px}.ws-calendar-day.ws-unavailable:hover{background:0 0;color:#bbb}.ws-calendar-day.ws-past{color:#ccc;cursor:not-allowed}.ws-calendar-day.ws-past:hover{background:0 0;color:#ccc}.ws-no-dates-msg{text-align:center;color:var(--ws-text-secondary);padding:24px 0;font-size:14px}.ws-form-group{margin-bottom:16px}.ws-form-group label{display:block;font-size:14px;font-weight:600;margin-bottom:6px;color:var(--ws-text)}.ws-form-group .ws-required{color:var(--ws-error);margin-left:2px}.ws-form-group input,.ws-form-group select,.ws-form-group textarea{width:100%;padding:10px 12px;font-size:15px;border:1.5px solid var(--ws-border);border-radius:var(--ws-radius);background:var(--ws-bg);color:var(--ws-text);font-family:var(--ws-font);transition:border-color var(--ws-transition);box-sizing:border-box;min-height:44px;-webkit-appearance:none;appearance:none}.ws-form-group input:focus,.ws-form-group select:focus,.ws-form-group textarea:focus{outline:0;border-color:var(--ws-primary);box-shadow:0 0 0 3px rgba(201,169,110,.15)}.ws-form-group textarea{min-height:80px;resize:vertical}.ws-form-group .ws-field-error{border-color:var(--ws-error)}.ws-form-group .ws-field-error:focus{box-shadow:0 0 0 3px rgba(220,53,69,.15)}.ws-error-text{font-size:12px;color:var(--ws-error);margin-top:4px;display:none}.ws-error-text.ws-visible{display:block}.ws-radio-group{display:flex;flex-wrap:wrap;gap:8px}.ws-radio-label{display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--ws-border);border-radius:var(--ws-radius);cursor:pointer;font-size:14px;transition:border-color var(--ws-transition),background var(--ws-transition);-webkit-tap-highlight-color:transparent}.ws-radio-label:hover{border-color:var(--ws-primary)}.ws-radio-label input[type=radio]{display:none}.ws-radio-label input[type=radio]:checked+span{font-weight:600}.ws-radio-label:has(input:checked){border-color:var(--ws-primary);background:rgba(201,169,110,.08)}.ws-btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 24px;font-size:15px;font-weight:600;border-radius:var(--ws-radius);border:none;cursor:pointer;transition:background var(--ws-transition),opacity var(--ws-transition);min-height:48px;font-family:var(--ws-font);-webkit-tap-highlight-color:transparent}.ws-btn:disabled{opacity:.5;cursor:not-allowed}.ws-btn-primary{background:var(--ws-primary);color:#fff}.ws-btn-primary:hover:not(:disabled){opacity:.9}.ws-btn-secondary{background:0 0;color:var(--ws-text);border:1.5px solid var(--ws-border)}.ws-btn-secondary:hover:not(:disabled){border-color:var(--ws-text-secondary)}.ws-btn-block{width:100%}.ws-btn-group{display:flex;gap:12px;margin-top:24px}.ws-btn-group .ws-btn{flex:1}.ws-spinner{display:inline-block;width:20px;height:20px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:ws-spin .6s linear infinite}.ws-btn .ws-spinner{margin-right:8px}.ws-loading-text{text-align:center;padding:40px 0;color:var(--ws-text-secondary);display:flex;flex-direction:column;align-items:center;gap:12px}.ws-loading-text .ws-spinner{width:32px;height:32px;border-width:3px;border-color:rgba(0,0,0,.1);border-top-color:var(--ws-primary)}@keyframes ws-spin{to{transform:rotate(360deg)}}.ws-summary{background:#fafafa;border-radius:var(--ws-radius);padding:16px;margin-bottom:16px}.ws-summary-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ws-border);font-size:14px}.ws-summary-row:last-child{border-bottom:none}.ws-summary-label{color:var(--ws-text-secondary);flex-shrink:0;margin-right:12px}.ws-summary-value{text-align:right;font-weight:500;word-break:break-word}.ws-confirmation{text-align:center;padding:24px 0}.ws-confirmation-icon{width:64px;height:64px;border-radius:50%;background:var(--ws-success);color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px}.ws-confirmation h3{font-size:20px;margin:0 0 8px;color:var(--ws-text)}.ws-confirmation p{color:var(--ws-text-secondary);font-size:14px;line-height:1.5;margin:0 0 20px}.ws-error-banner{background:var(--ws-error-bg);border:1px solid var(--ws-error);border-radius:var(--ws-radius);padding:12px 16px;color:var(--ws-error);font-size:14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:8px}.ws-error-banner .ws-error-icon{flex-shrink:0;font-size:16px;line-height:1.4}.ws-date-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(201,169,110,.12);color:var(--ws-primary);font-weight:600;font-size:14px;padding:8px 16px;border-radius:var(--ws-radius);margin-bottom:16px}.ws-rate-limit{text-align:center;font-size:12px;color:var(--ws-text-secondary);margin-top:8px}@media(prefers-color-scheme:dark){.ws-overlay{background:rgba(0,0,0,.7)}.ws-modal{--ws-bg:#1e1e1e;--ws-text:#e0e0e0;--ws-text-secondary:#999;--ws-border:#333;background:var(--ws-bg);color:var(--ws-text)}.ws-calendar-nav button:hover,.ws-today-btn:hover{background:#2a2a2a}.ws-form-group input,.ws-form-group select,.ws-form-group textarea{background:#2a2a2a;color:var(--ws-text)}.ws-summary{background:#2a2a2a}.ws-radio-label:has(input:checked){background:rgba(201,169,110,.15)}.ws-calendar-day.ws-other-month{color:#444}.ws-calendar-day.ws-past{color:#444}.ws-calendar-day.ws-unavailable{color:#555}.ws-date-badge{background:rgba(201,169,110,.2)}.ws-loading-text .ws-spinner{border-color:rgba(255,255,255,.1);border-top-color:var(--ws-primary)}}@media print{.ws-trigger-btn,.ws-overlay{display:none!important}}';
  }

  /* ------------------------------------------------------------------
     DOM building
     ------------------------------------------------------------------ */
  function buildTriggerBtn() {
    var pos = CONFIG.position === 'bottom-left' ? 'left' : 'right';
    var btn = createElement('button', {
      className: 'ws-trigger-btn',
      'aria-label': 'Rezerwacja online',
      style: pos + ': 24px',
      html: '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V8h14v11z"/></svg>',
    });
    return btn;
  }

  function buildOverlay() {
    var overlay = createElement('div', { className: 'ws-overlay', id: 'ws-overlay' });
    var modal = createElement('div', { className: 'ws-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Formularz rezerwacji' });

    var header = createElement('div', { className: 'ws-modal-header' });
    var title = createElement('h2', { html: 'Rezerwacja online' });
    var closeBtn = createElement('button', { className: 'ws-close-btn', 'aria-label': 'Zamknij', html: '&times;' });
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var indicator = createElement('div', { className: 'ws-step-indicator' });
    for (var i = 1; i <= 3; i++) {
      var dot = createElement('span', { className: 'ws-step-dot' + (i === 1 ? ' ws-active' : ''), dataset: { step: i } });
      indicator.appendChild(dot);
    }
    modal.appendChild(indicator);

    var body = createElement('div', { className: 'ws-modal-body' });
    modal.appendChild(body);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    el.overlay = overlay;
    el.modal = modal;
    el.modalHeader = header;
    el.modalTitle = title;
    el.closeBtn = closeBtn;
    el.indicator = indicator;
    el.stepDots = qsa('.ws-step-dot', indicator);
    el.modalBody = body;
    return overlay;
  }

  function renderStep(s) {
    el.modalBody.innerHTML = '';
    var stepEl = createElement('div', { className: 'ws-step ws-visible', id: 'ws-step-' + s });
    el.modalBody.appendChild(stepEl);

    /* Update dots */
    for (var i = 0; i < el.stepDots.length; i++) {
      removeClass(el.stepDots[i], 'ws-active');
      removeClass(el.stepDots[i], 'ws-completed');
      var stepNum = parseInt(el.stepDots[i].getAttribute('data-step'), 10);
      if (stepNum === s) addClass(el.stepDots[i], 'ws-active');
      else if (stepNum < s) addClass(el.stepDots[i], 'ws-completed');
    }

    switch (s) {
      case 1: renderStep1(stepEl); break;
      case 2: renderStep2(stepEl); break;
      case 3: renderStep3(stepEl); break;
    }

    el.modalBody.scrollTop = 0;
  }

  /* ------------------------------------------------------------------
     Step 1 — Calendar
     ------------------------------------------------------------------ */
  function renderStep1(container) {
    var now = new Date();
    STATE.month = STATE.month || new Date(now.getFullYear(), now.getMonth(), 1);
    container.innerHTML = '';

    /* Loading state */
    var loading = createElement('div', { className: 'ws-loading-text', id: 'ws-cal-loading' });
    loading.appendChild(createElement('div', { className: 'ws-spinner' }));
    loading.appendChild(document.createTextNode('Ładowanie kalendarza...'));
    container.appendChild(loading);

    /* Fetch tenant + availability in parallel */
    var tenantPromise = STATE.tenant
      ? Promise.resolve(STATE.tenant)
      : apiFetch('public/' + CONFIG.tenantId).then(function (data) {
          STATE.tenant = data;
          return data;
        });

    var monthStr = STATE.month.getFullYear() + '-' + String(STATE.month.getMonth() + 1).padStart(2, '0');
    var availPromise = apiFetch('public/' + CONFIG.tenantId + '/availability?month=' + monthStr).then(function (data) {
      STATE.bookedDates = data.booked_dates || [];
      return data;
    });

    Promise.all([tenantPromise, availPromise]).then(function (results) {
      var tenant = results[0];
      /* Update primary color */
      if (tenant && tenant.primary_color) {
        document.documentElement.style.setProperty('--ws-primary', tenant.primary_color);
      }
      buildCalendar(container);
    }).catch(function (err) {
      loading.innerHTML = '<div class="ws-error-banner"><span class="ws-error-icon">&#9888;</span><span>Nie udało się załadować kalendarza. Spróbuj ponownie później.</span></div>';
      /* Still show calendar with no data */
      STATE.bookedDates = [];
      buildCalendar(container);
    });
  }

  function buildCalendar(container) {
    /* Remove loading */
    var loading = document.getElementById('ws-cal-loading');
    if (loading) loading.remove();

    /* Prepend any existing content is gone, rebuild */
    container.innerHTML = '';

    var year = STATE.month.getFullYear();
    var month = STATE.month.getMonth();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    /* Nav */
    var nav = createElement('div', { className: 'ws-calendar-nav' });
    var prevBtn = createElement('button', { html: '&lsaquo;', 'aria-label': 'Poprzedni miesiąc' });
    var label = createElement('span', { className: 'ws-month-label', html: formatMonthPL(year, month) });
    var nextBtn = createElement('button', { html: '&rsaquo;', 'aria-label': 'Następny miesiąc' });
    var todayBtn = createElement('button', { className: 'ws-today-btn', html: 'Dziś' });

    nav.appendChild(prevBtn);
    nav.appendChild(label);
    nav.appendChild(todayBtn);
    nav.appendChild(nextBtn);
    container.appendChild(nav);

    /* Weekday headers */
    var weekdaysDiv = createElement('div', { className: 'ws-calendar-weekdays' });
    var dayNames = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
    for (var i = 0; i < 7; i++) {
      weekdaysDiv.appendChild(createElement('div', { className: 'ws-weekday', html: dayNames[i] }));
    }
    container.appendChild(weekdaysDiv);

    /* Grid */
    var grid = createElement('div', { className: 'ws-calendar-grid' });
    container.appendChild(grid);

    var firstDay = new Date(year, month, 1);
    var startOffset = (firstDay.getDay() + 6) % 7; /* Monday first */
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    function renderDays() {
      grid.innerHTML = '';

      /* Empty cells before first day */
      for (var i = 0; i < startOffset; i++) {
        grid.appendChild(createElement('div', { className: 'ws-calendar-day ws-empty' }));
      }

      for (var d = 1; d <= daysInMonth; d++) {
        var date = new Date(year, month, d);
        date.setHours(0, 0, 0, 0);
        var dateStr = isoDate(date);
        var isToday = date.getTime() === today.getTime();
        var isPast = date.getTime() < today.getTime();
        var isBooked = STATE.bookedDates.indexOf(dateStr) !== -1;
        var isSelected = STATE.selectedDate === dateStr;

        var classes = 'ws-calendar-day';
        if (isToday) classes += ' ws-today';
        if (isPast) classes += ' ws-past';
        if (isBooked) classes += ' ws-unavailable';
        if (isSelected) classes += ' ws-selected';

        var dayEl = createElement('button', {
          className: classes,
          html: String(d),
          dataset: { date: dateStr },
        });
        grid.appendChild(dayEl);
      }
    }

    renderDays();

    /* Event listeners */
    on(prevBtn, 'click', function () {
      STATE.month.setMonth(STATE.month.getMonth() - 1);
      STATE.selectedDate = null;
      fetchAvailabilityAndRebuild(container);
    });

    on(nextBtn, 'click', function () {
      STATE.month.setMonth(STATE.month.getMonth() + 1);
      STATE.selectedDate = null;
      fetchAvailabilityAndRebuild(container);
    });

    on(todayBtn, 'click', function () {
      STATE.month = new Date(today.getFullYear(), today.getMonth(), 1);
      STATE.selectedDate = null;
      fetchAvailabilityAndRebuild(container);
    });

    /* Date click (delegated) */
    on(grid, 'click', function (e) {
      var dayEl = closest(e.target, '.ws-calendar-day');
      if (!dayEl) return;
      if (hasClass(dayEl, 'ws-empty') || hasClass(dayEl, 'ws-unavailable') || hasClass(dayEl, 'ws-past')) return;
      var dateStr = dayEl.getAttribute('data-date');
      STATE.selectedDate = dateStr;

      /* Update UI */
      var allDays = qsa('.ws-calendar-day', grid);
      for (var i = 0; i < allDays.length; i++) {
        removeClass(allDays[i], 'ws-selected');
      }
      addClass(dayEl, 'ws-selected');

      /* Show next button */
      showNextButton(container, dateStr, true);
    });

    /* If already selected, show next button */
    if (STATE.selectedDate) {
      showNextButton(container, STATE.selectedDate);
    } else {
      showNextButton(container, null, false);
    }
  }

  function showNextButton(container, dateStr, visible) {
    var existing = document.getElementById('ws-next-btn-wrap');
    if (existing) existing.remove();

    if (!visible && !dateStr) return;

    var wrap = createElement('div', { id: 'ws-next-btn-wrap', style: 'margin-top:20px' });

    if (dateStr) {
      var d = new Date(dateStr + 'T12:00:00');
      var badge = createElement('div', { className: 'ws-date-badge', html: '&#128197; ' + formatDatePL(d) });
      wrap.appendChild(badge);
    }

    var nextBtn = createElement('button', {
      className: 'ws-btn ws-btn-primary ws-btn-block',
      html: 'Dalej',
      id: 'ws-step1-next',
    });
    on(nextBtn, 'click', function () {
      if (!STATE.selectedDate) return;
      STATE.step = 2;
      renderStep(2);
    });
    wrap.appendChild(nextBtn);
    container.appendChild(wrap);
  }

  function fetchAvailabilityAndRebuild(container) {
    var loading = createElement('div', { className: 'ws-loading-text' });
    loading.appendChild(createElement('div', { className: 'ws-spinner' }));
    loading.appendChild(document.createTextNode('Ładowanie...'));
    container.innerHTML = '';
    container.appendChild(loading);

    var monthStr = STATE.month.getFullYear() + '-' + String(STATE.month.getMonth() + 1).padStart(2, '0');
    apiFetch('public/' + CONFIG.tenantId + '/availability?month=' + monthStr).then(function (data) {
      STATE.bookedDates = data.booked_dates || [];
      buildCalendar(container);
    }).catch(function () {
      STATE.bookedDates = [];
      buildCalendar(container);
    });
  }

  /* ------------------------------------------------------------------
     Step 2 — Form
     ------------------------------------------------------------------ */
  function renderStep2(container) {
    var saved = loadFormData();
    var fd = saved || {};

    /* Restore from state if we came back */
    if (STATE.formData && Object.keys(STATE.formData).length > 0) {
      fd = STATE.formData;
    }

    container.innerHTML = '';

    /* Selected date badge */
    if (STATE.selectedDate) {
      var d = new Date(STATE.selectedDate + 'T12:00:00');
      container.appendChild(createElement('div', { className: 'ws-date-badge', html: '&#128197; ' + formatDatePL(d) }));
    }

    /* Error banner */
    var errorBanner = createElement('div', { className: 'ws-error-banner', id: 'ws-form-error', style: 'display:none' });
    errorBanner.innerHTML = '<span class="ws-error-icon">&#9888;</span><span id="ws-form-error-msg"></span>';
    container.appendChild(errorBanner);

    /* Name */
    container.appendChild(makeInputGroup('Imię i nazwisko', 'client_name', 'text', 'np. Jan Kowalski', true, fd.client_name || ''));

    /* Email */
    container.appendChild(makeInputGroup('E-mail', 'client_email', 'email', 'jan@example.com', true, fd.client_email || ''));

    /* Phone */
    container.appendChild(makeInputGroup('Telefon', 'client_phone', 'tel', '+48 123 456 789', true, fd.client_phone || ''));

    /* Client type */
    var typeGroup = createElement('div', { className: 'ws-form-group' });
    var typeLabel = createElement('label', { html: 'Typ klienta <span class="ws-required">*</span>' });
    typeGroup.appendChild(typeLabel);
    var radioWrap = createElement('div', { className: 'ws-radio-group' });
    var types = [
      { value: 'bride_groom', label: 'Para Młoda' },
      { value: 'dj', label: 'DJ' },
      { value: 'agency', label: 'Agencja' },
    ];
    types.forEach(function (t) {
      var radioLabel = createElement('label', { className: 'ws-radio-label' });
      var radio = createElement('input', {
        type: 'radio',
        name: 'client_type',
        value: t.value,
      });
      if (fd.client_type === t.value || (!fd.client_type && t.value === 'bride_groom')) {
        radio.checked = true;
      }
      radioLabel.appendChild(radio);
      radioLabel.appendChild(createElement('span', { html: t.label }));
      radioWrap.appendChild(radioLabel);
    });
    typeGroup.appendChild(radioWrap);
    container.appendChild(typeGroup);

    /* Guest count */
    container.appendChild(makeInputGroup('Liczba gości', 'guest_count', 'number', 'np. 100', false, fd.guest_count || ''));

    /* Event location */
    container.appendChild(makeInputGroup('Miejsce wydarzenia', 'event_location', 'text', 'np. Sala Weselna Słoneczny Brzeg', false, fd.event_location || ''));

    /* Package dropdown */
    var pkgGroup = createElement('div', { className: 'ws-form-group' });
    var pkgLabel = createElement('label', { html: 'Wybierz pakiet <span class="ws-required">*</span>' });
    pkgGroup.appendChild(pkgLabel);
    var pkgSelect = createElement('select', { id: 'ws-package-id' });
    var loadingOpt = createElement('option', { html: 'Ładowanie pakietów...' });
    pkgSelect.appendChild(loadingOpt);
    pkgGroup.appendChild(pkgSelect);

    /* Fetch packages */
    apiFetch('public/' + CONFIG.tenantId + '/packages').then(function (data) {
      var pkgs = Array.isArray(data) ? data : (data.packages || []);
      STATE.packages = pkgs;
      pkgSelect.innerHTML = '<option value="">-- Wybierz --</option>';
      pkgs.forEach(function (p) {
        var opt = createElement('option', { value: p.id, html: p.name + ' — ' + Number(p.price).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' zł' });
        if (fd.package_id === p.id) opt.selected = true;
        pkgSelect.appendChild(opt);
      });
    }).catch(function () {
      pkgSelect.innerHTML = '<option value="">Brak pakietów</option>';
    });

    container.appendChild(pkgGroup);

    /* Notes */
    container.appendChild(makeTextareaGroup('Uwagi', 'ws-notes', fd.notes || ''));

    /* Buttons */
    var btnGroup = createElement('div', { className: 'ws-btn-group' });
    var backBtn = createElement('button', { className: 'ws-btn ws-btn-secondary', html: 'Wstecz' });
    var nextBtn = createElement('button', { className: 'ws-btn ws-btn-primary', html: 'Dalej', id: 'ws-step2-next' });

    on(backBtn, 'click', function () {
      saveStep2Data();
      STATE.step = 1;
      renderStep(1);
    });

    on(nextBtn, 'click', function () {
      if (validateStep2()) {
        saveStep2Data();
        STATE.step = 3;
        renderStep(3);
      }
    });

    btnGroup.appendChild(backBtn);
    btnGroup.appendChild(nextBtn);
    container.appendChild(btnGroup);

    /* Focus first input */
    var firstInput = qs('input, select, textarea', container);
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 100);
  }

  function saveStep2Data() {
    STATE.formData = {
      client_name: getVal('client_name'),
      client_email: getVal('client_email'),
      client_phone: getVal('client_phone'),
      client_type: getSelectedRadio('client_type'),
      guest_count: getVal('guest_count'),
      event_location: getVal('event_location'),
      package_id: getVal('ws-package-id'),
      notes: getVal('ws-notes'),
    };
    saveFormData(STATE.formData);
  }

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function getSelectedRadio(name) {
    var radios = document.querySelectorAll('input[name="' + name + '"]:checked');
    return radios.length ? radios[0].value : 'bride_groom';
  }

  function makeInputGroup(label, id, type, placeholder, required, value) {
    var group = createElement('div', { className: 'ws-form-group' });
    var labelHtml = label;
    if (required) labelHtml += ' <span class="ws-required">*</span>';
    group.appendChild(createElement('label', { html: labelHtml, 'for': id }));
    var input = createElement('input', {
      type: type,
      id: id,
      placeholder: placeholder || '',
      value: value || '',
    });
    if (required) input.setAttribute('required', '');
    group.appendChild(input);

    var errorEl = createElement('div', { className: 'ws-error-text', id: id + '-error' });
    group.appendChild(errorEl);
    return group;
  }

  function makeTextareaGroup(label, id, value) {
    var group = createElement('div', { className: 'ws-form-group' });
    group.appendChild(createElement('label', { html: label, 'for': id }));
    var textarea = createElement('textarea', { id: id });
    textarea.appendChild(document.createTextNode(value || ''));
    group.appendChild(textarea);
    return group;
  }

  function validateStep2() {
    var valid = true;
    var fields = [
      { id: 'client_name', label: 'Imię i nazwisko' },
      { id: 'client_email', label: 'E-mail' },
      { id: 'client_phone', label: 'Telefon' },
    ];

    var errorBanner = document.getElementById('ws-form-error');
    var errorMsg = document.getElementById('ws-form-error-msg');

    /* Reset */
    fields.forEach(function (f) {
      var input = document.getElementById(f.id);
      if (input) removeClass(input, 'ws-field-error');
      var errEl = document.getElementById(f.id + '-error');
      if (errEl) removeClass(errEl, 'ws-visible');
    });
    if (errorBanner) errorBanner.style.display = 'none';

    var errors = [];

    fields.forEach(function (f) {
      var input = document.getElementById(f.id);
      var val = input ? input.value.trim() : '';
      if (!val) {
        valid = false;
        addClass(input, 'ws-field-error');
        var errEl = document.getElementById(f.id + '-error');
        if (errEl) {
          errEl.textContent = f.label + ' jest wymagane';
          addClass(errEl, 'ws-visible');
        }
        errors.push(f.label + ' jest wymagane');
      }
      if (f.id === 'client_email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        valid = false;
        addClass(input, 'ws-field-error');
        var errEl = document.getElementById(f.id + '-error');
        if (errEl) {
          errEl.textContent = 'Podaj prawidłowy adres e-mail';
          addClass(errEl, 'ws-visible');
        }
        errors.push('Podaj prawidłowy adres e-mail');
      }
    });

    /* Package validation */
    var pkgSelect = document.getElementById('ws-package-id');
    if (pkgSelect && !pkgSelect.value) {
      valid = false;
      addClass(pkgSelect, 'ws-field-error');
      errors.push('Wybierz pakiet');
    }

    if (!valid && errorBanner && errorMsg) {
      errorBanner.style.display = 'flex';
      errorMsg.textContent = errors[0];
    }

    return valid;
  }

  /* ------------------------------------------------------------------
     Step 3 — Confirmation
     ------------------------------------------------------------------ */
  function renderStep3(container) {
    var fd = STATE.formData;
    container.innerHTML = '';

    /* Summary */
    var summary = createElement('div', { className: 'ws-summary' });

    var dateObj = STATE.selectedDate ? new Date(STATE.selectedDate + 'T12:00:00') : null;
    addSummaryRow(summary, 'Data', dateObj ? formatDatePL(dateObj) : '-');
    addSummaryRow(summary, 'Imię', sanitize(fd.client_name || '-'));
    addSummaryRow(summary, 'E-mail', sanitize(fd.client_email || '-'));
    addSummaryRow(summary, 'Telefon', sanitize(fd.client_phone || '-'));

    var typeLabels = { bride_groom: 'Para Młoda', dj: 'DJ', agency: 'Agencja' };
    addSummaryRow(summary, 'Typ klienta', typeLabels[fd.client_type] || fd.client_type || '-');

    if (fd.guest_count) addSummaryRow(summary, 'Liczba gości', fd.guest_count);
    if (fd.event_location) addSummaryRow(summary, 'Miejsce', sanitize(fd.event_location));

    /* Package info */
    var selectedPkg = null;
    for (var i = 0; i < STATE.packages.length; i++) {
      if (STATE.packages[i].id === fd.package_id) {
        selectedPkg = STATE.packages[i];
        break;
      }
    }
    if (selectedPkg) {
      addSummaryRow(summary, 'Pakiet', selectedPkg.name + ' — ' + Number(selectedPkg.price).toLocaleString('pl-PL', { minimumFractionDigits: 2 }) + ' zł');
    } else {
      addSummaryRow(summary, 'Pakiet', '-');
    }

    if (fd.notes) addSummaryRow(summary, 'Uwagi', sanitize(fd.notes));
    container.appendChild(summary);

    /* Error banner */
    var errorBanner = createElement('div', { className: 'ws-error-banner', id: 'ws-submit-error', style: 'display:none' });
    errorBanner.innerHTML = '<span class="ws-error-icon">&#9888;</span><span id="ws-submit-error-msg"></span>';
    container.appendChild(errorBanner);

    /* Buttons */
    var btnGroup = createElement('div', { className: 'ws-btn-group' });
    var backBtn = createElement('button', { className: 'ws-btn ws-btn-secondary', html: 'Wstecz' });
    var submitBtn = createElement('button', { className: 'ws-btn ws-btn-primary', html: 'Zarezerwuj', id: 'ws-submit-btn' });

    on(backBtn, 'click', function () {
      STATE.step = 2;
      renderStep(2);
    });

    on(submitBtn, 'click', function () {
      submitBooking(submitBtn);
    });

    btnGroup.appendChild(backBtn);
    btnGroup.appendChild(submitBtn);
    container.appendChild(btnGroup);

    /* Rate limit info */
    var elapsed = Date.now() - STATE.lastSubmitTime;
    if (elapsed < CONFIG.rateLimitMs && STATE.lastSubmitTime > 0) {
      submitBtn.disabled = true;
      var remaining = Math.ceil((CONFIG.rateLimitMs - elapsed) / 1000);
      var rateInfo = createElement('div', { className: 'ws-rate-limit', id: 'ws-rate-info', html: 'Odczekaj ' + remaining + 's przed ponowną wysyłką' });
      container.appendChild(rateInfo);
      var timer = setInterval(function () {
        remaining--;
        if (rateInfo) rateInfo.textContent = 'Odczekaj ' + remaining + 's przed ponowną wysyłką';
        if (remaining <= 0) {
          clearInterval(timer);
          submitBtn.disabled = false;
          if (rateInfo) rateInfo.remove();
        }
      }, 1000);
    }
  }

  function addSummaryRow(parent, label, value) {
    var row = createElement('div', { className: 'ws-summary-row' });
    row.appendChild(createElement('span', { className: 'ws-summary-label', html: label }));
    row.appendChild(createElement('span', { className: 'ws-summary-value', html: String(value) }));
    parent.appendChild(row);
  }

  /* ------------------------------------------------------------------
     Submit booking
     ------------------------------------------------------------------ */
  function submitBooking(btn) {
    if (STATE.submitting) return;

    /* Rate limit check */
    var elapsed = Date.now() - STATE.lastSubmitTime;
    if (elapsed < CONFIG.rateLimitMs && STATE.lastSubmitTime > 0) {
      var remaining = Math.ceil((CONFIG.rateLimitMs - elapsed) / 1000);
      showSubmitError('Odczekaj ' + remaining + ' sekund przed ponowną próbą.');
      return;
    }

    STATE.submitting = true;
    btn.disabled = true;
    btn.innerHTML = '<div class="ws-spinner"></div> Wysyłanie...';

    var fd = STATE.formData;
    var body = {
      client_name: fd.client_name,
      client_email: fd.client_email,
      client_phone: fd.client_phone,
      client_type: fd.client_type || 'bride_groom',
      guest_count: parseInt(fd.guest_count, 10) || 0,
      event_location: fd.event_location || '',
      package_id: fd.package_id || '',
      event_date: STATE.selectedDate || '',
      source: 'public_booking',
    };

    apiPost('public/' + CONFIG.tenantId + '/bookings', body).then(function (data) {
      STATE.submitting = false;
      STATE.lastSubmitTime = Date.now();
      clearFormData();
      STATE.formData = {};
      showConfirmation(btn);
    }).catch(function (err) {
      STATE.submitting = false;
      STATE.lastSubmitTime = Date.now();
      btn.disabled = false;
      btn.innerHTML = 'Zarezerwuj';
      showSubmitError(err.message || 'Wystąpił błąd podczas wysyłania. Spróbuj ponownie.');
    });
  }

  function showSubmitError(msg) {
    var banner = document.getElementById('ws-submit-error');
    var msgEl = document.getElementById('ws-submit-error-msg');
    if (banner && msgEl) {
      banner.style.display = 'flex';
      msgEl.textContent = msg;
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function showConfirmation(btn) {
    var container = el.modalBody;
    container.innerHTML = '';

    var div = createElement('div', { className: 'ws-confirmation' });
    div.innerHTML = '<div class="ws-confirmation-icon">&#10003;</div><h3>Dziękujemy!</h3><p>Twoja rezerwacja została przyjęta.<br>Więcej informacji wyślemy na adres e-mail.</p>';

    /* Mini summary */
    var miniSummary = createElement('div', { className: 'ws-summary' });
    var dateObj = STATE.selectedDate ? new Date(STATE.selectedDate + 'T12:00:00') : null;
    if (dateObj) addSummaryRow(miniSummary, 'Data', formatDatePL(dateObj));
    var fd = STATE.formData;
    if (fd.client_name) addSummaryRow(miniSummary, 'Imię', sanitize(fd.client_name));
    if (fd.client_email) addSummaryRow(miniSummary, 'E-mail', sanitize(fd.client_email));
    if (fd.client_phone) addSummaryRow(miniSummary, 'Telefon', sanitize(fd.client_phone));
    div.appendChild(miniSummary);

    var newBtn = createElement('button', {
      className: 'ws-btn ws-btn-primary ws-btn-block',
      html: 'Nowa rezerwacja',
      style: 'margin-top:16px',
    });
    on(newBtn, 'click', function () {
      resetWidget();
    });
    div.appendChild(newBtn);

    container.appendChild(div);
  }

  function resetWidget() {
    STATE.step = 1;
    STATE.selectedDate = null;
    STATE.month = new Date();
    STATE.formData = {};
    STATE.submitting = false;
    clearFormData();
    renderStep(1);
  }

  /* ------------------------------------------------------------------
     Modal open / close
     ------------------------------------------------------------------ */
  function openModal() {
    addClass(el.overlay, 'ws-open');
    document.body.style.overflow = 'hidden';
    renderStep(STATE.step);
  }

  function closeModal() {
    removeClass(el.overlay, 'ws-open');
    document.body.style.overflow = '';
    /* Restore focus to trigger btn */
    if (el.triggerBtn) el.triggerBtn.focus();
  }

  function toggleModal() {
    if (hasClass(el.overlay, 'ws-open')) {
      closeModal();
    } else {
      openModal();
    }
  }

  /* ------------------------------------------------------------------
     Keyboard & accessibility
     ------------------------------------------------------------------ */
  function handleKeydown(e) {
    if (e.key === 'Escape' && hasClass(el.overlay, 'ws-open')) {
      closeModal();
    }
    /* Trap focus */
    if (e.key === 'Tab' && hasClass(el.overlay, 'ws-open')) {
      trapFocus(e);
    }
  }

  function trapFocus(e) {
    var focusable = el.modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  function init() {
    getScriptData();

    if (!CONFIG.tenantId) {
      console.warn('[PartyPilot Widget] Brak atrybutu data-tenant-id. Widget nie został uruchomiony.');
      return;
    }

    injectCSS();

    el.triggerBtn = buildTriggerBtn();
    document.body.appendChild(el.triggerBtn);

    buildOverlay();

    /* Set position */
    if (CONFIG.position === 'bottom-left') {
      el.triggerBtn.style.left = '24px';
      el.triggerBtn.style.right = 'auto';
    }

    /* Events */
    on(el.triggerBtn, 'click', toggleModal);
    on(el.closeBtn, 'click', closeModal);
    on(el.overlay, 'click', function (e) {
      if (e.target === el.overlay) closeModal();
    });
    on(document, 'keydown', handleKeydown);

    /* Expose API */
    window.PartyPilotWidget = {
      open: openModal,
      close: closeModal,
      reset: resetWidget,
      config: CONFIG,
    };
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
