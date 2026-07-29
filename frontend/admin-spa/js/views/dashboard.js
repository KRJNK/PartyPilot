/* ── Dashboard View ────────────────────────────────────────── */

import api from '../api.js';
import { navigate, getState } from '../app.js';
import { getCalendarEvents } from './calendar.js';

const STATUS_LABELS = {
  inquiry: 'Zapytanie',
  offer_sent: 'Oferta wysłana',
  deposit_paid: 'Zaliczka opłacona',
  confirmed: 'Potwierdzona',
  cancelled: 'Anulowana',
  completed: 'Zakończona',
};

/**
 * Render the dashboard with stats cards and recent bookings.
 * @param {HTMLElement} app
 */
export async function renderDashboard(app) {
  app.setAttribute('data-view', 'dashboard');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Dashboard</h1>
    <div class="subtitle">Przegląd rezerwacji i statystyki</div>
  </div>
  <button class="btn btn-primary" id="dash-new-booking">+ Nowa rezerwacja</button>
</div>
<div class="stats-grid" id="stats-grid">
  <div class="stat-card"><span class="stat-icon">&#128203;</span><div class="stat-label">Wszystkie rezerwacje</div><div class="stat-value" id="stat-total">—</div></div>
  <div class="stat-card"><span class="stat-icon">&#128220;</span><div class="stat-label">Oczekujące zapytania</div><div class="stat-value" id="stat-pending">—</div></div>
  <div class="stat-card"><span class="stat-icon">&#128197;</span><div class="stat-label">Nadchodzące wydarzenia</div><div class="stat-value" id="stat-upcoming">—</div></div>
  <div class="stat-card"><span class="stat-icon">&#9989;</span><div class="stat-label">Potwierdzone w tym m-cu</div><div class="stat-value" id="stat-confirmed-month">—</div></div>
</div>
<div class="card" id="dash-upcoming-card">
  <div class="card-header">Nadchodzące wydarzenia</div>
  <div id="dash-upcoming-events"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></div>
</div>
<div class="card">
  <div class="card-header">Ostatnie rezerwacje</div>
  <div id="dash-recent-table"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></div>
</div>
  `;

  // Attach "New Booking" button
  document.getElementById('dash-new-booking').addEventListener('click', () => {
    navigate('#bookings');
  });

  // Fetch data
  try {
    const data = await api.listBookings();
    const bookings = data.bookings || data || [];
    // Support both wrapped and unwrapped responses
    const list = Array.isArray(bookings) ? bookings : (Array.isArray(data) ? data : []);
    const state = getState();
    state.bookings = list;

    renderStats(list);
    renderRecentTable(list);
  } catch (err) {
    const el = document.getElementById('dash-recent-table');
    if (el) el.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }

  // Fetch upcoming events for the next 30 days
  loadUpcomingEvents();
}

async function loadUpcomingEvents() {
  const container = document.getElementById('dash-upcoming-events');
  if (!container) return;

  const now = new Date();
  const dateFrom = formatDateISO(now);
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 30);
  const dateTo = formatDateISO(futureDate);

  try {
    const data = await getCalendarEvents(dateFrom, dateTo);
    const events = data.events || [];

    // Filter to confirmed/deposit_paid only, sorted by date
    const upcoming = events
      .filter(e => e.status === 'confirmed' || e.status === 'deposit_paid')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 5);

    renderUpcomingEvents(container, upcoming);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function renderUpcomingEvents(container, events) {
  if (events.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">&#128197;</span><p>Brak nadchodzących wydarzeń</p></div>';
    return;
  }

  let html = '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Klient</th><th>Miejsce</th><th>Status</th></tr></thead><tbody>';
  for (const e of events) {
    const statusLabel = STATUS_LABELS[e.status] || e.status;
    html += `<tr data-id="${escapeHtml(e.booking_id)}">
      <td>${escapeHtml(formatDate(e.date))}</td>
      <td><strong>${escapeHtml(e.client_name)}</strong></td>
      <td>${escapeHtml(e.event_location || '—')}</td>
      <td><span class="badge badge-${escapeHtml(e.status || '')}">${escapeHtml(statusLabel)}</span></td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Row click → navigate to booking detail
  container.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      navigate('#bookings/' + row.getAttribute('data-id'));
    });
  });
}

function renderStats(bookings) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStr = firstOfMonth.toISOString().slice(0, 7);

  const total = bookings.length;
  const pending = bookings.filter(b => b.status === 'inquiry').length;
  const upcoming = bookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'completed') return false;
    if (!b.event_date) return false;
    return b.event_date >= now.toISOString().slice(0, 10);
  }).length;
  const confirmedThisMonth = bookings.filter(b => {
    return b.status === 'confirmed' && b.event_date && b.event_date.startsWith(monthStr);
  }).length;

  const totalEl = document.getElementById('stat-total');
  const pendingEl = document.getElementById('stat-pending');
  const upcomingEl = document.getElementById('stat-upcoming');
  const confirmedEl = document.getElementById('stat-confirmed-month');

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (upcomingEl) upcomingEl.textContent = upcoming;
  if (confirmedEl) confirmedEl.textContent = confirmedThisMonth;
}

function renderRecentTable(bookings) {
  const container = document.getElementById('dash-recent-table');
  if (!container) return;

  const recent = bookings.slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">&#128220;</span><p>Brak rezerwacji</p><button class="btn btn-primary" onclick="window.location.hash=\'#bookings\'">Dodaj rezerwację</button></div>';
    return;
  }

  let html = '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Klient</th><th>Data</th><th>Status</th><th>Pakiet</th><th>Zaliczka</th></tr></thead><tbody>';
  for (const b of recent) {
    const statusLabel = STATUS_LABELS[b.status] || b.status;
    const depositStatus = b.deposit_paid
      ? '<span class="deposit-paid">&#10003; Opłacona</span>'
      : '<span class="deposit-unpaid">&#9679; Nieopłacona</span>';
    html += `<tr data-id="${escapeHtml(b.id)}">
      <td>${escapeHtml(b.id)}</td>
      <td><strong>${escapeHtml(b.client_name)}</strong><br><span style="font-size:0.72rem;color:var(--text-faint);">${escapeHtml(b.client_email || '')}</span></td>
      <td>${escapeHtml(formatDate(b.event_date))}</td>
      <td><span class="badge badge-${escapeHtml(b.status || 'inquiry')}">${escapeHtml(statusLabel)}</span></td>
      <td>${escapeHtml(b.package_name || b.package_id || '—')}</td>
      <td>${depositStatus}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Row click → navigate to detail
  container.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      navigate('#bookings/' + row.getAttribute('data-id'));
    });
  });
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
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  } catch (_) { return dateStr; }
}

function formatDateISO(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
