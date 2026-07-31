"""
Services (Add-on Services) — katalog usług dodatkowych dla DJ-ów
(saksofonista, ciężki dym, fotobudka, race z iskrami, MC, celebrant itp.).

Trzy obszary:
  1. Service Catalog CRUD  — tabela `services` (per-tenant)
  2. Package ↔ Service     — tabela `package_services` (linki)
  3. Booking Services      — tabela `booking_services` (addony do rezerwacji)

Wszystkie zapytania WHERE zawierają tenant_id dla izolacji.
"""

import json
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from db import get_connection, return_connection, query, execute, serialize, next_id


# ── Service Catalog ────────────────────────────────────────────


def handle_list_services(tenant_id):
    """
    GET /api/admin/services

    Lista wszystkich aktywnych usług dla tenanta, posortowana po sort_order, name.
    """
    try:
        rows = query(
            """SELECT * FROM services
               WHERE tenant_id = %s AND is_active = TRUE
               ORDER BY sort_order ASC, name ASC""",
            (tenant_id,),
        )
        return _resp(200, {"services": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list services: {str(e)}"})


def handle_create_service(tenant_id, event):
    """
    POST /api/admin/services

    Body: { name, description, base_price, category, sort_order }
    """
    body = _parse_body(event)
    name = (body.get("name") or "").strip()

    if not name:
        return _resp(400, {"error": "Service name is required"})

    service_id = next_id("SVC")

    try:
        result = execute(
            """INSERT INTO services (id, tenant_id, name, description,
                                      base_price, category, sort_order)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                service_id, tenant_id, name,
                body.get("description", ""),
                float(body.get("base_price", 0)),
                body.get("category", "Inne"),
                int(body.get("sort_order", 0)),
            ),
        )
        return _resp(201, {"service": result})
    except Exception as e:
        return _resp(500, {"error": f"Failed to create service: {str(e)}"})


def handle_update_service(tenant_id, service_id, event):
    """
    PUT /api/admin/services/{id}

    Dynamiczna aktualizacja pól usługi (jak packages.handle_update).
    """
    body = _parse_body(event)
    if not body:
        return _resp(400, {"error": "No fields to update"})

    updatable = ["name", "description", "base_price", "category", "is_active", "sort_order"]

    set_clauses = []
    values = []
    for field in updatable:
        if field in body:
            set_clauses.append(f"{field} = %s")
            val = body[field]
            if field == "base_price":
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    val = 0
            if field == "sort_order":
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    val = 0
            if field == "is_active":
                val = bool(val)
            values.append(val)

    if not set_clauses:
        return _resp(400, {"error": "No valid fields to update"})

    set_clauses.append("updated_at = %s")
    values.append(datetime.now(timezone.utc))
    values.append(service_id)
    values.append(tenant_id)

    sql = (
        f"UPDATE services SET {', '.join(set_clauses)} "
        f"WHERE id = %s AND tenant_id = %s RETURNING *"
    )

    try:
        result = execute(sql, values)
        if result is None:
            return _resp(404, {"error": "Service not found"})
        return _resp(200, {"service": result})
    except Exception as e:
        return _resp(500, {"error": f"Failed to update service: {str(e)}"})


def handle_delete_service(tenant_id, service_id):
    """
    DELETE /api/admin/services/{id}

    Soft delete (is_active=FALSE) jeśli booking_services referencjonuje usługę,
    hard delete w przeciwnym razie.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy usługa istnieje i należy do tenanta
        cur.execute(
            "SELECT id FROM services WHERE id = %s AND tenant_id = %s",
            (service_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(404, {"error": "Service not found"})

        # Sprawdź czy booking_services referencjonuje tę usługę
        cur.execute(
            "SELECT 1 FROM booking_services WHERE service_id = %s LIMIT 1",
            (service_id,),
        )
        if cur.fetchone():
            # Soft delete — istnieją referencje
            cur.execute(
                "UPDATE services SET is_active = FALSE, updated_at = %s "
                "WHERE id = %s AND tenant_id = %s RETURNING id",
                (datetime.now(timezone.utc), service_id, tenant_id),
            )
            conn.commit()
            return _resp(200, {"message": "Service deactivated (has booking references)"})

        # Hard delete — brak referencji
        cur.execute(
            "DELETE FROM services WHERE id = %s AND tenant_id = %s RETURNING id",
            (service_id, tenant_id),
        )
        if not cur.fetchone():
            conn.rollback()
            return _resp(404, {"error": "Service not found"})
        conn.commit()
        return _resp(200, {"message": "Service deleted"})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to delete service: {str(e)}"})
    finally:
        return_connection(conn)


# ── Package ↔ Service linking ──────────────────────────────────


def handle_list_package_services(tenant_id, package_id):
    """
    GET /api/admin/packages/{id}/services

    Lista usług powiązanych z pakietem (JOIN z services dla pełnych danych).
    """
    try:
        rows = query(
            """SELECT s.* FROM package_services ps
               JOIN services s ON s.id = ps.service_id
               WHERE ps.package_id = %s
                 AND s.tenant_id = %s
               ORDER BY s.sort_order ASC, s.name ASC""",
            (package_id, tenant_id),
        )
        return _resp(200, {"services": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list package services: {str(e)}"})


def handle_replace_package_services(tenant_id, package_id, event):
    """
    PUT /api/admin/packages/{id}/services

    Body: { "service_ids": ["SVC-xxx", "SVC-yyy"] }
    Zastępuje wszystkie powiązania pakietu z usługami (delete old, insert new).
    """
    body = _parse_body(event)
    service_ids = body.get("service_ids", [])
    if not isinstance(service_ids, list):
        return _resp(400, {"error": "service_ids must be a list"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy pakiet istnieje i należy do tenanta
        cur.execute(
            "SELECT id FROM packages WHERE id = %s AND tenant_id = %s",
            (package_id, tenant_id),
        )
        if not cur.fetchone():
            return _resp(404, {"error": "Package not found"})

        # Waliduj że wszystkie service_ids należą do tenanta i są aktywne
        valid_ids = []
        if service_ids:
            cur.execute(
                "SELECT id FROM services WHERE id = ANY(%s) AND tenant_id = %s AND is_active = TRUE",
                (service_ids, tenant_id),
            )
            valid_ids = [r["id"] for r in cur.fetchall()]

        # Usuń stare powiązania
        cur.execute("DELETE FROM package_services WHERE package_id = %s", (package_id,))

        # Wstaw nowe
        for sid in valid_ids:
            cur.execute(
                "INSERT INTO package_services (package_id, service_id) VALUES (%s, %s) "
                "ON CONFLICT (package_id, service_id) DO NOTHING",
                (package_id, sid),
            )

        conn.commit()
        return _resp(200, {"service_ids": valid_ids})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to replace package services: {str(e)}"})
    finally:
        return_connection(conn)


# ── Booking Services (add-ons) ─────────────────────────────────


def handle_list_booking_services(tenant_id, booking_id):
    """
    GET /api/admin/bookings/{id}/services

    Lista usług dodanych do rezerwacji + suma cen addonów (is_included=FALSE).
    """
    try:
        rows = query(
            """SELECT bs.* FROM booking_services bs
               JOIN bookings b ON b.id = bs.booking_id
               WHERE bs.booking_id = %s AND b.tenant_id = %s
               ORDER BY bs.created_at ASC""",
            (booking_id, tenant_id),
        )
        total_addons = sum(
            float(r.get("price") or 0) for r in rows if not r.get("is_included")
        )
        return _resp(200, {
            "services": rows,
            "count": len(rows),
            "total_addons": total_addons,
        })
    except Exception as e:
        return _resp(500, {"error": f"Failed to list booking services: {str(e)}"})


def handle_create_booking_service(tenant_id, booking_id, event):
    """
    POST /api/admin/bookings/{id}/services

    Body: { service_id, price (optional), notes (optional) }
    Pobiera nazwę i base_price z katalogu usług. Sprawdza czy usługa jest
    zawarta w pakiecie rezerwacji → is_included=TRUE, price=0.
    """
    body = _parse_body(event)
    service_id = body.get("service_id", "")

    if not service_id:
        return _resp(400, {"error": "service_id is required"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Sprawdź czy booking istnieje i należy do tenanta
        cur.execute(
            "SELECT id, package_id FROM bookings WHERE id = %s AND tenant_id = %s",
            (booking_id, tenant_id),
        )
        booking = cur.fetchone()
        if not booking:
            return _resp(404, {"error": "Booking not found"})

        # Pobierz usługę z katalogu (must belong to same tenant)
        cur.execute(
            "SELECT * FROM services WHERE id = %s AND tenant_id = %s",
            (service_id, tenant_id),
        )
        service = cur.fetchone()
        if not service:
            return _resp(404, {"error": "Service not found"})

        # Sprawdź czy usługa jest częścią pakietu rezerwacji
        is_included = False
        package_id = booking.get("package_id")
        if package_id:
            cur.execute(
                "SELECT 1 FROM package_services WHERE package_id = %s AND service_id = %s LIMIT 1",
                (package_id, service_id),
            )
            if cur.fetchone():
                is_included = True

        # Cena: jeśli w pakiecie → 0; w przeciwnym razie z body lub base_price
        if is_included:
            price = 0
        else:
            if "price" in body and body["price"] is not None:
                try:
                    price = float(body["price"])
                except (ValueError, TypeError):
                    price = float(service["base_price"])
            else:
                price = float(service["base_price"])

        notes = body.get("notes", "")
        name = service["name"]

        cur.execute(
            """INSERT INTO booking_services (booking_id, service_id, name,
                                              price, is_included, notes)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (booking_id, service_id, name, price, is_included, notes),
        )
        created = cur.fetchone()
        conn.commit()

        return _resp(201, {"service": serialize(created)})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to add booking service: {str(e)}"})
    finally:
        return_connection(conn)


def handle_update_booking_service(tenant_id, booking_id, service_id, event):
    """
    PUT /api/admin/bookings/{id}/services/{service_id}

    Aktualizuje price, notes dla usługi dodanej do rezerwacji.
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

        # Sprawdź czy booking_service istnieje
        cur.execute(
            "SELECT * FROM booking_services WHERE booking_id = %s AND service_id = %s",
            (booking_id, service_id),
        )
        existing = cur.fetchone()
        if not existing:
            return _resp(404, {"error": "Booking service not found"})

        updatable = ["price", "notes", "is_included"]
        set_clauses = []
        values = []
        for field in updatable:
            if field in body:
                set_clauses.append(f"{field} = %s")
                val = body[field]
                if field == "price":
                    try:
                        val = float(val)
                    except (ValueError, TypeError):
                        val = 0
                if field == "is_included":
                    val = bool(val)
                values.append(val)

        if not set_clauses:
            return _resp(400, {"error": "No valid fields to update"})

        values.append(booking_id)
        values.append(service_id)

        sql = (
            f"UPDATE booking_services SET {', '.join(set_clauses)} "
            f"WHERE booking_id = %s AND service_id = %s RETURNING *"
        )

        cur.execute(sql, values)
        updated = cur.fetchone()
        conn.commit()

        return _resp(200, {"service": serialize(updated)})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to update booking service: {str(e)}"})
    finally:
        return_connection(conn)


def handle_delete_booking_service(tenant_id, booking_id, service_id):
    """
    DELETE /api/admin/bookings/{id}/services/{service_id}

    Usuwa usługę z rezerwacji.
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
            "DELETE FROM booking_services WHERE booking_id = %s AND service_id = %s",
            (booking_id, service_id),
        )
        if cur.rowcount == 0:
            return _resp(404, {"error": "Booking service not found"})

        conn.commit()
        return _resp(200, {"message": "Booking service removed"})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to delete booking service: {str(e)}"})
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