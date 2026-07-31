# ──────────────────────────────────────────────
# Scaleway Transactional Email (TEM)
# ──────────────────────────────────────────────

resource "scaleway_tem_domain" "main" {
  name       = var.domain_name
  region     = "pl-waw"
  accept_tos = true
}

resource "null_resource" "tem_setup" {
  triggers = {
    domain = var.domain_name
  }

  lifecycle {
    ignore_changes = all
  }
}

# Cloudflare DNS record for TEM domain verification
# (TXT record value provided by Scaleway TEM dashboard)
resource "cloudflare_record" "tem_verification" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = data.cloudflare_zone.main[0].id
  name    = "scw-tem-verification"
  type    = "TXT"
  content = "PLACEHOLDER_REPLACE_WITH_TEM_VERIFICATION_VALUE"
  comment = "Scaleway TEM domain ownership verification — update value after TEM registration"
}
