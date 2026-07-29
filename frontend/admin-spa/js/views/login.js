/* ── Login View ────────────────────────────────────────────── */

import * as auth from '../auth.js';
import { navigate } from '../app.js';

/**
 * Render the login / register forms and attach event listeners.
 * @param {HTMLElement} app — the #app container
 */
export function renderLogin(app) {
  app.setAttribute('data-view', 'login');

  app.innerHTML = `
<div class="login-page">
  <div class="login-card">
    <h1>Wedding <span class="accent">SaaS</span></h1>
    <p class="login-subtitle">Panel administracyjny</p>
    <div id="auth-error"></div>

    <!-- Login form -->
    <form id="login-form">
      <div class="form-group">
        <label for="login-email">Email</label>
        <input class="form-control" type="email" id="login-email" placeholder="email@domena.pl" required autocomplete="email">
      </div>
      <div class="form-group">
        <label for="login-password">Hasło</label>
        <input class="form-control" type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-lg" id="login-submit-btn">Zaloguj się</button>
      </div>
    </form>

    <!-- Register form (hidden by default) -->
    <form id="register-form" style="display:none;">
      <div class="form-group">
        <label for="reg-company">Nazwa firmy</label>
        <input class="form-control" type="text" id="reg-company" placeholder="Nazwa Twojej firmy" required>
      </div>
      <div class="form-group">
        <label for="reg-email">Email</label>
        <input class="form-control" type="email" id="reg-email" placeholder="email@domena.pl" required autocomplete="email">
      </div>
      <div class="form-group">
        <label for="reg-password">Hasło</label>
        <input class="form-control" type="password" id="reg-password" placeholder="••••••••" required autocomplete="new-password">
      </div>
      <div class="form-group">
        <label for="reg-confirm">Potwierdź hasło</label>
        <input class="form-control" type="password" id="reg-confirm" placeholder="••••••••" required autocomplete="new-password">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-lg" id="register-submit-btn">Zarejestruj się</button>
      </div>
    </form>

    <!-- Toggle link -->
    <div class="auth-toggle">
      <span id="auth-toggle-text">Nie masz konta?</span>
      <a href="#" id="auth-toggle-link">Zarejestruj się</a>
    </div>
  </div>
</div>
  `;

  // ── State ──────────────────────────────────────────────
  let showRegister = false;

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorEl = document.getElementById('auth-error');
  const toggleLink = document.getElementById('auth-toggle-link');
  const toggleText = document.getElementById('auth-toggle-text');

  // ── Toggle between forms ───────────────────────────────
  function toggleForms() {
    showRegister = !showRegister;
    loginForm.style.display = showRegister ? 'none' : '';
    registerForm.style.display = showRegister ? '' : 'none';
    toggleText.textContent = showRegister ? 'Masz już konto?' : 'Nie masz konta?';
    toggleLink.textContent = showRegister ? 'Zaloguj się' : 'Zarejestruj się';
    errorEl.innerHTML = '';
  }

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleForms();
  });

  // ── Login submit ───────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      errorEl.innerHTML = '<div class="error-box">Wprowadź email i hasło.</div>';
      return;
    }

    const submitBtn = document.getElementById('login-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logowanie...';

    try {
      await auth.login(email, password);
      navigate('#dashboard');
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Zaloguj się';
    }
  });

  // ── Register submit ────────────────────────────────────
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.innerHTML = '';

    const companyName = document.getElementById('reg-company').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!companyName || !email || !password || !confirm) {
      errorEl.innerHTML = '<div class="error-box">Wypełnij wszystkie pola.</div>';
      return;
    }

    if (password !== confirm) {
      errorEl.innerHTML = '<div class="error-box">Hasła nie są zgodne.</div>';
      return;
    }

    if (password.length < 6) {
      errorEl.innerHTML = '<div class="error-box">Hasło musi mieć co najmniej 6 znaków.</div>';
      return;
    }

    const submitBtn = document.getElementById('register-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Rejestracja...';

    try {
      await auth.register(companyName, email, password);
      navigate('#dashboard');
    } catch (err) {
      errorEl.innerHTML = '<div class="error-box">' + escapeHtml(err.message) + '</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Zarejestruj się';
    }
  });
}

/* ── Inline helper (self-contained) ───────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}
