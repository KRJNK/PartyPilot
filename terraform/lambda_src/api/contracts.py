"""
Contract PDF generation using fpdf2 + Scaleway Object Storage.

Generuje "Umowę o Wykonanie Dzieła" w PDF, przesyła na S3,
aktualizuje booking.contract_url i wysyła e-mail z linkiem do klienta.
"""

import json
import logging
import os
from datetime import datetime, timezone

from fpdf import FPDF

from db import query, execute

# ── Scaleway S3 ─────────────────────────────────────────────────

SCW_REGION = os.environ.get("SCW_REGION", "pl-waw-1")
SCW_ENDPOINT = f"https://s3.{SCW_REGION}.scw.cloud"
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "partypilot-storage")

_s3_client = None


def _get_s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        _s3_client = boto3.client(
            "s3",
            endpoint_url=SCW_ENDPOINT,
            region_name=SCW_REGION,
        )
    return _s3_client


# ── Polish character transliteration ────────────────────────────

_PL_TRANS = str.maketrans({
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "A", "Ć": "C", "Ę": "E", "Ł": "L", "Ń": "N",
    "Ó": "O", "Ś": "S", "Ź": "Z", "Ż": "Z",
    "–": "-", "—": "-", "\u201a": ",", "\u201e": ",",
    "\u201c": '"', "\u201d": '"', "\u2018": "'", "\u2019": "'",
    "\u2026": "...", "«": "<<", "»": ">>",
    "\u00a0": " ", "\u2022": "*", "\u00a9": "(c)",
})


def _ascii(text):
    """Transliterate Polish characters to ASCII for built-in PDF fonts."""
    if not text:
        return ""
    return str(text).translate(_PL_TRANS)


# ── PDF Generator ───────────────────────────────────────────────


class ContractPDF(FPDF):
    """PDF z header/footer dla Umowy o Wykonanie Dzieła."""

    def header(self):
        self.set_font("helvetica", "B", 14)
        self.set_text_color(60, 60, 60)
        self.cell(0, 10, _ascii("Umowa o Wykonanie Dzieła"), align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(180, 180, 180)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", "", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Strona {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.cell(0, 8, _ascii(title), new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body_text(self, text):
        self.set_font("helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        self.multi_cell(0, 5, _ascii(text))
        self.ln(2)

    def field_line(self, label, value=""):
        self.set_font("helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        underline = "__" * 30 if not value else ""
        self.cell(0, 7, _ascii(f"{label}: {value or underline}"), new_x="LMARGIN", new_y="NEXT")


def generate_contract_pdf(booking, tenant, package):
    """
    Generuje kompletny PDF umowy jako obiekt FPDF.

    Args:
        booking: dict z bookings (client_name, client_address, client_pesel,
                 event_date, event_time_start, event_time_end, event_location,
                 package_final_price, deposit_amount)
        tenant: dict z tenants (company_name, owner_email)
        package: dict z packages (name, features)
    """
    today = datetime.now(timezone.utc).strftime("%d.%m.%Y")
    event_date = booking.get("event_date", "________")
    try:
        dt = datetime.strptime(str(event_date), "%Y-%m-%d")
        event_date_pl = dt.strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        event_date_pl = str(event_date)

    final_price = float(booking.get("package_final_price", 0))
    deposit = float(booking.get("deposit_amount", 0))
    remaining = final_price - deposit

    # Przygotuj opis pakietu z features
    pkg_name = package.get("name", "")
    features_raw = package.get("features", [])
    if isinstance(features_raw, list):
        pkg_desc = "; ".join(str(f) for f in features_raw)
    else:
        pkg_desc = str(features_raw)

    pdf = ContractPDF()
    pdf.alias_nb_pages()
    pdf.add_page()

    # ── Tytuł ──
    pdf.set_font("helvetica", "B", 16)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 10, _ascii("UMOWA O WYKONANIE DZIEŁA"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # ── Preambuła ──
    pdf.body_text(f"zawarta w dniu {today} w Warszawie, pomiędzy:")

    # ── Zamawiający ──
    pdf.section_title("Zamawiającym:")
    pdf.field_line("Imię i Nazwisko", booking.get("client_name", ""))
    pdf.field_line("Adres", booking.get("client_address", ""))
    pdf.field_line("PESEL", booking.get("client_pesel", ""))
    pdf.ln(2)
    pdf.body_text('zwanym dalej "Zamawiającym",')

    # ── Wykonawca ──
    pdf.section_title("a Wykonawcą:")
    pdf.body_text(
        f"{tenant.get('company_name', '')}, "
        f"adres e-mail: {tenant.get('owner_email', '')}, "
        f"NIP: {booking.get('company_nip', '') or '(brak)'} "
        f'- zwany dalej "Wykonawcą".'
    )
    pdf.ln(2)

    # ── §1 Przedmiot Umowy ──
    pdf.section_title("§1. Przedmiot Umowy")
    pdf.body_text(
        "Przedmiotem niniejszej umowy jest wykonanie przez Wykonawcę dzieła "
        "polegającego na świadczeniu usługi:"
    )
    pdf.ln(1)
    pdf.body_text(f"     {pkg_name}{' – ' + pkg_desc if pkg_desc else ''}.")
    pdf.ln(1)
    pdf.body_text(
        f"Dzieło zostanie wykonane w dniu {event_date_pl} "
        f"w lokalu: {booking.get('event_location', '___________________')}."
    )
    if booking.get("event_time_start"):
        time_str = booking["event_time_start"]
        if booking.get("event_time_end"):
            time_str += f" – {booking['event_time_end']}"
        pdf.body_text(f"Godzina rozpoczęcia: {time_str}.")
    pdf.ln(2)

    # ── §2 Wynagrodzenie ──
    pdf.section_title("§2. Wynagrodzenie i Warunki Płatności")
    pdf.body_text(
        f"Strony ustalają łączne wynagrodzenie za wykonanie dzieła "
        f"w wysokości {final_price:.2f} PLN brutto."
    )
    pdf.ln(1)

    if deposit > 0:
        pdf.body_text(
            f"Zamawiający wpłaci zadatek w wysokości {deposit:.2f} PLN "
            f"w terminie do _________."
        )
        pdf.ln(1)
        pdf.body_text(
            f"Pozostała kwota w wysokości {remaining:.2f} PLN zostanie zapłacona "
            f"w terminie do _________."
        )
    else:
        pdf.body_text(
            f"Całkowita kwota wynagrodzenia w wysokości {final_price:.2f} PLN "
            f"zostanie zapłacona w terminie do _________."
        )
    pdf.ln(2)

    # ── §3 Odstąpienie ──
    pdf.section_title("§3. Odstąpienie od Umowy")
    pdf.body_text(
        "W przypadku odstąpienia od umowy przez Zamawiającego z przyczyn "
        "nieleżących po stronie Wykonawcy, zadatek ulega przepadkowi na rzecz "
        "Wykonawcy. W przypadku odstąpienia przez Wykonawcę z przyczyn "
        "nieleżących po stronie Zamawiającego, zobowiązany jest on do zwrotu "
        "zadatku w podwójnej wysokości."
    )
    pdf.ln(1)
    pdf.body_text(
        "Odstąpienie od umowy wymaga złożenia pisemnego oświadczenia pod "
        "rygorem nieważności."
    )
    pdf.ln(2)

    # ── §4 Postanowienia Końcowe ──
    pdf.section_title("§4. Postanowienia Końcowe")
    pdf.body_text(
        "Wszelkie zmiany niniejszej umowy wymagają formy pisemnej "
        "pod rygorem nieważności."
    )
    pdf.ln(1)
    pdf.body_text(
        "W sprawach nieuregulowanych niniejszą umową mają zastosowanie "
        "przepisy Kodeksu Cywilnego."
    )
    pdf.ln(1)
    pdf.body_text(
        "Ewentualne spory wynikające z niniejszej umowy strony będą starały "
        "się rozstrzygać polubownie, a w przypadku braku porozumienia poddadzą "
        "je rozstrzygnięciu właściwego sądu powszechnego."
    )
    pdf.ln(1)
    pdf.body_text(
        "Umowa sporządzona została w dwóch jednobrzmiących egzemplarzach, "
        "po jednym dla każdej ze stron."
    )
    pdf.ln(8)

    # ── Podpisy ──
    pdf.set_font("helvetica", "", 10)
    pdf.cell(90, 7, _ascii("Zamawiający (podpis):"), new_x="RIGHT", new_y="LAST")
    pdf.cell(10, 7, "", new_x="RIGHT", new_y="LAST")
    pdf.cell(90, 7, _ascii("Wykonawca (podpis):"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(15)
    pdf.cell(90, 5, "___________________________", new_x="RIGHT", new_y="LAST")
    pdf.cell(10, 5, "", new_x="RIGHT", new_y="LAST")
    pdf.cell(90, 5, "___________________________", new_x="LMARGIN", new_y="NEXT")

    return pdf


# ── S3 Upload ────────────────────────────────────────────────────


def _upload_to_s3(pdf_bytes, tenant_id, booking_id):
    """
    Przesyła PDF do Scaleway Object Storage.
    Fallback: zapisuje lokalnie jeśli S3 nie jest skonfigurowane.

    Returns:
        Public URL lub local path pliku PDF.
    """
    key = f"contracts/{tenant_id}/{booking_id}.pdf"

    # Fallback: local file storage (dev mode)
    if not STORAGE_BUCKET:
        local_dir = f"/tmp/partypilot-contracts/{tenant_id}"
        os.makedirs(local_dir, exist_ok=True)
        local_path = f"{local_dir}/{booking_id}.pdf"
        with open(local_path, "wb") as f:
            f.write(pdf_bytes)
        logging.info("PDF saved locally: %s", local_path)
        return local_path

    try:
        s3 = _get_s3()
        s3.put_object(
            Bucket=STORAGE_BUCKET,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
        url = f"https://{STORAGE_BUCKET}.s3.{SCW_REGION}.scw.cloud/{key}"
        logging.info("PDF uploaded to S3: %s", url)
        return url
    except Exception as e:
        logging.error("Failed to upload PDF to S3: %s, saving locally", e)
        local_dir = f"/tmp/partypilot-contracts/{tenant_id}"
        os.makedirs(local_dir, exist_ok=True)
        local_path = f"{local_dir}/{booking_id}.pdf"
        with open(local_path, "wb") as f:
            f.write(pdf_bytes)
        return local_path


# ── Handlery ────────────────────────────────────────────────────


def handle_generate_contract(tenant_id, booking_id, event):
    """
    POST /api/admin/bookings/{id}/contract

    Generuje PDF, wysyła na S3, aktualizuje booking, wysyła e-mail do klienta.
    """
    # 1. Fetch booking
    booking = query(
        "SELECT * FROM bookings WHERE id = %s AND tenant_id = %s",
        (booking_id, tenant_id),
        fetch="one",
    )
    if not booking:
        return _resp(404, {"error": "Booking not found"})

    # 2. Fetch tenant
    tenant = query(
        "SELECT * FROM tenants WHERE id = %s",
        (tenant_id,),
        fetch="one",
    )
    if not tenant:
        return _resp(404, {"error": "Tenant not found"})

    # 3. Fetch package (optional)
    package = {}
    pkg_id = booking.get("package_id", "")
    if pkg_id:
        pkg = query(
            "SELECT * FROM packages WHERE id = %s",
            (pkg_id,),
            fetch="one",
        )
        if pkg:
            package = pkg

    # 4. Generate PDF
    try:
        pdf = generate_contract_pdf(booking, tenant, package)
        pdf_bytes = bytes(pdf.output())
    except Exception as e:
        logging.error("PDF generation failed: %s", e)
        return _resp(500, {"error": f"PDF generation failed: {str(e)}"})

    # 5. Upload to S3
    try:
        contract_url = _upload_to_s3(pdf_bytes, tenant_id, booking_id)
    except Exception as e:
        return _resp(500, {"error": f"Failed to upload PDF: {str(e)}"})

    # 6. Update booking
    now = datetime.now(timezone.utc)
    result = execute(
        "UPDATE bookings SET contract_url = %s, updated_at = %s "
        "WHERE id = %s AND tenant_id = %s",
        (contract_url, now, booking_id, tenant_id),
    )
    if isinstance(result, dict) and result.get("rowcount", 0) == 0:
        return _resp(500, {"error": "Failed to update booking record"})

    # 7. Send email to client
    try:
        from mailer import send_contract_email
        send_contract_email(tenant, booking, contract_url)
    except Exception as e:
        logging.warning("Failed to send contract email: %s", e)

    return _resp(200, {
        "contract_url": contract_url,
        "booking_id": booking_id,
    })


def handle_download_contract(tenant_id, booking_id, event):
    """
    GET /api/admin/bookings/{id}/contract

    Zwraca URL do PDF (JSON redirect).
    """
    booking = query(
        "SELECT contract_url FROM bookings WHERE id = %s AND tenant_id = %s",
        (booking_id, tenant_id),
        fetch="one",
    )
    if not booking:
        return _resp(404, {"error": "Booking not found"})
    if not booking.get("contract_url"):
        return _resp(404, {"error": "Contract not yet generated. POST to /contract first."})

    return _resp(200, {
        "contract_url": booking["contract_url"],
        "booking_id": booking_id,
    })


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
