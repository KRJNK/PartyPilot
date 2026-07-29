/* ── Conversations List View ──────────────────────────────────── */

import api from '../api.js';
import { navigate } from '../app.js';
import { showToast } from './pipeline.js';

const PAGE_SIZE = 20;

/**
 * Render conversations list view.
 * @param {HTMLElement} app
 * @param {object} queryParams
 * @param {string} [queryParams.status] — filter by status
 * @param {string} [queryParams.page] — page number
 */
export async function renderConversations(app, queryParams) {
  app.setAttribute('data-view', 'conversations');

  const currentStatus = queryParams?.status || '';
  const currentPage = parseInt(queryParams?.page, 10) || 1;

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Rozmowy</h1>
    <div class="subtitle">Historia rozmów klientów z asystentem AI</div>
  </div>
  <div class="header-actions">
    <button class="btn btn-secondary btn-sm" id="conv-refresh-btn">&#8635; Odśwież</button>
  </div>
</div>

<div class="conversations-tabs" id="conv-tabs">
  <button class="filter-btn${currentStatus === '' ? ' active' : ''}" data-status="">Wszystkie</button>
  <button class="filter-btn${currentStatus === 'active' ? ' active' : ''}" data-status="active">Aktywne</button>
  <button class="filter-btn${currentStatus === 'handoff' ? ' active' : ''}" data-status="handoff">Zakwalifikowane</button>
  <button class="filter-btn${currentStatus === 'closed' ? ' active' : ''}" data-status="closed">Zamknięte</button>
</div>

<div id="conv-list"><div class="loading"><div class="spinner"></div><p>Ładowanie rozmów...</p></div></div>
  `;

  // Bind tabs
  document.querySelectorAll('#conv-tabs .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.getAttribute('data-status');
      navigate('#conversations' + (status ? '?status=' + status : ''));
    });
  });

  // Bind refresh
  document.getElementById('conv-refresh-btn').addEventListener('click', () => {
    loadConversations(currentStatus, currentPage);
  });

  await loadConversations(currentStatus, currentPage);
}

/* ── Load conversations ────────────────────────────────────── */
async function loadConversations(status, page) {
  const container = document.getElementById('conv-list');
  if (!container) return;

  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie rozmów...</p></div>';

  try {
    const data = await api.getConversations(status || undefined);
    const conversations = data.conversations || data || [];
    const list = Array.isArray(conversations) ? conversations : [];

    if (list.length === 0) {
      renderEmpty(container);
      return;
    }

    renderTable(container, list, page);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/* ── Render empty state ────────────────────────────────────── */
function renderEmpty(container) {
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">&#128172;</span><p>Brak rozmów</p></div>';
}

/* ── Render table ──────────────────────────────────────────── */
function renderTable(container, conversations, page) {
  const totalPages = Math.ceil(conversations.length / PAGE_SIZE);
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageItems = conversations.slice(startIdx, startIdx + PAGE_SIZE);

  const statusLabels = {
    active: 'Aktywna',
    handoff: 'Zakwalifikowana',
    closed: 'Zamknięta',
  };

  const statusClasses = {
    active: 'badge-active',
    handoff: 'badge-handoff',
    closed: 'badge-closed',
  };

  let rows = '';
  for (const conv of pageItems) {
    const statusClass = statusClasses[conv.status] || 'badge-closed';
    const statusLabel = statusLabels[conv.status] || conv.status || '—';
    const lastActivity = conv.updated_at || conv.created_at || '';
    const lastActivityFormatted = lastActivity ? formatDate(lastActivity) : '—';
    const msgCount = conv.message_count || '—';
    const leadBadge = conv.lead_qualified
      ? '<span class="lead-badge">&#10003; Zakwalifikowany</span>'
      : '<span class="text-faint">&mdash;</span>';

    rows += `
  <tr data-conv-id="${escapeHtml(conv.id || '')}">
    <td><strong>${escapeHtml(conv.client_name || 'Nieznany')}</strong></td>
    <td>${escapeHtml(conv.client_email || '—')}</td>
    <td><span class="badge ${statusClass}">${statusLabel}</span></td>
    <td>${msgCount}</td>
    <td>${lastActivityFormatted}</td>
    <td>${leadBadge}</td>
  </tr>
    `;
  }

  // Build pagination
  let paginationHtml = '';
  if (totalPages > 1) {
    let pagesHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      pagesHtml += `<button class="page-btn${i === page ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationHtml = `
<div class="pagination">
  <button class="page-btn" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''}>&laquo;</button>
  ${pagesHtml}
  <button class="page-btn" data-page="${page + 1}"${page >= totalPages ? ' disabled' : ''}>&raquo;</button>
  <span class="page-info">Strona ${page} z ${totalPages}</span>
</div>
    `;
  }

  container.innerHTML = `
<div class="table-wrap">
  <table class="conversations-table">
    <thead>
      <tr>
        <th>Klient</th>
        <th>Email</th>
        <th>Status</th>
        <th>Wiadomości</th>
        <th>Ostatnia aktywność</th>
        <th>Lead</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>
${paginationHtml}
  `;

  // Bind row clicks
  container.querySelectorAll('tbody tr').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-conv-id');
      if (id) navigate('#conversations/' + id);
    });
  });

  // Bind pagination
  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPage = parseInt(btn.getAttribute('data-page'), 10);
      if (targetPage && targetPage >= 1 && targetPage <= totalPages) {
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        params.set('page', targetPage);
        const qs = params.toString();
        navigate('#conversations' + (qs ? '?' + qs : ''));
      }
    });
  });
}

/* ── Helpers ────────────────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'przed chwilą';
    if (diffMins < 60) return diffMins + ' min temu';
    if (diffHours < 24) return diffHours + ' godz. temu';
    if (diffDays < 7) return diffDays + ' dni temu';

    return d.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return dateStr;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
