"""
D-21 Reminder Function — triggered daily by Scaleway cron.
Sends reminder emails for confirmed bookings happening in 21 days.
"""
import os
import sys

# Add the API source to path so we can reuse modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


def handle_d21_reminders(event, context):
    """Entry point for scheduled D-21 reminder."""
    from db import execute, query
    from email import send_email
    from datetime import date, timedelta

    target_date = date.today() + timedelta(days=21)

    # Find confirmed bookings for target date that haven't been reminded yet
    bookings = query(
        """
        SELECT b.*, t.company_name, t.contact_email, t.primary_color,
               t.logo_url, t.owner_email
        FROM bookings b
        JOIN tenants t ON b.tenant_id = t.id
        WHERE b.status = 'confirmed'
          AND b.event_date = %s
          AND (b.reminder_21_sent IS NULL OR b.reminder_21_sent = FALSE)
    """,
        (target_date,),
    )

    sent = 0
    for booking in bookings:
        try:
            send_d21_reminder(booking)
            # Mark as sent
            execute(
                """
                UPDATE bookings
                SET reminder_21_sent = TRUE, updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
            """,
                (booking["id"], booking["tenant_id"]),
            )
            sent += 1
        except Exception as e:
            print(f"ERROR - Failed to send reminder for {booking['id']}: {e}")

    return {"sent": sent, "target_date": str(target_date)}


def send_d21_reminder(booking):
    """Send D-21 reminder email to client."""
    from email import send_email

    subject = (
        f"Przypomnienie: Twoje wydarzenie za 21 dni — {booking['event_date']}"
    )
    html = f"""
    <h2>Pamiętaj! Twoje wydarzenie odbędzie się za 21 dni.</h2>
    <p>Data: {booking['event_date']}</p>
    <p>Miejsce: {booking.get('event_location', 'do ustalenia')}</p>
    <p>Prosimy o potwierdzenie szczegółów.</p>
    """
    send_email(booking["client_email"], subject, html)
