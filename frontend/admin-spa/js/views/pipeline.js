/* ── Pipeline Kanban Board View ─────────────────────────────── */

import api from '../api.js';
import { navigate } from '../app.js';

const STATUS_LABELS = {
  inquiry: 'Zapytania',
  offer_sent: 'Oferty wysłane',
  deposit_paid: 'Zaliczka',
  confirmed: 'Potwierdzone',
  completed: 'Zakończone',
};

const STATUS_KEYS = ['inquiry', 'offer_sent', 'deposit_paid', 'confirmed', 'completed'];

let pipelineData = {};

/**
 * Render the pipeline (Kanban) view.
 * @param {HTMLElement} app
 */
export async function renderPipeline(app) {
  app.setAttribute('data-view', 'pipeline');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Pipeline</h1>
    <div class="subtitle">Zarządzaj rezerwacjami metodą Kanban</div>
  </div>
  <button class="btn btn-primary" id="pipeline-new-btn">+ Nowa rezerwacja</button>
</div>
<div id="pipeline-wrap">
  <div class="loading"><div class="spinner"></div><p>Ładowanie pipeline...</p></div>
</div>
  `;

  document.getElementById('pipeline-new-btn').addEventListener('click', () => {
    navigate('#bookings');
  });

  await loadPipeline(app);
}

/**
 * Fetch pipeline data and render columns.
 */
async function loadPipeline(app) {
  const wrap = document.getElementById('pipeline-wrap');
  if (!wrap) return;

  try {
    const data = await api.getPipeline();
    pipelineData = data.columns || data.groups || data.bookings || data || {};
    renderBoard(wrap, app);
  } catch (err) {
    wrap.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function renderBoard(wrap, app) {
  let html = '<div class="pipeline-board">';

  for (const status of STATUS_KEYS) {
    const label = STATUS_LABELS[status] || status;
    const bookings = pipelineData[status] || [];
    const count = bookings.length;

    html += '<div class="pipeline-column" data-status="' + status + '">';
    html += '<div class="pipeline-column-header">';
    html += '<span class="pipeline-column-title">' + escapeHtml(label) + '</span>';
    html += '<span class="pipeline-column-count">' + count + '</span>';
    html += '</div>';
    html += '<div class="pipeline-column-body" data-status="' + status + '">';

    if (count === 0) {
      html += '<div class="pipeline-empty">Brak rezerwacji</div>';
    } else {
      for (const b of bookings) {
        html += buildCard(b, status);
      }
    }

    html += '</div>'; // .pipeline-column-body
    html += '</div>'; // .pipeline-column
  }

  html += '</div>'; // .pipeline-board
  wrap.innerHTML = html;

  // Bind drag and drop
  bindDragDrop(wrap, app);

  // Bind card clicks
  wrap.querySelectorAll('.pipeline-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Ignore clicks on drag handle
      if (e.target.closest('.pipeline-card-drag')) return;
      const id = card.getAttribute('data-booking-id');
      if (id) navigate('#bookings/' + id);
    });
  });
}

function buildCard(b, status) {
  const depositIcon = b.deposit_paid
    ? '<span class="pipeline-deposit pipeline-deposit-paid" title="Zaliczka opłacona">&#10003;</span>'
    : '<span class="pipeline-deposit pipeline-deposit-unpaid" title="Zaliczka nieopłacona">&#9679;</span>';

  return '<div class="pipeline-card" draggable="true" data-booking-id="' + escapeHtml(b.id) + '" data-status="' + status + '">' +
    '<div class="pipeline-card-drag" draggable="false">&#9776;</div>' +
    '<div class="pipeline-card-body">' +
      '<div class="pipeline-card-name">' + escapeHtml(b.client_name) + '</div>' +
      '<div class="pipeline-card-date">' + escapeHtml(formatDate(b.event_date)) + '</div>' +
      '<div class="pipeline-card-meta">' +
        (b.package_name || b.package_id ? '<span class="pipeline-card-package">' + escapeHtml(b.package_name || b.package_id) + '</span>' : '') +
        depositIcon +
      '</div>' +
      (b.event_location ? '<div class="pipeline-card-location">&#9906; ' + escapeHtml(b.event_location) + '</div>' : '') +
    '</div>' +
  '</div>';
}

/* ── Drag and Drop ──────────────────────────────────────────── */

let dragSrcId = null;
let dragSrcStatus = null;
let dragSrcElement = null;

function bindDragDrop(wrap, app) {
  const cards = wrap.querySelectorAll('.pipeline-card[draggable="true"]');
  const columns = wrap.querySelectorAll('.pipeline-column-body');

  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
  });

  columns.forEach(col => {
    col.addEventListener('dragover', onDragOver);
    col.addEventListener('dragenter', onDragEnter);
    col.addEventListener('dragleave', onDragLeave);
    col.addEventListener('drop', onDrop);
  });
}

function onDragStart(e) {
  const card = e.target.closest('.pipeline-card');
  if (!card) return;

  dragSrcId = card.getAttribute('data-booking-id');
  dragSrcStatus = card.getAttribute('data-status');
  dragSrcElement = card;

  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId || '');
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function onDragEnter(e) {
  const col = e.target.closest('.pipeline-column-body');
  if (col) {
    col.closest('.pipeline-column').classList.add('drag-over');
  }
}

function onDragLeave(e) {
  const col = e.target.closest('.pipeline-column-body');
  if (col) {
    col.closest('.pipeline-column').classList.remove('drag-over');
  }
}

function onDragEnd(e) {
  const card = e.target.closest('.pipeline-card');
  if (card) {
    card.classList.remove('dragging');
  }
  // Remove highlights from all columns
  document.querySelectorAll('.pipeline-column.drag-over').forEach(c => {
    c.classList.remove('drag-over');
  });
  dragSrcId = null;
  dragSrcStatus = null;
  dragSrcElement = null;
}

async function onDrop(e) {
  e.preventDefault();

  const targetCol = e.target.closest('.pipeline-column-body');
  if (!targetCol) return;

  const newStatus = targetCol.getAttribute('data-status');
  if (!newStatus || !dragSrcId) return;

  // Remove highlight
  targetCol.closest('.pipeline-column').classList.remove('drag-over');

  // Same column — no-op
  if (newStatus === dragSrcStatus) return;

  // Optimistically move the card
  if (dragSrcElement) {
    dragSrcElement.setAttribute('data-status', newStatus);
    targetCol.appendChild(dragSrcElement);
    dragSrcElement.classList.remove('dragging');

    // Update counts
    refreshColumnCounts();
  }

  // API call to update status
  try {
    await api.updateBooking(dragSrcId, { status: newStatus });
    // Refresh all pipeline data after drop
    const wrap = document.getElementById('pipeline-wrap');
    if (wrap) {
      await loadPipeline(document.getElementById('app'));
    }
  } catch (err) {
    // Rollback: card snaps back
    const wrap = document.getElementById('pipeline-wrap');
    if (wrap) {
      await loadPipeline(document.getElementById('app'));
    }
    // Show error toast
    showToast('Błąd aktualizacji statusu: ' + err.message, 'error');
  }

  dragSrcId = null;
  dragSrcStatus = null;
  dragSrcElement = null;
}

function refreshColumnCounts() {
  document.querySelectorAll('.pipeline-column').forEach(col => {
    const body = col.querySelector('.pipeline-column-body');
    const countEl = col.querySelector('.pipeline-column-count');
    if (body && countEl) {
      const cards = body.querySelectorAll('.pipeline-card');
      countEl.textContent = cards.length;
    }
  });
}

/* ── Toast Notification ─────────────────────────────────────── */

let toastTimeout = null;

export function showToast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;

  document.body.appendChild(toast);

  // Trigger slide-in
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Auto-dismiss after 3s
  toastTimeout = setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => { toast.remove(); }, 300);
    toastTimeout = null;
  }, 3000);
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
