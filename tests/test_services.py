"""
Services (add-on catalog) CRUD tests.
"""

import requests


def test_list_services(api_url, admin_headers):
    """GET /api/admin/services returns list of services."""
    r = requests.get(f"{api_url}/admin/services", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    services = data.get("services", data if isinstance(data, list) else [])
    assert isinstance(services, list)
    assert len(services) > 0  # seeded data


def test_list_services_has_expected_fields(api_url, admin_headers):
    """Each service should have core fields."""
    r = requests.get(f"{api_url}/admin/services", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    services = data.get("services", data if isinstance(data, list) else [])
    if services:
        s = services[0]
        for field in ("id", "name", "base_price", "category"):
            assert field in s, f"Missing field '{field}' in service: {s}"


def test_create_service(api_url, admin_headers, unique_id):
    """POST /api/admin/services creates a new service."""
    r = requests.post(
        f"{api_url}/admin/services",
        headers=admin_headers,
        json={
            "name": f"Test Service {unique_id}",
            "description": "Automated test",
            "base_price": 500,
            "category": "Muzyka",
        },
        timeout=5,
    )
    assert r.status_code in (200, 201), f"Create failed: {r.text}"
    svc = r.json().get("service", r.json())
    assert "id" in svc
    assert svc["name"] == f"Test Service {unique_id}"
    assert float(svc["base_price"]) == 500.0
    # Cleanup
    requests.delete(f"{api_url}/admin/services/{svc['id']}", headers=admin_headers, timeout=5)


def test_update_service(api_url, admin_headers, unique_id):
    """PUT /api/admin/services/{id} updates service fields."""
    # Create
    r = requests.post(
        f"{api_url}/admin/services",
        headers=admin_headers,
        json={"name": "Before Update", "base_price": 300, "category": "Efekty"},
        timeout=5,
    )
    svc = r.json().get("service", r.json())
    sid = svc["id"]
    # Update
    r2 = requests.put(
        f"{api_url}/admin/services/{sid}",
        headers=admin_headers,
        json={"base_price": 450, "description": "Updated desc"},
        timeout=5,
    )
    assert r2.status_code == 200
    updated = r2.json().get("service", r2.json())
    assert float(updated["base_price"]) == 450.0
    assert updated["description"] == "Updated desc"
    # Cleanup
    requests.delete(f"{api_url}/admin/services/{sid}", headers=admin_headers, timeout=5)


def test_delete_service_hard(api_url, admin_headers, unique_id):
    """DELETE /api/admin/services/{id} hard-deletes when no booking refs."""
    r = requests.post(
        f"{api_url}/admin/services",
        headers=admin_headers,
        json={"name": "To Delete", "base_price": 100},
        timeout=5,
    )
    svc = r.json().get("service", r.json())
    sid = svc["id"]
    r2 = requests.delete(f"{api_url}/admin/services/{sid}", headers=admin_headers, timeout=5)
    assert r2.status_code == 200
    # Verify gone
    r3 = requests.get(f"{api_url}/admin/services", headers=admin_headers, timeout=5)
    ids = [s["id"] for s in r3.json().get("services", [])]
    assert sid not in ids


def test_create_service_missing_name(api_url, admin_headers):
    """POST /api/admin/services without name returns 400."""
    r = requests.post(
        f"{api_url}/admin/services",
        headers=admin_headers,
        json={"base_price": 100},
        timeout=5,
    )
    assert r.status_code in (400, 422)


# ── Package ↔ Service linking ──────────────────────────────────


def test_list_package_services(api_url, admin_headers):
    """GET /api/admin/packages/{id}/services returns linked services."""
    r = requests.get(
        f"{api_url}/admin/packages/PKG-demo002/services",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    services = data.get("services", data if isinstance(data, list) else [])
    assert isinstance(services, list)
    assert len(services) > 0


def test_replace_package_services(api_url, admin_headers):
    """PUT /api/admin/packages/{id}/services replaces all service links."""
    # Get original
    r = requests.get(f"{api_url}/admin/packages/PKG-demo001/services", headers=admin_headers, timeout=5)
    original_ids = [s["id"] for s in r.json().get("services", [])]

    # Replace with 2 services
    r2 = requests.put(
        f"{api_url}/admin/packages/PKG-demo001/services",
        headers=admin_headers,
        json={"service_ids": ["SVC-demo001", "SVC-demo004"]},
        timeout=5,
    )
    assert r2.status_code == 200

    # Verify
    r3 = requests.get(f"{api_url}/admin/packages/PKG-demo001/services", headers=admin_headers, timeout=5)
    new_ids = [s["id"] for s in r3.json().get("services", [])]
    assert set(new_ids) == {"SVC-demo001", "SVC-demo004"}

    # Restore original
    requests.put(
        f"{api_url}/admin/packages/PKG-demo001/services",
        headers=admin_headers,
        json={"service_ids": original_ids},
        timeout=5,
    )


# ── Booking Services (add-ons) ─────────────────────────────────


def test_list_booking_services(api_url, admin_headers):
    """GET /api/admin/bookings/{id}/services returns booking add-ons."""
    r = requests.get(
        f"{api_url}/admin/bookings/BOOK-2026-001/services",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    services = data.get("services", data if isinstance(data, list) else [])
    assert isinstance(services, list)
    assert "total_addons" in data


def test_add_booking_service(api_url, admin_headers, make_booking):
    """POST /api/admin/bookings/{id}/services adds a service to a booking."""
    booking = make_booking()
    bid = booking["id"]
    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        json={"service_id": "SVC-demo004", "price": 500, "notes": "Test add-on"},
        timeout=5,
    )
    assert r.status_code in (200, 201), f"Add failed: {r.text}"
    svc = r.json().get("service", r.json())
    assert svc["name"] == "Fotobudka"
    assert float(svc["price"]) == 500.0
    assert svc["is_included"] is False


def test_add_included_service_is_free(api_url, admin_headers, make_booking):
    """Adding a service that's in the booking's package → is_included=True, price=0."""
    # Create booking with PKG-demo002 (includes DJ, Saksofonista, Ciężki dym)
    booking = make_booking(package_id="PKG-demo002")
    bid = booking["id"]
    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        json={"service_id": "SVC-demo001"},  # DJ — in package
        timeout=5,
    )
    assert r.status_code in (200, 201), f"Add failed: {r.text}"
    svc = r.json().get("service", r.json())
    assert svc["is_included"] is True
    assert float(svc["price"]) == 0.0


def test_update_booking_service(api_url, admin_headers, make_booking):
    """PUT /api/admin/bookings/{id}/services/{service_id} updates price/notes."""
    booking = make_booking()
    bid = booking["id"]
    # Add service first
    requests.post(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        json={"service_id": "SVC-demo003", "price": 300},
        timeout=5,
    )
    # Update
    r = requests.put(
        f"{api_url}/admin/bookings/{bid}/services/SVC-demo003",
        headers=admin_headers,
        json={"price": 250, "notes": "Negotiated"},
        timeout=5,
    )
    assert r.status_code == 200
    updated = r.json().get("service", r.json())
    assert float(updated["price"]) == 250.0
    assert updated["notes"] == "Negotiated"


def test_delete_booking_service(api_url, admin_headers, make_booking):
    """DELETE /api/admin/bookings/{id}/services/{service_id} removes add-on."""
    booking = make_booking()
    bid = booking["id"]
    # Add service
    requests.post(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        json={"service_id": "SVC-demo005", "price": 200},
        timeout=5,
    )
    # Delete
    r = requests.delete(
        f"{api_url}/admin/bookings/{bid}/services/SVC-demo005",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    # Verify gone
    r2 = requests.get(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        timeout=5,
    )
    ids = [s.get("service_id", "") for s in r2.json().get("services", [])]
    assert "SVC-demo005" not in ids


def test_total_addons_excludes_included(api_url, admin_headers, make_booking):
    """total_addons should sum only non-included services."""
    booking = make_booking(package_id="PKG-demo002")
    bid = booking["id"]
    # Add included service (DJ — in package)
    requests.post(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        json={"service_id": "SVC-demo001"},
        timeout=5,
    )
    # Add paid add-on
    requests.post(
        f"{api_url}/admin/bookings/{bid}/services",
        headers=admin_headers,
        json={"service_id": "SVC-demo004", "price": 500},
        timeout=5,
    )
    r = requests.get(f"{api_url}/admin/bookings/{bid}/services", headers=admin_headers, timeout=5)
    data = r.json()
    # total_addons should be 500 (only Fotobudka, not DJ which is included)
    assert float(data["total_addons"]) == 500.0
