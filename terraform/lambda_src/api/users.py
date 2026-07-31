"""
Users CRUD — zarządzanie użytkownikami (staff) w ramach tenanta.
Tabela: users (z dodatkowymi kolumnami: location, lat, lng, phone).

Wszystkie zapytania WHERE zawierają tenant_id dla izolacji.
"""

import json
import uuid
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from db import get_connection, return_connection, query, execute
from auth import hash_password


# ── Handlery ────────────────────────────────────────────────────


def handle_list_users(tenant_id):
    """
    GET /api/admin/users

    Lista wszystkich użytkowników w tenant (staff).
    """
    try:
        rows = query(
            """SELECT id, email, role, location, lat, lng, phone, created_at
               FROM users
               WHERE tenant_id = %s
               ORDER BY created_at ASC""",
            (tenant_id,),
        )
        return _resp(200, {"users": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list users: {str(e)}"})


def handle_create_user(tenant_id, event):
    """
    POST /api/admin/users

    Tworzy nowego użytkownika (staff) w tenant.
    Body: {email, password, role, location, phone}
    """
    body = _parse_body(event)
    email = (body.get("email") or "").strip().lower()
    password = body.get("password", "")
    role = body.get("role", "manager")
    location = body.get("location", "")
    phone = body.get("phone", "")

    if not email or not password:
        return _resp(400, {"error": "Email and password are required"})
    if len(password) < 8:
        return _resp(400, {"error": "Password must be at least 8 characters"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy email już istnieje w tym tenant
        cur.execute(
            "SELECT id FROM users WHERE tenant_id = %s AND email = %s",
            (tenant_id, email),
        )
        if cur.fetchone():
            return _resp(409, {"error": "Email already exists in this tenant"})

        user_id = str(uuid.uuid4())
        password_hash_val = hash_password(password)

        cur.execute(
            """INSERT INTO users (id, tenant_id, email, password_hash, role, location, phone)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               RETURNING id, email, role, location, phone, created_at""",
            (user_id, tenant_id, email, password_hash_val, role, location, phone),
        )
        created = cur.fetchone()
        conn.commit()

        return _resp(201, {"user": created})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to create user: {str(e)}"})
    finally:
        return_connection(conn)


def handle_update_user(tenant_id, user_id, event):
    """
    PUT /api/admin/users/{user_id}

    Aktualizuje dane użytkownika.
    Body: {role, location, lat, lng, phone}
    """
    body = _parse_body(event)

    if not body:
        return _resp(400, {"error": "No fields to update"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy user istnieje w tenant
        cur.execute(
            "SELECT * FROM users WHERE id = %s AND tenant_id = %s",
            (user_id, tenant_id),
        )
        existing = cur.fetchone()
        if not existing:
            return _resp(404, {"error": "User not found"})

        # Dozwolone pola
        updatable = ["role", "location", "lat", "lng", "phone"]
        set_clauses = []
        values = []

        for field in updatable:
            if field in body:
                set_clauses.append(f"{field} = %s")
                values.append(body[field])

        if not set_clauses:
            return _resp(400, {"error": "No valid fields to update"})

        values.append(user_id)
        values.append(tenant_id)

        sql = (
            f"UPDATE users SET {', '.join(set_clauses)} "
            f"WHERE id = %s AND tenant_id = %s "
            f"RETURNING id, email, role, location, lat, lng, phone, created_at"
        )

        cur.execute(sql, values)
        updated = cur.fetchone()
        conn.commit()

        return _resp(200, {"user": updated})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to update user: {str(e)}"})
    finally:
        return_connection(conn)


def handle_delete_user(tenant_id, user_id, current_user_id):
    """
    DELETE /api/admin/users/{user_id}

    Usuwa użytkownika. Nie można usunąć siebie ani właściciela (owner).
    """
    if user_id == current_user_id:
        return _resp(400, {"error": "Cannot delete yourself"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy user istnieje w tenant
        cur.execute(
            "SELECT * FROM users WHERE id = %s AND tenant_id = %s",
            (user_id, tenant_id),
        )
        existing = cur.fetchone()
        if not existing:
            return _resp(404, {"error": "User not found"})

        # Nie można usunąć właściciela
        if existing["role"] == "owner":
            return _resp(400, {"error": "Cannot delete the tenant owner"})

        cur.execute(
            "DELETE FROM users WHERE id = %s AND tenant_id = %s",
            (user_id, tenant_id),
        )
        conn.commit()

        return _resp(200, {"message": "User deleted"})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to delete user: {str(e)}"})
    finally:
        return_connection(conn)


def handle_update_location(tenant_id, user_id, event):
    """
    PUT /api/admin/users/{user_id}/location

    Aktualizuje lokalizację użytkownika.
    Body: {location, lat, lng}
    """
    body = _parse_body(event)
    location = body.get("location", "")
    lat = body.get("lat")
    lng = body.get("lng")

    if not location:
        return _resp(400, {"error": "location is required"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy user istnieje w tenant
        cur.execute(
            "SELECT id FROM users WHERE id = %s AND tenant_id = %s",
            (user_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(404, {"error": "User not found"})

        cur.execute(
            """UPDATE users
               SET location = %s, lat = %s, lng = %s
               WHERE id = %s AND tenant_id = %s
               RETURNING id, email, role, location, lat, lng, phone, created_at""",
            (location, lat, lng, user_id, tenant_id),
        )
        updated = cur.fetchone()
        conn.commit()

        return _resp(200, {"user": updated})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to update location: {str(e)}"})
    finally:
        return_connection(conn)


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
