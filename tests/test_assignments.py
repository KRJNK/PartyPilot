"""
Team assignments tests.
"""

import requests


def test_list_assignments_for_seeded_booking(api_url, admin_headers):
    """GET /api/admin/bookings/{id}/assignments returns assignments list."""
    # Use seeded booking BOOK-2026-001 which has assignments
    r = requests.get(
        f"{api_url}/admin/bookings/BOOK-2026-001/assignments",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    # API returns {"assignments": [...], "count": N}
    assignments = data.get("assignments", data if isinstance(data, list) else [])
    assert isinstance(assignments, list)


def test_create_and_delete_assignment(api_url, admin_headers, make_booking, make_user):
    """POST then DELETE assignment on a booking."""
    # Create a booking and a user
    booking = make_booking()
    user = make_user()
    bid = booking["id"]
    uid = user["id"]

    # Assign user to booking
    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/assignments",
        headers=admin_headers,
        json={"user_id": uid, "role": "dj"},
        timeout=5,
    )
    assert r.status_code in (200, 201), f"Create assignment failed: {r.text}"
    assignment = r.json()
    # API returns {"assignment": {...}}
    if "assignment" in assignment:
        assignment = assignment["assignment"]
    assert assignment.get("user_id") == uid or assignment.get("status") == "assigned"

    # List assignments — should include our user
    r2 = requests.get(
        f"{api_url}/admin/bookings/{bid}/assignments",
        headers=admin_headers,
        timeout=5,
    )
    assert r2.status_code == 200
    data = r2.json()
    assignments = data.get("assignments", data if isinstance(data, list) else [])
    assert isinstance(assignments, list)
    assert len(assignments) > 0

    # Delete assignment
    r3 = requests.delete(
        f"{api_url}/admin/bookings/{bid}/assignments/{uid}",
        headers=admin_headers,
        timeout=5,
    )
    assert r3.status_code == 200


def test_assignments_nonexistent_booking(api_url, admin_headers):
    """GET assignments for nonexistent booking returns empty or 404."""
    r = requests.get(
        f"{api_url}/admin/bookings/NONEXISTENT-9999/assignments",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assignments = data.get("assignments", data if isinstance(data, list) else [])
        assert isinstance(assignments, list)


def test_update_assignment_check_in(api_url, admin_headers, make_booking, make_user):
    """PUT /api/admin/bookings/{id}/assignments/{user_id} updates assignment (e.g. check-in)."""
    booking = make_booking()
    user = make_user()
    bid = booking["id"]
    uid = user["id"]

    # Create assignment first
    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/assignments",
        headers=admin_headers,
        json={"user_id": uid, "role": "dj"},
        timeout=5,
    )
    assert r.status_code in (200, 201)

    # Update — check in
    r2 = requests.put(
        f"{api_url}/admin/bookings/{bid}/assignments/{uid}",
        headers=admin_headers,
        json={"checked_in": True},
        timeout=5,
    )
    assert r2.status_code == 200
