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

  <!-- Assigned Staff Section -->
  <div class="card assignments-section" style="margin-top:1.5rem;">
    <div class="card-header">&#128101; Przypisany personel</div>
    <div id="assignments-content"><div class="loading" style="padding:1rem 0;"><div class="spinner" style="display:inline-block;"></div> Ładowanie...</div></div>
  </div>

  <!-- Files Section -->
  <div class="card files-section" style="margin-top:1.5rem;">
    <div class="card-header">&#128206; Pliki</div>
    <div id="files-content"><div class="loading" style="padding:1rem 0;"><div class="spinner" style="display:inline-block;"></div> Ładowanie...</div></div>
  </div>

  <!-- Location Section -->
  <div class="card" style="margin-top:1.5rem;">
    <div class="card-header">&#128205; Lokalizacja wydarzenia</div>
    <div id="location-content"><div class="loading" style="padding:1rem 0;"><div class="spinner" style="display:inline-block;"></div> Ładowanie...</div></div>
  </div>

  <!-- Services (add-ons) Section -->
  <div class="card" style="margin-top:1.5rem;">
    <div class="card-header">&#127925; Usługi dodatkowe</div>
    <div id="booking-services-content"><div class="loading" style="padding:1rem 0;"><div class="spinner" style="display:inline-block;"></div> Ładowanie...</div></div>
  </div>

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

  // ── Load sections ──
  renderAssignments(app, b);
  renderFiles(app, b);
  renderLocation(app, b);
  renderBookingServices(app, b);
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

/* ── Assigned Staff Section ──────────────────────────────── */
async function renderAssignments(app, b) {
  const container = document.getElementById('assignments-content');
  if (!container) return;
  try {
    const [assignments, users] = await Promise.all([
      api.listAssignments(b.id),
      api.listUsers(),
    ]);
    const list = Array.isArray(assignments) ? assignments : (assignments.data || []);
    const userList = Array.isArray(users) ? users : (users.data || []);

    let html = '<div class="assignments-list">';
    if (list.length === 0) {
      html += '<div class="empty-state" style="padding:1rem 0;"><span class="empty-icon" style="font-size:1.5rem;">&#128101;</span><p>Brak przypisanego personelu</p></div>';
    } else {
      for (const a of list) {
        const user = a.user || a;
        const userName = user.name || user.email || '—';
        const userEmail = user.email || '—';
        const role = a.role || a.role_at_event || '—';
        const checkedIn = a.checked_in ? true : false;
        const loc = a.location || user.location || '';
        const lat = a.lat || user.lat || null;
        const lng = a.lng || user.lng || null;
        const locStr = loc;
        const coords = lat && lng ? lat + ', ' + lng : '';

        html += '<div class="assignment-row">';
        html += '  <div class="assignment-info">';
        html += '    <span class="assignment-name">' + escapeHtml(userName) + '</span>';
        html += '    <span class="assignment-email">' + escapeHtml(userEmail) + '</span>';
        html += '    <span class="badge badge-role">' + escapeHtml(role) + '</span>';
        if (locStr) html += '    <span class="assignment-location">' + escapeHtml(locStr) + '</span>';
        if (coords) html += '    <span class="assignment-coords text-faint">' + escapeHtml(coords) + '</span>';
        html += '  </div>';
        html += '  <div class="assignment-actions">';
        // Check-in toggle
        const userId = a.user_id || user.id;
        html += '    <label class="checkbox-label assignment-checkin" style="font-size:0.78rem;">';
        html += '      <input type="checkbox" class="checkin-toggle" data-user-id="' + escapeHtml(String(userId)) + '"' + (checkedIn ? ' checked' : '') + '>';
        html += '      ' + (checkedIn ? 'Zameldowany' : 'Niepotwierdzony');
        html += '    </label>';
        // Remove button
        html += '    <button class="btn btn-danger btn-sm assignment-remove" data-user-id="' + escapeHtml(String(userId)) + '">&#128465; Usuń</button>';
        html += '  </div>';
        html += '</div>';
      }
    }
    html += '</div>';

    // Add assignment form
    html += '<div class="assignment-add-form" style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(128,128,128,0.06);">';
    html += '  <div class="form-row">';
    html += '    <div class="form-group">';
    html += '      <label>Dodaj członka zespołu</label>';
    html += '      <select class="form-control" id="assignment-user-select">';
    html += '        <option value="">— Wybierz użytkownika —</option>';
    for (const u of userList) {
      const alreadyAssigned = list.some(a => (a.user_id || (a.user && a.user.id)) === u.id);
      if (alreadyAssigned) continue;
      html += '        <option value="' + escapeHtml(String(u.id)) + '">' + escapeHtml(u.name || u.email || u.id) + ' (' + escapeHtml(u.email || '') + ')</option>';
    }
    html += '      </select>';
    html += '    </div>';
    html += '    <div class="form-group">';
    html += '      <label>Rola na wydarzeniu</label>';
    html += '      <input class="form-control" id="assignment-role-input" placeholder="np. DJ, Fotograf, Koordynator">';
    html += '    </div>';
    html += '  </div>';
    html += '  <button class="btn btn-primary btn-sm" id="assignment-add-btn">+ Przypisz</button>';
    html += '  <span id="assignment-add-error" class="text-faint" style="font-size:0.78rem;margin-left:0.5rem;"></span>';
    html += '</div>';

    container.innerHTML = html;
    bindAssignmentEvents(app, b);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function bindAssignmentEvents(app, b) {
  // Check-in toggles
  document.querySelectorAll('.checkin-toggle').forEach(function (cb) {
    cb.addEventListener('change', async function () {
      const userId = this.getAttribute('data-user-id');
      const checked = this.checked;
      try {
        await api.updateAssignment(b.id, userId, { checked_in: checked });
        showToast(checked ? 'Potwierdzono obecność' : 'Cofnięto potwierdzenie', 'success');
        renderAssignments(app, b);
      } catch (err) {
        showToast(err.message, 'error');
        this.checked = !checked;
      }
    });
  });

  // Remove assignment
  document.querySelectorAll('.assignment-remove').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Usunąć tego członka personelu z rezerwacji?')) return;
      const userId = this.getAttribute('data-user-id');
      try {
        await api.deleteAssignment(b.id, userId);
        showToast('Usunięto przypisanie', 'success');
        renderAssignments(app, b);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Add assignment
  const addBtn = document.getElementById('assignment-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async function () {
      const userId = document.getElementById('assignment-user-select')?.value;
      const role = document.getElementById('assignment-role-input')?.value;
      const errEl = document.getElementById('assignment-add-error');
      if (!userId) {
        if (errEl) errEl.textContent = 'Wybierz użytkownika';
        return;
      }
      if (errEl) errEl.textContent = '';
      addBtn.disabled = true;
      addBtn.textContent = 'Dodawanie...';
      try {
        await api.createAssignment(b.id, { user_id: userId, role: role || '' });
        showToast('Przypisano personel', 'success');
        renderAssignments(app, b);
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
        addBtn.disabled = false;
        addBtn.textContent = '+ Przypisz';
      }
    });
  }
}

/* ── Files Section ────────────────────────────────────────── */
async function renderFiles(app, b) {
  const container = document.getElementById('files-content');
  if (!container) return;
  try {
    const files = await api.listFiles(b.id);
    const list = Array.isArray(files) ? files : (files.data || []);

    let html = '<div class="files-list">';
    if (list.length === 0) {
      html += '<div class="empty-state" style="padding:1rem 0;"><span class="empty-icon" style="font-size:1.5rem;">&#128206;</span><p>Brak przesłanych plików</p></div>';
    } else {
      html += '<table class="files-table"><thead><tr><th>Nazwa pliku</th><th>Kategoria</th><th>Rozmiar</th><th>Przesłał</th><th>Data</th><th></th></tr></thead><tbody>';
      for (const f of list) {
        const fileName = f.original_name || f.filename || '—';
        const category = f.category || '—';
        const sizeStr = f.size ? formatFileSize(f.size) : '—';
        const uploader = f.uploaded_by_name || f.uploaded_by || '—';
        const dateStr = formatDate(f.created_at);
        const fileId = f.id;
        const downloadUrl = f.url || f.download_url || '';

        html += '<tr>';
        html += '  <td><span class="file-icon">&#128196;</span> ' + escapeHtml(fileName) + '</td>';
        html += '  <td><span class="badge badge-file-category">' + escapeHtml(category) + '</span></td>';
        html += '  <td class="text-faint">' + escapeHtml(sizeStr) + '</td>';
        html += '  <td class="text-faint">' + escapeHtml(uploader) + '</td>';
        html += '  <td class="text-faint">' + escapeHtml(dateStr) + '</td>';
        html += '  <td class="files-actions">';
        if (downloadUrl) {
          html += '    <a class="btn btn-secondary btn-sm" href="' + escapeHtml(downloadUrl) + '" target="_blank" rel="noopener">&#128229; Pobierz</a> ';
        }
        html += '    <button class="btn btn-danger btn-sm file-delete" data-file-id="' + escapeHtml(String(fileId)) + '">&#128465;</button>';
        html += '  </td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';

    // Upload form
    html += '<div class="file-upload-form" style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(128,128,128,0.06);">';
    html += '  <div class="form-row">';
    html += '    <div class="form-group">';
    html += '      <label>Plik</label>';
    html += '      <input class="form-control" type="file" id="file-upload-input">';
    html += '    </div>';
    html += '    <div class="form-group">';
    html += '      <label>Kategoria</label>';
    html += '      <select class="form-control" id="file-category-select">';
    html += '        <option value="contract">Kontrakt</option>';
    html += '        <option value="invoice">Faktura</option>';
    html += '        <option value="photo">Zdjęcie</option>';
    html += '        <option value="music">Muzyka</option>';
    html += '        <option value="other">Inne</option>';
    html += '      </select>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="form-group">';
    html += '    <label>Opis (opcjonalnie)</label>';
    html += '    <input class="form-control" id="file-description-input" placeholder="Krótki opis pliku">';
    html += '  </div>';
    html += '  <button class="btn btn-primary btn-sm" id="file-upload-btn">&#128228; Prześlij plik</button>';
    html += '  <span id="file-upload-error" class="text-faint" style="font-size:0.78rem;margin-left:0.5rem;"></span>';
    html += '</div>';

    container.innerHTML = html;
    bindFileEvents(app, b);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function bindFileEvents(app, b) {
  // Delete file
  document.querySelectorAll('.file-delete').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Usunąć ten plik?')) return;
      const fileId = this.getAttribute('data-file-id');
      try {
        await api.deleteFile(b.id, fileId);
        showToast('Plik usunięty', 'success');
        renderFiles(app, b);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Upload file
  const uploadBtn = document.getElementById('file-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async function () {
      const fileInput = document.getElementById('file-upload-input');
      const categoryEl = document.getElementById('file-category-select');
      const descEl = document.getElementById('file-description-input');
      const errEl = document.getElementById('file-upload-error');

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        if (errEl) errEl.textContent = 'Wybierz plik';
        return;
      }
      if (errEl) errEl.textContent = '';

      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      if (categoryEl) fd.append('category', categoryEl.value);
      if (descEl && descEl.value) fd.append('description', descEl.value);

      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Przesyłanie...';
      try {
        await api.uploadFile(b.id, fd);
        showToast('Plik przesłany', 'success');
        // Reset form
        if (fileInput) fileInput.value = '';
        if (descEl) descEl.value = '';
        renderFiles(app, b);
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Prześlij plik';
      }
    });
  }
}

/* ── Location Section ─────────────────────────────────────── */
async function renderLocation(app, b) {
  const container = document.getElementById('location-content');
  if (!container) return;
  try {
    const locationText = b.event_location || '—';
    const lat = b.event_lat || null;
    const lng = b.event_lng || null;

    let html = '<div><strong>Miejsce:</strong> ' + escapeHtml(locationText) + '</div>';
    if (lat && lng) {
      html += '<div class="text-faint" style="margin-top:0.3rem;font-size:0.82rem;">Współrzędne: ' + escapeHtml(lat) + ', ' + escapeHtml(lng) + '</div>';
    }

    // Show assigned user locations if available
    try {
      const assignments = await api.listAssignments(b.id);
      const list = Array.isArray(assignments) ? assignments : (assignments.data || []);
      const withCoords = list.filter(function (a) {
        const u = a.user || a;
        return u.lat && u.lng;
      });
      if (withCoords.length > 0) {
        html += '<div style="margin-top:1rem;"><div class="detail-label" style="margin-bottom:0.4rem;">Lokalizacje personelu</div>';
        for (const a of withCoords) {
          const u = a.user || a;
          const name = u.name || u.email || '—';
          const loc = a.location || u.location || '';
          html += '<div style="font-size:0.85rem;padding:0.25rem 0;">';
          html += '  <span style="font-weight:500;">' + escapeHtml(name) + '</span>';
          if (loc) html += ' &mdash; ' + escapeHtml(loc);
          html += ' <span class="text-faint">(' + escapeHtml(u.lat) + ', ' + escapeHtml(u.lng) + ')</span>';
          html += '</div>';
        }
        html += '</div>';
      }
    } catch (_) {
      // Ignore errors loading user locations — not critical
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/* ── Booking Services (Add-ons) Section ────────────────────── */
async function renderBookingServices(app, b) {
  const container = document.getElementById('booking-services-content');
  if (!container) return;
  try {
    const [bookingServicesResp, catalogResp] = await Promise.all([
      api.listBookingServices(b.id),
      api.listServices(),
    ]);
    const services = Array.isArray(bookingServicesResp) ? bookingServicesResp : (bookingServicesResp.services || bookingServicesResp.data || []);
    const totalAddons = bookingServicesResp.total_addons;
    const catalog = Array.isArray(catalogResp) ? catalogResp : (catalogResp.services || catalogResp.data || []);
    // Only active catalog services are selectable
    const activeCatalog = catalog.filter(function (s) { return s.is_active !== false && s.active !== false; });

    let html = '<div class="booking-services-list">';
    if (!services || services.length === 0) {
      html += '<div class="empty-state" style="padding:1rem 0;"><span class="empty-icon" style="font-size:1.5rem;">&#127925;</span><p>Brak usług dodatkowych w tej rezerwacji</p></div>';
    } else {
      html += '<table class="files-table"><thead><tr><th>Usługa</th><th>Cena</th><th>Notatki</th><th></th></tr></thead><tbody>';
      for (const s of services) {
        const serviceId = s.service_id || s.id;
        const name = s.name || s.service_name || ('#' + serviceId);
        const price = (s.price != null) ? (formatPrice(s.price) + ' zł') : '—';
        const notes = s.notes || '';
        const isIncluded = s.is_included === true;

        html += '<tr>';
        html += '  <td><span style="font-weight:500;">' + escapeHtml(name) + '</span>';
        if (isIncluded) html += ' <span class="badge badge-confirmed">Wliczone w pakiet</span>';
        html += '  </td>';
        html += '  <td>' + escapeHtml(price) + '</td>';
        html += '  <td class="text-faint">' + escapeHtml(notes || '—') + '</td>';
        html += '  <td class="files-actions">';
        html += '    <button class="btn btn-secondary btn-sm booking-service-edit" data-service-id="' + escapeHtml(String(serviceId)) + '">&#9998; Edytuj</button> ';
        html += '    <button class="btn btn-danger btn-sm booking-service-delete" data-service-id="' + escapeHtml(String(serviceId)) + '">&#128465; Usuń</button>';
        html += '  </td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    html += '</div>';

    // Total add-ons cost
    let computedTotal = 0;
    for (const s of services) {
      if (s.is_included === true) continue; // included in package, not extra
      if (s.price != null && !isNaN(Number(s.price))) computedTotal += Number(s.price);
    }
    const totalDisplay = (totalAddons != null) ? formatPrice(totalAddons) : formatPrice(computedTotal);
    html += '<div style="margin-top:0.75rem;font-weight:500;">Razem dodatki: ' + escapeHtml(totalDisplay) + ' zł</div>';

    // Add service form
    const addedIds = services.map(function (s) { return String(s.service_id || s.id); });
    const available = activeCatalog.filter(function (s) { return addedIds.indexOf(String(s.id)) === -1; });

    html += '<div class="assignment-add-form" style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(128,128,128,0.06);">';
    if (available.length === 0) {
      html += '<div class="text-faint" style="font-size:0.82rem;">Wszystkie dostępne usługi zostały już dodane.</div>';
    } else {
      html += '  <div class="form-row">';
      html += '    <div class="form-group">';
      html += '      <label>Wybierz usługę</label>';
      html += '      <select class="form-control" id="booking-service-select">';
      html += '        <option value="">— Wybierz usługę —</option>';
      for (const s of available) {
        const priceLabel = (s.base_price != null) ? ' (' + formatPrice(s.base_price) + ' zł)' : '';
        html += '        <option value="' + escapeHtml(String(s.id)) + '" data-base-price="' + escapeHtml(String(s.base_price || '')) + '">' + escapeHtml(s.name || s.id) + escapeHtml(priceLabel) + '</option>';
      }
      html += '      </select>';
      html += '    </div>';
      html += '    <div class="form-group">';
      html += '      <label>Cena (zł)</label>';
      html += '      <input class="form-control" type="number" step="0.01" min="0" id="booking-service-price" placeholder="np. 500">';
      html += '    </div>';
      html += '  </div>';
      html += '  <div class="form-group">';
      html += '    <label>Notatki (opcjonalnie)</label>';
      html += '    <input class="form-control" id="booking-service-notes" placeholder="np. uzgodniony termin, szczegóły">';
      html += '  </div>';
      html += '  <button class="btn btn-primary btn-sm" id="booking-service-add-btn">+ Dodaj usługę</button>';
      html += '  <span id="booking-service-add-error" class="text-faint" style="font-size:0.78rem;margin-left:0.5rem;"></span>';
    }
    html += '</div>';

    container.innerHTML = html;
    bindBookingServiceEvents(app, b, catalog);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function bindBookingServiceEvents(app, b, catalog) {
  // Auto-fill price when selecting a service
  const selectEl = document.getElementById('booking-service-select');
  const priceEl = document.getElementById('booking-service-price');
  if (selectEl && priceEl) {
    selectEl.addEventListener('change', function () {
      const opt = selectEl.options[selectEl.selectedIndex];
      const basePrice = opt ? opt.getAttribute('data-base-price') : '';
      if (basePrice !== '') priceEl.value = basePrice;
    });
  }

  // Add service
  const addBtn = document.getElementById('booking-service-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async function () {
      const serviceId = selectEl ? selectEl.value : '';
      const price = priceEl ? priceEl.value : '';
      const notesEl = document.getElementById('booking-service-notes');
      const errEl = document.getElementById('booking-service-add-error');
      if (!serviceId) {
        if (errEl) errEl.textContent = 'Wybierz usługę';
        return;
      }
      if (errEl) errEl.textContent = '';
      const data = { service_id: serviceId };
      if (price !== '') data.price = parseFloat(price);
      if (notesEl && notesEl.value) data.notes = notesEl.value;

      addBtn.disabled = true;
      addBtn.textContent = 'Dodawanie...';
      try {
        await api.addBookingService(b.id, data);
        showToast('Dodano usługę do rezerwacji', 'success');
        renderBookingServices(app, b);
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
        addBtn.disabled = false;
        addBtn.textContent = '+ Dodaj usługę';
      }
    });
  }

  // Edit service (open modal with price + notes)
  document.querySelectorAll('.booking-service-edit').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const serviceId = this.getAttribute('data-service-id');
      showBookingServiceEditModal(app, b, serviceId, catalog);
    });
  });

  // Delete service
  document.querySelectorAll('.booking-service-delete').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const serviceId = this.getAttribute('data-service-id');
      if (!confirm('Usunąć tę usługę z rezerwacji?')) return;
      try {
        await api.deleteBookingService(b.id, serviceId);
        showToast('Usługa usunięta z rezerwacji', 'success');
        renderBookingServices(app, b);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function showBookingServiceEditModal(app, b, serviceId, catalog) {
  // Find current booking service from DOM is unreliable; reload from API
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
<div class="modal-content">
  <button class="modal-close" id="bs-modal-close">&times;</button>
  <h2>Edytuj usługę</h2>
  <div id="bs-modal-body"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></div>
</div>
  `;
  document.body.appendChild(overlay);

  function closeModal() { overlay.remove(); }
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

  (async function () {
    let current;
    try {
      const resp = await api.listBookingServices(b.id);
      const list = Array.isArray(resp) ? resp : (resp.services || resp.data || []);
      current = list.find(function (s) { return String(s.service_id || s.id) === String(serviceId); });
    } catch (err) {
      document.getElementById('bs-modal-body').innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      return;
    }
    if (!current) {
      document.getElementById('bs-modal-body').innerHTML = '<div class="error-box">Nie znaleziono usługi w rezerwacji.</div>';
      return;
    }

    const name = current.name || current.service_name || ('#' + serviceId);
    const isIncluded = current.is_included === true;
    const price = (current.price != null) ? current.price : '';
    const notes = current.notes || '';

    document.getElementById('bs-modal-body').innerHTML = `
<form id="bs-edit-form">
  <div class="form-group">
    <label>Usługa</label>
    <div style="font-weight:500;padding:0.4rem 0;">${escapeHtml(name)}${isIncluded ? ' <span class="badge badge-confirmed">Wliczone w pakiet</span>' : ''}</div>
  </div>
  <div class="form-group">
    <label>Cena (zł)</label>
    <input class="form-control" type="number" step="0.01" min="0" name="price" value="${escapeHtml(price)}" placeholder="np. 500">
  </div>
  <div class="form-group">
    <label>Notatki</label>
    <textarea class="form-control" name="notes">${escapeHtml(notes)}</textarea>
  </div>
  <div id="bs-edit-error"></div>
  <div class="form-actions">
    <button type="submit" class="btn btn-primary">Zapisz zmiany</button>
    <button type="button" class="btn btn-secondary" id="bs-edit-cancel">Anuluj</button>
  </div>
</form>
    `;

    document.getElementById('bs-edit-cancel').addEventListener('click', closeModal);

    const form = document.getElementById('bs-edit-form');
    const errorEl = document.getElementById('bs-edit-error');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorEl.innerHTML = '';
      const fd = new FormData(form);
      const data = {};
      if (fd.get('price') !== '') data.price = parseFloat(fd.get('price'));
      data.notes = fd.get('notes') || '';

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Zapisywanie...';
      try {
        await api.updateBookingService(b.id, serviceId, data);
        showToast('Zaktualizowano usługę', 'success');
        closeModal();
        renderBookingServices(app, b);
      } catch (err) {
        errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Zapisz zmiany';
      }
    });
  })();
}

/* ── File size formatter ──────────────────────────────────── */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
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

function formatPrice(val) {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toFixed(2).replace(/\.00$/, '');
}
