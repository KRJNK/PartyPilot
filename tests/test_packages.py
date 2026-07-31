"""
Packages CRUD tests.
"""

import requests


def test_list_packages(api_url, admin_headers):
    """GET /api/admin/packages returns list of packages."""
    r = requests.get(f"{api_url}/admin/packages", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    # API returns {"packages": [...], "count": N}
    pkgs = data.get("packages", data if isinstance(data, list) else [])
    assert isinstance(pkgs, list)
    assert len(pkgs) > 0  # seeded data


def test_list_packages_has_expected_fields(api_url, admin_headers):
    """Each package should have core fields."""
    r = requests.get(f"{api_url}/admin/packages", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    pkgs = data.get("packages", data if isinstance(data, list) else [])
    if pkgs:
        p = pkgs[0]
        for field in ("id", "name", "price"):
            assert field in p, f"Missing field '{field}' in package: {p}"


def test_create_package(api_url, admin_headers, make_package):
    """POST /api/admin/packages creates a new package."""
    pkg = make_package(name="Test Create Pkg")
    assert "id" in pkg
    assert pkg["name"] == "Test Create Pkg"


def test_update_package(api_url, admin_headers, make_package):
    """PUT /api/admin/packages/{id} updates package fields."""
    pkg = make_package(name="Before Update Pkg", price=1000)
    pid = pkg["id"]
    r = requests.put(
        f"{api_url}/admin/packages/{pid}",
        headers=admin_headers,
        json={"name": "After Update Pkg", "price": 2000},
        timeout=5,
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["name"] == "After Update Pkg"
    assert float(updated["price"]) == 2000.0


def test_delete_package(api_url, admin_headers, make_package):
    """DELETE /api/admin/packages/{id} removes the package."""
    pkg = make_package(name="To Be Deleted Pkg")
    pid = pkg["id"]
    r = requests.delete(
        f"{api_url}/admin/packages/{pid}",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    # Verify it's gone
    r2 = requests.get(f"{api_url}/admin/packages", headers=admin_headers, timeout=5)
    assert r2.status_code == 200
    data = r2.json()
    pkgs = data.get("packages", data if isinstance(data, list) else [])
    ids = [p.get("id") for p in pkgs]
    assert pid not in ids


def test_create_package_missing_fields(api_url, admin_headers):
    """POST /api/admin/packages with missing required fields returns 400."""
    r = requests.post(
        f"{api_url}/admin/packages",
        headers=admin_headers,
        json={"description": "no name"},
        timeout=5,
    )
    assert r.status_code in (400, 422)
