# Backend: Scaleway Object Storage (S3-compatible)
# Credentials come from SCW_ACCESS_KEY / SCW_SECRET_KEY env vars
# (exported as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for the S3 backend)
terraform {
  backend "s3" {
    bucket                      = "wedding-saas-tfstate"
    key                         = "prod/terraform.tfstate"
    region                      = "pl-waw-1"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    endpoints                   = { s3 = "https://s3.pl-waw.scw.cloud" }
  }
}
