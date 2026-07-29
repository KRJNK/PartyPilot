# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────

output "database_url" {
  description = "PostgreSQL connection string (sensitive)"
  value       = local.database_url
  sensitive   = true
}

output "database_host" {
  description = "PostgreSQL endpoint IP"
  value       = scaleway_rdb_instance.db.load_balancer[0].ip
}

output "database_port" {
  description = "PostgreSQL port"
  value       = scaleway_rdb_instance.db.load_balancer[0].port
}

output "function_endpoint_url" {
  description = "Scaleway Serverless Function public endpoint"
  value       = local.function_endpoint
}

output "storage_bucket_name" {
  description = "Application data bucket name"
  value       = scaleway_object_bucket.storage.name
}

output "admin_spa_bucket_name" {
  description = "Admin SPA static hosting bucket name"
  value       = scaleway_object_bucket.admin_spa.name
}

output "admin_spa_bucket_endpoint" {
  description = "Admin SPA bucket website endpoint (configure via AWS CLI as noted in storage.tf)"
  value       = "https://${scaleway_object_bucket.admin_spa.name}.s3.pl-waw.scw.cloud"
}

output "jwt_secret" {
  description = "JWT signing secret (sensitive)"
  value       = random_password.jwt_secret.result
  sensitive   = true
}

output "db_password" {
  description = "PostgreSQL admin password (sensitive)"
  value       = random_password.db_password.result
  sensitive   = true
}

output "cloudflare_api_record_id" {
  description = "Cloudflare DNS record ID for api.*"
  value       = cloudflare_record.api.id
}

output "cloudflare_app_record_id" {
  description = "Cloudflare DNS record ID for app.*"
  value       = cloudflare_record.app.id
}

output "cloudflare_widget_record_id" {
  description = "Cloudflare DNS record ID for widget.*"
  value       = cloudflare_record.widget.id
}

output "function_namespace_name" {
  description = "Scaleway Serverless Function namespace"
  value       = scaleway_function_namespace.api.name
}

output "reminder_function_name" {
  description = "D-21 reminder function name"
  value       = scaleway_function.d21_reminder.name
}

output "secrets" {
  description = "Scaleway Secret Manager secret IDs"
  value = {
    database_url = scaleway_secret.database_url.id
    jwt_secret   = scaleway_secret.jwt_secret.id
    smtp         = scaleway_secret.smtp_credentials.id
  }
}
