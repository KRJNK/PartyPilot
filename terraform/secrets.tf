# ──────────────────────────────────────────────
# Random passwords / secrets
# ──────────────────────────────────────────────

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
  min_special      = 2
  min_upper        = 1
  min_lower        = 1
  min_numeric      = 1
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
  upper   = true
  lower   = true
  numeric = true
}

# ──────────────────────────────────────────────
# Scaleway Secret Manager
# ──────────────────────────────────────────────

resource "scaleway_secret" "database_url" {
  name        = "database-url"
  description = "PostgreSQL connection string for PartyPilot"
  tags        = local.common_tags_list
}

resource "scaleway_secret_version" "database_url" {
  secret_id = scaleway_secret.database_url.id
  data      = local.database_url
}

resource "scaleway_secret" "jwt_secret" {
  name        = "jwt-secret"
  description = "JWT signing key for PartyPilot"
  tags        = local.common_tags_list
}

resource "scaleway_secret_version" "jwt_secret" {
  secret_id = scaleway_secret.jwt_secret.id
  data      = random_password.jwt_secret.result
}

resource "scaleway_secret" "smtp_credentials" {
  name        = "smtp-credentials"
  description = "SMTP credentials for Scaleway Transactional Email"
  tags        = local.common_tags_list
}

resource "scaleway_secret_version" "smtp_credentials" {
  secret_id = scaleway_secret.smtp_credentials.id
  data = jsonencode({
    username = var.smtp_username
    password = var.smtp_password
  })
}

resource "scaleway_secret" "mistral_api_key" {
  name        = "mistral-api-key"
  description = "Mistral AI API key for PartyPilot chat assistant"
  tags        = local.common_tags_list
}

resource "scaleway_secret_version" "mistral_api_key" {
  secret_id = scaleway_secret.mistral_api_key.id
  data      = var.mistral_api_key
}
