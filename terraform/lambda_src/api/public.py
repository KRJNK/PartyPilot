"""
Public endpoints — nie wymagają autoryzacji, tenant_id z URL.

- GET  /api/public/{tenant_id}/packages     → packages.handle_list
- POST /api/public/{tenant_id}/bookings     → bookings.handle_create z source='public_booking'
- GET  /api/public/{tenant_id}              → tenants.handle_get_public_tenant
- GET  /api/public/{tenant_id}/availability → lista zajętych dat w miesiącu
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from db import get_connection, return_connection, query, execute, serialize

from bookings import handle_create as _admin_create_booking
from packages import handle_list as _list_packages
from tenants import handle_get_public_tenant as _get_public_tenant


def handle_public_create_booking(tenant_id, event):
    """
    POST /api/public/{tenant_id}/bookings

    Tworzy booking przez publiczny widget.
    - Waliduje czy tenant istnieje i jest aktywny
    - Rate limiting: max 3 bookingi z tego samego emaila w ciągu ostatniej godziny
    - Po sukcesie wysyła e-maile potwierdzające (auto-reply)
    """
    # 1. Sprawdź czy tenant istnieje i jest aktywny
    tenant = query(
        "SELECT id, status, company_name, primary_color, logo_url, "
        "contact_email, owner_email FROM tenants WHERE id = %s",
        (tenant_id,),
        fetch="one",
    )
    if not tenant:
        return _resp(404, {"error": "Tenant not found"})
    if tenant.get("status") != "active":
        return _resp(404, {"error": "Tenant not found or inactive"})

    # 2. Rate limiting — sprawdź email w body
    body = _parse_body(event)
    email = (body.get("client_email") or "").strip().lower()

    if email:
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        try:
            recent = query(
                """SELECT COUNT(*) AS cnt FROM bookings
                   WHERE tenant_id = %s AND client_email = %s
                   AND created_at >= %s""",
                (tenant_id, email, one_hour_ago),
                fetch="one",
            )
            if recent and recent.get("cnt", 0) >= 3:
                return _resp(429, {
                    "error": "Too many booking requests. Please try again later.",
                })
        except Exception:
            pass  # rate limiting nie może zablokować całego requestu

    # 3. Deleguj do bookings.handle_create z source='public_booking'
    result = _admin_create_booking(tenant_id, event, source="public_booking")

    # 4. Auto-reply e-maile (tylko przy sukcesie — status 201)
    _send_auto_reply(tenant, result)

    return result


def _send_auto_reply(tenant, create_result):
    """
    Wysyła e-maile potwierdzające po udanym utworzeniu rezerwacji.

    - Potwierdzenie do klienta (send_booking_confirmation)
    - Powiadomienie do organizatora (send_booking_notification)
    Błędy e-mail nie wpływają na sukces rezerwacji — tylko logowane.
    """
    if create_result.get("statusCode") != 201:
        return

    try:
        booking = json.loads(create_result.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        return

    if not booking or not booking.get("id"):
        return

    # Pobierz nazwę pakietu jeśli istnieje
    package_name = ""
    package_id = booking.get("package_id", "")
    if package_id:
        try:
            pkg = query(
                "SELECT name FROM packages WHERE id = %s", (package_id,),
                fetch="one",
            )
            if pkg:
                package_name = pkg.get("name", "")
        except Exception:
            pass

    booking_with_pkg = dict(booking)
    booking_with_pkg["package_name"] = package_name

    # Wyślij potwierdzenie do klienta
    if booking.get("client_email"):
        try:
            from email import send_booking_confirmation
            send_booking_confirmation(tenant, booking_with_pkg)
        except Exception as e:
            logging.error("Failed to send confirmation email: %s", e)

    # Wyślij powiadomienie do organizatora
    try:
        from email import send_booking_notification
        send_booking_notification(tenant, booking_with_pkg)
    except Exception as e:
        logging.error("Failed to send notification email: %s", e)


def handle_public_list_packages(tenant_id):
    """
    GET /api/public/{tenant_id}/packages

    Deleguje do packages.handle_list.
    """
    return _list_packages(tenant_id)


def handle_public_tenant_info(tenant_id):
    """
    GET /api/public/{tenant_id}

    Deleguje do tenants.handle_get_public_tenant.
    """
    return _get_public_tenant(tenant_id)


def handle_public_availability(tenant_id, event=None):
    """
    GET /api/public/{tenant_id}/availability

    Zwraca zajęte daty w danym miesiącu (z bazy PostgreSQL, NIE Google Calendar).
    Query param: ?month=YYYY-MM (domyślnie bieżący miesiąc)
    """
    # 1. Waliduj tenanta
    tenant = query(
        "SELECT id, status FROM tenants WHERE id = %s",
        (tenant_id,),
        fetch="one",
    )
    if not tenant:
        return _resp(404, {"error": "Tenant not found"})
    if tenant.get("status") != "active":
        return _resp(404, {"error": "Tenant not found or inactive"})

    # 2. Pobierz miesiąc z query string
    params = _get_query_params(event) if event else {}
    month_str = (params.get("month") or "").strip()

    if month_str:
        try:
            year, month = month_str.split("-")
            year_num = int(year)
            month_num = int(month)
        except (ValueError, AttributeError):
            return _resp(400, {"error": "Invalid month format. Use YYYY-MM (e.g. 2026-07)"})
    else:
        now = datetime.now(timezone.utc)
        year_num = now.year
        month_num = now.month

    # 3. Zapytanie o bookingi w danym miesiącu
    try:
        rows = query(
            """SELECT event_date, status, client_name, event_time_start,
                      event_time_end, event_location
               FROM bookings
               WHERE tenant_id = %s
                 AND status NOT IN ('cancelled')
                 AND EXTRACT(YEAR FROM event_date) = %s
                 AND EXTRACT(MONTH FROM event_date) = %s
               ORDER BY event_date""",
            (tenant_id, year_num, month_num),
        )

        booked_dates = []
        bookings_list = []
        seen_dates = set()
        for row in rows:
            date_str = row.get("event_date", "")
            if date_str and date_str not in seen_dates:
                seen_dates.add(date_str)
                booked_dates.append(str(date_str))
            bookings_list.append({
                "date": str(row.get("event_date", "")),
                "status": row.get("status", ""),
                "client_name": row.get("client_name", ""),
                "event_time_start": row.get("event_time_start", ""),
                "event_time_end": row.get("event_time_end", ""),
                "event_location": row.get("event_location", ""),
            })

        return _resp(200, {
            "booked_dates": booked_dates,
            "bookings": bookings_list,
        })

    except Exception as e:
        return _resp(500, {"error": f"Failed to get availability: {str(e)}"})


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


def _get_query_params(event):
    """Pobiera parametry query string z eventu."""
    return (
        event.get("query_string_parameters")
        or event.get("queryStringParameters")
        or {}
    )


def _resp(status_code, body):
    return {
        "statusCode": status_code,
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }
