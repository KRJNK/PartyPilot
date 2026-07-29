/* ── Client Database View ───────────────────────────────────── */

import api from '../api.js';
import { navigate } from '../app.js';

const PAGE_SIZE = 20;

let clientsData = [];
let filteredClients = [];
let currentPage = 0;
let sortField = null;
let sortDir = 'asc';

/**
 * Render the client database view.
 * @param {HTMLElement} app
 */
export async function renderClients(app) {
  app.setAttribute('data-view', 'clients');
  currentPage = 0;
  sortField = null;
  sortDir = 'asc';

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Klienci</h1>
    <div class="subtitle">Baza klientów</div>
  </div>
  <div style="display:flex;gap:0.5rem;">
    <button class="btn btn-secondary btn-sm" id="clients-export-btn">&#128229; Eksportuj CSV</button>
  </div>
</div>
<div class="card">
  <div class="clients-search">
    <input class="filter-input clients-search-input" type="text" id="clients-search-input" placeholder="Szukaj po nazwie, emailu lub telefonie..." autocomplete="off">
    <button class="btn btn-secondary btn-sm" id="clients-search-btn">&#128269; Szukaj</button>
  </div>
  <div id="clients-table-container">
    <div class="loading"><div class="spinner"></div><p>Ładowanie klientów...</p></div>
  </div>
  <div class="pagination" id="clients-pagination"></div>
</div>
  `;

  // Bind search
  document.getElementById('clients-search-btn').addEventListener('click', () => {
    currentPage = 0;
    filterAndRender(app);
  });

  document.getElementById('clients-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      currentPage = 0;
      filterAndRender(app);
    }
  });

  // Bind export
  document.getElementById('clients-export-btn').addEventListener('click', handleExport);

  // Load data
  await loadClients(app);
}

async function loadClients(app) {
  const container = document.getElementById('clients-table-container');
  if (!container) return;

  try {
    const data = await api.getClients();
    const clients = data.clients || data || [];
    clientsData = Array.isArray(clients) ? clients : (Array.isArray(data) ? data : []);
    filteredClients = [...clientsData];
    renderTable(container, app);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function filterAndRender(app) {
  const container = document.getElementById('clients-table-container');
  if (!container) return;

  const searchInput = document.getElementById('clients-search-input');
  const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

  if (term) {
    filteredClients = clientsData.filter(c =>
      (c.client_name || c.name || '').toLowerCase().includes(term) ||
      (c.client_email || c.email || '').toLowerCase().includes(term) ||
      (c.client_phone || c.phone || '').toLowerCase().includes(term)
    );
  } else {
    filteredClients = [...clientsData];
  }

  renderTable(container, app);
}

function renderTable(container, app) {
  // Sort if needed
  if (sortField) {
    filteredClients.sort((a, b) => {
      let aVal = getFieldValue(a, sortField);
      let bVal = getFieldValue(b, sortField);
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = 0;

  const start = currentPage * PAGE_SIZE;
  const pageItems = filteredClients.slice(start, start + PAGE_SIZE);

  const sortIcon = (field) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' &#9650;' : ' &#9660;';
  };

  let html;

  if (pageItems.length === 0) {
    html = '<div class="empty-state"><span class="empty-icon">&#128101;</span><p>Brak klientów spełniających kryteria</p></div>';
    container.innerHTML = html;
    renderPagination(totalPages);
    return;
  }

  // Desktop table
  html = '<div class="table-wrap clients-table"><table><thead><tr>' +
    '<th class="sortable" data-sort="name">Imię' + sortIcon('name') + '</th>' +
    '<th class="sortable" data-sort="email">Email' + sortIcon('email') + '</th>' +
    '<th class="sortable" data-sort="phone">Telefon' + sortIcon('phone') + '</th>' +
    '<th class="sortable" data-sort="type">Typ' + sortIcon('type') + '</th>' +
    '<th class="sortable" data-sort="bookings">Liczba rezerwacji' + sortIcon('bookings') + '</th>' +
    '<th class="sortable" data-sort="last_event">Ostatnie wydarzenie' + sortIcon('last_event') + '</th>' +
    '</tr></thead><tbody>';

  for (const c of pageItems) {
    const name = c.client_name || c.name || '—';
    const email = c.client_email || c.email || '—';
    const phone = c.client_phone || c.phone || '—';
    const typeLabel = clientTypeLabel(c.client_type || c.type || '');
    const bookingCount = c.booking_count || c.bookings_count || 0;
    const lastEvent = c.last_event_date || c.last_event || '—';

    html += `<tr class="clients-row" data-email="${escapeHtml(email)}">
      <td><strong>${escapeHtml(name)}</strong></td>
      <td style="font-size:0.78rem;">${escapeHtml(email)}</td>
      <td style="font-size:0.78rem;">${escapeHtml(phone)}</td>
      <td>${escapeHtml(typeLabel)}</td>
      <td style="text-align:center;">${bookingCount}</td>
      <td style="font-size:0.78rem;">${escapeHtml(formatDate(lastEvent))}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';

  // Mobile card list (hidden on desktop)
  html += '<div class="clients-mobile-list">';
  for (const c of pageItems) {
    const name = c.client_name || c.name || '—';
    const email = c.client_email || c.email || '—';
    const phone = c.client_phone || c.phone || '—';
    const typeLabel = clientTypeLabel(c.client_type || c.type || '');
    const bookingCount = c.booking_count || c.bookings_count || 0;
    const lastEvent = c.last_event_date || c.last_event || '—';

    html += `<div class="clients-mobile-card" data-email="${escapeHtml(email)}">
      <div class="clients-mobile-name">${escapeHtml(name)}</div>
      <div class="clients-mobile-detail">${escapeHtml(email)}</div>
      <div class="clients-mobile-detail">${escapeHtml(phone)}</div>
      <div class="clients-mobile-meta">
        <span>${escapeHtml(typeLabel)}</span>
        <span>${bookingCount} rezerw.</span>
        <span>${escapeHtml(formatDate(lastEvent))}</span>
      </div>
    </div>`;
  }
  html += '</div>';

  container.innerHTML = html;

  // Bind sort clicks
  container.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (sortField === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortDir = 'asc';
      }
      renderTable(container, app);
    });
  });

  // Bind row clicks → navigate to bookings filtered by email
  container.querySelectorAll('.clients-row, .clients-mobile-card').forEach(el => {
    el.addEventListener('click', () => {
      const email = el.getAttribute('data-email');
      if (email && email !== '—') {
        navigate('#bookings?search=' + encodeURIComponent(email));
      }
    });
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const paginationEl = document.getElementById('clients-pagination');
  if (!paginationEl) return;

  if (totalPages <= 1) {
    paginationEl.innerHTML = filteredClients.length > 0
      ? '<span class="page-info">' + filteredClients.length + ' wyników</span>'
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
  html += '<span class="page-info">' + filteredClients.length + ' wyników</span>';

  paginationEl.innerHTML = html;

  paginationEl.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-page');
      if (target === 'prev') { currentPage = Math.max(0, currentPage - 1); }
      else if (target === 'next') { currentPage = Math.min(totalPages - 1, currentPage + 1); }
      else { currentPage = parseInt(target, 10); }

      const container = document.getElementById('clients-table-container');
      if (container) renderTable(container, document.getElementById('app'));
    });
  });
}

/* ── CSV Export ─────────────────────────────────────────────── */

async function handleExport() {
  const btn = document.getElementById('clients-export-btn');
  if (!btn) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Eksportowanie...';

  try {
    const csvData = await api.exportClients();
    // If the API returns wrapped response, extract body
    let csvText = csvData;
    if (typeof csvData === 'object' && csvData.body) {
      csvText = csvData.body;
    } else if (typeof csvData === 'object' && csvData.csv) {
      csvText = csvData.csv;
    }

    downloadCSV(csvText, 'klienci.csv');
  } catch (err) {
    alert('Błąd eksportu: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function downloadCSV(csvText, filename) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/* ── Helpers ────────────────────────────────────────────────── */
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

function clientTypeLabel(type) {
  const labels = { bride_groom: 'Para Młoda', dj: 'DJ', agency: 'Agencja / Inna' };
  return labels[type] || type || '—';
}

function getFieldValue(obj, field) {
  switch (field) {
    case 'name': return obj.client_name || obj.name || '';
    case 'email': return obj.client_email || obj.email || '';
    case 'phone': return obj.client_phone || obj.phone || '';
    case 'type': return obj.client_type || obj.type || '';
    case 'bookings': return obj.booking_count || obj.bookings_count || 0;
    case 'last_event': return obj.last_event_date || obj.last_event || '';
    default: return '';
  }
}
