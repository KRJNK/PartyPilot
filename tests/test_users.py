"""
Users (team members) tests.
"""

import requests


def test_list_users(api_url, admin_headers):
    """GET /api/admin/users returns list of users."""
    r = requests.get(f"{api_url}/admin/users", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    # API returns {"users": [...], "count": N}
    users = data.get("users", data if isinstance(data, list) else [])
    assert isinstance(users, list)
    assert len(users) > 0  # seeded users


def test_list_users_has_expected_fields(api_url, admin_headers):
    """Each user should have core fields."""
    r = requests.get(f"{api_url}/admin/users", headers=admin_headers, timeout=5)
    assert r.status_code == 200
    data = r.json()
    users = data.get("users", data if isinstance(data, list) else [])
    if users:
        u = users[0]
        for field in ("id", "email", "role"):
            assert field in u, f"Missing field '{field}' in user: {u}"


def test_create_user(api_url, admin_headers, make_user):
    """POST /api/admin/users creates a new team member."""
    user = make_user(full_name="Test Create User")
    assert "id" in user
    # full_name may not be returned by API; check email + role instead
    assert user["email"].startswith("testuser")
    assert user["role"] == "member"


def test_update_user(api_url, admin_headers, make_user):
    """PUT /api/admin/users/{id} updates user fields."""
    user = make_user()
    uid = user["id"]
    r = requests.put(
        f"{api_url}/admin/users/{uid}",
        headers=admin_headers,
        json={"role": "manager"},
        timeout=5,
    )
    assert r.status_code == 200
    updated = r.json()
    # Response may be {"user": {...}} or direct
    if "user" in updated:
        updated = updated["user"]
    assert updated["role"] == "manager"


def test_delete_user(api_url, admin_headers, make_user):
    """DELETE /api/admin/users/{id} removes the user."""
    user = make_user()
    uid = user["id"]
    r = requests.delete(
        f"{api_url}/admin/users/{uid}",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    # Verify gone
    r2 = requests.get(f"{api_url}/admin/users", headers=admin_headers, timeout=5)
    assert r2.status_code == 200
    data = r2.json()
    users = data.get("users", data if isinstance(data, list) else [])
    ids = [u.get("id") for u in users]
    assert uid not in ids


def test_update_user_location(api_url, admin_headers, make_user):
    """PUT /api/admin/users/{id}/location sets location + lat/lng."""
    user = make_user()
    uid = user["id"]
    r = requests.put(
        f"{api_url}/admin/users/{uid}/location",
        headers=admin_headers,
        json={"location": "Warsaw Center", "lat": 52.2297, "lng": 21.0122},
        timeout=5,
    )
    assert r.status_code == 200


def test_create_user_missing_fields(api_url, admin_headers):
    """POST /api/admin/users with missing required fields returns 400."""
    r = requests.post(
        f"{api_url}/admin/users",
        headers=admin_headers,
        json={"full_name": "No Email"},
        timeout=5,
    )
    assert r.status_code in (400, 422)
