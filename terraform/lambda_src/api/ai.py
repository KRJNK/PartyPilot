"""
Moduł AI asystenta — czat, konfiguracja, rozmowy.

Endpoints:
  POST /api/public/{tenant_id}/chat        — wyślij wiadomość, otrzymaj odpowiedź AI
  GET  /api/admin/ai-config                — pobierz konfigurację AI
  PUT  /api/admin/ai-config                — aktualizuj konfigurację AI
  GET  /api/admin/conversations            — lista rozmów
  GET  /api/admin/conversations/{id}       — szczegóły rozmowy
  POST /api/admin/conversations/{id}/close — zamknij rozmowę
"""

import json
import logging
import os
import re
import urllib.request
from datetime import datetime, timezone, timedelta

import psycopg2
import psycopg2.extras

from db import (
    get_connection, return_connection, query, execute,
    serialize, next_booking_id,
)

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")

# ── Wzorce regex ─────────────────────────────────

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(r"(\+?48)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{3}")
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}")


# ══════════════════════════════════════════════════
# PUBLIC — Chat
# ══════════════════════════════════════════════════


def handle_chat(tenant_id, event):
    """
    POST /api/public/{tenant_id}/chat

    Przyjmuje wiadomość od klienta, odpowiada przez AI (Mistral).
    Jeśli brak conversation_id — tworzy nową rozmowę.
    Rate limiting: max 20 wiadomości na konwersację.
    """
    body = _parse_body(event)
    message = (body.get("message") or "").strip()
    conversation_id = (body.get("conversation_id") or "").strip()

    if not message:
        return _resp(400, {"error": "Message is required"})

    # 1. Sprawdź czy tenant istnieje i jest aktywny
    tenant = query(
        "SELECT * FROM tenants WHERE id = %s",
        (tenant_id,),
        fetch="one",
    )
    if not tenant:
        return _resp(404, {"error": "Tenant not found"})
    if tenant.get("status") != "active":
        return _resp(404, {"error": "Tenant not found or inactive"})

    # 2. Pobierz konfigurację AI tenanta
    ai_config = query(
        "SELECT * FROM ai_config WHERE tenant_id = %s",
        (tenant_id,),
        fetch="one",
    )

    # Jeśli AI wyłączone — canned response
    if not ai_config or not ai_config.get("enabled", False):
        contact = (
            (ai_config or {}).get("escalation_email", "")
            or tenant.get("contact_email", "")
            or tenant.get("owner_email", "")
        )
        return _resp(200, {
            "conversation_id": conversation_id or "",
            "reply": f"Asystent jest wyłączony. Skontaktuj się bezpośrednio: {contact}",
            "lead_qualified": False,
        })

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # 3. Ustal lub utwórz konwersację
        if conversation_id:
            cur.execute(
                "SELECT id, status FROM conversations "
                "WHERE id = %s AND tenant_id = %s",
                (conversation_id, tenant_id),
            )
            conv = cur.fetchone()
            if not conv:
                return _resp(404, {"error": "Conversation not found"})
            if conv["status"] == "closed":
                return _resp(400, {"error": "Conversation is closed"})

            # Rate limiting: max 20 wiadomości na konwersację
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = %s",
                (conversation_id,),
            )
            if cur.fetchone()["cnt"] >= 20:
                return _resp(429, {
                    "error": "Limit wiadomości w tej rozmowie został osiągnięty (max 20).",
                })
        else:
            # Nowa konwersacja
            cur.execute(
                "INSERT INTO conversations (tenant_id, status, created_at, updated_at) "
                "VALUES (%s, 'active', NOW(), NOW()) RETURNING id",
                (tenant_id,),
            )
            conversation_id = str(cur.fetchone()["id"])

        # 4. Zapisz wiadomość użytkownika
        cur.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) "
            "VALUES (%s, 'user', %s, NOW())",
            (conversation_id, message),
        )

        # 5. Pobierz historię (ostatnie 10 wiadomości)
        cur.execute(
            "SELECT role, content FROM messages "
            "WHERE conversation_id = %s ORDER BY created_at ASC LIMIT 10",
            (conversation_id,),
        )
        history = cur.fetchall()

        # 6. Pobierz pakiety tenanta
        cur.execute(
            "SELECT name, price, duration FROM packages "
            "WHERE tenant_id = %s ORDER BY sort_order ASC",
            (tenant_id,),
        )
        packages = cur.fetchall()

        # 7. Zbuduj system prompt
        company_name = tenant.get("company_name", "")
        faq_text = ai_config.get("faq_text", "")
        tone = ai_config.get("tone", "friendly")
        business_hours = ai_config.get("business_hours", "")

        packages_lines = []
        for p in packages:
            name = p["name"]
            price_raw = p.get("price")
            price = f"{float(price_raw):.0f} zł" if price_raw else "do ustalenia"
            duration = p.get("duration") or ""
            if duration:
                packages_lines.append(f"- {name}: {price} ({duration})")
            else:
                packages_lines.append(f"- {name}: {price}")
        packages_summary = "\n".join(packages_lines) if packages_lines else "Brak pakietów."

        system_prompt = (
            f"Jesteś asystentem AI dla {company_name}, firmy z branży ślubnej.\n"
            f"Twoje zadanie: odpowiadać na zapytania potencjalnych klientów, kwalifikować leady.\n\n"
            f"Informacje o firmie:\n{faq_text}\n\n"
            f"Pakiety:\n{packages_summary}\n\n"
            f"Godziny pracy: {business_hours}\n\n"
            f"Zasady:\n"
            f"- Odpowiadaj po polsku, uprzejmie i {tone}\n"
            f"- Krótkie odpowiedzi (max 2-3 zdania)\n"
            f"- Zbierz: imię, email, telefon, datę wesela, miejsce, budżet\n"
            f"- Jeśli klient jest gotowy na rezerwację: zapytaj o email i telefon\n"
            f"- Nie obiecywaj rzeczy których nie ma w informacjach\n"
            f"- Jeśli nie wiesz: powiedz że sprawdzisz i oddzwonisz"
        )

        # 8. Zbuduj listę wiadomości dla API
        api_messages = [{"role": "system", "content": system_prompt}]
        for row in history:
            api_messages.append({"role": row["role"], "content": row["content"]})
        api_messages.append({"role": "user", "content": message})

        # 9. Wywołaj Mistral API
        reply = _call_mistral(api_messages)
        if not reply:
            reply = (
                "Przepraszam, mam chwilowy problem techniczny. "
                "Spróbuj za chwilę lub skontaktuj się bezpośrednio."
            )

        # 10. Zapisz odpowiedź AI
        cur.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at) "
            "VALUES (%s, 'assistant', %s, NOW())",
            (conversation_id, reply),
        )

        # 11. Sprawdź kwalifikację leada
        lead_qualified, client_name, client_email, client_phone, client_date = (
            _check_lead_qualification(conversation_id, cur)
        )

        if lead_qualified:
            # Oznacz konwersację jako lead qualified
            cur.execute(
                "UPDATE conversations SET lead_qualified = TRUE, "
                "client_name = %s, client_email = %s, updated_at = NOW() "
                "WHERE id = %s",
                (client_name or "", client_email or "", conversation_id),
            )

            # Auto-create booking jeśli włączone
            if ai_config.get("auto_create_booking", True):
                _create_booking_from_lead(
                    conn, cur, tenant_id, conversation_id, client_name,
                    client_email, client_phone, client_date,
                )

            # Wyślij escalation email do vendora
            _send_escalation(tenant, ai_config, conversation_id, client_name,
                             client_email, client_phone)

        conn.commit()

        return _resp(200, {
            "conversation_id": conversation_id,
            "reply": reply,
            "lead_qualified": bool(lead_qualified),
        })

    except Exception as e:
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        logging.error("Chat error: %s", e)
        return _resp(500, {"error": f"Failed to process chat: {str(e)}"})
    finally:
        return_connection(conn)


# ══════════════════════════════════════════════════
# ADMIN — AI Config
# ══════════════════════════════════════════════════


def handle_get_ai_config(tenant_id):
    """
    GET /api/admin/ai-config

    Zwraca konfigurację AI asystenta dla tenanta.
    """
    try:
        config = query(
            "SELECT * FROM ai_config WHERE tenant_id = %s",
            (tenant_id,),
            fetch="one",
        )
        if not config:
            return _resp(200, {
                "tenant_id": tenant_id,
                "enabled": False,
                "system_prompt": "",
                "faq_text": "",
                "tone": "friendly",
                "business_hours": "",
                "escalation_email": "",
                "auto_create_booking": True,
            })
        return _resp(200, config)
    except Exception as e:
        return _resp(500, {"error": f"Failed to get AI config: {str(e)}"})


def handle_update_ai_config(tenant_id, event):
    """
    PUT /api/admin/ai-config

    Aktualizuje konfigurację AI asystenta.
    Jeśli nie istnieje — tworzy nową.
    """
    body = _parse_body(event)
    if not body:
        return _resp(400, {"error": "No fields to update"})

    updatable = [
        "enabled", "system_prompt", "faq_text", "tone",
        "business_hours", "escalation_email", "auto_create_booking",
    ]

    insert_fields = []
    insert_placeholders = []
    all_values = [tenant_id]
    for field in updatable:
        if field in body:
            insert_fields.append(field)
            insert_placeholders.append("%s")
            all_values.append(body[field])
    all_values.append(datetime.now(timezone.utc))

    if not insert_fields:
        return _resp(400, {"error": "No valid fields to update"})

    insert_sql = (
        f"INSERT INTO ai_config (tenant_id, {', '.join(insert_fields)}, updated_at) "
        f"VALUES (%s, {', '.join(insert_placeholders)}, %s) "
        f"ON CONFLICT (tenant_id) DO UPDATE SET "
    )

    update_parts = [f"{f} = EXCLUDED.{f}" for f in insert_fields]
    update_parts.append("updated_at = EXCLUDED.updated_at")

    full_sql = insert_sql + ", ".join(update_parts) + " RETURNING *"

    try:
        result = execute(full_sql, all_values)
        if result:
            return _resp(200, result)
        return _resp(500, {"error": "Failed to update AI config"})
    except Exception as e:
        return _resp(500, {"error": f"Failed to update AI config: {str(e)}"})


# ══════════════════════════════════════════════════
# ADMIN — Conversations
# ══════════════════════════════════════════════════


def handle_list_conversations(tenant_id, event):
    """
    GET /api/admin/conversations

    Lista rozmów z filtrowaniem po statusie i paginacją.
    Każda rozmowa zawiera preview ostatniej wiadomości.
    """
    params = _get_query_params(event)
    status = (params.get("status") or "").strip()
    try:
        page = int(params.get("page", "1"))
        limit = int(params.get("limit", "20"))
    except (ValueError, TypeError):
        return _resp(400, {"error": "Invalid page or limit parameter"})
    if limit > 100:
        limit = 100
    offset = (page - 1) * limit

    conditions = ["c.tenant_id = %s"]
    sql_params = [tenant_id]

    if status:
        conditions.append("c.status = %s")
        sql_params.append(status)

    where = " AND ".join(conditions)

    try:
        rows = query(
            f"""SELECT c.*,
                       (SELECT content FROM messages
                        WHERE conversation_id = c.id
                        ORDER BY created_at DESC LIMIT 1) AS last_message
                FROM conversations c
                WHERE {where}
                ORDER BY c.updated_at DESC
                LIMIT %s OFFSET %s""",
            sql_params + [limit, offset],
        )

        total_result = query(
            f"SELECT COUNT(*) AS count FROM conversations c WHERE {where}",
            sql_params,
            fetch="one",
        )
        total = total_result["count"] if total_result else 0

        return _resp(200, {
            "conversations": rows,
            "count": len(rows),
            "total": total,
            "page": page,
            "limit": limit,
        })
    except Exception as e:
        return _resp(500, {"error": f"Failed to list conversations: {str(e)}"})


def handle_get_conversation(tenant_id, conv_id):
    """
    GET /api/admin/conversations/{id}

    Zwraca konwersację + wszystkie wiadomości.
    """
    try:
        conversation = query(
            "SELECT * FROM conversations WHERE id = %s AND tenant_id = %s",
            (conv_id, tenant_id),
            fetch="one",
        )
        if not conversation:
            return _resp(404, {"error": "Conversation not found"})

        messages = query(
            "SELECT * FROM messages WHERE conversation_id = %s ORDER BY created_at ASC",
            (conv_id,),
        )

        conversation["messages"] = messages
        return _resp(200, conversation)
    except Exception as e:
        return _resp(500, {"error": f"Failed to get conversation: {str(e)}"})


def handle_close_conversation(tenant_id, conv_id):
    """
    POST /api/admin/conversations/{id}/close

    Zamyka konwersację (status = 'closed').
    """
    try:
        result = execute(
            "UPDATE conversations SET status = 'closed', updated_at = NOW() "
            "WHERE id = %s AND tenant_id = %s RETURNING *",
            (conv_id, tenant_id),
        )
        if not result:
            return _resp(404, {"error": "Conversation not found"})
        return _resp(200, result)
    except Exception as e:
        return _resp(500, {"error": f"Failed to close conversation: {str(e)}"})


# ══════════════════════════════════════════════════
# HELPERS — Mistral API
# ══════════════════════════════════════════════════


def _call_mistral(messages):
    """
    Wywołuje Mistral Chat Completions API (model mistral-small-latest).

    Args:
        messages: lista dictów [{"role": "system"|"user"|"assistant", "content": "..."}]

    Returns:
        Tekst odpowiedzi (str) lub None przy błędzie.
    """
    if not MISTRAL_API_KEY:
        logging.warning("MISTRAL_API_KEY not configured")
        return None

    payload = json.dumps({
        "model": "mistral-small-latest",
        "messages": messages,
        "max_tokens": 300,
        "temperature": 0.7,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
    }

    try:
        req = urllib.request.Request(
            "https://api.mistral.ai/v1/chat/completions",
            data=payload,
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            content = result["choices"][0]["message"]["content"].strip()
            return content
    except Exception as e:
        logging.error("Mistral API call failed: %s", e)
        return None


# ══════════════════════════════════════════════════
# HELPERS — Lead qualification
# ══════════════════════════════════════════════════


def _check_lead_qualification(conversation_id, cur):
    """
    Sprawdza czy konwersacja zawiera email, telefon i datę wydarzenia.
    Jeśli tak — lead jest zakwalifikowany.

    Returns:
        (lead_qualified: bool, client_name: str, client_email: str, client_phone: str)
    """
    cur.execute(
        "SELECT content, role FROM messages "
        "WHERE conversation_id = %s ORDER BY created_at ASC",
        (conversation_id,),
    )
    rows = cur.fetchall()

    all_text = " ".join(r["content"] for r in rows)

    email = _extract_email(all_text)
    phone = _extract_phone(all_text)
    date = _extract_date(all_text)
    name = _extract_name(all_text)

    qualified = bool(email and phone and date)
    return qualified, name, email, phone, date


def _extract_email(text):
    """Wyciąga adres email z tekstu."""
    m = _EMAIL_RE.search(text)
    return m.group(0) if m else ""


def _extract_phone(text):
    """Wyciąga numer telefonu z tekstu."""
    m = _PHONE_RE.search(text)
    return m.group(0).strip() if m else ""


def _extract_date(text):
    """Wyciąga datę w formacie YYYY-MM-DD lub DD.MM.YYYY z tekstu."""
    m = _DATE_RE.search(text)
    return m.group(0) if m else ""


def _extract_name(text):
    """
    Próbuje wyciągnąć imię klienta z tekstu rozmowy.
    Szuka fraz: 'mam na imię', 'jestem', 'nazywam się'.
    """
    patterns = [
        r"(?:mam na imi[eę]|jestem|nazywam si[eę])\s+(\w+)",
        r"imi[eę][:\s]+(\w+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return ""


# ══════════════════════════════════════════════════
# HELPERS — Auto-create booking & escalation
# ══════════════════════════════════════════════════


def _normalize_event_date(date_str):
    """
    Normalizuje datę do formatu YYYY-MM-DD.
    Obsługuje formaty: YYYY-MM-DD oraz DD.MM.YYYY.
    Zwraca None jeśli data jest pusta lub nieprawidłowa.
    """
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _create_booking_from_lead(conn, cur, tenant_id, conversation_id,
                               client_name, client_email, client_phone,
                               event_date=""):
    """
    Tworzy booking ze statusem 'inquiry' i source='ai_qualified'.
    """
    booking_id = next_booking_id(tenant_id)
    now = datetime.now(timezone.utc)

    # Użyj daty wyekstrahowanej z rozmowy, jeśli poprawna, inaczej fallback
    resolved_date = _normalize_event_date(event_date)
    if not resolved_date:
        resolved_date = (now + timedelta(days=365)).strftime("%Y-%m-%d")

    cur.execute(
        """INSERT INTO bookings (
               id, tenant_id, status, source,
               client_name, client_email, client_phone,
               event_date, created_at, updated_at
           ) VALUES (%s, %s, 'inquiry', 'ai_qualified',
               %s, %s, %s,
               %s::date, %s, %s)""",
        (
            booking_id,
            tenant_id,
            client_name or "Lead AI",
            client_email or "",
            client_phone or "",
            resolved_date,
            now,
            now,
        ),
    )

    cur.execute(
        "INSERT INTO booking_status_history (booking_id, status, note) "
        "VALUES (%s, 'inquiry', 'Auto-created from AI qualified lead')",
        (booking_id,),
    )

    logging.info(
        "Auto-created booking %s from AI lead (conv: %s)",
        booking_id, conversation_id,
    )


def _send_escalation(tenant, ai_config, conversation_id,
                     client_name, client_email, client_phone):
    """
    Wysyła e-mail escalation do vendora z informacjami o leadzie.
    """
    escalation_email = (
        ai_config.get("escalation_email", "")
        or tenant.get("contact_email", "")
        or tenant.get("owner_email", "")
    )

    if not escalation_email:
        logging.warning(
            "No escalation email for tenant %s — skipping", tenant.get("id")
        )
        return

    try:
        from mailer import send_lead_escalation

        send_lead_escalation(
            tenant_info=tenant,
            conversation={
                "id": conversation_id,
                "client_name": client_name or "",
                "client_email": client_email or "",
                "client_phone": client_phone or "",
            },
        )
        logging.info("Escalation email sent to %s", escalation_email)
    except Exception as e:
        logging.error("Failed to send escalation email: %s", e)


# ══════════════════════════════════════════════════
# HELPERS — Standardowe
# ══════════════════════════════════════════════════


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
