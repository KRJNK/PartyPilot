/* ── Conversation Detail View ─────────────────────────────────── */

import api from '../api.js';
import { navigate } from '../app.js';
import { showToast } from './pipeline.js';

/**
 * Render conversation detail view.
 * @param {HTMLElement} app
 * @param {string} id — conversation UUID
 */
export async function renderConversationDetail(app, id) {
  app.setAttribute('data-view', 'conversation-detail');

  if (!id) {
    navigate('#conversations');
    return;
  }

  app.innerHTML = `
<div class="page-header">
  <div>
    <h1>Szczegóły rozmowy</h1>
    <div class="subtitle" id="conv-detail-subtitle">Ładowanie...</div>
  </div>
  <button class="btn btn-secondary btn-sm" id="conv-back-btn">&larr; Wróć do listy</button>
</div>

<div id="conv-detail-loading"><div class="loading"><div class="spinner"></div><p>Ładowanie rozmowy...</p></div></div>
  `;

  document.getElementById('conv-back-btn').addEventListener('click', () => {
    navigate('#conversations');
  });

  await loadConversationDetail(app, id);
}

/* ── Load conversation data ─────────────────────────────────── */
async function loadConversationDetail(app, id) {
  const container = document.getElementById('conv-detail-loading');
  if (!container) return;

  try {
    const data = await api.getConversation(id);
    const conversation = data.conversation || data;
    renderDetail(app, conversation);
  } catch (err) {
    container.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
  }
}

/* ── Render detail ──────────────────────────────────────────── */
function renderDetail(app, conversation) {
  const subtitle = document.getElementById('conv-detail-subtitle');
  if (subtitle) {
    subtitle.textContent = 'Rozmowa z ' + (conversation.client_name || 'klientem');
  }

  const messages = conversation.messages || [];
  const status = conversation.status || 'active';
  const leadQualified = conversation.lead_qualified === true;
  const linkedBooking = conversation.booking || null;

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

  const container = document.getElementById('conv-detail-loading');
  if (!container) return;

  container.innerHTML = `
<div class="conversation-detail-layout">
  <!-- Chat transcript -->
  <div class="chat-transcript" id="chat-transcript">
    ${renderMessages(messages)}
  </div>

  <!-- Sidebar -->
  <div class="conversation-sidebar" id="conv-sidebar">
    <div class="sidebar-section">
      <h3>Informacje</h3>

      <div class="detail-field">
        <div class="detail-label">Klient</div>
        <div class="detail-value">${escapeHtml(conversation.client_name || 'Nieznany')}</div>
      </div>

      <div class="detail-field">
        <div class="detail-label">Email</div>
        <div class="detail-value">${escapeHtml(conversation.client_email || '—')}</div>
      </div>

      <div class="detail-field">
        <div class="detail-label">Telefon</div>
        <div class="detail-value">${escapeHtml(conversation.client_phone || '—')}</div>
      </div>

      <div class="detail-field">
        <div class="detail-label">Status</div>
        <div class="detail-value">
          <span class="badge ${statusClasses[status] || 'badge-closed'}">${statusLabels[status] || status}</span>
        </div>
      </div>

      <div class="detail-field">
        <div class="detail-label">Lead</div>
        <div class="detail-value">
          ${leadQualified
            ? '<span class="lead-badge">&#10003; Zakwalifikowany</span>'
            : '<span class="text-faint">—</span>'}
        </div>
      </div>

      <div class="detail-field">
        <div class="detail-label">Utworzono</div>
        <div class="detail-value">${formatDateTime(conversation.created_at)}</div>
      </div>

      <div class="detail-field">
        <div class="detail-label">Ostatnia aktywność</div>
        <div class="detail-value">${formatDateTime(conversation.updated_at)}</div>
      </div>
    </div>

    <!-- Booking summary (if linked) -->
    ${linkedBooking ? renderBookingSummary(linkedBooking) : ''}

    <!-- Actions -->
    <div class="sidebar-actions">
      ${status !== 'closed' ? `
        <button class="btn btn-danger btn-sm" id="conv-close-btn">Zamknij rozmowę</button>
      ` : ''}
      ${leadQualified && !linkedBooking ? `
        <button class="btn btn-primary btn-sm" id="conv-create-booking-btn">Utwórz rezerwację</button>
      ` : ''}
    </div>
  </div>
</div>
  `;

  // Scroll chat to bottom
  const chatEl = document.getElementById('chat-transcript');
  if (chatEl) {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // Bind close conversation
  const closeBtn = document.getElementById('conv-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      if (!confirm('Czy na pewno chcesz zamknąć tę rozmowę?')) return;
      closeBtn.disabled = true;
      closeBtn.textContent = 'Zamykanie...';
      try {
        await api.closeConversation(conversation.id);
        showToast('Rozmowa zamknięta', 'success');
        // Reload the detail
        await loadConversationDetail(app, conversation.id);
      } catch (err) {
        showToast('Błąd: ' + err.message, 'error');
        closeBtn.disabled = false;
        closeBtn.textContent = 'Zamknij rozmowę';
      }
    });
  }

  // Bind create booking
  const createBtn = document.getElementById('conv-create-booking-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      createBtn.textContent = 'Tworzenie...';
      try {
        const bookingData = {
          client_name: conversation.client_name || 'Lead z czatu',
          client_email: conversation.client_email || '',
          client_phone: conversation.client_phone || '',
          status: 'inquiry',
          source: 'ai_qualified',
        };
        const result = await api.createBooking(bookingData);
        showToast('Rezerwacja utworzona', 'success');
        // Reload to show booking card
        await loadConversationDetail(app, conversation.id);
      } catch (err) {
        showToast('Błąd: ' + err.message, 'error');
        createBtn.disabled = false;
        createBtn.textContent = 'Utwórz rezerwację';
      }
    });
  }
}

/* ── Render messages ────────────────────────────────────────── */
function renderMessages(messages) {
  if (!messages || messages.length === 0) {
    return '<div class="empty-state"><span class="empty-icon">&#128172;</span><p>Brak wiadomości</p></div>';
  }

  let html = '';
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    const time = formatTime(msg.created_at);
    const content = escapeHtml(msg.content || '');

    html += `
<div class="chat-message ${role}">
  <div class="chat-bubble">
    <div class="chat-text">${preserveLineBreaks(content)}</div>
    <div class="chat-time">${time}</div>
  </div>
</div>
    `;
  }

  return html;
}

/* ── Render booking summary card ────────────────────────────── */
function renderBookingSummary(booking) {
  const bookingId = booking.id || '';
  return `
<div class="booking-summary-card">
  <h3>Powiązana rezerwacja</h3>
  <div class="detail-field">
    <div class="detail-label">ID</div>
    <div class="detail-value">
      <a href="#bookings/${escapeHtml(bookingId)}">${escapeHtml(bookingId)}</a>
    </div>
  </div>
  <div class="detail-field">
    <div class="detail-label">Klient</div>
    <div class="detail-value">${escapeHtml(booking.client_name || '—')}</div>
  </div>
  <div class="detail-field">
    <div class="detail-label">Status</div>
    <div class="detail-value">
      <span class="badge badge-${escapeHtml(booking.status || 'inquiry')}">${escapeHtml(booking.status || 'inquiry')}</span>
    </div>
  </div>
  <div class="detail-field">
    <div class="detail-label">Data wydarzenia</div>
    <div class="detail-value">${escapeHtml(booking.event_date || '—')}</div>
  </div>
  <a href="#bookings/${escapeHtml(bookingId)}" class="btn btn-primary btn-sm" style="margin-top:0.75rem;">&#128196; Otwórz rezerwację</a>
</div>
  `;
}

/* ── Helpers ────────────────────────────────────────────────── */
function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return dateStr;
  }
}

function preserveLineBreaks(text) {
  return text.replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
