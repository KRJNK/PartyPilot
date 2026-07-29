"""
Tenants CRUD — zarządzanie profilem tenanta (branding, dane kontaktowe).

Admin endpoints wymagają JWT i tenant_id z tokena.
Public endpoint zwraca tylko podstawowe dane (bez wrażliwych pól).
"""

import json

from db import get_connection, return_connection, query, execute, serialize


def handle_get_tenant(tenant_id):
    """
    GET /api/admin/tenant

    Zwraca pełny profil tenanta.
    """
    try:
        tenant = query(
            "SELECT * FROM tenants WHERE id = %s",
            (tenant_id,),
            fetch="one",
        )
        if not tenant:
            return _resp(404, {"error": "Tenant not found"})
        return _resp(200, tenant)
    except Exception as e:
        return _resp(500, {"error": f"Failed to get tenant: {str(e)}"})


def handle_update_tenant(tenant_id, event):
    """
    PUT /api/admin/tenant

    Aktualizuje pola brandingowe tenanta:
    logo_url, primary_color, company_name, about_text,
    contact_email, contact_phone
    """
    body = _parse_body(event)
    if not body:
        return _resp(400, {"error": "No fields to update"})

    updatable = [
        "logo_url", "primary_color", "company_name",
        "about_text", "contact_email", "contact_phone",
    ]

    set_clauses = []
    values = []
    for field in updatable:
        if field in body:
            set_clauses.append(f"{field} = %s")
            values.append(body[field])

    if not set_clauses:
        return _resp(400, {"error": "No valid fields to update"})

    from datetime import datetime, timezone
    set_clauses.append("updated_at = %s")
    values.append(datetime.now(timezone.utc))
    values.append(tenant_id)

    sql = (
        f"UPDATE tenants SET {', '.join(set_clauses)} "
        f"WHERE id = %s RETURNING *"
    )

    try:
        result = execute(sql, values)
        if result is None:
            return _resp(404, {"error": "Tenant not found"})
        return _resp(200, result)
    except Exception as e:
        return _resp(500, {"error": f"Failed to update tenant: {str(e)}"})


def handle_get_public_tenant(tenant_id):
    """
    GET /api/public/{tenant_id}

    Zwraca publiczne dane tenanta (bez wrażliwych pól):
    company_name, logo_url, primary_color, about_text, status
    """
    try:
        tenant = query(
            """SELECT company_name, logo_url, primary_color, about_text, status, id
               FROM tenants WHERE id = %s""",
            (tenant_id,),
            fetch="one",
        )
        if not tenant:
            return _resp(404, {"error": "Tenant not found"})

        if tenant.get("status") != "active":
            return _resp(404, {"error": "Tenant not found or inactive"})

        # Usuń status z odpowiedzi publicznej
        tenant.pop("status", None)
        return _resp(200, tenant)

    except Exception as e:
        return _resp(500, {"error": f"Failed to get tenant info: {str(e)}"})


# ── Helpery ────────────────────────────────────────────────────


def _parse_body(event):
    """Parsuje ciało żądania JSON."""
    body = event.get("body", "")
    if event.get("isBase64Encoded", False):
        import base64
        try:
            body = base64.b64decode(body).decode("utf-8")
        except Exception:
            body = ""
    if isinstance(body, str):
        try:
            return json.loads(body)
        except (json.JSONDecodeError, TypeError):
            return {}
    return body if isinstance(body, dict) else {}


def _resp(status_code, body):
    return {
        "statusCode": status_code,
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }
