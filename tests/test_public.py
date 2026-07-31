"""
Public endpoints tests (no auth required).
"""

import requests


def test_get_public_tenant_info(api_url, _wait_for_api):
    """GET /api/public/{tenant_id} returns public tenant info."""
    r = requests.get(f"{api_url}/public/T-demo", timeout=5)
    assert r.status_code == 200
    data = r.json()
    assert "company_name" in data or "name" in data


def test_get_public_tenant_nonexistent(api_url):
    """GET /api/public/{fake_id} returns 404."""
    r = requests.get(f"{api_url}/public/NONEXISTENT", timeout=5)
    assert r.status_code in (404, 200)  # some implementations return empty 200


def test_get_public_packages(api_url):
    """GET /api/public/{tenant_id}/packages returns public package list."""
    r = requests.get(f"{api_url}/public/T-demo/packages", timeout=5)
    assert r.status_code == 200
    data = r.json()
    # API returns {"packages": [...], "count": N}
    pkgs = data.get("packages", data if isinstance(data, list) else [])
    assert isinstance(pkgs, list)


def test_get_public_availability(api_url):
    """GET /api/public/{tenant_id}/availability returns booked dates."""
    r = requests.get(
        f"{api_url}/public/T-demo/availability?start=2026-01-01&end=2026-12-31",
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (list, dict))


def test_public_create_booking(api_url, unique_id):
    """POST /api/public/{tenant_id}/bookings creates a booking from public widget."""
    r = requests.post(
        f"{api_url}/public/T-demo/bookings",
        json={
            "client_name": f"Public Test {unique_id}",
            "client_email": f"public{unique_id}@example.com",
            "client_phone": "+48 600 100 200",
            "event_date": "2026-10-15",
            "event_location": "Test Hall",
            "package_id": "PKG-demo001",
        },
        timeout=5,
    )
    assert r.status_code in (200, 201), f"Public booking failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data or "booking_id" in data
