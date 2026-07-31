"""
Shared fixtures for PartyPilot API integration tests.

Tests run against the local dev server (dev_server.py on port 8000).
Start it before running tests:
    systemd-run --user --unit=partypilot-api --working-directory=<repo> python3 -u dev_server.py
"""

import json
import os
import time

import pytest
import requests

# ── Configuration ────────────────────────────────────────────────

API_BASE = os.environ.get("API_BASE", "http://localhost:8000")
API_URL = f"{API_BASE}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@partypilot.pl")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "partypilot123")
TENANT_ID = os.environ.get("TENANT_ID", "T-demo")


# ── Session-scoped fixtures ──────────────────────────────────────


@pytest.fixture(scope="session")
def api_url():
    """Base API URL (without trailing slash)."""
    return API_URL


@pytest.fixture(scope="session")
def _wait_for_api():
    """Ensure the API server is up before tests start."""
    for _ in range(30):
        try:
            r = requests.get(f"{API_URL}/health", timeout=2)
            if r.status_code == 200:
                return
        except requests.ConnectionError:
            pass
        time.sleep(1)
    pytest.fail(f"API server not reachable at {API_URL} after 30s")


@pytest.fixture(scope="session")
def admin_token(_wait_for_api):
    """Login as admin and return JWT access token."""
    r = requests.post(
        f"{API_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=5,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data, f"No access_token in response: {data}"
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    """Authorization headers for admin requests."""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_user(admin_headers):
    """Return admin user info from /auth/me."""
    r = requests.get(f"{API_URL}/auth/me", headers=admin_headers, timeout=5)
    assert r.status_code == 200, f"Failed to get admin user: {r.text}"
    return r.json()


# ── Function-scoped fixtures ─────────────────────────────────────


@pytest.fixture
def unique_id():
    """Generate a unique suffix for test data (timestamp-based)."""
    return str(int(time.time() * 1000))[-8:]


@pytest.fixture
def make_booking(admin_headers, unique_id):
    """Factory: create a booking and return its data. Cleans up after test."""
    created_ids = []

    def _create(**overrides):
        defaults = {
            "client_name": f"Test Client {unique_id}",
            "client_email": f"test{unique_id}@example.com",
            "client_phone": "+48 600 000 000",
            "event_date": "2026-12-31",
            "event_time_start": "20:00",
            "event_time_end": "02:00",
            "event_location": "Test Venue, Warsaw",
            "package_id": "PKG-demo001",
            "package_final_price": 2500,
            "deposit_amount": 500,
            "notes": "Automated test booking",
        }
        defaults.update(overrides)
        r = requests.post(
            f"{API_URL}/admin/bookings",
            headers=admin_headers,
            json=defaults,
            timeout=5,
        )
        assert r.status_code in (200, 201), f"Create booking failed: {r.status_code} {r.text}"
        booking = r.json()
        if "id" in booking:
            created_ids.append(booking["id"])
        return booking

    yield _create

    # Cleanup: delete created bookings
    for bid in created_ids:
        try:
            requests.delete(
                f"{API_URL}/admin/bookings/{bid}",
                headers=admin_headers,
                timeout=5,
            )
        except Exception:
            pass


@pytest.fixture
def make_package(admin_headers, unique_id):
    """Factory: create a package and return its data. Cleans up after test."""
    created_ids = []

    def _create(**overrides):
        defaults = {
            "name": f"Test Package {unique_id}",
            "description": "Automated test package",
            "price": 3000,
            "features": ["DJ", "Lights", "Sound system"],
        }
        defaults.update(overrides)
        r = requests.post(
            f"{API_URL}/admin/packages",
            headers=admin_headers,
            json=defaults,
            timeout=5,
        )
        assert r.status_code in (200, 201), f"Create package failed: {r.status_code} {r.text}"
        pkg = r.json()
        if "id" in pkg:
            created_ids.append(pkg["id"])
        return pkg

    yield _create

    for pid in created_ids:
        try:
            requests.delete(
                f"{API_URL}/admin/packages/{pid}",
                headers=admin_headers,
                timeout=5,
            )
        except Exception:
            pass


@pytest.fixture
def make_user(admin_headers, unique_id):
    """Factory: create a team member user. Cleans up after test."""
    created_ids = []

    def _create(**overrides):
        defaults = {
            "email": f"testuser{unique_id}@partypilot.pl",
            "password": "TestPass123!",
            "role": "member",
            "location": "Warsaw",
        }
        defaults.update(overrides)
        r = requests.post(
            f"{API_URL}/admin/users",
            headers=admin_headers,
            json=defaults,
            timeout=5,
        )
        assert r.status_code in (200, 201), f"Create user failed: {r.status_code} {r.text}"
        user = r.json()
        # API returns {"user": {...}}, extract the user object
        if "user" in user and isinstance(user["user"], dict):
            user = user["user"]
        if "id" in user:
            created_ids.append(user["id"])
        return user

    yield _create

    for uid in created_ids:
        try:
            requests.delete(
                f"{API_URL}/admin/users/{uid}",
                headers=admin_headers,
                timeout=5,
            )
        except Exception:
            pass
