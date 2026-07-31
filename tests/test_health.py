"""
Health check endpoint tests.
"""

import requests


def test_health_returns_200(api_url, _wait_for_api):
    """GET /api/health should return 200 with status info."""
    r = requests.get(f"{api_url}/health", timeout=5)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


def test_health_no_auth_required(api_url):
    """Health endpoint should work without Authorization header."""
    r = requests.get(f"{api_url}/health", timeout=5)
    assert r.status_code == 200


def test_unknown_route_returns_404(api_url, admin_headers):
    """Unknown API route should return 404."""
    r = requests.get(f"{api_url}/admin/nonexistent", headers=admin_headers, timeout=5)
    assert r.status_code == 404


def test_admin_without_token_returns_401(api_url):
    """Admin endpoints without auth token should return 401."""
    r = requests.get(f"{api_url}/admin/bookings", timeout=5)
    assert r.status_code == 401
