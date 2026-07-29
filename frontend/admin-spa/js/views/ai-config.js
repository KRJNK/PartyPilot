/* ── AI Config View ──────────────────────────────────────────── */

import api from '../api.js';
import { showToast } from './pipeline.js';

/**
 * Render AI assistant configuration view.
 * @param {HTMLElement} app
 */
export async function renderAIConfig(app) {
  app.setAttribute('data-view', 'ai-config');

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>AI Asystent</h1>
    <div class="subtitle">Skonfiguruj asystenta AI dla swoich klientów</div>
  </div>
</div>

<div class="card">
  <div class="card-header">Ustawienia asystenta</div>
  <div id="ai-config-form"><div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div></div>
</div>

<div class="card">
  <div class="card-header">Podgląd system prompt</div>
  <div id="ai-prompt-preview"><div class="loading"><div class="spinner"></div><p>Generowanie...</p></div></div>
</div>
  `;

  await loadAIConfig(app);
}

/* ── Load config ───────────────────────────────────────────── */
async function loadAIConfig(app) {
  const container = document.getElementById('ai-config-form');
  if (!container) return;

  try {
    const data = await api.getAIConfig();
    const config = data.config || data || {};
    renderConfigForm(container, config);
    updatePromptPreview(config);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/* ── Render form ───────────────────────────────────────────── */
function renderConfigForm(container, config) {
  const enabled = config.enabled === true;
  const tone = config.tone || 'friendly';
  const faqText = config.faq_text || '';
  const businessHours = config.business_hours || '';
  const escalationEmail = config.escalation_email || '';
  const autoCreate = config.auto_create_booking !== false;

  const toneOptions = [
    { value: 'friendly', label: 'Przyjazny' },
    { value: 'professional', label: 'Profesjonalny' },
    { value: 'casual', label: 'Na luzie' },
  ];

  container.innerHTML = `
<form id="ai-config-form-elem">
  <div class="ai-config-status">
    <span class="ai-config-status-text">AI asystent jest <strong class="${enabled ? 'text-success' : 'text-muted'}">${enabled ? 'aktywny' : 'nieaktywny'}</strong></span>
  </div>

  <div class="form-group">
    <label class="checkbox-label ai-toggle-label">
      <span class="ai-toggle">
        <input type="checkbox" id="ai-enabled" ${enabled ? 'checked' : ''}>
        <span class="ai-toggle-slider"></span>
      </span>
      Włącz asystenta AI
    </label>
  </div>

  <div class="form-group">
    <label>Ton odpowiedzi</label>
    <select class="form-control" id="ai-tone" name="tone">
      ${toneOptions.map(o => `<option value="${o.value}"${tone === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
    </select>
  </div>

  <div class="form-group">
    <label>Tekst FAQ</label>
    <textarea class="form-control ai-faq-textarea" id="ai-faq-text" name="faq_text" rows="10" placeholder="Wklej informacje o swoich usługach, cennik, politykę anulacji, FAQ...">${escapeHtml(faqText)}</textarea>
    <div class="form-helper">
      Wklej informacje o swoich usługach, cennik, politykę anulacji, FAQ. AI użyje tego do odpowiadania na pytania klientów.
    </div>
    <div class="char-counter" id="ai-faq-counter">${faqText.length} znaków</div>
  </div>

  <div class="form-group">
    <label>Godziny pracy</label>
    <input class="form-control" id="ai-hours" name="business_hours" value="${escapeHtml(businessHours)}" placeholder="Pon-Pt: 9-18, Sob: 10-14">
    <div class="form-helper">Format dowolny — np. "Pon-Pt: 9-18, Sob: 10-14"</div>
  </div>

  <div class="form-group">
    <label>Email do eskalacji</label>
    <input class="form-control" type="email" id="ai-escalation-email" name="escalation_email" value="${escapeHtml(escalationEmail)}" placeholder="kontakt@twojafirma.pl">
    <div class="form-helper">Zakwalifikowani leadzi zostaną wysłani na ten adres</div>
  </div>

  <div class="form-group">
    <label class="checkbox-label">
      <input type="checkbox" id="ai-auto-create" ${autoCreate ? 'checked' : ''}>
      Auto-twórz rezerwację
    </label>
    <div class="form-helper">Gdy lead zostanie zakwalifikowany, automatycznie utwórz rezerwację ze statusem "inquiry"</div>
  </div>

  <div id="ai-config-error"></div>

  <div class="form-actions">
    <button type="submit" class="btn btn-primary" id="ai-config-save-btn">Zapisz</button>
  </div>
</form>
  `;

  // Character counter
  const faqTextarea = document.getElementById('ai-faq-text');
  const counterEl = document.getElementById('ai-faq-counter');
  if (faqTextarea && counterEl) {
    const updateCounter = () => {
      counterEl.textContent = faqTextarea.value.length + ' znaków';
    };
    faqTextarea.addEventListener('input', updateCounter);
  }

  // Toggle status text
  const toggle = document.getElementById('ai-enabled');
  const statusText = container.querySelector('.ai-config-status-text strong');
  if (toggle && statusText) {
    toggle.addEventListener('change', () => {
      const active = toggle.checked;
      statusText.textContent = active ? 'aktywny' : 'nieaktywny';
      statusText.className = active ? 'text-success' : 'text-muted';
    });
  }

  // Submit handler
  const form = document.getElementById('ai-config-form-elem');
  const errorEl = document.getElementById('ai-config-error');
  const saveBtn = document.getElementById('ai-config-save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Zapisywanie...';

    const payload = {
      enabled: document.getElementById('ai-enabled').checked,
      tone: document.getElementById('ai-tone').value,
      faq_text: document.getElementById('ai-faq-text').value,
      business_hours: document.getElementById('ai-hours').value,
      escalation_email: document.getElementById('ai-escalation-email').value,
      auto_create_booking: document.getElementById('ai-auto-create').checked,
    };

    try {
      await api.updateAIConfig(payload);
      showToast('Konfiguracja AI zapisana pomyślnie', 'success');
      updatePromptPreview(payload);
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Zapisz';
    }
  });
}

/* ── Prompt Preview ────────────────────────────────────────── */
function updatePromptPreview(config) {
  const el = document.getElementById('ai-prompt-preview');
  if (!el) return;

  const enabled = config.enabled === true;
  const toneMap = { friendly: 'Przyjazny', professional: 'Profesjonalny', casual: 'Na luzie' };
  const toneLabel = toneMap[config.tone] || 'Przyjazny';
  const faqText = config.faq_text || '(brak)';
  const businessHours = config.business_hours || '(nie określono)';
  const escalationEmail = config.escalation_email || '(nie ustawiono)';
  const autoCreate = config.auto_create_booking !== false;

  const promptLines = [
    'Jesteś asystentem AI firmy weselnej. Twój ton: ' + toneLabel + '.',
    '',
    'Odpowiadasz na pytania klientów na podstawie poniższych informacji o firmie:',
    '',
    '--- FAQ / Informacje o firmie ---',
    faqText,
    '',
    '--- Godziny pracy ---',
    businessHours,
    '',
    '--- Zasady ---',
    '- Jeśli klient jest gotowy do rezerwacji, zakwalifikuj leada (lead_qualified = true).',
    '- Jeśli nie znasz odpowiedzi, poproś klienta o kontakt mailowy: ' + escalationEmail,
    '- Nie wymyślaj informacji — odpowiadaj tylko na podstawie podanych danych.',
    autoCreate ? '- Po zakwalifikowaniu leada, automatycznie utwórz rezerwację.' : '- Po zakwalifikowaniu leada, poinformuj zespół.',
  ];

  el.innerHTML = `
<div class="prompt-preview">
  <div class="prompt-preview-status">
    Status: <strong class="${enabled ? 'text-success' : 'text-muted'}">${enabled ? 'AKTYWNY' : 'NIEAKTYWNY'}</strong>
  </div>
  <pre class="prompt-preview-text">${escapeHtml(promptLines.join('\n'))}</pre>
</div>
  `;
}

/* ── Helper ────────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
