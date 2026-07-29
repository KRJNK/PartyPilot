# ──────────────────────────────────────────────
# Object Storage: App data (contracts, uploads, widget)
# ──────────────────────────────────────────────

resource "scaleway_object_bucket" "storage" {
  name   = "wedding-saas-storage"
  region = "pl-waw"
  tags   = local.common_tags_list
}

resource "scaleway_object_bucket_acl" "storage" {
  bucket = scaleway_object_bucket.storage.id
  acl    = "private"
}

# ──────────────────────────────────────────────
# Object Storage: Admin SPA static hosting
# ──────────────────────────────────────────────

resource "scaleway_object_bucket" "admin_spa" {
  name   = "wedding-saas-admin-spa"
  region = "pl-waw"
  tags   = local.common_tags_list
}

resource "scaleway_object_bucket_acl" "admin_spa" {
  bucket = scaleway_object_bucket.admin_spa.id
  acl    = "public-read"
}

# NOTE: Bucket website configuration (error_document = "index.html") is
# not directly available in the Scaleway Terraform provider. Apply it
# manually with the AWS CLI using Scaleway S3-compatible endpoint:
#
#   aws s3api put-bucket-website \
#     --bucket wedding-saas-admin-spa \
#     --website-configuration '{
#       "IndexDocument": {"Suffix": "index.html"},
#       "ErrorDocument": {"Key": "index.html"}
#     }'
#     --endpoint-url https://s3.pl-waw.scw.cloud
