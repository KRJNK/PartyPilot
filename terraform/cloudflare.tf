# ──────────────────────────────────────────────
# Cloudflare Zone
# ──────────────────────────────────────────────

data "cloudflare_zone" "main" {
  count = var.cloudflare_zone_id != "" ? 1 : 0
  name  = var.domain_name
}

# ──────────────────────────────────────────────
# DNS Records
# ──────────────────────────────────────────────

# API: CNAME to Scaleway Serverless Function endpoint
resource "cloudflare_record" "api" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = data.cloudflare_zone.main[0].id
  name    = "api"
  type    = "CNAME"
  content = replace(local.function_endpoint, "https://", "")
  proxied = true
  comment = "PartyPilot API — Scaleway Serverless Function"
}

# Admin SPA: CNAME to Scaleway Object Storage website
resource "cloudflare_record" "app" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = data.cloudflare_zone.main[0].id
  name    = "app"
  type    = "CNAME"
  content = "partypilot-admin-spa.s3.pl-waw.scw.cloud"
  proxied = true
  comment = "PartyPilot Admin SPA — Scaleway Object Storage"
}

# Booking Widget: CNAME to Scaleway Object Storage (same bucket)
resource "cloudflare_record" "widget" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = data.cloudflare_zone.main[0].id
  name    = "widget"
  type    = "CNAME"
  content = "partypilot-admin-spa.s3.pl-waw.scw.cloud"
  proxied = true
  comment = "PartyPilot Booking Widget — Scaleway Object Storage"
}

# ──────────────────────────────────────────────
# Page Rules
# ──────────────────────────────────────────────

# SPA routing: serve index.html for all paths under app.partypilot.pl
resource "cloudflare_page_rule" "app_spa" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = data.cloudflare_zone.main[0].id
  target  = "app.${var.domain_name}/*"
  actions {
    forwarding_url {
      status_code = 302
      url         = "https://app.${var.domain_name}/"
    }
  }
  status = "active"
}
