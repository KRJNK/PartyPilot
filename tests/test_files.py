"""
File upload tests.
"""

import requests
import io


def test_list_files_for_seeded_booking(api_url, admin_headers):
    """GET /api/admin/bookings/{id}/files returns files list."""
    r = requests.get(
        f"{api_url}/admin/bookings/BOOK-2026-001/files",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    # API returns {"files": [...], "count": N}
    files = data.get("files", data if isinstance(data, list) else [])
    assert isinstance(files, list)


def test_upload_and_delete_file(api_url, admin_headers, make_booking):
    """POST a file upload, then DELETE it."""
    booking = make_booking()
    bid = booking["id"]

    # Upload a small text file
    file_content = b"This is a test file for PartyPilot."
    files = {
        "file": ("test_doc.txt", io.BytesIO(file_content), "text/plain"),
    }
    form_data = {
        "category": "document",
        "description": "Automated test file",
    }

    # Use multipart form — don't set Content-Type manually, requests does it
    headers = {"Authorization": admin_headers["Authorization"]}

    r = requests.post(
        f"{api_url}/admin/bookings/{bid}/files",
        headers=headers,
        files=files,
        data=form_data,
        timeout=10,
    )
    assert r.status_code in (200, 201), f"File upload failed: {r.status_code} {r.text}"
    file_data = r.json()
    # API may return {"file": {...}} or direct
    if "file" in file_data:
        file_data = file_data["file"]
    assert "id" in file_data or "file_id" in file_data

    # List files — should include our upload
    r2 = requests.get(
        f"{api_url}/admin/bookings/{bid}/files",
        headers=admin_headers,
        timeout=5,
    )
    assert r2.status_code == 200
    data = r2.json()
    files_list = data.get("files", data if isinstance(data, list) else [])
    assert isinstance(files_list, list)
    assert len(files_list) > 0

    # Delete the file
    file_id = file_data.get("id") or file_data.get("file_id")
    if file_id:
        r3 = requests.delete(
            f"{api_url}/admin/bookings/{bid}/files/{file_id}",
            headers=admin_headers,
            timeout=5,
        )
        assert r3.status_code == 200


def test_files_nonexistent_booking(api_url, admin_headers):
    """GET files for nonexistent booking returns empty or 404."""
    r = requests.get(
        f"{api_url}/admin/bookings/NONEXISTENT-9999/files",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        files = data.get("files", data if isinstance(data, list) else [])
        assert isinstance(files, list)
