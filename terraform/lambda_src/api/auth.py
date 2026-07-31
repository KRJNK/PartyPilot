"""
Autoryzacja JWT dla PartyPilot.

Rejestracja, logowanie, refresh token, weryfikacja JWT.
Używa python-jose (HS256) + passlib (bcrypt).
"""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from jose import jwt, JWTError

from db import get_connection, return_connection, query, execute, serialize, next_id

# ── Konfiguracja ───────────────────────────────────────────────

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("JWT_ACCESS_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("JWT_REFRESH_EXPIRE_DAYS", "30"))
ALGORITHM = "HS256"

# ── Password hashing ───────────────────────────────────────────


def hash_password(password: str) -> str:
    """Zwraca bcrypt hash hasła."""
    return _bcrypt.hashpw(password.encode("utf-8")[:72], _bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hash: str) -> bool:
    """Weryfikuje hasło względem bcrypt hasha."""
    try:
        return _bcrypt.checkpw(password.encode("utf-8")[:72], hash.encode("utf-8"))
    except Exception:
        return False


# ── JWT tokeny ────────────────────────────────────────────────


def create_access_token(payload: dict, expires_minutes: int = None) -> str:
    """Tworzy JWT access token (krótkotrwały, domyślnie 15 min)."""
    expire = expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
    to_encode = payload.copy()
    to_encode.update({
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire),
        "iat": datetime.now(timezone.utc),
    })
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


def create_refresh_token(payload: dict, expires_days: int = None) -> str:
    """Tworzy JWT refresh token (długotrwały, domyślnie 30 dni)."""
    expire = expires_days or REFRESH_TOKEN_EXPIRE_DAYS
    to_encode = payload.copy()
    to_encode.update({
        "exp": datetime.now(timezone.utc) + timedelta(days=expire),
        "iat": datetime.now(timezone.utc),
    })
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    """
    Weryfikuje JWT — sprawdza podpis i expiry.
    Zwraca payload (dict) lub None jeśli token jest nieprawidłowy.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ── Auth middleware ────────────────────────────────────────────


def require_auth(event):
    """
    Wyciąga Bearer token z nagłówka Authorization i weryfikuje go.

    Returns:
        (payload, None) — sukces
        (None, response_dict) — błąd (401)
    """
    headers = event.get("headers") or {}
    auth_header = headers.get("authorization") or headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, _resp(401, {"error": "Missing or invalid Authorization header"})
    token = auth_header[len("Bearer "):]
    payload = verify_token(token)
    if payload is None:
        return None, _resp(401, {"error": "Invalid or expired token"})
    return payload, None


# ── Handlery ───────────────────────────────────────────────────


def handle_register(event):
    """
    POST /api/auth/register
    Body: { company_name, email, password }
    """
    body = _parse_body(event)
    email = (body.get("email") or "").strip().lower()
    password = body.get("password", "")
    company_name = body.get("company_name", "")

    if not email or not password:
        return _resp(400, {"error": "Email and password are required"})
    if len(password) < 8:
        return _resp(400, {"error": "Password must be at least 8 characters"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Sprawdź czy email już istnieje (cross-tenant)
        cur.execute("SELECT id FROM users WHERE email = %s LIMIT 1", (email,))
        if cur.fetchone():
            return _resp(409, {"error": "Email already registered"})

        tenant_id = next_id("T")
        user_id = str(uuid.uuid4())
        password_hash = hash_password(password)

        # Transakcja: INSERT tenant + user
        cur.execute(
            """INSERT INTO tenants (id, company_name, owner_email, status, plan)
               VALUES (%s, %s, %s, 'active', 'starter')""",
            (tenant_id, company_name, email),
        )
        cur.execute(
            """INSERT INTO users (id, tenant_id, email, password_hash, role)
               VALUES (%s, %s, %s, %s, 'owner')""",
            (user_id, tenant_id, email, password_hash),
        )
        conn.commit()

        # Zwróć tokeny
        token_payload = {"sub": user_id, "tenant_id": tenant_id, "role": "owner", "email": email}
        access_token = create_access_token(token_payload)
        refresh_token = create_refresh_token(token_payload)

        return _resp(201, {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "tenant_id": tenant_id,
                "email": email,
                "role": "owner",
            },
            "tenant": {
                "id": tenant_id,
                "company_name": company_name,
            },
        })

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Registration failed: {str(e)}"})
    finally:
        return_connection(conn)


def handle_login(event):
    """
    POST /api/auth/login
    Body: { email, password }
    """
    body = _parse_body(event)
    email = (body.get("email") or "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        return _resp(400, {"error": "Email and password are required"})

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE email = %s LIMIT 1", (email,))
        user = cur.fetchone()

        if not user:
            return _resp(401, {"error": "Invalid email or password"})

        # psycopg2 domyślny cursor zwraca tuple; indeksy kolumn
        # (id, tenant_id, email, password_hash, role, created_at)
        user_id = user[0]
        tenant_id = user[1]
        user_email = user[2]
        password_hash = user[3]
        role = user[4]

        if not verify_password(password, password_hash):
            return _resp(401, {"error": "Invalid email or password"})

        # Sprawdź status tenanta
        cur.execute("SELECT status FROM tenants WHERE id = %s", (tenant_id,))
        tenant_row = cur.fetchone()
        if tenant_row and tenant_row[0] != "active":
            return _resp(403, {"error": "Account is suspended or inactive"})

        conn.commit()

        token_payload = {"sub": user_id, "tenant_id": tenant_id, "role": role, "email": user_email}
        access_token = create_access_token(token_payload)
        refresh_token = create_refresh_token(token_payload)

        return _resp(200, {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "tenant_id": tenant_id,
                "email": user_email,
                "role": role,
            },
        })

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return _resp(500, {"error": f"Login failed: {str(e)}"})
    finally:
        return_connection(conn)


def handle_refresh(event):
    """
    POST /api/auth/refresh
    Body: { refresh_token }
    """
    body = _parse_body(event)
    token = body.get("refresh_token", "")

    if not token:
        return _resp(400, {"error": "Refresh token is required"})

    payload = verify_token(token)
    if payload is None:
        return _resp(401, {"error": "Invalid or expired refresh token"})

    # Generuj nowy access token
    new_access = create_access_token({
        "sub": payload.get("sub"),
        "tenant_id": payload.get("tenant_id"),
        "role": payload.get("role"),
        "email": payload.get("email"),
    })

    return _resp(200, {
        "access_token": new_access,
        "token_type": "bearer",
    })


def handle_me(event):
    """
    GET /api/auth/me
    Wymaga: Authorization: Bearer {token}
    """
    user_info, error = require_auth(event)
    if error:
        return error

    user_id = user_info.get("sub")
    tenant_id = user_info.get("tenant_id")

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, tenant_id, email, role, created_at FROM users WHERE id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            return _resp(404, {"error": "User not found"})

        user = {
            "id": row[0],
            "tenant_id": row[1],
            "email": row[2],
            "role": row[3],
            "created_at": row[4].isoformat() if hasattr(row[4], "isoformat") else str(row[4]),
        }

        # Pobierz dane tenanta
        cur.execute(
            "SELECT company_name, logo_url, primary_color, plan FROM tenants WHERE id = %s",
            (tenant_id,),
        )
        tenant_row = cur.fetchone()
        tenant = None
        if tenant_row:
            tenant = {
                "id": tenant_id,
                "company_name": tenant_row[0],
                "logo_url": tenant_row[1],
                "primary_color": tenant_row[2],
                "plan": tenant_row[3],
            }

        return _resp(200, {"user": user, "tenant": tenant})

    except Exception as e:
        return _resp(500, {"error": f"Failed to get user info: {str(e)}"})
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
