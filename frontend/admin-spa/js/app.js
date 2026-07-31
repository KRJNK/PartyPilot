/* ── PartyPilot Admin SPA — Main App ────────────────────── */

import * as auth from './auth.js';
import api from './api.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderBookings } from './views/bookings.js';
import { renderBookingDetail } from './views/booking-detail.js';
import { renderSettings } from './views/settings.js';
import { renderCalendar } from './views/calendar.js';
import { renderPipeline } from './views/pipeline.js';
import { renderClients } from './views/clients.js';
import { renderAIConfig } from './views/ai-config.js';
import { renderConversations } from './views/conversations.js';
import { renderConversationDetail } from './views/conversation-detail.js';
import { renderTeam } from './views/team.js';
import { renderServices } from './views/services.js';

/* ── State ────────────────────────────────────────────────── */
const state = {
  currentView: null,
  currentParams: null,
  currentQuery: {},
  user: auth.getUser(),
  bookings: [],
  packages: [],
  tenant: null,
};

/* ── Helpers ──────────────────────────────────────────────── */
function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
function qsa(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
function htmlTo(el, html) { el.innerHTML = html; }

export function getState() { return state; }

/* ── Router ───────────────────────────────────────────────── */
const routes = {};

/**
 * Navigate to a hash route.
 * @param {string} hash — e.g. '#dashboard' or '#bookings/BK-001'
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Match current hash against registered routes and invoke handler.
 */
function handleRoute() {
  let hash = window.location.hash || '#dashboard';
  let fullPath = hash.replace(/^#/, '');
  let path = fullPath.split('?')[0];

  // Parse query params from hash
  const queryString = fullPath.split('?')[1] || '';
  const queryParams = {};
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const idx = pair.indexOf('=');
      if (idx === -1) {
        queryParams[decodeURIComponent(pair)] = '';
      } else {
        queryParams[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
      }
    });
  }

  // Auth guard
  if (!auth.isLoggedIn() && path !== 'login') {
    navigate('#login');
    return;
  }

  // Refresh user from storage
  state.user = auth.getUser();
  state.currentQuery = queryParams;

  let matched = false;
  for (const pattern in routes) {
    const regex = new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$');
    const match = path.match(regex);
    if (match) {
      const params = match.slice(1);
      matched = true;
      // Call the view renderer with route params + query params
      routes[pattern](...params, queryParams);
      break;
    }
  }

  if (!matched) {
    // Default to dashboard
    renderView('dashboard');
  }
}

/**
 * Register a route pattern with a handler function.
 * @param {string} pattern — e.g. 'bookings/:id'
 * @param {Function} handler — receives matched segments as arguments
 */
function route(pattern, handler) {
  routes[pattern] = handler;
}

/* ── View Rendering ───────────────────────────────────────── */
/**
 * Render a named view into the app container.
 * @param {string} viewName — view identifier
 * @param {*} params — optional data passed to the view
 */
function renderView(viewName, ...params) {
  const app = document.getElementById('app');
  if (!app) return;

  state.currentView = viewName;
  state.currentParams = params;

  const renderers = {
    login: () => renderLogin(app),
    dashboard: () => renderDashboard(app),
    bookings: () => renderBookings(app),
    'booking-detail': () => renderBookingDetail(app, ...params),
    calendar: () => renderCalendar(app),
    pipeline: () => renderPipeline(app),
    clients: () => renderClients(app),
    team: () => renderTeam(app),
    services: () => renderServices(app),
    settings: () => renderSettings(app),
    'ai-config': () => renderAIConfig(app),
    conversations: () => renderConversations(app, state.currentQuery),
    'conversation-detail': () => renderConversationDetail(app, ...params),
  };

  const renderFn = renderers[viewName];
  if (renderFn) {
    renderFn();
  } else {
    htmlTo(app, '<div class="loading"><div class="spinner"></div><p>Ładowanie...</p></div>');
  }

  updateSidebar();
}

/* ── Sidebar ──────────────────────────────────────────────── */
function updateSidebar() {
  const emailEl = document.getElementById('sidebar-user-email');
  if (emailEl && state.user) {
    emailEl.textContent = state.user.email || '';
  }

  const activeView = state.currentView || '';
  qsa('.sidebar-nav a').forEach((a) => {
    const nav = a.getAttribute('data-nav');
    a.classList.toggle('active', nav === activeView);
  });
}

/* ── Init ─────────────────────────────────────────────────── */
function init() {
  const root = document.getElementById('root');
  if (!root) return;

  // Build shell: sidebar + main content
  const shellHtml = `
<button class="hamburger" id="hamburger" aria-label="Menu">&#9776;</button>
<aside class="sidebar" id="sidebar">
  <div class="sidebar-logo">PartyPilot</div>
  <div class="sidebar-sub">Panel administracyjny</div>
  <nav class="sidebar-nav">
    <div class="nav-section">Puls</div>
    <a href="#dashboard" data-nav="dashboard"><span class="nav-icon">📊</span> Pulpit</a>

    <div class="nav-section">Rezerwacje</div>
    <a href="#bookings" data-nav="bookings"><span class="nav-icon">📋</span> Rezerwacje</a>
    <a href="#pipeline" data-nav="pipeline"><span class="nav-icon">🗂️</span> Tablica</a>
    <a href="#calendar" data-nav="calendar"><span class="nav-icon">📅</span> Kalendarz</a>
    <a href="#clients" data-nav="clients"><span class="nav-icon">👥</span> Klienci</a>

    <div class="nav-section">Zespół</div>
    <a href="#team" data-nav="team"><span class="nav-icon">👤</span> Zespół</a>
    <a href="#services" data-nav="services"><span class="nav-icon">🎵</span> Usługi</a>

    <div class="nav-section">Asystent AI</div>
    <a href="#ai-config" data-nav="ai-config"><span class="nav-icon">🤖</span> Asystent AI</a>
    <a href="#conversations" data-nav="conversations"><span class="nav-icon">💬</span> Rozmowy</a>

    <div class="nav-section">Konfiguracja</div>
    <a href="#settings" data-nav="settings"><span class="nav-icon">⚙️</span> Ustawienia</a>
  </nav>
  <div class="sidebar-footer">
    <span class="user-email" id="sidebar-user-email"></span>
    <button class="logout-link" id="logout-btn">&#9654; Wyloguj</button>
  </div>
</aside>
<main class="main-content" id="app" data-view=""></main>
`;

  htmlTo(root, shellHtml);

  // Hamburger toggle
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Logout handler
  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    auth.logout();
  });

  // Register routes
  route('login', () => renderView('login'));
  route('dashboard', () => renderView('dashboard'));
  route('bookings', () => renderView('bookings'));
  route('bookings/:id', (id) => renderView('booking-detail', id));
  route('calendar', () => renderView('calendar'));
  route('pipeline', () => renderView('pipeline'));
  route('clients', () => renderView('clients'));
  route('ai-config', () => renderView('ai-config'));
  route('conversations', () => renderView('conversations'));
  route('conversations/:id', (id) => renderView('conversation-detail', id));
  route('team', () => renderView('team'));
  route('services', () => renderView('services'));
  route('settings', () => renderView('settings'));

  // Listen for hash changes
  window.addEventListener('hashchange', handleRoute);

  // Initial route
  handleRoute();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
