variable "domain_name" {
  description = "Root domain for the platform"
  type        = string
  default     = "partypilot.pl"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the domain (leave empty to skip Cloudflare resources)"
  type        = string
  default     = ""
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (leave default to skip Cloudflare resources)"
  type        = string
  sensitive   = true
  default     = "0000000000000000000000000000000000000000"
}

variable "db_instance_name" {
  description = "Scaleway Managed PostgreSQL instance name"
  type        = string
  default     = "partypilot-db"
}

variable "db_node_type" {
  description = "Scaleway Managed PostgreSQL node type (e.g. DB-DEV-S, DB-GP-XS)"
  type        = string
  default     = "DB-DEV-S"
}

variable "db_username" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "partypilot"
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

variable "smtp_from" {
  description = "Sender email address for outbound emails"
  type        = string
  default     = "noreply@weddingsaas.pl"
}

variable "mistral_api_key" {
  description = "Mistral AI API key for chat assistant"
  type        = string
  sensitive   = true
  default     = ""
}

variable "scw_access_key" {
  description = "Scaleway access key (for S3 sync operations)"
  type        = string
  default     = ""
}

variable "scw_secret_key" {
  description = "Scaleway secret key (for S3 sync operations)"
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
    Project     = "PartyPilot"
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
