/* ── Services View (Add-on Catalog) ─────────────────────────── */

import api from '../api.js';

/**
 * Render services catalog management view.
 * @param {HTMLElement} app
 */
export async function renderServices(app) {
  app.setAttribute('data-view', 'services');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Usługi dodatkowe</h1>
    <div class="subtitle">Katalog usług, które możesz dodawać do pakietów i rezerwacji</div>
  </div>
  <div class="header-actions">
    <button class="btn btn-primary" id="services-add-btn">+ Dodaj usługę</button>
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table class="team-table" id="services-table">
      <thead>
        <tr>
          <th>Nazwa</th>
          <th>Kategoria</th>
          <th>Cena bazowa</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="services-tbody">
        <tr><td colspan="5"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></td></tr>
      </tbody>
    </table>
  </div>
</div>
  `;

  await loadServices(app);

  document.getElementById('services-add-btn').addEventListener('click', function () {
    showServiceModal(app, null);
  });
}

/* ── Load services ───────────────────────────────────────── */
async function loadServices(app) {
  const tbody = document.getElementById('services-tbody');
  if (!tbody) return;
  try {
    const resp = await api.listServices();
    const list = Array.isArray(resp) ? resp : (resp.services || resp.data || []);
    renderServicesTable(tbody, list, app);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="error-box">' + escapeHtml(err.message) + '</div></td></tr>';
  }
}

function renderServicesTable(tbody, services, app) {
  if (!services || services.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">&#127925;</span><p>Brak usług w katalogu</p><p style="font-size:0.82rem;">Dodaj pierwszą usługę klikając przycisk powyżej.</p></div></td></tr>';
    return;
  }

  // Sort by sort_order then name for a stable display
  const sorted = services.slice().sort(function (a, b) {
    const sa = (a.sort_order == null) ? 9999 : a.sort_order;
    const sb = (b.sort_order == null) ? 9999 : b.sort_order;
    if (sa !== sb) return sa - sb;
    return (a.name || '').localeCompare(b.name || '');
  });

  let html = '';
  for (const s of sorted) {
    const name = s.name || '—';
    const category = s.category || '—';
    const price = (s.base_price != null) ? (formatPrice(s.base_price) + ' zł') : '—';
    const isActive = s.is_active !== false && s.active !== false;
    const statusBadge = isActive
      ? '<span class="badge badge-confirmed">Aktywna</span>'
      : '<span class="badge badge-cancelled">Nieaktywna</span>';
    const desc = s.description || '';

    html += '<tr>';
    html += '  <td><div style="font-weight:500;">' + escapeHtml(name) + '</div>';
    if (desc) html += '<div class="text-faint" style="font-size:0.78rem;">' + escapeHtml(desc) + '</div>';
    html += '  </td>';
    html += '  <td><span class="badge badge-role">' + escapeHtml(category) + '</span></td>';
    html += '  <td>' + escapeHtml(price) + '</td>';
    html += '  <td>' + statusBadge + '</td>';
    html += '  <td class="team-actions-cell">';
    html += '    <button class="btn btn-secondary btn-sm service-edit-btn" data-service-id="' + escapeHtml(String(s.id)) + '">&#9998; Edytuj</button> ';
    html += '    <button class="btn btn-danger btn-sm service-delete-btn" data-service-id="' + escapeHtml(String(s.id)) + '">&#128465; Usuń</button>';
    html += '  </td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;

  // Bind edit buttons
  tbody.querySelectorAll('.service-edit-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const serviceId = this.getAttribute('data-service-id');
      const service = services.find(function (s) { return String(s.id) === serviceId; });
      if (service) showServiceModal(app, service);
    });
  });

  // Bind delete buttons
  tbody.querySelectorAll('.service-delete-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const serviceId = this.getAttribute('data-service-id');
      const service = services.find(function (s) { return String(s.id) === serviceId; });
      const label = service ? (service.name || serviceId) : serviceId;
      if (!confirm('Czy na pewno usunąć usługę "' + label + '"? Tej operacji nie można cofnąć.')) return;
      try {
        await api.deleteService(serviceId);
        showToast('Usługa usunięta', 'success');
        loadServices(app);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ── Modal ────────────────────────────────────────────────── */
function showServiceModal(app, service) {
  const isEdit = !!service;
  const title = isEdit ? 'Edytuj usługę' : 'Dodaj usługę';

  const categories = ['Muzyka', 'Efekty', 'Foto', 'Inne'];
  const currentCategory = service ? (service.category || '') : '';
  let categoryOptions = '';
  for (const c of categories) {
    categoryOptions += '<option value="' + escapeHtml(c) + '"' + (c === currentCategory ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
  }
  // Allow free-text category: if current value is not in the list, add it
  if (currentCategory && categories.indexOf(currentCategory) === -1) {
    categoryOptions = '<option value="' + escapeHtml(currentCategory) + '" selected>' + escapeHtml(currentCategory) + '</option>' + categoryOptions;
  }
  categoryOptions = '<option value=""' + (!currentCategory ? ' selected' : '') + '>— Wybierz kategorię —</option>' + categoryOptions;

  const isActive = service ? (service.is_active !== false && service.active !== false) : true;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
<div class="modal-content">
  <button class="modal-close" id="service-modal-close">&times;</button>
  <h2>${title}</h2>
  <form id="service-form">
    <div class="form-group">
      <label>Nazwa *</label>
      <input class="form-control" name="name" value="${escapeHtml(service ? (service.name || '') : '')}" placeholder="np. Saksofonista, Efekt ciężkiego dymu" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Kategoria</label>
        <select class="form-control" name="category" id="service-category-select">
          ${categoryOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Cena bazowa (zł)</label>
        <input class="form-control" type="number" step="0.01" min="0" name="base_price" value="${service && service.base_price != null ? service.base_price : ''}" placeholder="np. 500">
      </div>
    </div>
    <div class="form-group">
      <label>Opis</label>
      <textarea class="form-control" name="description" placeholder="Krótki opis usługi">${escapeHtml(service ? (service.description || '') : '')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Kolejność sortowania</label>
        <input class="form-control" type="number" step="1" name="sort_order" value="${service && service.sort_order != null ? service.sort_order : ''}" placeholder="np. 10 (mniejsze = wyżej na liście)">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select class="form-control" name="is_active">
          <option value="true"${isActive ? ' selected' : ''}>Aktywna</option>
          <option value="false"${!isActive ? ' selected' : ''}>Nieaktywna</option>
        </select>
      </div>
    </div>
    <div id="service-form-error"></div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${isEdit ? 'Zapisz zmiany' : 'Dodaj'}</button>
      <button type="button" class="btn btn-secondary" id="service-modal-cancel">Anuluj</button>
    </div>
  </form>
</div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  function closeModal() {
    overlay.remove();
  }
  overlay.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('service-modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  // Form submit
  const form = document.getElementById('service-form');
  const errorEl = document.getElementById('service-form-error');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.innerHTML = '';
    const fd = new FormData(form);
    const data = {};
    fd.forEach(function (v, k) { data[k] = v; });

    // Parse numeric fields
    if (data.base_price !== undefined && data.base_price !== '') {
      data.base_price = parseFloat(data.base_price);
    } else {
      delete data.base_price;
    }
    if (data.sort_order !== undefined && data.sort_order !== '') {
      data.sort_order = parseInt(data.sort_order, 10);
    } else {
      delete data.sort_order;
    }
    // is_active → boolean
    data.is_active = (data.is_active === 'true');

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Zapisywanie...' : 'Dodawanie...';

    try {
      if (isEdit) {
        await api.updateService(service.id, data);
        showToast('Zaktualizowano usługę', 'success');
      } else {
        await api.createService(data);
        showToast('Dodano usługę', 'success');
      }
      closeModal();
      loadServices(app);
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Zapisz zmiany' : 'Dodaj';
    }
  });
}

/* ── Toast ────────────────────────────────────────────────── */
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
  requestAnimationFrame(function () {
    toast.classList.add('toast-visible');
  });
  toastTimeout = setTimeout(function () {
    toast.classList.remove('toast-visible');
    setTimeout(function () { toast.remove(); }, 300);
    toastTimeout = null;
  }, 3000);
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str == null ? '' : String(str)));
  return div.innerHTML;
}

function formatPrice(val) {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  // Polish-friendly: two decimals, keep integers clean
  return n.toFixed(2).replace(/\.00$/, '');
}