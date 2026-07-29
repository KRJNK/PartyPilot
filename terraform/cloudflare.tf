# ──────────────────────────────────────────────
# Cloudflare Zone
# ──────────────────────────────────────────────

data "cloudflare_zone" "main" {
  name = var.domain_name
}

# ──────────────────────────────────────────────
# DNS Records
# ──────────────────────────────────────────────

# API: CNAME to Scaleway Serverless Function endpoint
resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.main.id
  name    = "api"
  type    = "CNAME"
  content = replace(local.function_endpoint, "https://", "")
  proxied = true
  comment = "Wedding SaaS API — Scaleway Serverless Function"
}

# Admin SPA: CNAME to Scaleway Object Storage website
resource "cloudflare_record" "app" {
  zone_id = data.cloudflare_zone.main.id
  name    = "app"
  type    = "CNAME"
  content = "wedding-saas-admin-spa.s3.pl-waw.scw.cloud"
  proxied = true
  comment = "Wedding SaaS Admin SPA — Scaleway Object Storage"
}

# Booking Widget: CNAME to Scaleway Object Storage (same bucket)
resource "cloudflare_record" "widget" {
  zone_id = data.cloudflare_zone.main.id
  name    = "widget"
  type    = "CNAME"
  content = "wedding-saas-admin-spa.s3.pl-waw.scw.cloud"
  proxied = true
  comment = "Wedding SaaS Booking Widget — Scaleway Object Storage"
}

# ──────────────────────────────────────────────
# Page Rules
# ──────────────────────────────────────────────

# SPA routing: serve index.html for all paths under app.weddingsaas.pl
resource "cloudflare_page_rule" "app_spa" {
  zone_id = data.cloudflare_zone.main.id
  target  = "app.${var.domain_name}/*"
  actions {
    forwarding_url {
      status_code = 302
      url         = "https://app.${var.domain_name}/"
    }
  }
  status = "active"
}
