/* ── Calendar View ──────────────────────────────────────────── */

import api from '../api.js';
import { navigate } from '../app.js';

const STATUS_LABELS = {
  inquiry: 'Zapytanie',
  offer_sent: 'Oferta wysłana',
  deposit_paid: 'Zaliczka opłacona',
  confirmed: 'Potwierdzona',
  cancelled: 'Anulowana',
  completed: 'Zakończona',
};

const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const DAY_NAMES = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

/* ── Calendar State ────────────────────────────────────────── */
const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  events: [],
  loading: false,
  cache: {}, // keyed by "YYYY-MM" → events array
  selectedDate: null,
};

/* ── Render Entry Point ───────────────────────────────────── */
export async function renderCalendar(app) {
  app.setAttribute('data-view', 'calendar');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Kalendarz</h1>
    <div class="subtitle">Podgląd rezerwacji w kalendarzu</div>
  </div>
</div>
<div id="calendar-wrap">
  <div class="loading"><div class="spinner"></div><p>Ładowanie kalendarza...</p></div>
</div>
  `;

  state.selectedDate = null;
  await loadAndRender(app);
}

/* ── Data Loading ──────────────────────────────────────────── */
async function loadAndRender(app) {
  const monthKey = state.year + '-' + String(state.month + 1).padStart(2, '0');

  // Compute visible range (Mon–Sun including overflow from prev/next month)
  const firstDayOfMonth = new Date(state.year, state.month, 1);
  const lastDayOfMonth = new Date(state.year, state.month + 1, 0);
  const startDow = (firstDayOfMonth.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = lastDayOfMonth.getDate();

  const visFirst = new Date(state.year, state.month, 1 - startDow);
  // Last visible day: go to Saturday (index 6) of the last week
  const endDow = (lastDayOfMonth.getDay() + 6) % 7;
  const visLast = new Date(state.year, state.month, daysInMonth + (6 - endDow));

  const dateFrom = formatDateISO(visFirst);
  const dateTo = formatDateISO(visLast);

  // Fetch only if not cached
  if (!state.cache[monthKey]) {
    state.loading = true;
    const wrap = document.getElementById('calendar-wrap');
    if (wrap) {
      wrap.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie kalendarza...</p></div>';
    }

    try {
      const data = await api.getCalendar(dateFrom, dateTo);
      state.events = data.events || [];
      state.cache[monthKey] = state.events;
    } catch (err) {
      const wrapEl = document.getElementById('calendar-wrap');
      if (wrapEl) {
        wrapEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      }
      state.loading = false;
      return;
    }
    state.loading = false;
  } else {
    state.events = state.cache[monthKey];
  }

  buildGrid(app);
}

/* ── Build Calendar Grid ───────────────────────────────────── */
function buildGrid(app) {
  const firstDayOfMonth = new Date(state.year, state.month, 1);
  const lastDayOfMonth = new Date(state.year, state.month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startDow = (firstDayOfMonth.getDay() + 6) % 7; // Mon=0

  const today = new Date();
  const todayStr = formatDateISO(today);

  // Group events by date
  const eventsByDay = {};
  for (const e of state.events) {
    const dateKey = e.date || '';
    if (!dateKey) continue;
    if (!eventsByDay[dateKey]) eventsByDay[dateKey] = [];
    eventsByDay[dateKey].push(e);
  }

  // Previous month days to show
  const prevMonth = new Date(state.year, state.month, 0);
  const daysInPrevMonth = prevMonth.getDate();

  let html = '';

  // ── Navigation ──
  html += `
<div class="calendar-nav">
  <button class="cal-nav-btn" id="cal-prev">&#9664;</button>
  <h2 class="calendar-title">${MONTH_NAMES[state.month]} ${state.year}</h2>
  <button class="cal-nav-btn" id="cal-next">&#9654;</button>
  <button class="btn btn-secondary btn-sm cal-today-btn" id="cal-today">Dzisiaj</button>
</div>
  `;

  // ── Grid ──
  html += '<div class="calendar-grid">';

  // Header row
  for (const d of DAY_NAMES) {
    html += '<div class="calendar-cell calendar-header-cell">' + d + '</div>';
  }

  // Day cells — 42 cells (6 rows × 7 cols)
  let day = 1;
  let nextMonthDay = 1;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < startDow) {
        // Previous month overflow
        const prevDay = daysInPrevMonth - startDow + col + 1;
        const prevDate = new Date(state.year, state.month - 1, prevDay);
        const dateStr = formatDateISO(prevDate);
        html += buildCell(dateStr, prevDay, true, col >= 5, eventsByDay[dateStr], todayStr);
      } else if (day > daysInMonth) {
        // Next month overflow
        const nextDate = new Date(state.year, state.month + 1, nextMonthDay);
        const dateStr = formatDateISO(nextDate);
        html += buildCell(dateStr, nextMonthDay, true, col >= 5, eventsByDay[dateStr], todayStr);
        nextMonthDay++;
      } else {
        const dateStr = state.year + '-' + String(state.month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        html += buildCell(dateStr, day, false, col >= 5, eventsByDay[dateStr], todayStr);
        day++;
      }
    }
  }

  html += '</div>'; // .calendar-grid

  // ── Day detail panel ──
  html += '<div class="calendar-day-panel" id="calendar-day-panel">';
  if (state.selectedDate) {
    const dayEvents = state.events.filter(function (e) { return e.date === state.selectedDate; });
    html += buildDayDetail(state.selectedDate, dayEvents);
  } else {
    html += '<div class="day-panel-placeholder">Kliknij dzień, aby zobaczyć szczegóły</div>';
  }
  html += '</div>';

  const wrap = document.getElementById('calendar-wrap');
  if (!wrap) return;
  wrap.innerHTML = html;

  // ── Bind events ──
  bindNavigation(app);
  bindDayClicks(wrap);
  bindPanelActions();
}

function buildCell(dateStr, dayNum, isOtherMonth, isWeekend, dayEvents, todayStr) {
  let classes = 'calendar-cell';
  if (isOtherMonth) classes += ' other-month';
  if (dateStr === todayStr) classes += ' today';
  if (isWeekend) classes += ' weekend';
  if (dateStr === state.selectedDate) classes += ' selected';

  let eventsHtml = '';
  if (dayEvents && dayEvents.length > 0) {
    const visible = dayEvents.slice(0, 3);
    const extra = dayEvents.length - 3;
    eventsHtml = '<div class="calendar-event-dots">';
    for (const e of visible) {
      const dotClass = 'cal-dot-' + (e.status || 'inquiry');
      let title = escapeHtml(e.client_name) + ' — ' + (STATUS_LABELS[e.status] || e.status);
      if (e.status === 'cancelled') {
        eventsHtml += '<span class="cal-dot ' + dotClass + ' cancelled" title="' + title + '"></span>';
      } else {
        eventsHtml += '<span class="cal-dot ' + dotClass + '" title="' + title + '"></span>';
      }
    }
    if (extra > 0) {
      eventsHtml += '<span class="cal-dot-more">+' + extra + '</span>';
    }
    eventsHtml += '</div>';
  }

  return '<div class="' + classes + '" data-date="' + dateStr + '">' +
    '<span class="cal-day-num">' + dayNum + '</span>' +
    eventsHtml +
  '</div>';
}

/* ── Day Detail Panel ──────────────────────────────────────── */
function buildDayDetail(dateStr, dayEvents) {
  const d = new Date(dateStr + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  let html = '<div class="day-panel-header">' +
    '<h3 class="day-panel-title">' + dateLabel + '</h3>' +
    '<button class="day-panel-close" id="day-panel-close">&times;</button>' +
  '</div>';

  if (!dayEvents || dayEvents.length === 0) {
    html += '<div class="day-panel-body"><div class="day-panel-empty">Brak rezerwacji w tym dniu</div></div>';
  } else {
    html += '<div class="day-panel-body">';
    for (const e of dayEvents) {
      const statusLabel = STATUS_LABELS[e.status] || e.status;
      const timeStr = (e.event_time_start || '—') + ' – ' + (e.event_time_end || '—');
      const isCancelled = e.status === 'cancelled';
      const rowClass = isCancelled ? 'event-item-cancelled' : '';

      html += '<div class="day-event-item ' + rowClass + '" data-booking-id="' + escapeHtml(e.booking_id) + '">' +
        '<div class="day-event-time">' + escapeHtml(timeStr) + '</div>' +
        '<div class="day-event-info">' +
          '<div class="day-event-name">' + escapeHtml(e.client_name) + '</div>' +
          '<div class="day-event-meta">' +
            '<span class="badge badge-' + escapeHtml(e.status || 'inquiry') + '">' + escapeHtml(statusLabel) + '</span>' +
            (e.event_location ? ' <span class="day-event-location">&#9906; ' + escapeHtml(e.event_location) + '</span>' : '') +
            (e.package_id ? ' <span class="day-event-package">' + escapeHtml(e.package_id) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }
    html += '</div>';
  }

  // Action buttons
  html += '<div class="day-panel-actions">' +
    '<button class="btn btn-primary btn-sm" id="day-panel-new-booking" data-date="' + escapeHtml(dateStr) + '">+ Nowa rezerwacja</button>' +
  '</div>';

  return html;
}

/* ── Split-panel responsive: on mobile, show events inline ─── */
function buildMobileDayList(dayEvents) {
  const today = new Date();
  const todayStr = formatDateISO(today);

  // Build a flat list of all events across all days
  const allDates = {};
  for (const e of state.events) {
    const key = e.date || '';
    if (!key) continue;
    if (!allDates[key]) allDates[key] = [];
    allDates[key].push(e);
  }

  const sortedDates = Object.keys(allDates).sort();

  if (sortedDates.length === 0) {
    return '<div class="day-panel-body"><div class="day-panel-empty">Brak rezerwacji w tym miesiącu</div></div>';
  }

  let html = '<div class="day-panel-body mobile-list">';
  for (const dateStr of sortedDates) {
    const events = allDates[dateStr];
    const d = new Date(dateStr + 'T12:00:00');
    const dateLabel = d.toLocaleDateString('pl-PL', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
    const isToday = dateStr === todayStr;

    html += '<div class="mobile-date-group' + (isToday ? ' mobile-today' : '') + '">' +
      '<div class="mobile-date-header">' + escapeHtml(dateLabel) + '</div>';

    for (const e of events) {
      const statusLabel = STATUS_LABELS[e.status] || e.status;
      const timeStr = (e.event_time_start || '—') + ' – ' + (e.event_time_end || '—');
      const isCancelled = e.status === 'cancelled';

      html += '<div class="day-event-item ' + (isCancelled ? 'event-item-cancelled' : '') + '" data-booking-id="' + escapeHtml(e.booking_id) + '">' +
        '<div class="day-event-time">' + escapeHtml(timeStr) + '</div>' +
        '<div class="day-event-info">' +
          '<div class="day-event-name">' + escapeHtml(e.client_name) + '</div>' +
          '<div class="day-event-meta">' +
            '<span class="badge badge-' + escapeHtml(e.status || 'inquiry') + '">' + escapeHtml(statusLabel) + '</span>' +
            (e.event_location ? ' <span class="day-event-location">&#9906; ' + escapeHtml(e.event_location) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* ── Navigation Bindings ───────────────────────────────────── */
function bindNavigation(app) {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const todayBtn = document.getElementById('cal-today');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      state.month--;
      if (state.month < 0) { state.month = 11; state.year--; }
      state.selectedDate = null;
      loadAndRender(app);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.month++;
      if (state.month > 11) { state.month = 0; state.year++; }
      state.selectedDate = null;
      loadAndRender(app);
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      const now = new Date();
      state.month = now.getMonth();
      state.year = now.getFullYear();
      state.selectedDate = null;
      loadAndRender(app);
    });
  }
}

/* ── Day Click Bindings ────────────────────────────────────── */
function bindDayClicks(wrap) {
  wrap.querySelectorAll('.calendar-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.getAttribute('data-date');
      state.selectedDate = date;

      // Update selection styling
      wrap.querySelectorAll('.calendar-cell.selected').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');

      // Rebuild panel
      const panel = document.getElementById('calendar-day-panel');
      if (panel) {
        const dayEvents = state.events.filter(function (e) { return e.date === date; });
        panel.innerHTML = buildDayDetail(date, dayEvents);
        bindPanelActions();
      }
    });
  });
}

/* ── Panel Action Bindings ─────────────────────────────────── */
function bindPanelActions() {
  const closeBtn = document.getElementById('day-panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      state.selectedDate = null;
      const panel = document.getElementById('calendar-day-panel');
      if (panel) {
        panel.innerHTML = '<div class="day-panel-placeholder">Kliknij dzień, aby zobaczyć szczegóły</div>';
      }
      // Remove selection styling
      document.querySelectorAll('.calendar-cell.selected').forEach(c => c.classList.remove('selected'));
    });
  }

  // Event item click → navigate to booking detail
  document.querySelectorAll('.day-event-item[data-booking-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-booking-id');
      if (id) navigate('#bookings/' + id);
    });
  });

  // New booking button
  const newBtn = document.getElementById('day-panel-new-booking');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      // Navigate to #bookings — the bookings view will be rendered fresh
      // (no pre-fill mechanism exists, but we store the date in state)
      navigate('#bookings');
    });
  }

  // Also bind .calendar-cell clicks that might have been re-rendered
  const wrap = document.getElementById('calendar-wrap');
  if (wrap) bindDayClicks(wrap);
}

/* ── Helpers ───────────────────────────────────────────────── */
function formatDateISO(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

/* ── Exported helper for dashboard ─────────────────────────── */
export function getCalendarEvents(dateFrom, dateTo) {
  return api.getCalendar(dateFrom, dateTo);
}
