/* ── Booking Detail View ───────────────────────────────────── */

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

/**
 * Render full booking detail with edit mode, action buttons, and timeline.
 * @param {HTMLElement} app
 * @param {string} id — booking ID
 */
export async function renderBookingDetail(app, id) {
  app.setAttribute('data-view', 'booking-detail');

  app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Ładowanie szczegółów...</p></div>';

  if (!id) {
    navigate('#bookings');
    return;
  }

  try {
    const booking = await api.getBooking(id);
    renderDetail(app, booking);
  } catch (err) {
    app.innerHTML = '<div class="page-header"><h1>Szczegóły rezerwacji</h1></div><div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function renderDetail(app, b) {
  const isCancelled = b.status === 'cancelled';
  const isCompleted = b.status === 'completed';
  const canEdit = !isCancelled && !isCompleted;
  const canCancel = !isCancelled && !isCompleted;
  const canDelete = true; // hard delete always available
  const canMarkDeposit = canEdit && !b.deposit_paid;

  // Status history timeline
  let historyHtml = '';
  if (b.status_history && b.status_history.length) {
    historyHtml = '<h3 style="font-size:0.95rem;font-weight:500;margin:1.5rem 0 0.75rem;">Historia statusów</h3><div class="timeline">';
    const history = Array.isArray(b.status_history) ? b.status_history.slice().reverse() : [];
    for (const h of history) {
      historyHtml += `<div class="timeline-item">
        <span class="timeline-date">${escapeHtml(formatTimestamp(h.timestamp))}</span>
        <span class="timeline-status">${escapeHtml(STATUS_LABELS[h.status] || h.status)}</span>
        <span class="timeline-note">${escapeHtml(h.note || '')}</span>
      </div>`;
    }
    historyHtml += '</div>';
  }

  // Action buttons
  let actionsHtml = '';
  if (canMarkDeposit) {
    actionsHtml += `<button class="btn btn-primary btn-sm" id="act-deposit">&#10003; Oznacz zaliczkę jako opłaconą</button> `;
  }
  if (canEdit) {
    actionsHtml += `<button class="btn btn-secondary btn-sm" id="act-toggle-edit">&#9998; Edytuj</button> `;
  }
  if (canCancel) {
    actionsHtml += `<button class="btn btn-danger btn-sm" id="act-cancel">&#10005; Anuluj rezerwację</button> `;
  }
  if (canDelete) {
    actionsHtml += `<button class="btn btn-danger btn-sm" id="act-delete">&#128465; Usuń trwale</button>`;
  }
  if (b.status === 'deposit_paid') {
    actionsHtml += ` <span class="badge badge-deposit_paid">Zaliczka opłacona</span>`;
  }

  const depositStatus = b.deposit_paid
    ? '<span class="deposit-paid">&#10003; Opłacona' + (b.deposit_paid_at ? ' (' + escapeHtml(formatDate(b.deposit_paid_at)) + ')' : '') + '</span>'
    : '<span class="deposit-unpaid">&#9679; Nieopłacona' + (b.deposit_amount ? ' — ' + escapeHtml(b.deposit_amount) + ' zł' : '') + '</span>';

  // Contract section
  const hasContract = b.contract_url && b.contract_url.length > 0;
  let contractHtml = '';
  if (hasContract) {
    contractHtml = '<div class="contract-section">' +
      '<div class="contract-section-title">&#128196; Kontrakt</div>' +
      '<div class="contract-actions">' +
        '<a class="btn btn-primary btn-sm" href="' + escapeHtml(b.contract_url) + '" target="_blank" rel="noopener">&#128229; Pobierz kontrakt</a> ' +
        '<button class="btn btn-secondary btn-sm" id="act-regenerate-contract">&#128260; Regeneruj</button> ' +
        '<button class="btn btn-secondary btn-sm" id="act-send-contract">&#9993; Wyślij do klienta</button>' +
        (b.contract_generated_at ? '<div class="contract-date">Wygenerowano: ' + escapeHtml(formatTimestamp(b.contract_generated_at)) + '</div>' : '') +
      '</div>' +
    '</div>';
  } else {
    contractHtml = '<div class="contract-section">' +
      '<div class="contract-section-title">&#128196; Kontrakt</div>' +
      '<div class="contract-actions">' +
        '<button class="btn btn-primary btn-sm" id="act-generate-contract">&#128221; Generuj kontrakt</button>' +
      '</div>' +
      '<div id="contract-result"></div>' +
    '</div>';
  }

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1><a href="#bookings" style="color:var(--text-muted);font-size:0.75rem;font-weight:300;">&#8592; Rezerwacje</a> / ${escapeHtml(b.client_name)}</h1>
    <div class="subtitle">${escapeHtml(b.id)} &middot; <span class="badge badge-${escapeHtml(b.status || 'inquiry')}">${escapeHtml(STATUS_LABELS[b.status] || b.status)}</span></div>
  </div>
</div>

<div class="action-bar" id="detail-actions">${actionsHtml}</div>
<div id="detail-action-result"></div>

<div class="card" id="detail-card">
  <div class="detail-grid" id="detail-grid-view">
    <div><div class="detail-field"><div class="detail-label">ID</div><div class="detail-value" style="font-family:monospace;">${escapeHtml(b.id)}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Typ klienta</div><div class="detail-value">${escapeHtml(clientTypeLabel(b.client_type))}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Klient</div><div class="detail-value">${escapeHtml(b.client_name)}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Email</div><div class="detail-value">${escapeHtml(b.client_email || '—')}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Telefon</div><div class="detail-value">${escapeHtml(b.client_phone || '—')}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Data wydarzenia</div><div class="detail-value">${escapeHtml(formatDate(b.event_date))}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Godzina</div><div class="detail-value">${escapeHtml(b.event_time_start || '—')} &ndash; ${escapeHtml(b.event_time_end || '—')}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Miejsce</div><div class="detail-value">${escapeHtml(b.event_location || '—')}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Liczba gości</div><div class="detail-value">${b.guest_count || '—'}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Pakiet</div><div class="detail-value">${escapeHtml(b.package_name || b.package_id || '—')}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Cena pakietu</div><div class="detail-value">${escapeHtml(b.package_price || b.package_final_price || '—')}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Zaliczka</div><div class="detail-value">${depositStatus}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Utworzono</div><div class="detail-value">${escapeHtml(formatTimestamp(b.created_at))}</div></div></div>
    <div><div class="detail-field"><div class="detail-label">Aktualizacja</div><div class="detail-value">${escapeHtml(formatTimestamp(b.updated_at))}</div></div></div>
  </div>

  ${contractHtml}

  <!-- Edit form (hidden by default) -->
  <div id="detail-form-edit" style="display:none;"></div>

  <!-- Internal notes -->
  <div style="margin-top:1.5rem;">
    <div class="detail-label" style="margin-bottom:0.3rem;">Notatki wewnętrzne</div>
    <div id="notes-view" style="white-space:pre-wrap;font-size:0.88rem;">${escapeHtml(b.internal_notes || '—')}</div>
    <textarea class="inline-edit-area" id="notes-edit" style="display:none;">${escapeHtml(b.internal_notes || '')}</textarea>
  </div>

  ${historyHtml}
</div>
  `;

  // ── Bind action buttons ──
  bindActions(app, b);

  // ── Edit toggle ──
  const toggleBtn = document.getElementById('act-toggle-edit');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => toggleEditMode(app, b));
  }
}

/* ── Contract Handlers ─────────────────────────────────────── */
function bindContractActions(app, b) {
  // Generate contract
  const genBtn = document.getElementById('act-generate-contract');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      const resultEl = document.getElementById('contract-result');
      if (resultEl) {
        resultEl.innerHTML = '<div class="loading" style="padding:0.5rem 0;"><div class="spinner" style="display:inline-block;"></div> Generowanie kontraktu...</div>';
      }
      genBtn.disabled = true;
      try {
        await api.generateContract(b.id);
        // Reload to show the contract
        await renderBookingDetail(app, b.id);
      } catch (err) {
        if (resultEl) {
          resultEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
        }
        genBtn.disabled = false;
      }
    });
  }

  // Regenerate contract
  const regenBtn = document.getElementById('act-regenerate-contract');
  if (regenBtn) {
    regenBtn.addEventListener('click', async () => {
      regenBtn.disabled = true;
      regenBtn.textContent = 'Generowanie...';
      try {
        await api.generateContract(b.id);
        showToast('Kontrakt wygenerowany ponownie', 'success');
        await renderBookingDetail(app, b.id);
      } catch (err) {
        showToast(err.message, 'error');
        regenBtn.disabled = false;
        regenBtn.textContent = 'Regeneruj';
      }
    });
  }

  // Send contract to client
  const sendBtn = document.getElementById('act-send-contract');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Wysyłanie...';
      try {
        await api.generateContract(b.id);
        showToast('Kontrakt wysłany do klienta', 'success');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Wyślij do klienta';
      } catch (err) {
        showToast(err.message, 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Wyślij do klienta';
      }
    });
  }
}

/* ── Toast (reusable from pipeline.js pattern) ──────────────── */
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

/* ── Action Handlers ──────────────────────────────────────── */
function bindActions(app, b) {
  // Mark deposit paid
  const depositBtn = document.getElementById('act-deposit');
  if (depositBtn) {
    depositBtn.addEventListener('click', async () => {
      if (!confirm('Oznaczyć zaliczkę jako opłaconą?')) return;
      setResult('Oznaczanie zaliczki...', 'loading');
      try {
        await api.markDepositPaid(b.id);
        setResult('Zaliczka oznaczona jako opłacona.', 'success');
        // Re-render
        await renderBookingDetail(app, b.id);
      } catch (err) {
        setResult(err.message, 'error');
      }
    });
  }

  // Cancel
  const cancelBtn = document.getElementById('act-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('Czy na pewno chcesz anulować tę rezerwację?')) return;
      setResult('Anulowanie...', 'loading');
      try {
        await api.cancelBooking(b.id);
        setResult('Rezerwacja anulowana.', 'success');
        await renderBookingDetail(app, b.id);
      } catch (err) {
        setResult(err.message, 'error');
      }
    });
  }

  // Delete
  const deleteBtn = document.getElementById('act-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Czy na pewno chcesz TRWALE USUNĄĆ tę rezerwację? Tej operacji nie można cofnąć.')) return;
      setResult('Usuwanie...', 'loading');
      try {
        await api.deleteBooking(b.id);
        navigate('#bookings');
      } catch (err) {
        setResult(err.message, 'error');
      }
    });
  }

  // Contract actions
  bindContractActions(app, b);
}

/* ── Edit Mode ────────────────────────────────────────────── */
function toggleEditMode(app, b) {
  const viewGrid = document.getElementById('detail-grid-view');
  const editForm = document.getElementById('detail-form-edit');
  const notesView = document.getElementById('notes-view');
  const notesEdit = document.getElementById('notes-edit');
  const toggleBtn = document.getElementById('act-toggle-edit');

  if (!editForm) return;

  const isEditing = editForm.style.display !== 'none';

  if (isEditing) {
    // Cancel edit — switch back to view mode
    editForm.style.display = 'none';
    viewGrid.style.display = '';
    notesView.style.display = '';
    notesEdit.style.display = 'none';
    toggleBtn.textContent = '\u270E Edytuj';
    return;
  }

  // Switch to edit mode
  viewGrid.style.display = 'none';
  notesView.style.display = 'none';
  notesEdit.style.display = '';
  toggleBtn.textContent = 'Anuluj edycję';

  editForm.style.display = '';
  editForm.innerHTML = `
<h3 style="font-size:0.95rem;font-weight:500;margin-bottom:1rem;">Edycja rezerwacji</h3>
<form id="booking-edit-form">
  <div class="form-row">
    <div class="form-group">
      <label>Imię i Nazwisko *</label>
      <input class="form-control" name="client_name" value="${escapeHtml(b.client_name || '')}" required>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input class="form-control" type="email" name="client_email" value="${escapeHtml(b.client_email || '')}">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Telefon</label>
      <input class="form-control" name="client_phone" value="${escapeHtml(b.client_phone || '')}">
    </div>
    <div class="form-group">
      <label>Typ klienta</label>
      <select class="form-control" name="client_type">
        <option value="bride_groom"${b.client_type === 'bride_groom' ? ' selected' : ''}>Para Młoda</option>
        <option value="dj"${b.client_type === 'dj' ? ' selected' : ''}>DJ</option>
        <option value="agency"${b.client_type === 'agency' ? ' selected' : ''}>Agencja / Inna</option>
      </select>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Data wydarzenia *</label>
      <input class="form-control" type="date" name="event_date" value="${escapeHtml(b.event_date || '')}" required>
    </div>
    <div class="form-group">
      <label>Miejsce</label>
      <input class="form-control" name="event_location" value="${escapeHtml(b.event_location || '')}">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Godzina rozpoczęcia</label>
      <input class="form-control" type="time" name="event_time_start" value="${escapeHtml(b.event_time_start || '')}">
    </div>
    <div class="form-group">
      <label>Godzina zakończenia</label>
      <input class="form-control" type="time" name="event_time_end" value="${escapeHtml(b.event_time_end || '')}">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Liczba gości</label>
      <input class="form-control" type="number" name="guest_count" value="${b.guest_count || ''}">
    </div>
    <div class="form-group">
      <label>Pakiet</label>
      <input class="form-control" name="package_id" value="${escapeHtml(b.package_id || '')}" placeholder="Nazwa pakietu">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Cena pakietu</label>
      <input class="form-control" name="package_price" value="${escapeHtml(b.package_price || b.package_final_price || '')}" placeholder="np. 2999">
    </div>
    <div class="form-group">
      <label>Kwota zaliczki</label>
      <input class="form-control" name="deposit_amount" value="${b.deposit_amount || ''}" placeholder="np. 500">
    </div>
  </div>
  <div id="edit-form-error"></div>
  <div class="form-actions">
    <button type="submit" class="btn btn-primary" id="edit-save-btn">Zapisz zmiany</button>
    <button type="button" class="btn btn-secondary" id="edit-cancel-btn">Anuluj</button>
  </div>
</form>
  `;

  // Save handler
  const editFormEl = document.getElementById('booking-edit-form');
  const errorEl = document.getElementById('edit-form-error');
  const saveBtn = document.getElementById('edit-save-btn');

  editFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Zapisywanie...';

    // Capture notes from textarea
    const notesVal = document.getElementById('notes-edit')?.value || '';

    const fd = new FormData(editFormEl);
    const data = {};
    fd.forEach((v, k) => { data[k] = v; });
    data.internal_notes = notesVal;

    try {
      await api.updateBooking(b.id, data);
      setResult('Zapisano pomyślnie.', 'success');
      await renderBookingDetail(app, b.id);
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Zapisz zmiany';
    }
  });

  // Cancel edit button
  document.getElementById('edit-cancel-btn').addEventListener('click', () => {
    renderBookingDetail(app, b.id);
  });
}

/* ── Result display ───────────────────────────────────────── */
function setResult(msg, type) {
  const el = document.getElementById('detail-action-result');
  if (!el) return;
  const cls = type === 'success' ? 'success-box' : type === 'error' ? 'error-box' : 'loading';
  let inner;
  if (type === 'loading') {
    inner = '<div class="spinner" style="display:inline-block;"></div> ' + escapeHtml(msg);
  } else {
    inner = escapeHtml(msg);
  }
  el.innerHTML = '<div class="' + cls + '">' + inner + '</div>';
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

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    // Support both unix timestamp (seconds) and ISO string
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

function clientTypeLabel(type) {
  const labels = { bride_groom: 'Para Młoda', dj: 'DJ', agency: 'Agencja / Inna' };
  return labels[type] || type || '—';
}
