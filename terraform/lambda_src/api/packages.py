"""
Packages CRUD — operacje PostgreSQL na tabeli packages.

Pakiety są zawsze z zakresu tenant_id (WHERE tenant_id = $1).
Pola JSONB (features) są obsługiwane natywnie przez psycopg2.
"""

import json

from db import get_connection, return_connection, query, execute, serialize, next_id


def handle_list(tenant_id):
    """
    GET /api/admin/packages
    GET /api/public/{tenant_id}/packages

    Zwraca wszystkie pakiety dla tenanta posortowane po sort_order.
    """
    try:
        packages = query(
            "SELECT * FROM packages WHERE tenant_id = %s ORDER BY sort_order ASC, name ASC",
            (tenant_id,),
        )
        return _resp(200, {"packages": packages, "count": len(packages)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list packages: {str(e)}"})


def handle_create(tenant_id, event):
    """
    POST /api/admin/packages

    Body: { name, price, duration, features, deposit_type, deposit_amount, sort_order }
    """
    body = _parse_body(event)
    name = (body.get("name") or "").strip()

    if not name:
        return _resp(400, {"error": "Package name is required"})

    pkg_id = next_id("PKG")

    try:
        features = body.get("features", [])
        if isinstance(features, str):
            try:
                features = json.loads(features)
            except (json.JSONDecodeError, TypeError):
                features = []

        result = execute(
            """INSERT INTO packages (id, tenant_id, name, price, duration,
               features, deposit_type, deposit_amount, sort_order)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                pkg_id, tenant_id, name,
                float(body.get("price", 0)),
                body.get("duration", ""),
                features,
                body.get("deposit_type", "fixed"),
                float(body.get("deposit_amount", 0)),
                int(body.get("sort_order", 0)),
            ),
        )
        return _resp(201, result)

    except Exception as e:
        return _resp(500, {"error": f"Failed to create package: {str(e)}"})


def handle_update(tenant_id, pkg_id, event):
    """
    PUT /api/admin/packages/{id}

    Dynamiczna aktualizacja pól pakietu.
    """
    body = _parse_body(event)
    if not body:
        return _resp(400, {"error": "No fields to update"})

    updatable = [
        "name", "price", "duration", "features",
        "deposit_type", "deposit_amount", "sort_order",
    ]

    set_clauses = []
    values = []
    for field in updatable:
        if field in body:
            set_clauses.append(f"{field} = %s")
            val = body[field]
            # Konwersje typów
            if field == "price" or field == "deposit_amount":
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    val = 0
            if field == "sort_order":
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    val = 0
            if field == "features" and isinstance(val, str):
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    val = []
            values.append(val)

    if not set_clauses:
        return _resp(400, {"error": "No valid fields to update"})

    from datetime import datetime, timezone
    set_clauses.append("updated_at = %s")
    values.append(datetime.now(timezone.utc))
    values.append(pkg_id)
    values.append(tenant_id)

    sql = (
        f"UPDATE packages SET {', '.join(set_clauses)} "
        f"WHERE id = %s AND tenant_id = %s RETURNING *"
    )

    try:
        result = execute(sql, values)
        if result is None:
            return _resp(404, {"error": "Package not found"})
        return _resp(200, result)
    except Exception as e:
        return _resp(500, {"error": f"Failed to update package: {str(e)}"})


def handle_delete(tenant_id, pkg_id):
    """
    DELETE /api/admin/packages/{id}
    """
    try:
        result = execute(
            "DELETE FROM packages WHERE id = %s AND tenant_id = %s RETURNING id",
            (pkg_id, tenant_id),
        )
        if result is None:
            return _resp(404, {"error": "Package not found"})
        return _resp(200, {"message": "Package deleted"})
    except Exception as e:
        return _resp(500, {"error": f"Failed to delete package: {str(e)}"})


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
