"""
Staff Portal — uproszczony widok dla pracowników (DJ, technik, MC itp.).

Endpointy /api/my/* filtrują dane po przypisaniach bieżącego użytkownika
(booking_assignments.user_id = current user), a nie tenant-wide.

Uwierzytelnianie: JWT (user_info zawiera sub, tenant_id, role, email).
Izolacja tenant: każde zapytanie WHERE zawiera b.tenant_id = %s.
"""

import json
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from db import get_connection, return_connection, query


# ── Handlery ────────────────────────────────────────────────────


def handle_my_bookings(user_info, event):
    """
    GET /api/my/bookings

    Zwraca rezerwacje, do których bieżący użytkownik ma przypisanie
    (booking_assignments.user_id = sub).

    Opcjonalne parametry zapytania:
      ?status=inquiry,confirmed   — filtr po statusach (comma-separated)
      ?upcoming=true              — tylko wydarzenia od dziś (event_date >= CURRENT_DATE)

    Response: {"bookings": [...], "count": N}
    """
    user_id = user_info.get("sub")
    tenant_id = user_info.get("tenant_id")
    if not user_id or not tenant_id:
        return _resp(401, {"error": "Unauthorized"})

    qsp = event.get("query_string_parameters") or {}
    if not isinstance(qsp, dict):
        qsp = {}

    status_filter = qsp.get("status", "")
    upcoming = (qsp.get("upcoming", "") or "").lower() in ("1", "true", "yes")

    where_clauses = ["ba.user_id = %s", "b.tenant_id = %s"]
    params = [user_id, tenant_id]

    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        if statuses:
            placeholders = ", ".join(["%s"] * len(statuses))
            where_clauses.append(f"b.status IN ({placeholders})")
            params.extend(statuses)

    if upcoming:
        where_clauses.append("b.event_date >= CURRENT_DATE")

    where_sql = " AND ".join(where_clauses)

    sql = f"""
        SELECT b.*, ba.role AS my_role, ba.checked_in AS my_checked_in,
               ba.checked_in_at AS my_checked_in_at
        FROM bookings b
        JOIN booking_assignments ba ON ba.booking_id = b.id
        WHERE {where_sql}
        ORDER BY b.event_date ASC
    """

    try:
        rows = query(sql, params)
        return _resp(200, {"bookings": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list my bookings: {str(e)}"})


def handle_my_booking_detail(user_info, booking_id):
    """
    GET /api/my/bookings/{booking_id}

    Zwraca szczegóły rezerwacji + przypisanie bieżącego użytkownika +
    innych członków zespołu + usługi przypisane do rezerwacji.

    Weryfikuje, że użytkownik jest przypisany do tej rezerwacji (403 jeśli nie).

    Response: {
        "booking": {...},
        "my_assignment": {role, checked_in, checked_in_at, notes},
        "team": [{user_id, email, role, checked_in, location}],
        "services": [{name, price, is_included, notes}]
    }
    """
    user_id = user_info.get("sub")
    tenant_id = user_info.get("tenant_id")
    if not user_id or not tenant_id:
        return _resp(401, {"error": "Unauthorized"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Booking + przypisanie bieżącego użytkownika (z izolacją tenant)
        cur.execute(
            """
            SELECT b.*, ba.role AS my_role, ba.checked_in AS my_checked_in,
                   ba.checked_in_at AS my_checked_in_at, ba.notes AS my_notes
            FROM bookings b
            JOIN booking_assignments ba ON ba.booking_id = b.id
            WHERE b.id = %s AND b.tenant_id = %s AND ba.user_id = %s
            """,
            (booking_id, tenant_id, user_id),
        )
        booking_row = cur.fetchone()
        if not booking_row:
            # Sprawdź czy booking istnieje w tenant — żeby rozróżnić 404 vs 403
            cur.execute(
                "SELECT id FROM bookings WHERE id = %s AND tenant_id = %s",
                (booking_id, tenant_id),
            )
            if not cur.fetchone():
                return _resp(404, {"error": "Booking not found"})
            return _resp(403, {"error": "You are not assigned to this booking"})

        booking = _row_to_dict(booking_row)
        my_assignment = {
            "role": booking.pop("my_role", None),
            "checked_in": booking.pop("my_checked_in", None),
            "checked_in_at": booking.pop("my_checked_in_at", None),
            "notes": booking.pop("my_notes", None),
        }

        # Inni członkowie zespołu (JOIN z usersami tego samego tenanta)
        cur.execute(
            """
            SELECT ba.user_id, u.email, ba.role, ba.checked_in, u.location
            FROM booking_assignments ba
            JOIN users u ON u.id = ba.user_id
            WHERE ba.booking_id = %s AND u.tenant_id = %s
            ORDER BY ba.created_at ASC
            """,
            (booking_id, tenant_id),
        )
        team = [_row_to_dict(r) for r in cur.fetchall()]

        # Usługi przypisane do rezerwacji
        cur.execute(
            """
            SELECT name, price, is_included, notes
            FROM booking_services
            WHERE booking_id = %s
            ORDER BY id ASC
            """,
            (booking_id,),
        )
        services = [_row_to_dict(r) for r in cur.fetchall()]

        return _resp(200, {
            "booking": booking,
            "my_assignment": my_assignment,
            "team": team,
            "services": services,
        })

    except Exception as e:
        return _resp(500, {"error": f"Failed to get booking detail: {str(e)}"})
    finally:
        return_connection(conn)


def handle_my_check_in(user_info, booking_id):
    """
    POST /api/my/bookings/{booking_id}/check-in

    Oznacza bieżącego użytkownika jako check-in dla tej rezerwacji.
    Ustawia checked_in=TRUE, checked_in_at=NOW().
    Weryfikuje przypisanie (403 jeśli nie).

    Response: {"assignment": {checked_in: true, checked_in_at: "..."}}
    """
    user_id = user_info.get("sub")
    tenant_id = user_info.get("tenant_id")
    if not user_id or not tenant_id:
        return _resp(401, {"error": "Unauthorized"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Weryfikacja: booking istnieje w tenant + użytkownik jest przypisany
        cur.execute(
            """
            SELECT ba.id
            FROM booking_assignments ba
            JOIN bookings b ON b.id = ba.booking_id
            WHERE ba.booking_id = %s AND b.tenant_id = %s AND ba.user_id = %s
            """,
            (booking_id, tenant_id, user_id),
        )
        assignment = cur.fetchone()
        if not assignment:
            # Rozróżnij 404 (booking nie istnieje) vs 403 (brak przypisania)
            cur.execute(
                "SELECT id FROM bookings WHERE id = %s AND tenant_id = %s",
                (booking_id, tenant_id),
            )
            if not cur.fetchone():
                return _resp(404, {"error": "Booking not found"})
            return _resp(403, {"error": "You are not assigned to this booking"})

        now = datetime.now(timezone.utc)
        cur.execute(
            """
            UPDATE booking_assignments
            SET checked_in = TRUE, checked_in_at = %s
            WHERE booking_id = %s AND user_id = %s
            RETURNING checked_in, checked_in_at
            """,
            (now, booking_id, user_id),
        )
        updated = cur.fetchone()
        conn.commit()

        return _resp(200, {"assignment": _row_to_dict(updated)})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to check in: {str(e)}"})
    finally:
        return_connection(conn)


def handle_my_profile(user_info):
    """
    GET /api/my/profile

    Zwraca informacje o bieżącym użytkowniku: id, email, role, location, phone.

    Response: {"user": {...}}
    """
    user_id = user_info.get("sub")
    tenant_id = user_info.get("tenant_id")
    if not user_id or not tenant_id:
        return _resp(401, {"error": "Unauthorized"})

    try:
        row = query(
            """
            SELECT id, email, role, location, phone
            FROM users
            WHERE id = %s AND tenant_id = %s
            """,
            (user_id, tenant_id),
            fetch="one",
        )
        if not row:
            return _resp(404, {"error": "User not found"})
        return _resp(200, {"user": row})
    except Exception as e:
        return _resp(500, {"error": f"Failed to get profile: {str(e)}"})


# ── Helpery ────────────────────────────────────────────────────


def _row_to_dict(row):
    """Konwertuje RealDictRow na zwykły dict (JSON-safe)."""
    if row is None:
        return None
    if isinstance(row, dict):
        return dict(row)
    return row


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