/* ── API Client ───────────────────────────────────────────── */

import * as auth from './auth.js';

/*
 * Config — will be injected during deployment.
 * Hardcoded defaults for local development.
 */
const API_BASE = 'https://api.weddingsaas.pl/api';

/**
 * Generic fetch wrapper.
 * - Adds Authorization: Bearer {token} from auth.getToken()
 * - Adds Content-Type: application/json
 * - Returns parsed JSON
 * - Throws on error
 * - 401 → try token refresh once, retry request, then redirect to login
 */
export async function apiCall(method, path, body) {
  const url = API_BASE.replace(/\/+$/, '') + '/' + path.replace(/^\//, '');

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const token = auth.getToken();
  if (token) {
    opts.headers['Authorization'] = 'Bearer ' + token;
  }

  if (body !== undefined && body !== null) {
    opts.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, opts);
  } catch (netErr) {
    throw new Error('Błąd sieci: ' + netErr.message);
  }

  // Handle 401 — try token refresh, then retry
  if (response.status === 401) {
    try {
      await auth.refresh();
      const newToken = auth.getToken();
      if (newToken) {
        opts.headers['Authorization'] = 'Bearer ' + newToken;
      }
      response = await fetch(url, opts);
    } catch (_) {
      auth.logout();
      throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    }

    // If still 401 after refresh, redirect to login
    if (response.status === 401) {
      auth.logout();
      throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    }
  }

  // Try to parse JSON body
  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error('Odpowiedź serwera: HTTP ' + response.status);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'HTTP ' + response.status);
  }

  return data;
}

/* ── API Methods ──────────────────────────────────────────── */

const api = {
  // Auth
  login(email, password) {
    return auth.login(email, password);
  },

  register(company_name, email, password) {
    return auth.register(company_name, email, password);
  },

  refreshToken() {
    return auth.refresh();
  },

  getMe() {
    return apiCall('GET', 'auth/me');
  },

  // Bookings
  listBookings(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    const qs = params.toString();
    const path = 'admin/bookings' + (qs ? '?' + qs : '');
    return apiCall('GET', path);
  },

  getBooking(id) {
    return apiCall('GET', 'admin/bookings/' + encodeURIComponent(id));
  },

  updateBooking(id, data) {
    return apiCall('PUT', 'admin/bookings/' + encodeURIComponent(id), data);
  },

  createBooking(data) {
    return apiCall('POST', 'admin/bookings', data);
  },

  cancelBooking(id) {
    return apiCall('POST', 'admin/bookings/' + encodeURIComponent(id) + '/cancel');
  },

  deleteBooking(id) {
    return apiCall('DELETE', 'admin/bookings/' + encodeURIComponent(id));
  },

  markDepositPaid(id) {
    return apiCall('POST', 'admin/bookings/' + encodeURIComponent(id) + '/mark-deposit-paid');
  },

  // Packages
  listPackages() {
    return apiCall('GET', 'admin/packages');
  },

  createPackage(data) {
    return apiCall('POST', 'admin/packages', data);
  },

  updatePackage(id, data) {
    return apiCall('PUT', 'admin/packages/' + encodeURIComponent(id), data);
  },

  deletePackage(id) {
    return apiCall('DELETE', 'admin/packages/' + encodeURIComponent(id));
  },

  // Calendar
  getCalendar(dateFrom, dateTo) {
    return apiCall('GET', 'admin/calendar?date_from=' + encodeURIComponent(dateFrom) + '&date_to=' + encodeURIComponent(dateTo));
  },

  // Pipeline
  getPipeline() {
    return apiCall('GET', 'admin/bookings/pipeline');
  },

  // Clients
  getClients(search) {
    return apiCall('GET', 'admin/clients' + (search ? '?search=' + encodeURIComponent(search) : ''));
  },

  exportClients() {
    return apiCall('GET', 'admin/clients/export');
  },

  // Contract
  generateContract(bookingId) {
    return apiCall('POST', 'admin/bookings/' + encodeURIComponent(bookingId) + '/contract');
  },

  getContract(bookingId) {
    return apiCall('GET', 'admin/bookings/' + encodeURIComponent(bookingId) + '/contract');
  },

  // AI Config
  getAIConfig() {
    return apiCall('GET', 'admin/ai-config');
  },

  updateAIConfig(data) {
    return apiCall('PUT', 'admin/ai-config', data);
  },

  getConversations(status) {
    const path = 'admin/conversations' + (status ? '?status=' + encodeURIComponent(status) : '');
    return apiCall('GET', path);
  },

  getConversation(id) {
    return apiCall('GET', 'admin/conversations/' + encodeURIComponent(id));
  },

  closeConversation(id) {
    return apiCall('POST', 'admin/conversations/' + encodeURIComponent(id) + '/close');
  },

  // Tenant
  getTenant() {
    return apiCall('GET', 'admin/tenant');
  },

  updateTenant(data) {
    return apiCall('PUT', 'admin/tenant', data);
  },
};

export default api;
