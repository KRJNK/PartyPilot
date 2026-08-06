# ──────────────────────────────────────────────
# Archive the API source code
# ──────────────────────────────────────────────

data "archive_file" "api_source" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/api"
  output_path = "${path.module}/.build/api.zip"
}

# ──────────────────────────────────────────────
# Serverless Function Namespace
# ──────────────────────────────────────────────

resource "scaleway_function_namespace" "api" {
  name   = "partypilot"
  region = "pl-waw"
  tags   = local.common_tags_list
}

# ──────────────────────────────────────────────
# Serverless Function: API
# ──────────────────────────────────────────────

resource "scaleway_function" "api" {
  namespace_id = scaleway_function_namespace.api.id
  name         = "partypilot-api"
  runtime      = "python312"
  handler      = "main.handler"
  privacy      = "public"
  deploy       = true
  zip_file     = data.archive_file.api_source.output_path
  zip_hash     = data.archive_file.api_source.output_sha256
  memory_limit = 512
  timeout      = 30
  min_scale    = 0
  max_scale    = 10
  region       = "pl-waw"
  tags         = local.common_tags_list

  environment_variables = {
    DATABASE_URL    = local.database_url
    JWT_SECRET      = random_password.jwt_secret.result
    ALLOWED_ORIGINS = var.allowed_origins
    SMTP_HOST       = "smtp.tem.scw.cloud"
    SMTP_PORT       = "587"
    SMTP_USER       = var.smtp_username
    SMTP_PASS       = var.smtp_password
    SMTP_FROM       = var.smtp_from
    STORAGE_BUCKET  = scaleway_object_bucket.storage.name
    SCW_REGION      = "pl-waw-1"
    MISTRAL_API_KEY = var.mistral_api_key
  }

  depends_on = [
    scaleway_rdb_instance.db,
    scaleway_rdb_database.db,
    scaleway_object_bucket.storage,
  ]
}
