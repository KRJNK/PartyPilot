# ──────────────────────────────────────────────
# Scaleway Transactional Email (TEM)
# ──────────────────────────────────────────────
#
# NOTE: Scaleway TEM domain registration and SMTP credential
# generation are not fully supported in the Terraform provider
# as of provider v2.x. Manual setup is required:
#
#   1. Go to https://console.scaleway.com/transactional-email/domains
#   2. Add your domain (e.g. weddingsaas.pl)
#   3. Verify domain ownership via DNS TXT record
#   4. Generate SMTP credentials in the TEM dashboard
#   5. Copy the SMTP username and password into terraform.tfvars
#      as smtp_username and smtp_password
#
# The DNS verification TXT record is created below via Cloudflare.
# Once set up, the function env vars (SMTP_HOST, SMTP_PORT,
# SMTP_USER, SMTP_PASS) will be used automatically.
#
# TEM domain registration (uncomment when supported):
# resource "scaleway_tem_domain" "main" {
#   domain_name = var.domain_name
#   region      = "pl-waw-1"
#   accept_tos  = true
# }

resource "null_resource" "tem_setup" {
  triggers = {
    domain = var.domain_name
  }

  lifecycle {
    # This resource is informational — TEM must be configured manually
    ignore_changes = all
  }
}

# Cloudflare DNS record for TEM domain verification
# (TXT record value provided by Scaleway TEM dashboard)
resource "cloudflare_record" "tem_verification" {
  zone_id = data.cloudflare_zone.main.id
  name    = "scw-tem-verification"
  type    = "TXT"
  content = "PLACEHOLDER_REPLACE_WITH_TEM_VERIFICATION_VALUE"
  comment = "Scaleway TEM domain ownership verification — update value after TEM registration"
}
