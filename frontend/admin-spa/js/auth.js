/* ── Custom JWT Authentication ─────────────────────────────── */

/*
 * Config — will be injected during deployment.
 * Hardcoded defaults for local development.
 */
const API_BASE = 'http://localhost:8000/api';

/**
 * Login with email and password.
 * POST /api/auth/login → { access_token, refresh_token, user }
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function login(email, password) {
  const url = API_BASE.replace(/\/+$/, '') + '/auth/login';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Błąd logowania');
  }

  const { access_token, refresh_token, user } = data;

  if (!access_token) {
    throw new Error('Nieprawidłowa odpowiedź autoryzacji');
  }

  sessionStorage.setItem('pp_access_token', access_token);
  if (refresh_token) {
    sessionStorage.setItem('pp_refresh_token', refresh_token);
  }
  sessionStorage.setItem('pp_user', JSON.stringify(user || {}));

  return data;
}

/**
 * Register a new tenant and owner user.
 * POST /api/auth/register → { access_token, refresh_token, user }
 * @param {string} company_name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function register(company_name, email, password) {
  const url = API_BASE.replace(/\/+$/, '') + '/auth/register';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name, email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Błąd rejestracji');
  }

  const { access_token, refresh_token, user } = data;

  if (!access_token) {
    throw new Error('Nieprawidłowa odpowiedź rejestracji');
  }

  sessionStorage.setItem('pp_access_token', access_token);
  if (refresh_token) {
    sessionStorage.setItem('pp_refresh_token', refresh_token);
  }
  sessionStorage.setItem('pp_user', JSON.stringify(user || {}));

  return data;
}

/**
 * Refresh the access token using the refresh token.
 * POST /api/auth/refresh → { access_token }
 * Updates sessionStorage with the new access token.
 * @returns {Promise<string>} the new access token
 */
export async function refresh() {
  const refreshToken = sessionStorage.getItem('pp_refresh_token');
  if (!refreshToken) {
    logout();
    throw new Error('Brak tokena odświeżania');
  }

  const url = API_BASE.replace(/\/+$/, '') + '/auth/refresh';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    logout();
    throw new Error(data.error || data.message || 'Sesja wygasła');
  }

  if (data.access_token) {
    sessionStorage.setItem('pp_access_token', data.access_token);
  }

  return data.access_token;
}

/**
 * Logout — clear session storage and redirect to login.
 */
export function logout() {
  sessionStorage.removeItem('pp_access_token');
  sessionStorage.removeItem('pp_refresh_token');
  sessionStorage.removeItem('pp_user');
  window.location.hash = '#login';
}

/**
 * Check if user is currently authenticated.
 * Decodes JWT to check expiry. If the access token is expired
 * but a refresh token exists, the user is still considered logged in
 * (actual refresh happens lazily in api.js on 401).
 * @returns {boolean}
 */
export function isLoggedIn() {
  const token = sessionStorage.getItem('pp_access_token');
  const user = sessionStorage.getItem('pp_user');
  if (!token || !user) return false;

  // Decode JWT to check expiry
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      // Access token expired — check if we have a refresh token
      const refreshToken = sessionStorage.getItem('pp_refresh_token');
      if (refreshToken) {
        // Still considered logged in; api.js will auto-refresh on 401
        return true;
      }
      // No refresh token — truly logged out
      logout();
      return false;
    }
  } catch (_) {
    // If we can't decode, still consider logged in (defensive)
  }

  return true;
}

/**
 * Get the current access token from sessionStorage.
 * @returns {string|null}
 */
export function getToken() {
  return sessionStorage.getItem('pp_access_token');
}

/**
 * Get the current user object from sessionStorage.
 * @returns {object|null}
 */
export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem('pp_user'));
  } catch (_) {
    return null;
  }
}

/**
 * Get the tenant_id from the stored user info.
 * @returns {string|null}
 */
export function getTenantId() {
  const user = getUser();
  return user ? user.tenant_id : null;
}
