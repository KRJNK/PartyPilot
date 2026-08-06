/* ── API Client ───────────────────────────────────────────── */

import * as auth from './auth.js';

/*
 * Config — will be injected during deployment.
 * Hardcoded defaults for local development.
 */
const API_BASE = 'http://localhost:8000/api';

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

  // Users (staff management)
  listUsers() {
    return apiCall('GET', 'admin/users');
  },
  createUser(data) {
    return apiCall('POST', 'admin/users', data);
  },
  updateUser(userId, data) {
    return apiCall('PUT', 'admin/users/' + encodeURIComponent(userId), data);
  },
  deleteUser(userId) {
    return apiCall('DELETE', 'admin/users/' + encodeURIComponent(userId));
  },
  updateUserLocation(userId, data) {
    return apiCall('PUT', 'admin/users/' + encodeURIComponent(userId) + '/location', data);
  },

  // Booking Assignments
  listAssignments(bookingId) {
    return apiCall('GET', 'admin/bookings/' + encodeURIComponent(bookingId) + '/assignments');
  },
  createAssignment(bookingId, data) {
    return apiCall('POST', 'admin/bookings/' + encodeURIComponent(bookingId) + '/assignments', data);
  },
  updateAssignment(bookingId, userId, data) {
    return apiCall('PUT', 'admin/bookings/' + encodeURIComponent(bookingId) + '/assignments/' + encodeURIComponent(userId), data);
  },
  deleteAssignment(bookingId, userId) {
    return apiCall('DELETE', 'admin/bookings/' + encodeURIComponent(bookingId) + '/assignments/' + encodeURIComponent(userId));
  },

  // Booking Files
  listFiles(bookingId) {
    return apiCall('GET', 'admin/bookings/' + encodeURIComponent(bookingId) + '/files');
  },
  uploadFile(bookingId, formData) {
    // This is a special case — multipart upload, not JSON
    const url = API_BASE.replace(/\/+$/, '') + '/admin/bookings/' + encodeURIComponent(bookingId) + '/files';
    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + auth.getToken(),
      },
      body: formData, // FormData object, browser sets Content-Type
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      return data;
    });
  },
  deleteFile(bookingId, fileId) {
    return apiCall('DELETE', 'admin/bookings/' + encodeURIComponent(bookingId) + '/files/' + encodeURIComponent(fileId));
  },

  // Services (add-on catalog)
  listServices() {
    return apiCall('GET', 'admin/services');
  },
  createService(data) {
    return apiCall('POST', 'admin/services', data);
  },
  updateService(id, data) {
    return apiCall('PUT', 'admin/services/' + encodeURIComponent(id), data);
  },
  deleteService(id) {
    return apiCall('DELETE', 'admin/services/' + encodeURIComponent(id));
  },

  // Package Services
  listPackageServices(packageId) {
    return apiCall('GET', 'admin/packages/' + encodeURIComponent(packageId) + '/services');
  },
  updatePackageServices(packageId, serviceIds) {
    return apiCall('PUT', 'admin/packages/' + encodeURIComponent(packageId) + '/services', { service_ids: serviceIds });
  },

  // Booking Services (add-ons)
  listBookingServices(bookingId) {
    return apiCall('GET', 'admin/bookings/' + encodeURIComponent(bookingId) + '/services');
  },
  addBookingService(bookingId, data) {
    return apiCall('POST', 'admin/bookings/' + encodeURIComponent(bookingId) + '/services', data);
  },
  updateBookingService(bookingId, serviceId, data) {
    return apiCall('PUT', 'admin/bookings/' + encodeURIComponent(bookingId) + '/services/' + encodeURIComponent(serviceId), data);
  },
  deleteBookingService(bookingId, serviceId) {
    return apiCall('DELETE', 'admin/bookings/' + encodeURIComponent(bookingId) + '/services/' + encodeURIComponent(serviceId));
  },

  // Staff Portal (/api/my/*)
  myBookings(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.upcoming) params.set('upcoming', 'true');
    const qs = params.toString();
    const path = 'my/bookings' + (qs ? '?' + qs : '');
    return apiCall('GET', path);
  },

  myBookingDetail(id) {
    return apiCall('GET', 'my/bookings/' + encodeURIComponent(id));
  },

  myCheckIn(bookingId) {
    return apiCall('POST', 'my/bookings/' + encodeURIComponent(bookingId) + '/check-in');
  },

  myProfile() {
    return apiCall('GET', 'my/profile');
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
