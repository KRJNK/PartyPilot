variable "domain_name" {
  description = "Root domain for the platform"
  type        = string
  default     = "weddingsaas.pl"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the domain"
  type        = string
  default     = ""
}

variable "db_instance_name" {
  description = "Scaleway Managed PostgreSQL instance name"
  type        = string
  default     = "wedding-saas-db"
}

variable "db_node_type" {
  description = "Scaleway Managed PostgreSQL node type (e.g. DB-DEV-S, DB-GP-XS)"
  type        = string
  default     = "DB-DEV-S"
}

variable "db_username" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "wedding_saas"
}

variable "db_password" {
  description = "PostgreSQL admin password (auto-generated via random_password)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_secret" {
  description = "JWT signing secret (auto-generated via random_password)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "smtp_username" {
  description = "Scaleway Transactional Email SMTP username"
  type        = string
  default     = ""
}

variable "smtp_password" {
  description = "Scaleway Transactional Email SMTP password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "allowed_origins" {
  description = "CORS allowed origins (comma-separated or *)"
  type        = string
  default     = "*"
}

variable "common_tags" {
  description = "Default tags applied to all resources"
  type = object({
    Project     = string
    Environment = string
    Owner       = string
  })
  default = {
    Project     = "Wedding SaaS"
    Environment = "Production"
    Owner       = "KRJNK"
  }
}

variable "feature_flags" {
  description = "Feature flag overrides for the platform"
  type = object({
    ai_assistant      = bool
    sms_notifications = bool
    google_calendar   = bool
  })
  default = {
    ai_assistant      = false
    sms_notifications = false
    google_calendar   = false
  }
}
