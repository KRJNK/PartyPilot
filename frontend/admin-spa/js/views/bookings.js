/* ── Bookings List View ────────────────────────────────────── */

import api from '../api.js';
import { navigate, getState } from '../app.js';

const STATUS_LABELS = {
  inquiry: 'Zapytanie',
  offer_sent: 'Oferta wysłana',
  deposit_paid: 'Zaliczka opłacona',
  confirmed: 'Potwierdzona',
  cancelled: 'Anulowana',
  completed: 'Zakończona',
};

const PAGE_SIZE = 20;

let currentPage = 0;
let filteredBookings = [];

/**
 * Render the bookings list with filters and pagination.
 * @param {HTMLElement} app
 */
export async function renderBookings(app) {
  app.setAttribute('data-view', 'bookings');
  currentPage = 0;

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Rezerwacje</h1>
    <div class="subtitle">Zarządzaj wszystkimi rezerwacjami</div>
  </div>
  <div style="display:flex;gap:0.5rem;">
    <button class="btn btn-primary" id="booking-new-btn">+ Nowa rezerwacja</button>
  </div>
</div>
<div class="card">
  <div class="filters">
    <div class="filter-group">
      <label style="font-size:0.75rem;color:var(--text-muted);">Status:</label>
      <select class="filter-input" id="filter-status">
        <option value="">Wszystkie</option>
        <option value="inquiry">Zapytanie</option>
        <option value="offer_sent">Oferta wysłana</option>
        <option value="deposit_paid">Zaliczka opłacona</option>
        <option value="confirmed">Potwierdzona</option>
        <option value="completed">Zakończona</option>
        <option value="cancelled">Anulowana</option>
      </select>
    </div>
    <div class="filter-group">
      <label style="font-size:0.75rem;color:var(--text-muted);">Od:</label>
      <input class="filter-input" type="date" id="filter-date-from">
    </div>
    <div class="filter-group">
      <label style="font-size:0.75rem;color:var(--text-muted);">Do:</label>
      <input class="filter-input" type="date" id="filter-date-to">
    </div>
    <div class="filter-group">
      <label style="font-size:0.75rem;color:var(--text-muted);">Szukaj:</label>
      <input class="filter-input" type="text" id="filter-search" placeholder="Nazwa klienta..." style="min-width:160px;">
    </div>
    <button class="btn btn-secondary btn-sm" id="filter-apply-btn">Filtruj</button>
  </div>
  <div id="bookings-table-container">
    <div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div>
  </div>
  <div class="pagination" id="bookings-pagination"></div>
</div>
  `;

  // ── New Booking button → open modal ──
  document.getElementById('booking-new-btn').addEventListener('click', () => {
    showNewBookingModal(app);
  });

  // ── Apply filters ──
  document.getElementById('filter-apply-btn').addEventListener('click', () => {
    currentPage = 0;
    loadAndRenderBookings(app);
  });

  // Also filter on Enter in search field
  document.getElementById('filter-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      currentPage = 0;
      loadAndRenderBookings(app);
    }
  });

  // ── Check for search query param (e.g. from clients view) ──
  const query = getState().currentQuery || {};
  if (query.search) {
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.value = query.search;
    }
  }

  // ── Load initial data ──
  await loadAndRenderBookings(app);
}

/**
 * Fetch bookings from API and render the table.
 */
async function loadAndRenderBookings(app) {
  const container = document.getElementById('bookings-table-container');
  if (!container) return;

  const statusEl = document.getElementById('filter-status');
  const dateFromEl = document.getElementById('filter-date-from');
  const dateToEl = document.getElementById('filter-date-to');

  const filters = {
    status: statusEl ? statusEl.value : '',
    date_from: dateFromEl ? dateFromEl.value : '',
    date_to: dateToEl ? dateToEl.value : '',
  };

  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div>';

  try {
    const data = await api.listBookings(filters);
    const bookings = data.bookings || data || [];
    const list = Array.isArray(bookings) ? bookings : (Array.isArray(data) ? data : []);

    const state = getState();
    state.bookings = list;

    // Apply client-side search
    const searchInput = document.getElementById('filter-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (searchTerm) {
      filteredBookings = list.filter(b =>
        (b.client_name || '').toLowerCase().includes(searchTerm) ||
        (b.client_email || '').toLowerCase().includes(searchTerm) ||
        (b.id || '').toLowerCase().includes(searchTerm)
      );
    } else {
      filteredBookings = list;
    }

    renderTable(container, app);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function renderTable(container, app) {
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = 0;

  const start = currentPage * PAGE_SIZE;
  const pageItems = filteredBookings.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">&#128220;</span><p>Brak rezerwacji spełniających kryteria</p></div>';
    renderPagination(totalPages, app);
    return;
  }

  let html = '<div class="table-wrap"><table><thead><tr>' +
    '<th>ID</th><th>Klient</th><th>Email</th><th>Data</th><th>Status</th><th>Pakiet</th><th>Zaliczka</th><th>Akcje</th>' +
    '</tr></thead><tbody>';

  for (const b of pageItems) {
    const statusLabel = STATUS_LABELS[b.status] || b.status;
    const depositStatus = b.deposit_paid
      ? '<span class="deposit-paid">&#10003; Tak</span>'
      : '<span class="deposit-unpaid">&#9679; Nie</span>';

    html += `<tr data-id="${escapeHtml(b.id)}">
      <td style="font-size:0.78rem;font-family:monospace;">${escapeHtml(b.id)}</td>
      <td><strong>${escapeHtml(b.client_name)}</strong></td>
      <td style="font-size:0.78rem;">${escapeHtml(b.client_email || '—')}</td>
      <td>${escapeHtml(formatDate(b.event_date))}</td>
      <td><span class="badge badge-${escapeHtml(b.status || 'inquiry')}">${escapeHtml(statusLabel)}</span></td>
      <td>${escapeHtml(b.package_name || b.package_id || '—')}</td>
      <td>${depositStatus}</td>
      <td style="text-align:center;white-space:nowrap;">
        <button class="btn btn-secondary btn-sm booking-row-action" data-id="${escapeHtml(b.id)}" data-action="view">&#128065;</button>
      </td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Row click → navigate to detail
  container.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.booking-row-action')) return;
      navigate('#bookings/' + row.getAttribute('data-id'));
    });
  });

  // Action buttons
  container.querySelectorAll('.booking-row-action').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate('#bookings/' + btn.getAttribute('data-id'));
    });
  });

  renderPagination(totalPages, app);
}

function renderPagination(totalPages, app) {
  const paginationEl = document.getElementById('bookings-pagination');
  if (!paginationEl) return;

  if (totalPages <= 1) {
    paginationEl.innerHTML = filteredBookings.length > 0
      ? '<span class="page-info">' + filteredBookings.length + ' wyników</span>'
      : '';
    return;
  }

  let html = '<button class="page-btn" data-page="prev"' + (currentPage === 0 ? ' disabled' : '') + '>&#9664;</button>';

  const startPage = Math.max(0, currentPage - 2);
  const endPage = Math.min(totalPages - 1, currentPage + 2);

  if (startPage > 0) {
    html += '<button class="page-btn" data-page="0">1</button>';
    if (startPage > 1) html += '<span class="page-info">...</span>';
  }

  for (let i = startPage; i <= endPage; i++) {
    html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + (i + 1) + '</button>';
  }

  if (endPage < totalPages - 1) {
    if (endPage < totalPages - 2) html += '<span class="page-info">...</span>';
    html += '<button class="page-btn" data-page="' + (totalPages - 1) + '">' + totalPages + '</button>';
  }

  html += '<button class="page-btn" data-page="next"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>&#9654;</button>';
  html += '<span class="page-info">' + filteredBookings.length + ' wyników</span>';

  paginationEl.innerHTML = html;

  // Bind pagination clicks
  paginationEl.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-page');
      if (target === 'prev') { currentPage = Math.max(0, currentPage - 1); }
      else if (target === 'next') { currentPage = Math.min(totalPages - 1, currentPage + 1); }
      else { currentPage = parseInt(target, 10); }

      const container = document.getElementById('bookings-table-container');
      if (container) renderTable(container, app);

      // Scroll to top of table
      const card = btn.closest('.card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ── New Booking Modal ────────────────────────────────────── */
function showNewBookingModal(app) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'new-booking-modal';

  overlay.innerHTML = `
<div class="modal-content">
  <button class="modal-close" id="modal-close-btn">&times;</button>
  <h2>Nowa rezerwacja</h2>
  <form id="new-booking-form">
    <div class="form-row">
      <div class="form-group">
        <label>Imię i Nazwisko *</label>
        <input class="form-control" name="client_name" required placeholder="Jan Kowalski">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input class="form-control" type="email" name="client_email" placeholder="jan@example.com">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Telefon</label>
        <input class="form-control" name="client_phone" placeholder="+48 600 000 000">
      </div>
      <div class="form-group">
        <label>Typ klienta</label>
        <select class="form-control" name="client_type">
          <option value="bride_groom">Para Młoda</option>
          <option value="dj">DJ</option>
          <option value="agency">Agencja / Inna</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Data wydarzenia *</label>
        <input class="form-control" type="date" name="event_date" required>
      </div>
      <div class="form-group">
        <label>Miejsce</label>
        <input class="form-control" name="event_location" placeholder="Pałac, sala...">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Godzina rozpoczęcia</label>
        <input class="form-control" type="time" name="event_time_start">
      </div>
      <div class="form-group">
        <label>Godzina zakończenia</label>
        <input class="form-control" type="time" name="event_time_end">
      </div>
    </div>
    <div class="form-group">
      <label>Notatki wewnętrzne</label>
      <textarea class="form-control" name="internal_notes" rows="2"></textarea>
    </div>
    <div id="modal-form-error"></div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="modal-save-btn">Utwórz rezerwację</button>
      <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Anuluj</button>
    </div>
  </form>
</div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  const close = () => {
    overlay.remove();
  };

  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('modal-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Submit
  const form = document.getElementById('new-booking-form');
  const errorEl = document.getElementById('modal-form-error');
  const saveBtn = document.getElementById('modal-save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Tworzenie...';

    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => { data[k] = v; });

    try {
      const result = await api.createBooking(data);
      close();
      // Navigate to the new booking detail
      navigate('#bookings/' + result.id);
      // Reload the list if we're still on bookings view
      const state = getState();
      if (state.currentView === 'bookings') {
        await loadAndRenderBookings(app);
      }
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Utwórz rezerwację';
    }
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
