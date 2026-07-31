"""
Bookings CRUD and pipeline tests.
"""

import requests


def test_list_bookings(api_url, admin_headers):
    """GET /api/admin/bookings returns list of bookings."""
    r = requests.get(f"{api_url}/admin/bookings", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    # API returns {"bookings": [...], "count": N}
    bookings = data.get("bookings", data if isinstance(data, list) else [])
    assert isinstance(bookings, list)
    assert len(bookings) > 0  # seeded data


def test_list_bookings_has_expected_fields(api_url, admin_headers):
    """Each booking should have core fields."""
    r = requests.get(f"{api_url}/admin/bookings", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    bookings = data.get("bookings", data if isinstance(data, list) else [])
    if bookings:
        b = bookings[0]
        for field in ("id", "client_name", "event_date", "status"):
            assert field in b, f"Missing field '{field}' in booking: {b}"


def test_create_booking(api_url, admin_headers, make_booking):
    """POST /api/admin/bookings creates a new booking."""
    booking = make_booking(client_name="Test Create Booking")
    assert "id" in booking
    assert booking["client_name"] == "Test Create Booking"
    assert booking["status"] == "inquiry"


def test_get_booking_by_id(api_url, admin_headers, make_booking):
    """GET /api/admin/bookings/{id} returns booking detail."""
    booking = make_booking(client_name="Test Get Booking")
    bid = booking["id"]
    r = requests.get(f"{api_url}/admin/bookings/{bid}", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    detail = r.json()
    assert detail["id"] == bid
    assert detail["client_name"] == "Test Get Booking"


def test_get_nonexistent_booking(api_url, admin_headers):
    """GET /api/admin/bookings/{fake_id} returns 404."""
    r = requests.get(
        f"{api_url}/admin/bookings/NONEXISTENT-9999",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 404


def test_update_booking(api_url, admin_headers, make_booking):
    """PUT /api/admin/bookings/{id} updates booking fields."""
    booking = make_booking(client_name="Before Update")
    bid = booking["id"]
    r = requests.put(
        f"{api_url}/admin/bookings/{bid}",
        headers=admin_headers,
        json={"client_name": "After Update", "internal_notes": "Updated notes"},
        timeout=5,
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["client_name"] == "After Update"
    assert updated["internal_notes"] == "Updated notes"


def test_cancel_booking(api_url, admin_headers, make_booking):
    """POST /api/admin/bookings/{id}/cancel sets status to cancelled."""
    booking = make_booking()
    bid = booking["id"]
    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/cancel",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    cancelled = r.json()
    assert cancelled["status"] == "cancelled"


def test_mark_deposit_paid(api_url, admin_headers, make_booking):
    """POST /api/admin/bookings/{id}/mark-deposit-paid sets deposit_paid=True."""
    booking = make_booking()
    bid = booking["id"]
    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/mark-deposit-paid",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    result = r.json()
    assert result.get("deposit_paid") is True


def test_delete_booking(api_url, admin_headers, make_booking):
    """DELETE /api/admin/bookings/{id} removes the booking."""
    booking = make_booking(client_name="To Be Deleted")
    bid = booking["id"]
    r = requests.delete(
        f"{api_url}/admin/bookings/{bid}",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    # Verify it's gone
    r2 = requests.get(
        f"{api_url}/admin/bookings/{bid}",
        headers=admin_headers,
        timeout=5,
    )
    assert r2.status_code == 404


def test_pipeline_returns_statuses(api_url, admin_headers):
    """GET /api/admin/bookings/pipeline returns bookings grouped by status."""
    r = requests.get(
        f"{api_url}/admin/bookings/pipeline",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    # API returns {"columns": {status: [bookings]}, "counts": {status: count}}
    columns = data.get("columns", data) if isinstance(data, dict) else data
    assert isinstance(columns, dict)
    for status in ("inquiry", "offer_sent", "confirmed", "completed"):
        assert status in columns, f"Pipeline missing status '{status}'"


def test_calendar_returns_events(api_url, admin_headers):
    """GET /api/admin/calendar returns bookings in date range."""
    r = requests.get(
        f"{api_url}/admin/calendar?start=2026-01-01&end=2026-12-31",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    # API returns {"events": [...], "count": N, ...}
    events = data.get("events", data if isinstance(data, list) else [])
    assert isinstance(events, list)


def test_create_booking_missing_fields(api_url, admin_headers):
    """POST /api/admin/bookings with missing required fields returns 400."""
    r = requests.post(
        f"{api_url}/admin/bookings",
        headers=admin_headers,
        json={"notes": "missing required fields"},
        timeout=5,
    )
    assert r.status_code in (400, 422)
