/* ── Team View (Staff Management) ───────────────────────────── */

import api from '../api.js';

/**
 * Render team/staff management view.
 * @param {HTMLElement} app
 */
export async function renderTeam(app) {
  app.setAttribute('data-view', 'team');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Zespół</h1>
    <div class="subtitle">Zarządzanie członkami zespołu</div>
  </div>
  <div class="header-actions">
    <button class="btn btn-primary" id="team-add-btn">+ Dodaj członka zespołu</button>
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table class="team-table" id="team-table">
      <thead>
        <tr>
          <th>Imię i nazwisko / Email</th>
          <th>Rola</th>
          <th>Lokalizacja</th>
          <th>Telefon</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="team-tbody">
        <tr><td colspan="5"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></td></tr>
      </tbody>
    </table>
  </div>
</div>
  `;

  await loadTeam(app);

  document.getElementById('team-add-btn').addEventListener('click', () => {
    showTeamMemberModal(app, null);
  });
}

/* ── Load team ───────────────────────────────────────────── */
async function loadTeam(app) {
  const tbody = document.getElementById('team-tbody');
  if (!tbody) return;
  try {
    const users = await api.listUsers();
    const list = Array.isArray(users) ? users : (users.data || []);
    renderTeamTable(tbody, list, app);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="error-box">' + escapeHtml(err.message) + '</div></td></tr>';
  }
}

function renderTeamTable(tbody, users, app) {
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">&#128101;</span><p>Brak członków zespołu</p><p style="font-size:0.82rem;">Dodaj pierwszego członka zespołu klikając przycisk powyżej.</p></div></td></tr>';
    return;
  }

  let html = '';
  for (const u of users) {
    const name = u.name || '—';
    const email = u.email || '—';
    const role = u.role || '—';
    const location = u.location || '—';
    const phone = u.phone || '—';
    const lat = u.lat || null;
    const lng = u.lng || null;
    let locDisplay = escapeHtml(location);
    if (lat && lng) {
      locDisplay += ' <span class="text-faint">(' + escapeHtml(lat) + ', ' + escapeHtml(lng) + ')</span>';
    }

    html += '<tr>';
    html += '  <td><div style="font-weight:500;">' + escapeHtml(name) + '</div><div class="text-faint" style="font-size:0.78rem;">' + escapeHtml(email) + '</div></td>';
    html += '  <td><span class="badge badge-role">' + escapeHtml(role) + '</span></td>';
    html += '  <td class="team-location-cell">' + locDisplay + '</td>';
    html += '  <td class="text-faint">' + escapeHtml(phone) + '</td>';
    html += '  <td class="team-actions-cell">';
    html += '    <button class="btn btn-secondary btn-sm team-edit-btn" data-user-id="' + escapeHtml(String(u.id)) + '">&#9998; Edytuj</button> ';
    html += '    <button class="btn btn-danger btn-sm team-delete-btn" data-user-id="' + escapeHtml(String(u.id)) + '">&#128465; Usuń</button>';
    html += '  </td>';
    html += '</tr>';
  }
  tbody.innerHTML = html;

  // Bind edit buttons
  tbody.querySelectorAll('.team-edit-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const userId = this.getAttribute('data-user-id');
      const user = users.find(function (u) { return String(u.id) === userId; });
      if (user) showTeamMemberModal(app, user);
    });
  });

  // Bind delete buttons
  tbody.querySelectorAll('.team-delete-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Czy na pewno usunąć tego członka zespołu?')) return;
      const userId = this.getAttribute('data-user-id');
      try {
        await api.deleteUser(userId);
        showToast('Członek zespołu usunięty', 'success');
        loadTeam(app);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

/* ── Modal ────────────────────────────────────────────────── */
function showTeamMemberModal(app, user) {
  const isEdit = !!user;
  const title = isEdit ? 'Edytuj członka zespołu' : 'Dodaj członka zespołu';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
<div class="modal-content">
  <button class="modal-close" id="team-modal-close">&times;</button>
  <h2>${title}</h2>
  <form id="team-member-form">
    <div class="form-group">
      <label>Email *</label>
      <input class="form-control" type="email" name="email" value="${escapeHtml(user ? (user.email || '') : '')}" ${isEdit ? 'readonly' : 'required'}>
    </div>
    ${!isEdit ? '<div class="form-group"><label>Hasło *</label><input class="form-control" type="password" name="password" required></div>' : ''}
    <div class="form-row">
      <div class="form-group">
        <label>Nazwa</label>
        <input class="form-control" name="name" value="${escapeHtml(user ? (user.name || '') : '')}">
      </div>
      <div class="form-group">
        <label>Telefon</label>
        <input class="form-control" name="phone" value="${escapeHtml(user ? (user.phone || '') : '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Rola</label>
        <input class="form-control" name="role" value="${escapeHtml(user ? (user.role || '') : '')}" placeholder="np. DJ, Fotograf">
      </div>
      <div class="form-group">
        <label>Lokalizacja</label>
        <input class="form-control" name="location" value="${escapeHtml(user ? (user.location || '') : '')}" placeholder="Miasto, adres">
      </div>
    </div>
    <div class="form-group">
      <label>Szerokość geograficzna (lat)</label>
      <input class="form-control" name="lat" type="number" step="any" value="${user && user.lat ? user.lat : ''}" placeholder="np. 52.2297">
    </div>
    <div class="form-group">
      <label>Długość geograficzna (lng)</label>
      <input class="form-control" name="lng" type="number" step="any" value="${user && user.lng ? user.lng : ''}" placeholder="np. 21.0122">
    </div>
    <div id="team-form-error"></div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${isEdit ? 'Zapisz zmiany' : 'Dodaj'}</button>
      <button type="button" class="btn btn-secondary" id="team-modal-cancel">Anuluj</button>
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
  document.getElementById('team-modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  // Form submit
  const form = document.getElementById('team-member-form');
  const errorEl = document.getElementById('team-form-error');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.innerHTML = '';
    const fd = new FormData(form);
    const data = {};
    fd.forEach(function (v, k) { data[k] = v; });

    // Parse lat/lng as numbers
    if (data.lat) data.lat = parseFloat(data.lat);
    if (data.lng) data.lng = parseFloat(data.lng);

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Zapisywanie...' : 'Dodawanie...';

    try {
      if (isEdit) {
        await api.updateUser(user.id, data);
        showToast('Zaktualizowano członka zespołu', 'success');
      } else {
        await api.createUser(data);
        showToast('Dodano członka zespołu', 'success');
      }
      closeModal();
      loadTeam(app);
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
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
