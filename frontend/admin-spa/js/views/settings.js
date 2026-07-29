/* ── Settings View (Tenant Profile + Packages) ───────────────── */

import api from '../api.js';
import { getState } from '../app.js';

/**
 * Render settings view with tenant profile form and package management.
 * @param {HTMLElement} app
 */
export async function renderSettings(app) {
  app.setAttribute('data-view', 'settings');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Ustawienia</h1>
    <div class="subtitle">Profil firmy i zarządzanie pakietami</div>
  </div>
</div>

<div class="card" id="settings-tenant-card">
  <div class="card-header">Profil firmy</div>
  <div id="settings-tenant-form"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></div>
</div>

<div class="card">
  <div class="card-header">
    <span>Pakiety</span>
    <button class="btn btn-primary btn-sm" id="pkg-add-btn" style="float:right;">+ Dodaj pakiet</button>
  </div>
  <div id="settings-packages"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></div>
</div>
  `;

  // Load data in parallel
  await Promise.all([
    loadTenantProfile(app),
    loadPackages(app),
  ]);

  // Bind "Add Package" button
  document.getElementById('pkg-add-btn').addEventListener('click', () => {
    showPackageModal(app, null);
  });
}

/* ── Tenant Profile ───────────────────────────────────────── */
async function loadTenantProfile(app) {
  const container = document.getElementById('settings-tenant-form');
  if (!container) return;

  try {
    const tenant = await api.getTenant();
    const state = getState();
    state.tenant = tenant;

    renderTenantForm(container, tenant);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function renderTenantForm(container, tenant) {
  container.innerHTML = `
<form id="tenant-form">
  <div class="form-row">
    <div class="form-group">
      <label>Nazwa firmy</label>
      <input class="form-control" name="company_name" value="${escapeHtml(tenant.company_name || '')}" placeholder="Nazwa Twojej firmy">
    </div>
    <div class="form-group">
      <label>Logo URL</label>
      <input class="form-control" name="logo_url" value="${escapeHtml(tenant.branding?.logo_url || '')}" placeholder="https://example.com/logo.png">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Kolor główny</label>
      <input class="form-control" type="color" name="primary_color" value="${escapeHtml(tenant.branding?.primary_color || '#c9a96e')}" style="height:42px;padding:4px;cursor:pointer;">
    </div>
    <div class="form-group">
      <label>Email kontaktowy</label>
      <input class="form-control" type="email" name="contact_email" value="${escapeHtml(tenant.contact_email || tenant.owner_email || '')}" placeholder="kontakt@firma.pl">
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Telefon kontaktowy</label>
      <input class="form-control" name="contact_phone" value="${escapeHtml(tenant.contact_phone || '')}" placeholder="+48 600 000 000">
    </div>
    <div class="form-group">
      <label>Status</label>
      <input class="form-control" value="${escapeHtml(tenant.status || '')}" disabled style="opacity:0.6;">
    </div>
  </div>
  <div class="form-group">
    <label>O firmie</label>
    <textarea class="form-control" name="about_text" rows="3" placeholder="Krótki opis firmy...">${escapeHtml(tenant.about_text || '')}</textarea>
  </div>
  <div id="tenant-form-error"></div>
  <div id="tenant-form-success"></div>
  <div class="form-actions">
    <button type="submit" class="btn btn-primary" id="tenant-save-btn">Zapisz ustawienia</button>
  </div>
</form>
  `;

  // Submit handler
  const form = document.getElementById('tenant-form');
  const errorEl = document.getElementById('tenant-form-error');
  const successEl = document.getElementById('tenant-form-success');
  const saveBtn = document.getElementById('tenant-save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';
    successEl.innerHTML = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Zapisywanie...';

    const fd = new FormData(form);
    const data = {};

    // Structure the fields correctly for the API
    data.company_name = fd.get('company_name') || '';
    data.about_text = fd.get('about_text') || '';
    data.contact_email = fd.get('contact_email') || '';
    data.contact_phone = fd.get('contact_phone') || '';
    data.branding = {
      logo_url: fd.get('logo_url') || '',
      primary_color: fd.get('primary_color') || '#c9a96e',
    };

    try {
      await api.updateTenant(data);
      successEl.innerHTML = '<div class="success-box">&#10003; Ustawienia zapisane pomyślnie.</div>';
      // Update state
      const state = getState();
      state.tenant = { ...(state.tenant || {}), ...data };
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Zapisz ustawienia';
    }
  });
}

/* ── Packages ──────────────────────────────────────────────── */
async function loadPackages(app) {
  const container = document.getElementById('settings-packages');
  if (!container) return;

  try {
    const data = await api.listPackages();
    const packages = data.packages || data || [];
    const list = Array.isArray(packages) ? packages : (Array.isArray(data) ? data : []);

    const state = getState();
    state.packages = list;

    renderPackages(container, list);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

function renderPackages(container, packages) {
  if (!packages || packages.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">&#128230;</span><p>Brak pakietów. Dodaj pierwszy pakiet.</p></div>';
    return;
  }

  let html = '';
  for (const pkg of packages) {
    const features = pkg.features && Array.isArray(pkg.features)
      ? pkg.features.join(', ')
      : (typeof pkg.features === 'string' ? pkg.features : '');
    html += `
<div class="package-item" data-pkg-id="${escapeHtml(pkg.id || pkg.package_id || '')}">
  <div class="package-info">
    <div class="package-name">${escapeHtml(pkg.name || 'Bez nazwy')}</div>
    <div class="package-meta">${escapeHtml(pkg.price || '')}${pkg.price && pkg.duration ? ' &middot; ' : ''}${escapeHtml(pkg.duration || '')}${features ? ' &middot; ' + escapeHtml(features) : ''}</div>
  </div>
  <div class="package-actions">
    <button class="btn btn-secondary btn-sm pkg-edit-btn" data-pkg-id="${escapeHtml(pkg.id || pkg.package_id || '')}">&#9998;</button>
    <button class="btn btn-danger btn-sm pkg-delete-btn" data-pkg-id="${escapeHtml(pkg.id || pkg.package_id || '')}">&#128465;</button>
  </div>
</div>
    `;
  }

  container.innerHTML = html;

  // Bind edit buttons
  container.querySelectorAll('.pkg-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pkgId = btn.getAttribute('data-pkg-id');
      const pkg = packages.find(p => (p.id || p.package_id) === pkgId);
      if (pkg) showPackageModal(container, pkg);
    });
  });

  // Bind delete buttons
  container.querySelectorAll('.pkg-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pkgId = btn.getAttribute('data-pkg-id');
      if (!pkgId) return;
      if (!confirm('Czy na pewno chcesz usunąć ten pakiet?')) return;
      try {
        await api.deletePackage(pkgId);
        // Reload packages
        await loadPackages(document.getElementById('settings-packages')?.closest('.card') ? null : null);
      } catch (err) {
        alert('Błąd: ' + err.message);
      }
    });
  });
}

/* ── Package Add/Edit Modal ───────────────────────────────── */
function showPackageModal(context, pkg) {
  const isEdit = !!pkg;
  const title = isEdit ? 'Edytuj pakiet' : 'Dodaj pakiet';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
<div class="modal-content">
  <button class="modal-close" id="pkg-modal-close">&times;</button>
  <h2>${title}</h2>
  <form id="pkg-modal-form">
    <div class="form-row">
      <div class="form-group">
        <label>Nazwa pakietu *</label>
        <input class="form-control" name="name" value="${escapeHtml(pkg?.name || '')}" required placeholder="np. Pakiet Standard">
      </div>
      <div class="form-group">
        <label>Cena</label>
        <input class="form-control" name="price" value="${escapeHtml(pkg?.price || '')}" placeholder="np. 2999 zł">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Czas trwania</label>
        <input class="form-control" name="duration" value="${escapeHtml(pkg?.duration || '')}" placeholder="np. 8 godzin">
      </div>
      <div class="form-group">
        <label>Typ zaliczki</label>
        <select class="form-control" name="deposit_type">
          <option value="">Brak</option>
          <option value="fixed"${pkg?.deposit_type === 'fixed' ? ' selected' : ''}>Stała kwota</option>
          <option value="percentage"${pkg?.deposit_type === 'percentage' ? ' selected' : ''}>Procent</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Kwota zaliczki</label>
        <input class="form-control" name="deposit_amount" value="${pkg?.deposit_amount || ''}" placeholder="np. 500">
      </div>
    </div>
    <div class="form-group">
      <label>Funkcje / opis (oddzielone przecinkami)</label>
      <textarea class="form-control" name="features" rows="2" placeholder="Konsultacje, Dekoracje, Catering...">${escapeHtml(Array.isArray(pkg?.features) ? pkg.features.join(', ') : (pkg?.features || ''))}</textarea>
    </div>
    <div id="pkg-modal-error"></div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="pkg-modal-save">${isEdit ? 'Zapisz zmiany' : 'Dodaj pakiet'}</button>
      <button type="button" class="btn btn-secondary" id="pkg-modal-cancel">Anuluj</button>
    </div>
  </form>
</div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('pkg-modal-close').addEventListener('click', close);
  document.getElementById('pkg-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const form = document.getElementById('pkg-modal-form');
  const errorEl = document.getElementById('pkg-modal-error');
  const saveBtn = document.getElementById('pkg-modal-save');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';
    saveBtn.disabled = true;
    saveBtn.textContent = isEdit ? 'Zapisywanie...' : 'Dodawanie...';

    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => { data[k] = v; });

    // Parse features from comma-separated string
    if (data.features) {
      data.features = data.features.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      data.features = [];
    }

    try {
      if (isEdit) {
        await api.updatePackage(pkg.id || pkg.package_id, data);
      } else {
        await api.createPackage(data);
      }
      close();
      // Reload packages section
      await loadPackages(document.getElementById('settings-packages')?.closest('.card') ? null : null);
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Zapisz zmiany' : 'Dodaj pakiet';
    }
  });
}

/* ── Helper ───────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
