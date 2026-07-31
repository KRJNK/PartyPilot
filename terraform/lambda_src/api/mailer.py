"""
Moduł email — wysyłanie transakcyjnych e-maili przez SMTP (Scaleway TEM).

Używa wyłącznie stdlib (smtplib, email.mime).
Konfiguracja przez zmienne środowiskowe:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ── Konfiguracja SMTP ───────────────────────────────────────────

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.tem.scw.cloud")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "noreply@partypilot.pl")


# ── Publiczny helper SMTP ───────────────────────────────────────


def send_email(to, subject, html_body, text_body=None):
    """
    Wysyła e-mail przez SMTP z TLS.

    Args:
        to: adres odbiorcy (str)
        subject: temat (str)
        html_body: treść HTML (str)
        text_body: treść plain-text fallback (str, opcjonalnie)

    Returns:
        True jeśli wysłano, False przy błędzie
    """
    if not SMTP_USER or not SMTP_PASS:
        logging.warning("SMTP not configured — skipping email to %s", to)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject

    # Plain-text fallback
    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))

    # HTML body
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, [to], msg.as_string())
        server.quit()
        logging.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:
        logging.error("Failed to send email to %s: %s", to, e)
        return False


# ── Szablony e-maili ────────────────────────────────────────────


def _build_base_html(content_html, tenant_info):
    """
    Owija treść w bazowy szablon HTML z brandingiem tenanta.
    """
    primary_color = tenant_info.get("primary_color", "#C9A96E")
    company_name = tenant_info.get("company_name", "")
    logo_url = tenant_info.get("logo_url", "")

    logo_html = (
        f'<img src="{logo_url}" alt="{company_name}" '
        f'style="max-width:180px;height:auto;margin-bottom:16px;">'
        if logo_url
        else f'<h1 style="color:{primary_color};margin:0 0 16px 0;font-size:24px;">{company_name}</h1>'
    )

    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="background-color:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 32px 16px 32px;text-align:center;border-bottom:3px solid {primary_color};">
              {logo_html}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px 32px;font-size:15px;line-height:1.6;color:#333333;">
              {content_html}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background-color:#f9f9f9;font-size:12px;color:#999999;text-align:center;">
              {company_name} &mdash; System rezerwacji<br>
              Wiadomość wygenerowana automatycznie, nie odpowiadaj na nią.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_booking_confirmation(tenant_info, booking):
    """
    Wysyła e-mail potwierdzający do klienta po złożeniu rezerwacji.

    Args:
        tenant_info: dict z polami company_name, primary_color, logo_url
        booking: dict z booking data (client_email, client_name, event_date,
                 event_time_start, event_time_end, event_location, package_name,
                 package_price, deposit_amount)
    """
    client_email = booking.get("client_email", "")
    if not client_email:
        logging.warning("No client email — skipping confirmation")
        return False

    client_name = booking.get("client_name", "Kliencie")
    company_name = tenant_info.get("company_name", "Organizator")
    event_date = booking.get("event_date", "")
    event_time = ""
    if booking.get("event_time_start"):
        event_time = booking["event_time_start"]
        if booking.get("event_time_end"):
            event_time += f" – {booking['event_time_end']}"

    package_name = booking.get("package_name", "")
    package_price = booking.get("package_price", 0)
    deposit_amount = booking.get("deposit_amount", 0)

    content = f"""
    <h2 style="color:#333333;margin:0 0 16px 0;">Dziękujemy za zapytanie!</h2>
    <p style="margin:0 0 16px 0;">Witaj <strong>{client_name}</strong>,</p>
    <p style="margin:0 0 16px 0;">
      Twoja rezerwacja w <strong>{company_name}</strong> została przyjęta.
      Otrzymasz od nas wkrótce odpowiedź z dalszymi krokami.
    </p>

    <table role="presentation" width="100%" cellpadding="8" cellspacing="0"
           style="background-color:#f9f9f9;border-radius:6px;margin:16px 0;font-size:14px;">
      <tr><td style="font-weight:bold;color:#555555;width:120px;">Data wydarzenia</td>
          <td>{event_date}</td></tr>
      {f'<tr><td style="font-weight:bold;color:#555555;">Godzina</td><td>{event_time}</td></tr>' if event_time else ''}
      {f'<tr><td style="font-weight:bold;color:#555555;">Miejsce</td><td>{booking["event_location"]}</td></tr>' if booking.get("event_location") else ''}
      {f'<tr><td style="font-weight:bold;color:#555555;">Pakiet</td><td>{package_name}</td></tr>' if package_name else ''}
      {f'<tr><td style="font-weight:bold;color:#555555;">Cena pakietu</td><td>{package_price:.2f} zł</td></tr>' if package_price else ''}
      {f'<tr><td style="font-weight:bold;color:#555555;">Wymagana zaliczka</td><td>{deposit_amount:.2f} zł</td></tr>' if deposit_amount else ''}
    </table>

    <p style="margin:16px 0 0 0;font-size:13px;color:#777777;">
      Jeśli masz jakiekolwiek pytania, skontaktuj się z nami bezpośrednio.
    </p>
    """

    subject = f"Potwierdzenie przyjęcia rezerwacji – {company_name}"
    html = _build_base_html(content, tenant_info)
    text = (
        f"Dziękujemy za zapytanie, {client_name}!\n\n"
        f"Twoja rezerwacja w {company_name} została przyjęta.\n"
        f"Data wydarzenia: {event_date}\n"
        f"{'Godzina: ' + event_time if event_time else ''}\n\n"
        f"Otrzymasz od nas wkrótce odpowiedź."
    )

    return send_email(client_email, subject, html, text_body=text)


def send_booking_notification(tenant_info, booking):
    """
    Wysyła powiadomienie do organizatora o nowej rezerwacji.

    Args:
        tenant_info: dict z polami company_name, contact_email, owner_email
        booking: dict z booking data
    """
    recipient = tenant_info.get("contact_email") or tenant_info.get("owner_email", "")
    if not recipient:
        logging.warning("No contact/owner email for tenant — skipping notification")
        return False

    client_name = booking.get("client_name", "?")
    event_date = booking.get("event_date", "?")
    company_name = tenant_info.get("company_name", "")

    content = f"""
    <h2 style="color:#333333;margin:0 0 16px 0;">Nowa rezerwacja!</h2>
    <p style="margin:0 0 16px 0;">
      Otrzymałeś nową rezerwację od <strong>{client_name}</strong> na
      <strong>{event_date}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="8" cellspacing="0"
           style="background-color:#f9f9f9;border-radius:6px;margin:16px 0;font-size:14px;">
      <tr><td style="font-weight:bold;color:#555555;width:140px;">Klient</td>
          <td>{booking.get("client_name", "")}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Email</td>
          <td>{booking.get("client_email", "")}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Telefon</td>
          <td>{booking.get("client_phone", "")}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Data wydarzenia</td>
          <td>{event_date}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Godzina</td>
          <td>{booking.get("event_time_start", "")} – {booking.get("event_time_end", "")}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Miejsce</td>
          <td>{booking.get("event_location", "")}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Liczba gości</td>
          <td>{booking.get("guest_count", 0)}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Pakiet</td>
          <td>{booking.get("package_name", "")} ({booking.get("package_id", "")})</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Cena pakietu</td>
          <td>{booking.get("package_price", 0):.2f} zł</td></tr>
    </table>

    <p style="margin:16px 0 0 0;">
      <a href="mailto:{booking.get("client_email", "")}"
         style="display:inline-block;padding:10px 20px;background-color:{tenant_info.get("primary_color", "#C9A96E")};
                color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
        Odpowiedz klientowi
      </a>
    </p>
    """

    subject = f"Nowa rezerwacja od {client_name} na {event_date}"
    html = _build_base_html(content, tenant_info)
    text = (
        f"Nowa rezerwacja od {client_name} na {event_date}\n\n"
        f"Klient: {booking.get('client_name', '')}\n"
        f"Email: {booking.get('client_email', '')}\n"
        f"Telefon: {booking.get('client_phone', '')}\n"
        f"Data: {event_date}\n"
        f"Godzina: {booking.get('event_time_start', '')} – {booking.get('event_time_end', '')}\n"
        f"Miejsce: {booking.get('event_location', '')}\n"
        f"Pakiet: {booking.get('package_name', '')}\n"
    )

    return send_email(recipient, subject, html, text_body=text)


def send_contract_email(tenant_info, booking, contract_url):
    """
    Wysyła e-mail do klienta z linkiem do wygenerowanej umowy PDF.

    Args:
        tenant_info: dict z polami company_name, primary_color, logo_url, contact_email
        booking: dict z booking data (client_email, client_name, event_date,
                 package_final_price, deposit_amount)
        contract_url: publiczny URL do PDF

    Returns:
        True jeśli wysłano, False przy błędzie
    """
    client_email = booking.get("client_email", "")
    if not client_email:
        logging.warning("No client email — skipping contract email")
        return False

    client_name = booking.get("client_name", "")
    company_name = tenant_info.get("company_name", "Organizator")
    event_date = booking.get("event_date", "")
    final_price = float(booking.get("package_final_price", 0))
    deposit = float(booking.get("deposit_amount", 0))
    remaining = final_price - deposit

    date_formatted = str(event_date)
    try:
        dt = datetime.strptime(str(event_date), "%Y-%m-%d")
        date_formatted = dt.strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        pass

    content = f"""
    <h2 style="color:#333333;margin:0 0 16px 0;">Twoja umowa jest gotowa!</h2>
    <p style="margin:0 0 16px 0;">Dzień dobry <strong>{client_name}</strong>,</p>
    <p style="margin:0 0 16px 0;">
        Przygotowałem dla Ciebie umowę dotyczącą wydarzenia
        w dniu <strong>{date_formatted}</strong>.
    </p>
    <p style="text-align:center;margin:24px 0;">
        <a href="{contract_url}"
           style="display:inline-block;background-color:{tenant_info.get('primary_color', '#C9A96E')};
                  color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;
                  font-size:16px;font-weight:bold;">
            Pobierz umowę PDF
        </a>
    </p>
    <table role="presentation" width="100%" cellpadding="8" cellspacing="0"
           style="background-color:#f9f9f9;border-radius:6px;margin:16px 0;font-size:14px;">
        <tr><td style="font-weight:bold;color:#555555;width:140px;">Data wydarzenia</td>
            <td>{date_formatted}</td></tr>
        {f'<tr><td style="font-weight:bold;color:#555555;">Wartość umowy</td><td>{final_price:.2f} zł</td></tr>' if final_price else ''}
        {f'<tr><td style="font-weight:bold;color:#555555;">Zadatek</td><td>{deposit:.2f} zł</td></tr>' if deposit else ''}
        {f'<tr><td style="font-weight:bold;color:#555555;">Pozostało do zapłaty</td><td>{remaining:.2f} zł</td></tr>' if remaining else ''}
    </table>
    <p style="margin:16px 0 0 0;">
        Proszę o zapoznanie się z treścią umowy. W przypadku pytań
        pozostaję do dyspozycji.
    </p>
    <p style="margin:16px 0 0 0;font-size:13px;color:#777777;">
        Po podpisaniu proszę o odesłanie skanu lub zdjęcia umowy drogą mailową.
    </p>
    """

    subject = f"Umowa do podpisu – {date_formatted} | {company_name}"
    html = _build_base_html(content, tenant_info)
    text = (
        f"Twoja umowa jest gotowa, {client_name}!\n\n"
        f"Przygotowałem umowę na wydarzenie {date_formatted}.\n\n"
        f"Link do PDF: {contract_url}\n\n"
        f"Wartość umowy: {final_price:.2f} zł\n"
        f"{'Zadatek: ' + f'{deposit:.2f} zł' if deposit else ''}\n"
        f"{'Pozostało: ' + f'{remaining:.2f} zł' if remaining else ''}\n\n"
        f"Proszę o zapoznanie się i odesłanie podpisanej umowy.\n"
    )

    return send_email(client_email, subject, html, text_body=text)


def send_lead_escalation(tenant_info, conversation):
    """
    Wysyła e-mail powiadomienie do vendora o zakwalifikowanym leadzie.

    Args:
        tenant_info: dict z polami company_name, primary_color, logo_url,
                     contact_email, owner_email
        conversation: dict z polami id, client_name, client_email, client_phone
    """
    recipient = (
        tenant_info.get("contact_email")
        or tenant_info.get("owner_email", "")
    )
    if not recipient:
        logging.warning(
            "No escalation email — skipping lead notification"
        )
        return False

    client_name = conversation.get("client_name", "?")
    client_email = conversation.get("client_email", "?")
    client_phone = conversation.get("client_phone", "?")
    company_name = tenant_info.get("company_name", "")
    conv_id = conversation.get("id", "")

    content = f"""
    <h2 style="color:#333333;margin:0 0 16px 0;">🎉 Nowy lead zakwalifikowany!</h2>
    <p style="margin:0 0 16px 0;">
        Asystent AI zakwalifikował nowego leada dla
        <strong>{company_name}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="8" cellspacing="0"
           style="background-color:#f9f9f9;border-radius:6px;margin:16px 0;font-size:14px;">
      <tr><td style="font-weight:bold;color:#555555;width:140px;">Imię</td>
          <td>{client_name}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Email</td>
          <td>{client_email}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">Telefon</td>
          <td>{client_phone}</td></tr>
      <tr><td style="font-weight:bold;color:#555555;">ID rozmowy</td>
          <td>{conv_id}</td></tr>
    </table>

    <p style="margin:16px 0 0 0;">
      <a href="mailto:{client_email}"
         style="display:inline-block;padding:10px 20px;background-color:{tenant_info.get("primary_color", "#C9A96E")};
                color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
        Skontaktuj się z leadem
      </a>
    </p>
    """

    subject = f"🎉 Nowy lead zakwalifikowany – {client_name}"
    html = _build_base_html(content, tenant_info)
    text = (
        f"Nowy lead zakwalifikowany!\n\n"
        f"Imię: {client_name}\n"
        f"Email: {client_email}\n"
        f"Telefon: {client_phone}\n"
        f"ID rozmowy: {conv_id}\n\n"
        f"Asystent AI zakwalifikował nowego leada dla {company_name}."
    )

    return send_email(recipient, subject, html, text_body=text)
