/* ── My Bookings (Staff Portal) View ─────────────────────────── */

import api from '../api.js';
import * as auth from '../auth.js';
import { navigate } from '../app.js';

const STATUS_LABELS = {
  inquiry: 'Zapytanie',
  offer_sent: 'Oferta wysłana',
  deposit_paid: 'Zaliczka opłacona',
  confirmed: 'Potwierdzona',
  cancelled: 'Anulowana',
  completed: 'Zakończona',
};

const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

/* ── List Screen ───────────────────────────────────────────── */
/**
 * Render the staff portal bookings list.
 * @param {HTMLElement} app
 */
export async function renderMyBookings(app) {
  app.setAttribute('data-view', 'my-bookings');

  const user = auth.getUser();
  const role = user ? user.role : '';

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Moje zlecenia</h1>
    <div class="subtitle">Przypisane wydarzenia i check-in</div>
  </div>
  <span class="my-role-badge">${escapeHtml(role || '—')}</span>
</div>

<div class="my-bookings-toolbar">
  <button class="filter-btn active" id="my-filter-upcoming">Nadchodzące</button>
  <button class="filter-btn" id="my-filter-all">Wszystkie</button>
</div>

<div id="my-bookings-list">
  <div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div>
</div>
  `;

  // Filter state
  let currentFilter = 'upcoming';

  const filterUpcoming = document.getElementById('my-filter-upcoming');
  const filterAll = document.getElementById('my-filter-all');

  filterUpcoming.addEventListener('click', () => {
    if (currentFilter === 'upcoming') return;
    currentFilter = 'upcoming';
    filterUpcoming.classList.add('active');
    filterAll.classList.remove('active');
    loadList(app, true);
  });

  filterAll.addEventListener('click', () => {
    if (currentFilter === 'all') return;
    currentFilter = 'all';
    filterAll.classList.add('active');
    filterUpcoming.classList.remove('active');
    loadList(app, false);
  });

  // Initial load
  await loadList(app, true);
}

/**
 * Fetch and render the list of assigned bookings.
 * @param {HTMLElement} app
 * @param {boolean} upcoming
 */
async function loadList(app, upcoming) {
  const container = document.getElementById('my-bookings-list');
  if (!container) return;

  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div>';

  try {
    const data = await api.myBookings(upcoming ? { upcoming: true } : {});
    const bookings = (data && data.bookings) || [];

    if (bookings.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">&#128220;</span><p>Brak przypisanych zleceń</p></div>';
      return;
    }

    let html = '<div class="my-bookings-grid">';
    for (const b of bookings) {
      const statusLabel = STATUS_LABELS[b.status] || b.status;
      const checkedIn = b.my_checked_in === true;
      const dateStr = formatDate(b.event_date);
      const weekday = weekdayName(b.event_date);
      const timeRange = (b.event_time_start || b.event_time_end)
        ? (escapeHtml(b.event_time_start || '—') + ' &ndash; ' + escapeHtml(b.event_time_end || '—'))
        : '—';

      let locationMain = escapeHtml(b.event_location || '—');
      let locationSub = '';
      if (b.event_location && b.event_location.includes(',')) {
        const parts = b.event_location.split(',');
        locationMain = escapeHtml(parts[0].trim());
        locationSub = escapeHtml(parts.slice(1).join(',').trim());
      }

      html += `
<div class="my-booking-card${checkedIn ? ' my-booking-checked' : ''}" data-id="${escapeHtml(b.id)}">
  <div class="my-booking-card-header">
    <div class="my-booking-client">${escapeHtml(b.client_name || '—')}</div>
    ${checkedIn ? '<span class="my-checked-in" title="' + escapeHtml(formatTimestamp(b.my_checked_in_at)) + '">&#10003; Obecność potwierdzona</span>' : ''}
  </div>
  <div class="my-booking-card-body">
    <div class="my-booking-meta">
      <span class="my-booking-meta-icon">&#128197;</span>
      <span class="my-booking-date">${dateStr}</span>
      ${weekday ? '<span class="my-booking-weekday">' + escapeHtml(weekday) + '</span>' : ''}
    </div>
    <div class="my-booking-meta">
      <span class="my-booking-meta-icon">&#128336;</span>
      <span>${timeRange}</span>
    </div>
    <div class="my-booking-meta">
      <span class="my-booking-meta-icon">&#128205;</span>
      <span>${locationMain}${locationSub ? '<span class="text-faint"> &middot; ' + locationSub + '</span>' : ''}</span>
    </div>
  </div>
  <div class="my-booking-card-footer">
    <span class="badge badge-${escapeHtml(b.status || 'inquiry')}">${escapeHtml(statusLabel)}</span>
    <span class="my-role-badge">${escapeHtml(b.my_role || '—')}</span>
  </div>
</div>
      `;
    }
    html += '</div>';
    container.innerHTML = html;

    // Click → detail
    container.querySelectorAll('.my-booking-card').forEach(card => {
      card.addEventListener('click', () => {
        navigate('#my-bookings/' + card.getAttribute('data-id'));
      });
    });
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/* ── Detail Screen ────────────────────────────────────────── */
/**
 * Render the staff portal booking detail (read-only + check-in).
 * @param {HTMLElement} app
 * @param {string} id — booking ID
 */
export async function renderMyBookingDetail(app, id) {
  app.setAttribute('data-view', 'my-booking-detail');

  app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie szczegółów...</p></div>';

  if (!id) {
    navigate('#my-bookings');
    return;
  }

  try {
    const data = await api.myBookingDetail(id);
    renderDetail(app, data);
  } catch (err) {
    app.innerHTML = '<div class="page-header"><a href="#my-bookings" class="back-link">&#8592; Moje zlecenia</a></div><div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/**
 * Render the detail view from API response.
 * @param {HTMLElement} app
 * @param {object} data — { booking, my_assignment, team, services }
 */
function renderDetail(app, data) {
  const b = data.booking || {};
  const myAssignment = data.my_assignment || {};
  const team = data.team || [];
  const services = data.services || [];

  const statusLabel = STATUS_LABELS[b.status] || b.status;
  const checkedIn = myAssignment.checked_in === true;
  const checkedInAt = myAssignment.checked_in_at || null;

  // Hero data
  const eventDate = formatDate(b.event_date);
  const weekday = weekdayName(b.event_date);
  const timeRange = (b.event_time_start || b.event_time_end)
    ? (escapeHtml(b.event_time_start || '—') + ' &ndash; ' + escapeHtml(b.event_time_end || '—'))
    : '—';
  const duration = durationLabel(b.event_time_start, b.event_time_end);

  let locationMain = escapeHtml(b.event_location || '—');
  let locationSub = '';
  if (b.event_location && b.event_location.includes(',')) {
    const parts = b.event_location.split(',');
    locationMain = escapeHtml(parts[0].trim());
    locationSub = escapeHtml(parts.slice(1).join(',').trim());
  }

  // Contact links
  const emailHtml = b.client_email
    ? `<a href="mailto:${escapeHtml(b.client_email)}" class="booking-contact-link">${escapeHtml(b.client_email)}</a>`
    : '<span class="text-faint">—</span>';
  const phoneHtml = b.client_phone
    ? `<a href="tel:${escapeHtml(b.client_phone)}" class="booking-contact-link">${escapeHtml(b.client_phone)}</a>`
    : '<span class="text-faint">—</span>';

  // My role / check-in section
  let checkinHtml;
  if (checkedIn) {
    checkinHtml = `
<div class="my-checked-in-banner">
  <span class="my-checked-in-icon">&#10003;</span>
  <div>
    <div class="my-checked-in-title">Obecność potwierdzona</div>
    <div class="my-checked-in-time">${escapeHtml(formatTimestamp(checkedInAt))}</div>
  </div>
</div>
    `;
  } else {
    checkinHtml = `
<button class="btn my-checkin-btn" id="my-checkin-btn">
  <span style="font-size:1.15rem;">&#10003;</span> Potwierdź obecność
</button>
<div id="my-checkin-result"></div>
    `;
  }

  // Team section
  let teamHtml = '';
  if (team.length === 0) {
    teamHtml = '<div class="empty-state" style="padding:1rem 0;"><span class="empty-icon" style="font-size:1.5rem;">&#128101;</span><p>Jesteś jedynym członkiem zespołu</p></div>';
  } else {
    teamHtml = '<div class="my-team-list">';
    for (const m of team) {
      const mCheckedIn = m.checked_in === true;
      teamHtml += `
<div class="my-team-member">
  <span class="my-team-member-icon">&#128100;</span>
  <div class="my-team-member-info">
    <span class="my-team-member-email">${escapeHtml(m.email || '—')}</span>
    <span class="my-role-badge">${escapeHtml(m.role || '—')}</span>
    ${m.location ? '<span class="my-team-member-location text-faint">' + escapeHtml(m.location) + '</span>' : ''}
  </div>
  <span class="my-team-member-status ${mCheckedIn ? 'my-checked-in' : 'my-not-checked-in'}">
    ${mCheckedIn ? '&#10003; Zameldowany' : '&#9675; Nieobecny'}
  </span>
</div>
      `;
    }
    teamHtml += '</div>';
  }

  // Services section
  let servicesHtml = '';
  if (services.length === 0) {
    servicesHtml = '<div class="empty-state" style="padding:1rem 0;"><span class="empty-icon" style="font-size:1.5rem;">&#127925;</span><p>Brak usług dodatkowych</p></div>';
  } else {
    servicesHtml = '<div class="my-services-list">';
    for (const s of services) {
      const price = (s.price != null && s.price !== '') ? (escapeHtml(String(s.price)) + ' zł') : '—';
      const isIncluded = s.is_included === true;
      servicesHtml += `
<div class="my-service-item">
  <div class="my-service-name">
    <span>${escapeHtml(s.name || '—')}</span>
    ${isIncluded ? '<span class="badge badge-confirmed">Wliczone</span>' : ''}
  </div>
  <div class="my-service-price">${price}</div>
  ${s.notes ? '<div class="my-service-notes text-faint">' + escapeHtml(s.notes) + '</div>' : ''}
</div>
      `;
    }
    servicesHtml += '</div>';
  }

  app.innerHTML = `
<div class="page-header">
  <div>
    <a href="#my-bookings" class="back-link">&#8592; Moje zlecenia</a>
    <h1>${escapeHtml(b.client_name || '—')}</h1>
    <div class="subtitle">${escapeHtml(b.id || '')} &middot; <span class="badge badge-${escapeHtml(b.status || 'inquiry')}">${escapeHtml(statusLabel)}</span></div>
  </div>
</div>

<div class="booking-hero">
  <div class="booking-hero-keyinfo">
    <div class="booking-hero-date">
      <span class="booking-hero-icon">&#128197;</span>
      <div>
        <div class="booking-hero-primary">${eventDate}</div>
        <div class="booking-hero-secondary">${weekday ? escapeHtml(weekday) : ''}</div>
      </div>
    </div>
    <div class="booking-hero-time">
      <span class="booking-hero-icon">&#128336;</span>
      <div>
        <div class="booking-hero-primary">${timeRange}</div>
        <div class="booking-hero-secondary">${duration ? escapeHtml(duration) : ''}</div>
      </div>
    </div>
    <div class="booking-hero-location">
      <span class="booking-hero-icon">&#128205;</span>
      <div>
        <div class="booking-hero-primary">${locationMain}</div>
        ${locationSub ? '<div class="booking-hero-secondary">' + locationSub + '</div>' : ''}
      </div>
    </div>
  </div>

  <div class="booking-contact-card">
    <div class="booking-contact-item">
      <span class="booking-contact-icon">&#9993;</span>
      ${emailHtml}
    </div>
    <div class="booking-contact-item">
      <span class="booking-contact-icon">&#128222;</span>
      ${phoneHtml}
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="card-header-icon">&#128100;</span> Moja rola</div>
  <div class="my-role-info">
    <span class="my-role-badge my-role-badge-lg">${escapeHtml(myAssignment.role || '—')}</span>
    ${myAssignment.notes ? '<div class="my-role-notes text-faint">' + escapeHtml(myAssignment.notes) + '</div>' : ''}
  </div>
  ${checkinHtml}
</div>

<div class="card">
  <div class="card-header"><span class="card-header-icon">&#128101;</span> Zespół</div>
  ${teamHtml}
</div>

<div class="card">
  <div class="card-header"><span class="card-header-icon">&#127925;</span> Usługi</div>
  ${servicesHtml}
</div>
  `;

  // Bind check-in button
  if (!checkedIn) {
    const checkinBtn = document.getElementById('my-checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', async () => {
        const resultEl = document.getElementById('my-checkin-result');
        checkinBtn.disabled = true;
        checkinBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Trwa check-in...';
        try {
          await api.myCheckIn(b.id);
          showToast('Obecność potwierdzona', 'success');
          // Re-render detail to show checked-in state
          await renderMyBookingDetail(app, b.id);
        } catch (err) {
          if (resultEl) resultEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
          checkinBtn.disabled = false;
          checkinBtn.innerHTML = '<span style="font-size:1.15rem;">&#10003;</span> Potwierdź obecność';
        }
      });
    }
  }
}

/* ── Profile Screen ───────────────────────────────────────── */
/**
 * Render the staff portal profile view (read-only).
 * @param {HTMLElement} app
 */
export async function renderMyProfile(app) {
  app.setAttribute('data-view', 'my-profile');

  app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie profilu...</p></div>';

  try {
    const data = await api.myProfile();
    const user = data.user || {};
    const role = user.role || '';

    app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Mój profil</h1>
    <div class="subtitle">Twoje dane w systemie</div>
  </div>
  <span class="my-role-badge">${escapeHtml(role || '—')}</span>
</div>

<div class="card">
  <div class="card-header"><span class="card-header-icon">&#128100;</span> Dane użytkownika</div>
  <div class="my-profile-grid">
    <div class="detail-field">
      <div class="detail-label">Email</div>
      <div class="detail-value">${escapeHtml(user.email || '—')}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Rola</div>
      <div class="detail-value"><span class="my-role-badge">${escapeHtml(role || '—')}</span></div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Telefon</div>
      <div class="detail-value">${escapeHtml(user.phone || '—')}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Lokalizacja</div>
      <div class="detail-value">${escapeHtml(user.location || '—')}</div>
    </div>
  </div>
</div>
    `;
  } catch (err) {
    app.innerHTML = '<div class="page-header"><h1>Mój profil</h1></div><div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/* ── Toast (same pattern as booking-detail.js) ──────────────── */
let toastTimeout = null;
function showToast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });
  toastTimeout = setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => { toast.remove(); }, 300);
    toastTimeout = null;
  }, 3000);
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
    return dateStr;
  } catch (_) { return dateStr; }
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    let d;
    if (typeof ts === 'number') {
      d = new Date(ts * 1000);
    } else if (typeof ts === 'string' && ts.match(/^\d+$/)) {
      d = new Date(parseInt(ts, 10) * 1000);
    } else {
      d = new Date(ts);
    }
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return String(ts); }
}

function weekdayName(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return WEEKDAYS[d.getDay()];
  } catch (_) { return ''; }
}

function durationLabel(start, end) {
  if (!start || !end) return '';
  try {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60; // overnight
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return m + ' min';
    if (m === 0) return h + ' h';
    return h + ' h ' + m + ' min';
  } catch (_) { return ''; }
}