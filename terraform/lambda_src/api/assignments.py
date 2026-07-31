"""
Booking Assignments — przypisywanie użytkowników (DJ, technik, MC itp.)
do rezerwacji. Tabela: booking_assignments.

Wszystkie zapytania WHERE zawierają tenant_id dla izolacji.
"""

import json
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from db import get_connection, return_connection, query, execute


# ── Handlery ────────────────────────────────────────────────────


def handle_list_assignments(tenant_id, booking_id):
    """
    GET /api/admin/bookings/{booking_id}/assignments

    Lista wszystkich przypisań do booking — JOIN z users.
    """
    try:
        rows = query(
            """SELECT ba.id, ba.booking_id, ba.user_id, ba.role, ba.notes,
                      ba.checked_in, ba.checked_in_at, ba.created_at,
                      u.email AS user_email, u.phone AS user_phone,
                      u.location AS user_location, u.lat, u.lng
               FROM booking_assignments ba
               JOIN users u ON u.id = ba.user_id
               WHERE ba.booking_id = %s
                 AND u.tenant_id = %s
               ORDER BY ba.created_at ASC""",
            (booking_id, tenant_id),
        )
        return _resp(200, {"assignments": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list assignments: {str(e)}"})


def handle_create_assignment(tenant_id, booking_id, event):
    """
    POST /api/admin/bookings/{booking_id}/assignments

    Body: {user_id, role, notes}
    Sprawdza czy user należy do tego samego tenanta i czy booking istnieje.
    """
    body = _parse_body(event)
    user_id = body.get("user_id", "")
    role = body.get("role", "dj")
    notes = body.get("notes", "")

    if not user_id:
        return _resp(400, {"error": "user_id is required"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy booking istnieje i należy do tenanta
        cur.execute(
            "SELECT id FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(404, {"error": "Booking not found"})

        # Sprawdź czy user istnieje i należy do tego samego tenanta
        cur.execute(
            "SELECT id FROM users WHERE id = %s AND tenant_id = %s",
            (user_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(400, {"error": "User not found or belongs to different tenant"})

        # Sprawdź czy już przypisany
        cur.execute(
            "SELECT id FROM booking_assignments WHERE booking_id = %s AND user_id = %s",
            (booking_id, user_id),
        )
        if cur.fetchone():
            return _resp(409, {"error": "User already assigned to this booking"})

        now = datetime.now(timezone.utc)
        cur.execute(
            """INSERT INTO booking_assignments (booking_id, user_id, role, notes, created_at)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING *""",
            (booking_id, user_id, role, notes, now),
        )
        created = cur.fetchone()
        conn.commit()

        return _resp(201, {"assignment": created})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to create assignment: {str(e)}"})
    finally:
        return_connection(conn)


def handle_delete_assignment(tenant_id, booking_id, user_id):
    """
    DELETE /api/admin/bookings/{booking_id}/assignments/{user_id}

    Usuwa przypisanie użytkownika do rezerwacji.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Sprawdź czy booking należy do tenanta
        cur.execute(
            "SELECT id FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(404, {"error": "Booking not found"})

        cur.execute(
            "DELETE FROM booking_assignments WHERE booking_id = %s AND user_id = %s",
            (booking_id, user_id),
        )
        if cur.rowcount == 0:
            return _resp(404, {"error": "Assignment not found"})

        conn.commit()
        return _resp(200, {"message": "Assignment deleted"})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to delete assignment: {str(e)}"})
    finally:
        return_connection(conn)


def handle_update_assignment(tenant_id, booking_id, user_id, event):
    """
    PUT /api/admin/bookings/{booking_id}/assignments/{user_id}

    Aktualizuje role, notes, checked_in.
    """
    body = _parse_body(event)

    if not body:
        return _resp(400, {"error": "No fields to update"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy booking należy do tenanta
        cur.execute(
            "SELECT id FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(404, {"error": "Booking not found"})

        # Sprawdź czy assignment istnieje
        cur.execute(
            "SELECT * FROM booking_assignments WHERE booking_id = %s AND user_id = %s",
            (booking_id, user_id),
        )
        existing = cur.fetchone()
        if not existing:
            return _resp(404, {"error": "Assignment not found"})

        # Dozwolone pola
        updatable = ["role", "notes", "checked_in"]
        set_clauses = []
        values = []

        for field in updatable:
            if field in body:
                set_clauses.append(f"{field} = %s")
                values.append(body[field])

        # Jeśli checked_in zmienia się na True, ustaw checked_in_at
        if "checked_in" in body and body["checked_in"] is True and not existing.get("checked_in"):
            set_clauses.append("checked_in_at = %s")
            values.append(datetime.now(timezone.utc))
        elif "checked_in" in body and body["checked_in"] is False:
            set_clauses.append("checked_in_at = NULL")

        if not set_clauses:
            return _resp(400, {"error": "No valid fields to update"})

        values.append(booking_id)
        values.append(user_id)

        sql = (
            f"UPDATE booking_assignments SET {', '.join(set_clauses)} "
            f"WHERE booking_id = %s AND user_id = %s RETURNING *"
        )

        cur.execute(sql, values)
        updated = cur.fetchone()
        conn.commit()

        return _resp(200, {"assignment": updated})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to update assignment: {str(e)}"})
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
