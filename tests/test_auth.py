"""
Authentication endpoint tests.
"""

import requests


def test_login_admin_success(api_url, _wait_for_api):
    """POST /api/auth/login with valid admin credentials returns token."""
    r = requests.post(
        f"{api_url}/auth/login",
        json={"email": "admin@partypilot.pl", "password": "partypilot123"},
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    # Role is nested under "user"
    assert data["user"]["role"] == "owner"
    assert data["user"]["email"] == "admin@partypilot.pl"


def test_login_wrong_password(api_url):
    """POST /api/auth/login with wrong password returns 401."""
    r = requests.post(
        f"{api_url}/auth/login",
        json={"email": "admin@partypilot.pl", "password": "wrongpassword"},
        timeout=5,
    )
    assert r.status_code == 401


def test_login_nonexistent_user(api_url):
    """POST /api/auth/login with unknown email returns 401."""
    r = requests.post(
        f"{api_url}/auth/login",
        json={"email": "nobody@nowhere.com", "password": "whatever"},
        timeout=5,
    )
    assert r.status_code == 401


def test_login_missing_fields(api_url):
    """POST /api/auth/login with missing fields returns 400."""
    r = requests.post(
        f"{api_url}/auth/login",
        json={"email": "admin@partypilot.pl"},
        timeout=5,
    )
    assert r.status_code in (400, 422)


def test_me_with_valid_token(api_url, admin_headers):
    """GET /api/auth/me with valid token returns user info."""
    r = requests.get(f"{api_url}/auth/me", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    # API returns {"user": {...}, "tenant": {...}}
    user = data.get("user", data)
    assert user["email"] == "admin@partypilot.pl"
    assert user["role"] == "owner"
    assert "tenant_id" in user


def test_me_without_token(api_url):
    """GET /api/auth/me without token returns 401."""
    r = requests.get(f"{api_url}/auth/me", timeout=5)
    assert r.status_code == 401


def test_me_with_invalid_token(api_url):
    """GET /api/auth/me with garbage token returns 401."""
    r = requests.get(
        f"{api_url}/auth/me",
        headers={"Authorization": "Bearer garbage.token.here"},
        timeout=5,
    )
    assert r.status_code == 401


def test_refresh_token(api_url):
    """POST /api/auth/refresh with valid refresh_token returns new access_token."""
    # Login first to get refresh token
    r = requests.post(
        f"{api_url}/auth/login",
        json={"email": "admin@partypilot.pl", "password": "partypilot123"},
        timeout=5,
    )
    assert r.status_code == 200
    refresh_token = r.json().get("refresh_token")
    assert refresh_token

    # Use refresh token
    r2 = requests.post(
        f"{api_url}/auth/refresh",
        json={"refresh_token": refresh_token},
        timeout=5,
    )
    assert r2.status_code == 200
    assert "access_token" in r2.json()
