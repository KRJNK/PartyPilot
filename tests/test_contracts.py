"""
Contract PDF generation tests.
"""

import os
import requests


def test_generate_contract_seeded_booking(api_url, admin_headers):
    """POST /api/admin/bookings/{id}/contract generates a PDF and returns URL."""
    r = requests.post(
        f"{api_url}/admin/bookings/BOOK-2026-001/contract",
        headers=admin_headers,
        timeout=10,
    )
    assert r.status_code == 200, f"Contract generation failed: {r.status_code} {r.text}"
    data = r.json()
    assert "contract_url" in data
    assert data["booking_id"] == "BOOK-2026-001"
    # URL should point to a .pdf file (S3 URL or local path)
    assert data["contract_url"].endswith(".pdf")


def test_download_contract_after_generation(api_url, admin_headers):
    """GET /api/admin/bookings/{id}/contract returns contract URL after generation."""
    # First generate (idempotent — may already exist)
    requests.post(
        f"{api_url}/admin/bookings/BOOK-2026-001/contract",
        headers=admin_headers,
        timeout=10,
    )
    # Then download
    r = requests.get(
        f"{api_url}/admin/bookings/BOOK-2026-001/contract",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 200
    data = r.json()
    assert "contract_url" in data
    assert data["contract_url"].endswith(".pdf")


def test_generate_contract_nonexistent_booking(api_url, admin_headers):
    """POST contract for nonexistent booking returns 404."""
    r = requests.post(
        f"{api_url}/admin/bookings/NONEXISTENT-9999/contract",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 404


def test_download_contract_nonexistent_booking(api_url, admin_headers):
    """GET contract for nonexistent booking returns 404."""
    r = requests.get(
        f"{api_url}/admin/bookings/NONEXISTENT-9999/contract",
        headers=admin_headers,
        timeout=5,
    )
    assert r.status_code == 404


def test_generated_pdf_is_valid_file(api_url, admin_headers):
    """Verify the generated PDF file exists on disk and is a valid PDF."""
    # Generate
    r = requests.post(
        f"{api_url}/admin/bookings/BOOK-2026-001/contract",
        headers=admin_headers,
        timeout=10,
    )
    assert r.status_code == 200
    url = r.json()["contract_url"]

    # If it's a local path, verify the file
    if url.startswith("/tmp/"):
        assert os.path.exists(url), f"PDF file not found at {url}"
        with open(url, "rb") as f:
            header = f.read(5)
        assert header == b"%PDF-", f"File at {url} is not a valid PDF (header: {header})"
        size = os.path.getsize(url)
        assert size > 100, f"PDF file too small ({size} bytes) — likely empty/corrupt"
