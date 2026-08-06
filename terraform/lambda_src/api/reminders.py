"""
D-21 reminder — wywoływany przez zaplanowaną funkcję (Scaleway Scheduled Function).

Znajduje potwierdzone bookingi, gdzie event_date = dziś + 21 dni,
wysyła e-mail przypominający i oznacza reminder_21_sent = TRUE.

Wymaga kolumny reminder_21_sent w tabeli bookings (BOOLEAN DEFAULT FALSE).
"""

import json
import logging
from datetime import datetime, timezone, timedelta

from db import get_connection, return_connection, query, execute, serialize


def handle_d21_reminders(event):
    """
    Handler dla zaplanowanej funkcji (Scaleway Scheduled Function / cron).

    Event format (Scaleway):
      { "schedule": "trigger" }

    Query: wszystkie confirmed bookingi z event_date = today + 21 dni,
    dla których reminder_21_sent IS NULL OR reminder_21_sent = FALSE.
    """
    target_date = (datetime.now(timezone.utc) + timedelta(days=21)).strftime("%Y-%m-%d")
    logging.info("D-21 reminder: szukam bookingów na %s", target_date)

    try:
        rows = query(
            """SELECT b.*, t.company_name, t.contact_email, t.primary_color, t.logo_url
               FROM bookings b
               JOIN tenants t ON b.tenant_id = t.id
               WHERE b.status = 'confirmed'
                 AND b.event_date = %s
                 AND (b.reminder_21_sent IS NULL OR b.reminder_21_sent = FALSE)""",
            (target_date,),
        )
    except Exception as e:
        logging.error("D-21 query failed: %s", e)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    reminders_sent = 0
    errors = 0

    for row in rows:
        booking_id = row.get("id", "")
        client_email = row.get("client_email", "")

        if not client_email:
            logging.warning("D-21: brak client_email dla booking %s, pomijam", booking_id)
            continue

        try:
            # Wyślij e-mail
            if _send_reminder_email(row):
                # Oznacz jako wysłany tylko gdy email faktycznie poszedł
                now = datetime.now(timezone.utc)
                execute(
                    "UPDATE bookings SET reminder_21_sent = TRUE, updated_at = %s WHERE id = %s",
                    (now, booking_id),
                )
                reminders_sent += 1
                logging.info("D-21: reminder wysłany do %s (booking %s)", client_email, booking_id)
            else:
                errors += 1
                logging.error("D-21: nie udało się wysłać remindera do %s (booking %s)", client_email, booking_id)
        except Exception as e:
            errors += 1
            logging.error("D-21: błąd dla booking %s: %s", booking_id, e)

    logging.info(
        "D-21 reminder zakończony. Wysłane: %d, Błędy: %d",
        reminders_sent,
        errors,
    )
    return {
        "statusCode": 200,
        "body": json.dumps({
            "reminders_sent": reminders_sent,
            "errors": errors,
        }),
    }


def _send_reminder_email(booking):
    """
    Wysyła e-mail D-21 z prośbą o potwierdzenie szczegółów.

    Args:
        booking: dict z bookings + tenant info (company_name, primary_color, logo_url)
    """
    from mailer import send_email

    client_name = booking.get("client_name", "")
    client_email = booking.get("client_email", "")
    event_date = booking.get("event_date", "")
    event_location = booking.get("event_location", "")
    event_time_start = booking.get("event_time_start", "")
    event_time_end = booking.get("event_time_end", "")
    company_name = booking.get("company_name", "")
    primary_color = booking.get("primary_color", "#C9A96E")
    logo_url = booking.get("logo_url", "")

    # Sformatuj datę
    date_formatted = str(event_date)
    try:
        dt = datetime.strptime(str(event_date), "%Y-%m-%d")
        date_formatted = dt.strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        pass

    time_str = event_time_start or ""
    if event_time_start and event_time_end:
        time_str = f"{event_time_start} – {event_time_end}"

    content_html = f"""
    <h2 style="color:#333333;margin:0 0 16px 0;">Przypomnienie – {date_formatted}</h2>
    <p style="margin:0 0 16px 0;">Dzień dobry <strong>{client_name}</strong>,</p>
    <p style="margin:0 0 16px 0;">
        Pozostały 3 tygodnie do Twojego wydarzenia!
        Chciałbym potwierdzić następujące szczegóły:
    </p>
    <table role="presentation" width="100%" cellpadding="8" cellspacing="0"
           style="background-color:#f9f9f9;border-radius:6px;margin:16px 0;font-size:14px;">
        <tr><td style="font-weight:bold;color:#555555;width:140px;">Data wydarzenia</td>
            <td>{date_formatted}</td></tr>
        {f'<tr><td style="font-weight:bold;color:#555555;">Godzina</td><td>{time_str}</td></tr>' if time_str else ''}
        {f'<tr><td style="font-weight:bold;color:#555555;">Miejsce</td><td>{event_location}</td></tr>' if event_location else ''}
    </table>
    <p style="margin:16px 0 0 0;"><strong>Proszę o potwierdzenie:</strong></p>
    <ol style="margin:8px 0 16px 0;color:#444444;line-height:1.7;">
        <li>Czy data i godzina są aktualne?</li>
        <li>Czy lokalizacja się nie zmieniła?</li>
        <li>Czy mają Państwo jakieś dodatkowe pytania lub prośby?</li>
    </ol>
    <p style="margin:16px 0 0 0;color:#777777;font-size:13px;">
        Z góry dziękuję za potwierdzenie i pozostaję do dyspozycji.
    </p>
    """

    # Użyj base template z email.py
    from mailer import _build_base_html
    html = _build_base_html(content_html, {
        "primary_color": primary_color,
        "company_name": company_name,
        "logo_url": logo_url,
    })

    text = (
        f"Przypomnienie – {date_formatted}\n\n"
        f"Dzień dobry {client_name},\n\n"
        f"Pozostały 3 tygodnie do Twojego wydarzenia!\n"
        f"Proszę o potwierdzenie szczegółów:\n"
        f"- Data: {date_formatted}\n"
        f"- Godzina: {time_str}\n"
        f"- Miejsce: {event_location}\n\n"
        f"1. Czy data i godzina są aktualne?\n"
        f"2. Czy lokalizacja się nie zmieniła?\n"
        f"3. Czy mają Państwo jakieś pytania?\n"
    )

    subject = f"Przypomnienie – {date_formatted} | {company_name}"
    return send_email(client_email, subject, html, text_body=text)
