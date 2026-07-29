"""
Scaleway Serverless Function — główny router Wedding SaaS API.

Handler: main.handler (format Scaleway: module.handler)

Event format (Scaleway, API Gateway v2 compatible):
  event['http']['method']
  event['http']['path']
  event['body']
  event['headers']
  event['query_string_parameters']

Routes:
  GET  /api/health                          — health check (no auth)
  GET  /api/public/{tenant_id}              — public tenant info
  GET  /api/public/{tenant_id}/packages     — list packages (public)
  POST /api/public/{tenant_id}/bookings     — create booking (self-service)
  GET  /api/public/{tenant_id}/availability — availability (booked dates)
  POST /api/auth/register                   — rejestracja
  POST /api/auth/login                      — logowanie
  POST /api/auth/refresh                    — refresh token
  GET  /api/auth/me                         — current user (JWT)
  GET  /api/admin/bookings                  — list bookings
  POST /api/admin/bookings                  — create booking
  GET  /api/admin/bookings/{id}             — booking detail
  PUT  /api/admin/bookings/{id}             — update booking
  POST /api/admin/bookings/{id}/cancel      — cancel
  DELETE /api/admin/bookings/{id}           — hard delete
  POST /api/admin/bookings/{id}/mark-deposit-paid
  GET  /api/admin/packages                  — list packages
  POST /api/admin/packages                  — create package
  PUT  /api/admin/packages/{id}             — update package
  DELETE /api/admin/packages/{id}           — delete package
  GET  /api/admin/tenant                    — tenant profile
  PUT  /api/admin/tenant                    — update tenant branding
  GET  /api/admin/calendar                  — calendar view (bookings in date range)
  POST /api/public/{tenant_id}/chat         — AI chat (public, no auth)
  GET  /api/admin/ai-config                 — get AI assistant config
  PUT  /api/admin/ai-config                 — update AI assistant config
  GET  /api/admin/conversations             — list conversations
  GET  /api/admin/conversations/{id}        — conversation detail
  POST /api/admin/conversations/{id}/close  — close conversation
"""

import json
import os
import re
import traceback

# ── Regexy ścieżek ─────────────────────────────────────────────

PUBLIC_PATH_RE = re.compile(r"^/api/public/([^/]+)(?:/([^/]+))?$")
ADMIN_BOOKINGS_PIPELINE_RE = re.compile(r"^/api/admin/bookings/pipeline$")
ADMIN_BOOKINGS_CONTRACT_RE = re.compile(r"^/api/admin/bookings/([^/]+)/contract$")
ADMIN_BOOKINGS_RE = re.compile(
    r"^/api/admin/bookings(?:/([^/]+))?(?:/(cancel|mark-deposit-paid))?$"
)
ADMIN_PACKAGES_RE = re.compile(r"^/api/admin/packages(?:/([^/]+))?$")
ADMIN_TENANT_RE = re.compile(r"^/api/admin/tenant$")
ADMIN_CALENDAR_RE = re.compile(r"^/api/admin/calendar$")
ADMIN_CLIENTS_RE = re.compile(r"^/api/admin/clients(?:/export)?$")
ADMIN_AI_CONFIG_RE = re.compile(r"^/api/admin/ai-config$")
ADMIN_CONVERSATIONS_RE = re.compile(
    r"^/api/admin/conversations(?:/([^/]+))?(?:/([^/]+))?$"
)


# ── Entry point ────────────────────────────────────────────────


def handler(event, context):
    """
    Główna funkcja entry point dla Scaleway Serverless Functions.
    Parsuje metodę + ścieżkę i kieruje do odpowiedniego handlera.
    """
    try:
        return _route(event, context)
    except Exception as e:
        print(f"ERROR - Unhandled exception: {traceback.format_exc()}")
        return _response(500, {"error": "Internal server error", "detail": str(e)})


# ── Router ─────────────────────────────────────────────────────


def _route(event, context):
    method = _get_method(event)
    path = _get_path(event)
    cors = _get_cors_origin(event)

    # ── OPTIONS preflight ─────────────────────────────────
    if method == "OPTIONS":
        return _response(200, "", cors=cors)

    # ── Health check ──────────────────────────────────────
    if path == "/api/health" and method == "GET":
        return _require_cors(_handle_health(), cors)

    # ── Public routes (no auth) ───────────────────────────
    m_pub = PUBLIC_PATH_RE.match(path)
    if m_pub:
        tenant_id = m_pub.group(1)
        sub_resource = m_pub.group(2)

        # GET  /api/public/{tenant_id}
        if not sub_resource and method == "GET":
            from tenants import handle_get_public_tenant
            return _require_cors(handle_get_public_tenant(tenant_id), cors)

        # GET  /api/public/{tenant_id}/packages
        if sub_resource == "packages" and method == "GET":
            from public import handle_public_list_packages
            return _require_cors(handle_public_list_packages(tenant_id), cors)

        # POST /api/public/{tenant_id}/bookings
        if sub_resource == "bookings" and method == "POST":
            from public import handle_public_create_booking
            return _require_cors(handle_public_create_booking(tenant_id, event), cors)

        # GET  /api/public/{tenant_id}/availability
        if sub_resource == "availability" and method == "GET":
            from public import handle_public_availability
            return _require_cors(handle_public_availability(tenant_id, event), cors)

        # POST /api/public/{tenant_id}/chat
        if sub_resource == "chat" and method == "POST":
            from ai import handle_chat
            return _require_cors(handle_chat(tenant_id, event), cors)

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Auth routes ───────────────────────────────────────
    if path == "/api/auth/register" and method == "POST":
        from auth import handle_register
        return _require_cors(handle_register(event), cors)

    if path == "/api/auth/login" and method == "POST":
        from auth import handle_login
        return _require_cors(handle_login(event), cors)

    if path == "/api/auth/refresh" and method == "POST":
        from auth import handle_refresh
        return _require_cors(handle_refresh(event), cors)

    if path == "/api/auth/me" and method == "GET":
        from auth import handle_me
        return _require_cors(handle_me(event), cors)

    # ── Admin routes (require JWT) ────────────────────────
    user_info = _authenticate(event)
    if user_info is None:
        return _require_cors(
            _response(401, {"error": "Unauthorized"}), cors
        )

    tenant_id = user_info.get("tenant_id")
    if not tenant_id:
        return _require_cors(
            _response(403, {"error": "Invalid token: missing tenant_id"}), cors
        )

    # ── Bookings Pipeline (must be BEFORE generic bookings {id}) ─
    if ADMIN_BOOKINGS_PIPELINE_RE.match(path) and method == "GET":
        from bookings import handle_pipeline
        return _require_cors(handle_pipeline(tenant_id, event), cors)

    # ── Clients ───────────────────────────────────────────
    if ADMIN_CLIENTS_RE.match(path):
        from bookings import handle_clients, handle_export_clients

        if path == "/api/admin/clients/export" and method == "GET":
            result = handle_export_clients(tenant_id, event)
            result.setdefault("headers", {})
            result["headers"]["Access-Control-Allow-Origin"] = cors
            return result

        if path == "/api/admin/clients" and method == "GET":
            return _require_cors(handle_clients(tenant_id, event), cors)

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Bookings CRUD ─────────────────────────────────────
    m_book = ADMIN_BOOKINGS_RE.match(path)
    if m_book:
        booking_id = m_book.group(1)
        sub_action = m_book.group(2)

        from bookings import (
            handle_create, handle_list, handle_get,
            handle_update, handle_cancel, handle_delete,
            handle_mark_deposit_paid,
        )

        # GET  /api/admin/bookings
        if not booking_id and method == "GET":
            return _require_cors(handle_list(tenant_id, event), cors)
        # POST /api/admin/bookings
        if not booking_id and method == "POST":
            return _require_cors(handle_create(tenant_id, event), cors)

        if booking_id:
            # POST /api/admin/bookings/{id}/cancel
            if sub_action == "cancel" and method == "POST":
                return _require_cors(handle_cancel(tenant_id, booking_id), cors)
            # POST /api/admin/bookings/{id}/mark-deposit-paid
            if sub_action == "mark-deposit-paid" and method == "POST":
                return _require_cors(
                    handle_mark_deposit_paid(tenant_id, booking_id), cors
                )
            # GET  /api/admin/bookings/{id}
            if not sub_action and method == "GET":
                return _require_cors(handle_get(tenant_id, booking_id), cors)
            # PUT  /api/admin/bookings/{id}
            if not sub_action and method == "PUT":
                return _require_cors(handle_update(tenant_id, booking_id, event), cors)
            # DELETE /api/admin/bookings/{id}
            if not sub_action and method == "DELETE":
                return _require_cors(handle_delete(tenant_id, booking_id), cors)

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Bookings Contract ─────────────────────────────────
    m_contract = ADMIN_BOOKINGS_CONTRACT_RE.match(path)
    if m_contract:
        booking_id = m_contract.group(1)
        from contracts import handle_generate_contract, handle_download_contract

        if method == "POST":
            return _require_cors(
                handle_generate_contract(tenant_id, booking_id, event), cors
            )
        if method == "GET":
            return _require_cors(
                handle_download_contract(tenant_id, booking_id, event), cors
            )

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Packages CRUD ─────────────────────────────────────
    m_pkg = ADMIN_PACKAGES_RE.match(path)
    if m_pkg:
        pkg_id = m_pkg.group(1)

        from packages import handle_create as _pkg_create, handle_list as _pkg_list
        from packages import handle_update as _pkg_update, handle_delete as _pkg_delete

        # GET  /api/admin/packages
        if not pkg_id and method == "GET":
            return _require_cors(_pkg_list(tenant_id), cors)
        # POST /api/admin/packages
        if not pkg_id and method == "POST":
            return _require_cors(_pkg_create(tenant_id, event), cors)

        if pkg_id:
            # PUT  /api/admin/packages/{id}
            if method == "PUT":
                return _require_cors(_pkg_update(tenant_id, pkg_id, event), cors)
            # DELETE /api/admin/packages/{id}
            if method == "DELETE":
                return _require_cors(_pkg_delete(tenant_id, pkg_id), cors)

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Tenant profile ────────────────────────────────────
    m_ten = ADMIN_TENANT_RE.match(path)
    if m_ten:
        from tenants import handle_get_tenant, handle_update_tenant

        if method == "GET":
            return _require_cors(handle_get_tenant(tenant_id), cors)
        if method == "PUT":
            return _require_cors(handle_update_tenant(tenant_id, event), cors)

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Calendar ──────────────────────────────────────────
    if ADMIN_CALENDAR_RE.match(path) and method == "GET":
        from bookings import handle_calendar
        return _require_cors(handle_calendar(tenant_id, event), cors)

    # ── AI Config ─────────────────────────────────────────
    m_ai_config = ADMIN_AI_CONFIG_RE.match(path)
    if m_ai_config:
        from ai import handle_get_ai_config, handle_update_ai_config

        if method == "GET":
            return _require_cors(handle_get_ai_config(tenant_id), cors)
        if method == "PUT":
            return _require_cors(
                handle_update_ai_config(tenant_id, event), cors
            )

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── Conversations ─────────────────────────────────────
    m_conv = ADMIN_CONVERSATIONS_RE.match(path)
    if m_conv:
        conv_id = m_conv.group(1)
        action = m_conv.group(2)

        from ai import (
            handle_list_conversations,
            handle_get_conversation,
            handle_close_conversation,
        )

        # GET  /api/admin/conversations
        if not conv_id and method == "GET":
            return _require_cors(
                handle_list_conversations(tenant_id, event), cors
            )

        if conv_id:
            # POST /api/admin/conversations/{id}/close
            if action == "close" and method == "POST":
                return _require_cors(
                    handle_close_conversation(tenant_id, conv_id), cors
                )
            # GET  /api/admin/conversations/{id}
            if not action and method == "GET":
                return _require_cors(
                    handle_get_conversation(tenant_id, conv_id), cors
                )

        return _require_cors(_response(404, {"error": "Not found"}), cors)

    # ── 404 fallback ──────────────────────────────────────
    return _require_cors(_response(404, {"error": "Not found"}), cors)


# ── Auth middleware ────────────────────────────────────────────


def _authenticate(event):
    """
    Weryfikuje JWT Bearer token z nagłówka Authorization.
    Zwraca payload dict (zawiera sub, tenant_id, role, email) lub None.
    """
    from auth import verify_token

    headers = event.get("headers") or {}
    auth_header = headers.get("authorization") or headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[len("Bearer "):]
    return verify_token(token)


# ── Health ─────────────────────────────────────────────────────


def _handle_health():
    """GET /api/health — sprawdza stan API i baz danych."""
    try:
        from db import query

        result = query("SELECT 1 AS ok", fetch="one")
        db_ok = result is not None and result.get("ok") == 1
        status_code = 200 if db_ok else 503
        return _response(status_code, {
            "status": "healthy" if db_ok else "degraded",
            "database": "connected" if db_ok else "disconnected",
        })
    except Exception as e:
        return _response(503, {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
        })


# ── CORS ───────────────────────────────────────────────────────

_ALLOWED_ORIGINS_ENV = os.environ.get("ALLOWED_ORIGINS", "*")


def _get_cors_origin(event):
    """Zwraca dozwolony origin CORS na podstawie nagłówka Origin."""
    origins = [o.strip() for o in _ALLOWED_ORIGINS_ENV.split(",") if o.strip()]
    if not origins or origins == ["*"]:
        return "*"
    headers = event.get("headers") or {}
    request_origin = headers.get("origin") or headers.get("Origin", "")
    if request_origin in origins:
        return request_origin
    # Fallback: pierwszy dozwolony
    return origins[0]


def _require_cors(resp, cors_origin):
    """Dodaje nagłówki CORS do odpowiedzi."""
    resp.setdefault("headers", {})
    resp["headers"]["Access-Control-Allow-Origin"] = cors_origin
    resp["headers"]["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    resp["headers"]["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    resp["headers"]["Content-Type"] = "application/json"
    return resp


# ── Response helpers ───────────────────────────────────────────


def _response(status_code, body, cors="*", extra_headers=None):
    """Tworzy standardową odpowiedź API."""
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": cors,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    }
    if extra_headers:
        headers.update(extra_headers)
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body, ensure_ascii=False, default=str)
        if isinstance(body, (dict, list))
        else body,
    }


def _parse_body(event):
    """Parsuje ciało żądania JSON (używane przez inne moduły)."""
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


# ── Event helpers ──────────────────────────────────────────────


def _get_method(event):
    """Wyciąga metodę HTTP z eventu (Scaleway / API GW v2 / compat)."""
    return (
        event.get("http", {}).get("method")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "GET")
    )


def _get_path(event):
    """Wyciąga ścieżkę URL z eventu."""
    return (
        event.get("http", {}).get("path")
        or event.get("requestContext", {}).get("http", {}).get("path")
        or event.get("path", "")
    )
