"""
Booking Files — metadane plików (dokumenty, playlisty, zdjęcia itp.)
powiązane z rezerwacjami. Tabela: booking_files.

Pliki fizycznie zapisywane są na dysku (lub S3), API przechowuje tylko metadane.
"""

import json
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from db import get_connection, return_connection, query, execute


# ── Handlery ────────────────────────────────────────────────────


def handle_list_files(tenant_id, booking_id):
    """
    GET /api/admin/bookings/{booking_id}/files

    Lista wszystkich plików dla booking — JOIN z users (uploader name/email).
    """
    try:
        rows = query(
            """SELECT bf.id, bf.booking_id, bf.uploaded_by, bf.filename,
                      bf.file_path, bf.file_size, bf.file_type,
                      bf.category, bf.description, bf.created_at,
                      u.email AS uploader_email
               FROM booking_files bf
               LEFT JOIN users u ON u.id = bf.uploaded_by
               WHERE bf.booking_id = %s
                 AND EXISTS (
                     SELECT 1 FROM bookings WHERE id = %s AND tenant_id = %s
                 )
               ORDER BY bf.created_at DESC""",
            (booking_id, booking_id, tenant_id),
        )
        return _resp(200, {"files": rows, "count": len(rows)})
    except Exception as e:
        return _resp(500, {"error": f"Failed to list files: {str(e)}"})


def handle_create_file(tenant_id, booking_id, event, user_info):
    """
    POST /api/admin/bookings/{booking_id}/files

    Tworzy rekord metadanych pliku.
    Body: {filename, file_path, file_size, file_type, category, description}
    uploaded_by pochodzi z JWT (user_info["sub"]).
    """
    body = _parse_body(event)
    filename = body.get("filename", "")
    file_path = body.get("file_path", "")
    file_size = body.get("file_size", 0)
    file_type = body.get("file_type", "")
    category = body.get("category", "document")
    description = body.get("description", "")
    uploaded_by = user_info.get("sub", "")

    if not filename or not file_path:
        return _resp(400, {"error": "filename and file_path are required"})

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

        now = datetime.now(timezone.utc)
        cur.execute(
            """INSERT INTO booking_files
               (booking_id, uploaded_by, filename, file_path, file_size, file_type, category, description, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (booking_id, uploaded_by, filename, file_path, file_size, file_type, category, description, now),
        )
        created = cur.fetchone()
        conn.commit()

        return _resp(201, {"file": created})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to create file: {str(e)}"})
    finally:
        return_connection(conn)


def handle_delete_file(tenant_id, booking_id, file_id):
    """
    DELETE /api/admin/bookings/{booking_id}/files/{file_id}

    Usuwa rekord metadanych pliku z bazy.
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
            "DELETE FROM booking_files WHERE id = %s AND booking_id = %s",
            (file_id, booking_id),
        )
        if cur.rowcount == 0:
            return _resp(404, {"error": "File not found"})

        conn.commit()
        return _resp(200, {"message": "File deleted"})

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Failed to delete file: {str(e)}"})
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
