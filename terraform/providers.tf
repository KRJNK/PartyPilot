provider "scaleway" {
  region = "pl-waw"
  zone   = "pl-waw-1"

  # Configured via environment variables:
  #   SCW_ACCESS_KEY
  #   SCW_SECRET_KEY
  #   SCW_DEFAULT_PROJECT_ID
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
