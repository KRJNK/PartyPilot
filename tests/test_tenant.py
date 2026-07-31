"""
Tenant profile tests.
"""

import requests


def test_get_tenant(api_url, admin_headers):
    """GET /api/admin/tenant returns tenant profile."""
    r = requests.get(f"{api_url}/admin/tenant", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert "company_name" in data


def test_update_tenant(api_url, admin_headers):
    """PUT /api/admin/tenant updates tenant branding fields."""
    # Get current
    r = requests.get(f"{api_url}/admin/tenant", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    original = r.json()

    # Update
    new_name = "Updated Company Name"
    r2 = requests.put(
        f"{api_url}/admin/tenant",
        headers=admin_headers,
        json={"company_name": new_name},
        timeout=5,
    )
    assert r2.status_code == 200
    updated = r2.json()
    assert updated["company_name"] == new_name

    # Restore original
    r3 = requests.put(
        f"{api_url}/admin/tenant",
        headers=admin_headers,
        json={"company_name": original["company_name"]},
        timeout=5,
    )
    assert r3.status_code == 200
