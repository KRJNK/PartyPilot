#!/usr/bin/env python3
"""
Local development server for PartyPilot API.
Wraps the Scaleway Serverless Function handler to work with standard HTTP requests.
"""

import json
import os
import re
import sys
import traceback
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Add the API source directory to path
API_DIR = os.path.join(os.path.dirname(__file__), "terraform", "lambda_src", "api")
sys.path.insert(0, API_DIR)

# Set environment variables for local dev
os.environ.setdefault("DATABASE_URL", "postgresql://wedding_saas:devpass123@localhost:5434/wedding_saas")
os.environ.setdefault("JWT_SECRET", "local-dev-secret-not-for-production-64chars-padding!!")
os.environ.setdefault("ALLOWED_ORIGINS", "*")
os.environ.setdefault("SMTP_HOST", "localhost")
os.environ.setdefault("SMTP_PORT", "587")
os.environ.setdefault("SMTP_USER", "")
os.environ.setdefault("SMTP_PASS", "")
os.environ.setdefault("STORAGE_BUCKET", "")
os.environ.setdefault("SCW_REGION", "pl-waw")

from main import handler


# ── Multipart form-data parser ─────────────────────────────────


def _parse_multipart(body_bytes, content_type):
    """
    Parsuje multipart/form-data body.
    Zwraca (fields_dict, files_list) gdzie files_list to listy dictów:
        {field, filename, content_type, data}
    """
    boundary_match = re.search(r"boundary=([^;\s]+)", content_type)
    if not boundary_match:
        return {}, []
    boundary = boundary_match.group(1).encode("utf-8")

    parts = body_bytes.split(b"--" + boundary)
    fields = {}
    files = []

    for part in parts:
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue

        # Split headers from body
        header_end = part.find(b"\r\n\r\n")
        if header_end == -1:
            continue

        header_section = part[:header_end]
        body_data = part[header_end + 4:]

        # Remove trailing \r\n (but not inside file data)
        if body_data.endswith(b"\r\n"):
            body_data = body_data[:-2]

        header_lines = header_section.decode("utf-8", errors="replace").split("\r\n")

        content_disposition = ""
        part_content_type = ""
        for line in header_lines:
            lower = line.lower()
            if lower.startswith("content-disposition:"):
                content_disposition = line
            if lower.startswith("content-type:"):
                part_content_type = line.split(":", 1)[1].strip()

        # Extract field name
        name_match = re.search(r'name="([^"]*)"', content_disposition)
        if not name_match:
            continue
        name = name_match.group(1)

        # Check if it's a file upload
        filename_match = re.search(r'filename="([^"]*)"', content_disposition)
        if filename_match and filename_match.group(1):
            files.append({
                "field": name,
                "filename": filename_match.group(1),
                "content_type": part_content_type or "application/octet-stream",
                "data": body_data,
            })
        else:
            fields[name] = body_data.decode("utf-8", errors="replace")

    return fields, files


class LocalAPIHandler(BaseHTTPRequestHandler):
    """Translates standard HTTP requests into Scaleway event format."""

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        query_params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", 0))

        # Read body once as raw bytes
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        body = body_bytes.decode("utf-8") if body_bytes else ""

        # ── Multipart form-data (file upload) ──
        if content_type.startswith("multipart/form-data"):
            fields, files = _parse_multipart(body_bytes, content_type)

            # Extract tenant_id from JWT for file save path
            from auth import verify_token
            headers_raw = {k.lower(): v for k, v in self.headers.items()}
            auth_header = headers_raw.get("authorization", "")
            tenant_id = "unknown"
            if auth_header.startswith("Bearer "):
                payload = verify_token(auth_header[7:])
                if payload:
                    tenant_id = payload.get("tenant_id", "unknown")

            # Build body from form fields + file metadata
            if files:
                file_data = files[0]  # handle single file upload
                m = re.match(r"/api/admin/bookings/([^/]+)/files", path)
                booking_id = m.group(1) if m else "unknown"

                upload_dir = f"/tmp/partypilot-uploads/{tenant_id}/{booking_id}/"
                os.makedirs(upload_dir, exist_ok=True)

                safe_filename = file_data["filename"]
                file_path = os.path.join(upload_dir, safe_filename)
                with open(file_path, "wb") as f:
                    f.write(file_data["data"])

                file_size = len(file_data["data"])
                file_type = file_data["content_type"]

                body = json.dumps({
                    "filename": safe_filename,
                    "file_path": file_path,
                    "file_size": file_size,
                    "file_type": file_type,
                    "category": fields.get("category", "document"),
                    "description": fields.get("description", ""),
                })
            else:
                body = json.dumps(fields)

        # Build Scaleway-style event
        headers = {k.lower(): v for k, v in self.headers.items()}
        event = {
            "http": {
                "method": method,
                "path": path,
                "headers": headers,
            },
            "body": body,
            "headers": headers,
            "query_string_parameters": query_params,
            "isBase64Encoded": False,
        }

        try:
            result = handler(event, None)
            status_code = result.get("statusCode", 200)
            resp_headers = result.get("headers", {})
            resp_body = result.get("body", "")

            # Ensure Content-Type
            if "Content-Type" not in resp_headers and "content-type" not in resp_headers:
                resp_headers["Content-Type"] = "application/json"

            self.send_response(status_code)
            for k, v in resp_headers.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(resp_body.encode("utf-8") if isinstance(resp_body, str) else resp_body)

        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")

    def do_DELETE(self):
        self._handle("DELETE")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.end_headers()

    def log_message(self, format, *args):
        # Color-coded logging
        msg = format % args
        sys.stderr.write(f"  {msg}\n")


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), LocalAPIHandler)
    print(f"\n  PartyPilot API — Local Dev Server")
    print(f"  ─────────────────────────────────────")
    print(f"  API:     http://localhost:{port}/api")
    print(f"  Health:  http://localhost:{port}/api/health")
    print(f"  DB:      localhost:5434/partypilot")
    print(f"  ─────────────────────────────────────")
    print(f"  Login:   admin@partypilot.pl / partypilot123")
    print(f"  ─────────────────────────────────────\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()