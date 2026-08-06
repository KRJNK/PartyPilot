# ──────────────────────────────────────────────
# Archive the reminder source code
# ──────────────────────────────────────────────

data "archive_file" "reminders_source" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src"
  output_path = "${path.module}/.build/reminders.zip"
}

# ──────────────────────────────────────────────
# Serverless Function Namespace (cron jobs)
# ──────────────────────────────────────────────

resource "scaleway_function_namespace" "reminders" {
  name   = "partypilot-cron"
  region = "pl-waw"
  tags   = local.common_tags_list
}

# ──────────────────────────────────────────────
# Serverless Function: D-21 Reminder
# ──────────────────────────────────────────────

resource "scaleway_function" "d21_reminder" {
  namespace_id = scaleway_function_namespace.reminders.id
  name         = "partypilot-d21-reminder"
  runtime      = "python312"
  handler      = "reminders.handle_d21_reminders"
  privacy      = "private" # not publicly accessible, triggered by cron
  deploy       = true
  zip_file     = data.archive_file.reminders_source.output_path
  zip_hash     = data.archive_file.reminders_source.output_sha256
  memory_limit = 256
  timeout      = 60
  min_scale    = 0
  max_scale    = 1
  region       = "pl-waw"
  tags         = local.common_tags_list

  environment_variables = {
    DATABASE_URL = local.database_url
    SMTP_HOST    = "smtp.tem.scw.cloud"
    SMTP_PORT    = "587"
    SMTP_USER    = var.smtp_username
    SMTP_PASS    = var.smtp_password
    SMTP_FROM    = var.smtp_from
    SCW_REGION   = "pl-waw-1"
  }

  depends_on = [
    scaleway_rdb_instance.db
  ]
}

# ──────────────────────────────────────────────
# Cron Trigger: Daily D-21 Reminder (10:00 UTC)
# ──────────────────────────────────────────────

resource "scaleway_function_cron" "d21_reminder" {
  name        = "d21-reminder-daily"
  function_id = scaleway_function.d21_reminder.id
  schedule    = "0 10 * * *"
  args        = jsonencode({ type = "d21_reminder" })
}
