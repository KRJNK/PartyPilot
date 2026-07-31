"""
Bookings CRUD — operacje PostgreSQL na tabeli bookings.

Wszystkie zapytania WHERE zawierają tenant_id = $1 dla izolacji.
Zmiany statusu są rejestrowane w booking_status_history.
"""

import csv
import io
import json
from datetime import datetime, date, timezone, timedelta

import psycopg2
import psycopg2.extras

from db import (
    get_connection, return_connection, query, execute,
    serialize, next_booking_id,
)

# Statusy w kolejności pipeline
PIPELINE_STATUSES = ["inquiry", "offer_sent", "deposit_paid", "confirmed", "completed"]


# ── Handlery ───────────────────────────────────────────────────


def handle_create(tenant_id, event, source="admin"):
    """
    POST /api/admin/bookings
    POST /api/public/{tenant_id}/bookings

    Tworzy nową rezerwację + wpis w booking_status_history.
    """
    body = _parse_body(event)
    _coerce_types(body)

    required = ["client_name", "event_date"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return _resp(400, {"error": f"Missing required fields: {', '.join(missing)}"})

    booking_id = next_booking_id(tenant_id)
    now = datetime.now(timezone.utc)

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """INSERT INTO bookings (
                id, tenant_id, status, client_type,
                client_name, client_email, client_phone, client_address,
                client_pesel, client_id_document,
                company_name, company_nip, wants_contract,
                event_date, event_time_start, event_time_end,
                event_location, guest_count,
                package_id, package_price, package_final_price, package_notes,
                deposit_amount, deposit_paid,
                internal_notes, source,
                created_at, updated_at
            ) VALUES (
                %s, %s, 'inquiry', %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s
            )""",
            (
                booking_id, tenant_id, body.get("client_type", ""),
                body["client_name"], body.get("client_email", ""),
                body.get("client_phone", ""), body.get("client_address", ""),
                body.get("client_pesel", ""), body.get("client_id_document", ""),
                body.get("company_name", ""), body.get("company_nip", ""),
                body.get("wants_contract", False),
                body["event_date"], body.get("event_time_start", ""),
                body.get("event_time_end", ""),
                body.get("event_location", ""), int(body.get("guest_count", 0)),
                body.get("package_id", ""),
                float(body.get("package_price", 0)),
                float(body.get("package_final_price", 0)),
                body.get("package_notes", ""),
                float(body.get("deposit_amount", 0)),
                bool(body.get("deposit_paid", False)),
                body.get("internal_notes", ""), source,
                now, now,
            ),
        )

        # Historia statusu
        cur.execute(
            """INSERT INTO booking_status_history (booking_id, status, note)
               VALUES (%s, 'inquiry', 'Booking created')""",
            (booking_id,),
        )

        conn.commit()

        # Pobierz utworzoną rezerwację
        cur.execute("SELECT * FROM bookings WHERE id = %s", (booking_id,))
        created = cur.fetchone()
        return _resp(201, serialize(created))

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to create booking: {str(e)}"})
    finally:
        return_connection(conn)


def handle_list(tenant_id, event):
    """
    GET /api/admin/bookings

    Opcjonalne filtry: status, date_from, date_to
    Paginacja: LIMIT 20, OFFSET (page-1)*20
    Sortowanie: event_date DESC
    """
    params = _get_query_params(event)
    status = params.get("status", "").strip()
    date_from = params.get("date_from", "").strip()
    date_to = params.get("date_to", "").strip()
    page = int(params.get("page", "1"))
    limit = int(params.get("limit", "20"))
    if limit > 100:
        limit = 100
    offset = (page - 1) * limit

    conditions = ["tenant_id = %s"]
    sql_params = [tenant_id]

    if status:
        conditions.append("status = %s")
        sql_params.append(status)
    if date_from:
        conditions.append("event_date >= %s::date")
        sql_params.append(date_from)
    if date_to:
        conditions.append("event_date <= %s::date")
        sql_params.append(date_to)

    where = " AND ".join(conditions)

    try:
        bookings = query(
            f"SELECT * FROM bookings WHERE {where} ORDER BY event_date DESC, created_at DESC LIMIT %s OFFSET %s",
            sql_params + [limit, offset],
        )

        total_result = query(
            f"SELECT COUNT(*) AS count FROM bookings WHERE {where}",
            sql_params,
            fetch="one",
        )
        total = total_result["count"] if total_result else 0

        return _resp(200, {
            "bookings": bookings,
            "count": len(bookings),
            "total": total,
            "page": page,
            "limit": limit,
        })

    except Exception as e:
        return _resp(500, {"error": f"Failed to list bookings: {str(e)}"})


def handle_get(tenant_id, booking_id):
    """
    GET /api/admin/bookings/{id}

    Zwraca booking + historia statusów.
    """
    try:
        booking = query(
            "SELECT * FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
            fetch="one",
        )
        if not booking:
            return _resp(404, {"error": "Booking not found"})

        history = query(
            "SELECT * FROM booking_status_history WHERE booking_id = %s ORDER BY created_at ASC",
            (booking_id,),
        )

        booking["status_history"] = history
        return _resp(200, booking)

    except Exception as e:
        return _resp(500, {"error": f"Failed to get booking: {str(e)}"})


def handle_update(tenant_id, booking_id, event):
    """
    PUT /api/admin/bookings/{id}

    Dynamiczna aktualizacja — tylko podane w body pola są zmieniane.
    Jeśli zmienił się status, dodaje wpis do booking_status_history.
    """
    body = _parse_body(event)
    _coerce_types(body)

    if not body:
        return _resp(400, {"error": "No fields to update"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Pobierz obecny stan
        cur.execute(
            "SELECT * FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        existing = cur.fetchone()
        if not existing:
            return _resp(404, {"error": "Booking not found"})

        old_status = existing["status"]

        # Dozwolone pola do aktualizacji
        updatable = [
            "client_type", "client_name", "client_email", "client_phone",
            "client_address", "client_pesel", "client_id_document",
            "company_name", "company_nip", "wants_contract",
            "event_date", "event_time_start", "event_time_end",
            "event_location", "guest_count", "package_id",
            "package_price", "package_final_price", "package_notes",
            "deposit_amount", "deposit_paid", "internal_notes",
            "contract_url", "source", "status", "package_notes",
        ]

        set_clauses = []
        values = []
        for field in updatable:
            if field in body:
                set_clauses.append(f"{field} = %s")
                values.append(body[field])

        if not set_clauses:
            return _resp(400, {"error": "No valid fields to update"})

        now = datetime.now(timezone.utc)
        set_clauses.append("updated_at = %s")
        values.append(now)
        values.append(booking_id)
        values.append(tenant_id)

        sql = (
            f"UPDATE bookings SET {', '.join(set_clauses)} "
            f"WHERE id = %s AND tenant_id = %s RETURNING *"
        )

        cur.execute(sql, values)
        updated = cur.fetchone()

        # Rejestruj zmianę statusu
        new_status = body.get("status")
        if new_status and new_status != old_status:
            note = body.get("status_note", f"Status changed from {old_status} to {new_status}")
            cur.execute(
                """INSERT INTO booking_status_history (booking_id, status, note)
                   VALUES (%s, %s, %s)""",
                (booking_id, new_status, note),
            )

        conn.commit()
        return _resp(200, serialize(updated))

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to update booking: {str(e)}"})
    finally:
        return_connection(conn)


def handle_cancel(tenant_id, booking_id):
    """
    POST /api/admin/bookings/{id}/cancel

    Ustawia status='cancelled' i dodaje wpis do historii.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT status FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        existing = cur.fetchone()
        if not existing:
            return _resp(404, {"error": "Booking not found"})

        if existing["status"] == "cancelled":
            return _resp(400, {"error": "Booking is already cancelled"})

        now = datetime.now(timezone.utc)
        cur.execute(
            """UPDATE bookings SET status = 'cancelled', updated_at = %s
               WHERE id = %s AND tenant_id = %s RETURNING *""",
            (now, booking_id, tenant_id),
        )
        updated = cur.fetchone()

        cur.execute(
            """INSERT INTO booking_status_history (booking_id, status, note)
               VALUES (%s, 'cancelled', 'Booking cancelled')""",
            (booking_id,),
        )

        conn.commit()
        return _resp(200, serialize(updated))

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to cancel booking: {str(e)}"})
    finally:
        return_connection(conn)


def handle_delete(tenant_id, booking_id):
    """
    DELETE /api/admin/bookings/{id}

    Hard delete — kaskada usuwa też booking_status_history.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            "DELETE FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        if cur.rowcount == 0:
            return _resp(404, {"error": "Booking not found"})

        conn.commit()
        return _resp(200, {"message": "Booking deleted"})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to delete booking: {str(e)}"})
    finally:
        return_connection(conn)


def handle_mark_deposit_paid(tenant_id, booking_id):
    """
    POST /api/admin/bookings/{id}/mark-deposit-paid

    Ustawia deposit_paid=true, deposit_paid_at=NOW().
    Jeśli status to 'offer_sent', automatycznie awansuje do 'deposit_paid'.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            "SELECT * FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        booking = cur.fetchone()
        if not booking:
            return _resp(404, {"error": "Booking not found"})

        if booking["deposit_paid"]:
            return _resp(400, {"error": "Deposit already marked as paid"})

        current_status = booking["status"]
        new_status = current_status

        if current_status == "offer_sent":
            new_status = "deposit_paid"

        now = datetime.now(timezone.utc)
        cur.execute(
            """UPDATE bookings
               SET deposit_paid = true, deposit_paid_at = %s,
                   status = %s, updated_at = %s
               WHERE id = %s AND tenant_id = %s
               RETURNING *""",
            (now, new_status, now, booking_id, tenant_id),
        )
        updated = cur.fetchone()

        note = "Deposit marked as paid"
        if new_status != current_status:
            note += f", status advanced from {current_status} to {new_status}"

        cur.execute(
            """INSERT INTO booking_status_history (booking_id, status, note)
               VALUES (%s, %s, %s)""",
            (booking_id, new_status, note),
        )

        conn.commit()
        return _resp(200, serialize(updated))

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to mark deposit paid: {str(e)}"})
    finally:
        return_connection(conn)


# ── Pipeline ────────────────────────────────────────────────────


def handle_pipeline(tenant_id, event):
    """
    GET /api/admin/bookings/pipeline

    Grupuje bookingi według statusu (inquiry, offer_sent, deposit_paid,
    confirmed, completed) i zwraca jako kolumny Kanban.
    """
    try:
        all_bookings = query(
            "SELECT * FROM bookings WHERE tenant_id = %s ORDER BY event_date DESC, created_at DESC",
            (tenant_id,),
        )
    except Exception as e:
        return _resp(500, {"error": f"Failed to fetch pipeline: {str(e)}"})

    columns = {s: [] for s in PIPELINE_STATUSES}
    for b in all_bookings:
        status = b.get("status", "")
        if status in columns:
            columns[status].append(b)

    counts = {s: len(columns[s]) for s in PIPELINE_STATUSES}

    return _resp(200, {"columns": columns, "counts": counts})


# ── Clients ─────────────────────────────────────────────────────


def handle_clients(tenant_id, event):
    """
    GET /api/admin/clients

    Zwraca listę unikalnych klientów z historią rezerwacji.

    Query params:
        search — wyszukiwanie po name/email/phone
        date_from — filtr od daty wydarzenia (YYYY-MM-DD)
        date_to — filtr do daty wydarzenia (YYYY-MM-DD)
    """
    params = _get_query_params(event)
    search = (params.get("search") or "").strip()
    date_from = (params.get("date_from") or "").strip()
    date_to = (params.get("date_to") or "").strip()

    conditions = ["tenant_id = %s", "client_email != ''"]
    sql_params = [tenant_id]

    if search:
        conditions.append("(client_name ILIKE %s OR client_email ILIKE %s OR client_phone ILIKE %s)")
        like = f"%{search}%"
        sql_params.extend([like, like, like])
    if date_from:
        conditions.append("event_date >= %s::date")
        sql_params.append(date_from)
    if date_to:
        conditions.append("event_date <= %s::date")
        sql_params.append(date_to)

    where = " AND ".join(conditions)

    try:
        rows = query(
            f"""SELECT client_email, client_name, client_phone, client_type,
                       COUNT(*) AS booking_count,
                       MAX(event_date) AS last_event_date
                FROM bookings
                WHERE {where}
                GROUP BY client_email, client_name, client_phone, client_type
                ORDER BY last_event_date DESC""",
            sql_params,
        )
        return _resp(200, {"clients": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list clients: {str(e)}"})


def handle_export_clients(tenant_id, event):
    """
    GET /api/admin/clients/export

    Eksportuje listę klientów do CSV.
    """
    # Użyj tej samej logiki co handle_clients
    params = _get_query_params(event)
    search = (params.get("search") or "").strip()

    conditions = ["tenant_id = %s", "client_email != ''"]
    sql_params = [tenant_id]

    if search:
        conditions.append("(client_name ILIKE %s OR client_email ILIKE %s OR client_phone ILIKE %s)")
        like = f"%{search}%"
        sql_params.extend([like, like, like])

    where = " AND ".join(conditions)

    try:
        rows = query(
            f"""SELECT client_email, client_name, client_phone, client_type,
                       COUNT(*) AS booking_count,
                       MAX(event_date) AS last_event_date
                FROM bookings
                WHERE {where}
                GROUP BY client_email, client_name, client_phone, client_type
                ORDER BY last_event_date DESC""",
            sql_params,
        )
    except Exception as e:
        return _resp(500, {"error": f"Failed to export clients: {str(e)}"})

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Email", "Nazwa", "Telefon", "Typ", "Liczba rezerwacji", "Ostatnie wydarzenie"])
    for r in rows:
        writer.writerow([
            r.get("client_email", ""),
            r.get("client_name", ""),
            r.get("client_phone", ""),
            r.get("client_type", ""),
            r.get("booking_count", 0),
            str(r.get("last_event_date", "")),
        ])

    csv_content = output.getvalue()

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=clients.csv",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": csv_content,
    }


def handle_calendar(tenant_id, event):
    """
    GET /api/admin/calendar

    Zwraca bookingi w zadanym przedziale datowym (widok kalendarza).
    Query params: date_from (YYYY-MM-DD), date_to (YYYY-MM-DD)
    Domyślnie: date_from = dzisiaj, date_to = dzisiaj + 90 dni
    """
    params = _get_query_params(event)
    date_from = (params.get("date_from") or "").strip()
    date_to = (params.get("date_to") or "").strip()

    today = date.today()
    if not date_from:
        date_from = today.isoformat()
    if not date_to:
        date_to = (today + timedelta(days=90)).isoformat()

    try:
        rows = query(
            """SELECT id, event_date, status, client_name,
                      event_time_start, event_time_end, event_location, package_id
               FROM bookings
               WHERE tenant_id = %s
                 AND status NOT IN ('cancelled')
                 AND event_date BETWEEN %s::date AND %s::date
               ORDER BY event_date""",
            (tenant_id, date_from, date_to),
        )

        events = []
        for row in rows:
            events.append({
                "date": str(row.get("event_date", "")),
                "booking_id": row.get("id", ""),
                "status": row.get("status", ""),
                "client_name": row.get("client_name", ""),
                "event_time_start": row.get("event_time_start", ""),
                "event_time_end": row.get("event_time_end", ""),
                "event_location": row.get("event_location", ""),
                "package_id": row.get("package_id", ""),
            })

        return _resp(200, {
            "events": events,
            "count": len(events),
            "date_from": date_from,
            "date_to": date_to,
        })

    except Exception as e:
        return _resp(500, {"error": f"Failed to get calendar: {str(e)}"})


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


def _coerce_types(body):
    """Konwertuje typy pól do oczekiwanych typów Python."""
    # guest_count → int
    if "guest_count" in body and body["guest_count"] is not None:
        try:
            body["guest_count"] = int(body["guest_count"])
        except (ValueError, TypeError):
            pass
    # wants_contract → bool
    if "wants_contract" in body:
        val = body["wants_contract"]
        if isinstance(val, str):
            body["wants_contract"] = val.lower() in ("true", "1", "yes")
        else:
            body["wants_contract"] = bool(val)
    # deposit_paid → bool
    if "deposit_paid" in body:
        val = body["deposit_paid"]
        if isinstance(val, str):
            body["deposit_paid"] = val.lower() in ("true", "1", "yes")
        else:
            body["deposit_paid"] = bool(val)
    # kwoty → float
    for f in ("package_price", "package_final_price", "deposit_amount"):
        if f in body and body[f] is not None:
            try:
                body[f] = float(body[f])
            except (ValueError, TypeError):
                pass


def _resp(status_code, body):
    return {
        "statusCode": status_code,
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }
