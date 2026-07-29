# ──────────────────────────────────────────────
# Terraform variables — Wedding SaaS
# ──────────────────────────────────────────────
# Update these values for your environment.
# Secrets (db_password, jwt_secret, smtp_password)
# are auto-generated or pulled from env vars.
#
# Scaleway credentials are sourced from:
#   SCW_ACCESS_KEY, SCW_SECRET_KEY, SCW_DEFAULT_PROJECT_ID
# Cloudflare credentials from:
#   CLOUDFLARE_API_TOKEN
# ──────────────────────────────────────────────

domain_name        = "weddingsaas.pl"
cloudflare_zone_id = ""

db_instance_name = "wedding-saas-db"
db_node_type     = "DB-DEV-S"
db_username      = "wedding_saas"
db_password      = ""
jwt_secret       = ""

smtp_username = ""
smtp_password = ""

allowed_origins = "*"

common_tags = {
  Project     = "Wedding SaaS"
  Environment = "Production"
  Owner       = "KRJNK"
}

feature_flags = {
  ai_assistant      = false
  sms_notifications = false
  google_calendar   = false
}
