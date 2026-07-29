"""
Połączenie z PostgreSQL i helpery dla Wedding SaaS.

Używa psycopg2 z pulą połączeń ThreadedConnectionPool.
Wszystkie zapytania używają parametryzowanych wartości ($1, $2, …).
Każde zapytanie WHERE zawiera tenant_id = $1 dla izolacji tenantów.
"""

import os
import re
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# ── Pula połączeń (modułowa, współdzielona między invokacjami) ──

_pool = None


def _get_pool():
    """Zwraca globalną pulę połączeń, tworzy ją jeśli nie istnieje."""
    global _pool
    if _pool is None:
        try:
            _pool = ThreadedConnectionPool(1, 10, DATABASE_URL)
        except Exception as e:
            print(f"WARNING: Nie udało się utworzyć puli połączeń: {e}")
            _pool = None
    return _pool


def get_connection():
    """Zwraca połączenie z puli lub bezpośrednie (fallback)."""
    pool = _get_pool()
    if pool is not None:
        try:
            return pool.getconn()
        except Exception as e:
            print(f"WARNING: Nie udało się pobrać połączenia z puli: {e}")
    # Fallback: bezpośrednie połączenie
    return psycopg2.connect(DATABASE_URL)


def return_connection(conn):
    """Zwraca połączenie do puli lub zamyka je."""
    if conn is None:
        return
    pool = _get_pool()
    if pool is not None:
        try:
            pool.putconn(conn)
            return
        except Exception:
            pass
    try:
        conn.close()
    except Exception:
        pass


# ── Helpery zapytań ────────────────────────────────────────────


def query(sql, params=None, fetch="all"):
    """
    Wykonuje zapytanie SELECT i zwraca wyniki jako listę dictów.

    fetch='all'  → wszystkie wiersze (lista)
    fetch='one'  → pierwszy wiersz (dict) lub None
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        if fetch == "one":
            row = cur.fetchone()
            return serialize(row) if row else None
        rows = cur.fetchall()
        return [serialize(r) for r in rows]
    finally:
        return_connection(conn)


def execute(sql, params=None):
    """
    Wykonuje INSERT / UPDATE / DELETE.
    Jeśli zapytanie zawiera RETURNING, zwraca pierwszy wiersz.
    W przeciwnym razie zwraca {"rowcount": N}.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        conn.commit()
        if cur.description:
            row = cur.fetchone()
            return serialize(row) if row else None
        return {"rowcount": cur.rowcount}
    except Exception:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        raise


# ── Serializacja ───────────────────────────────────────────────


def serialize(row):
    """Konwertuje rekord (RealDictRow/dict) do słownika JSON-safe."""
    if row is None:
        return None
    if isinstance(row, dict):
        return {k: _serialize_value(v) for k, v in row.items()}
    return _serialize_value(row)


def _serialize_value(value):
    """Rekurencyjnie konwertuje wartość do typu JSON-safe."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize_value(v) for v in value]
    # bytes → string (dla UUID itp.)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


# ── Generatory ID ──────────────────────────────────────────────


def next_booking_id(tenant_id):
    """
    Generuje sekwencyjny booking ID: BOOK-{YYYY}-{NNN}.
    Sekwencja per-tenant — szuka MAX(id) w bieżącym roku.
    """
    year = datetime.now(timezone.utc).strftime("%Y")
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT MAX(id) FROM bookings WHERE tenant_id = %s AND id LIKE %s",
            (tenant_id, f"BOOK-{year}-%"),
        )
        row = cur.fetchone()
        max_id = row[0] if row and row[0] else ""
        if max_id:
            parts = max_id.split("-")
            next_num = int(parts[2]) + 1
        else:
            next_num = 1
        return f"BOOK-{year}-{next_num:03d}"
    finally:
        return_connection(conn)


def next_id(prefix):
    """Generuje ID z prefiksem np. PKG-{uuid4.hex[:8]}."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# ── Ekstrakcja tenant_id z żądania ────────────────────────────


_TENANT_PATH_RE = re.compile(r"^/api/public/([^/]+)")


def tenant_id_from_request(event):
    """
    Wyciąga tenant_id z URL dla publicznych endpointów.

    /api/public/{tenant_id}/packages  →  tenant_id
    /api/public/{tenant_id}           →  tenant_id
    """
    path = (
        event.get("http", {}).get("path")
        or event.get("path", "")
    )
    m = _TENANT_PATH_RE.match(path)
    return m.group(1) if m else None
