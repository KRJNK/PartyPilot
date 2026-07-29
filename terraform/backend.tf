# Backend: Scaleway Object Storage (S3-compatible)
# Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars
# (or SCW_ACCESS_KEY / SCW_SECRET_KEY — same values)
terraform {
  backend "s3" {
    bucket                      = "wedding-saas-tfstate"
    key                         = "prod/terraform.tfstate"
    region                      = "pl-waw-1"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_metadata_api_check     = true

    endpoints {
      s3 = "https://s3.pl-waw.scw.cloud"
    }
  }
}
