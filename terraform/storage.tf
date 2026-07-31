# ──────────────────────────────────────────────
# Object Storage: App data (contracts, uploads, widget)
# ──────────────────────────────────────────────

resource "scaleway_object_bucket" "storage" {
  name   = "partypilot-storage"
  region = "pl-waw"
  tags   = local.common_tags_map
}

resource "scaleway_object_bucket_acl" "storage" {
  bucket = scaleway_object_bucket.storage.id
  acl    = "private"
}

# ──────────────────────────────────────────────
# Object Storage: Admin SPA static hosting
# ──────────────────────────────────────────────

resource "scaleway_object_bucket" "admin_spa" {
  name   = "partypilot-admin-spa"
  region = "pl-waw"
  tags   = local.common_tags_map
}

resource "scaleway_object_bucket_acl" "admin_spa" {
  bucket = scaleway_object_bucket.admin_spa.id
  acl    = "public-read"
}

# ──────────────────────────────────────────────
# Frontend Upload: Sync admin SPA to bucket
# ──────────────────────────────────────────────

resource "null_resource" "upload_frontend" {
  depends_on = [scaleway_object_bucket_acl.admin_spa]

  provisioner "local-exec" {
    command = <<-EOT
      export AWS_ACCESS_KEY_ID='${var.scw_access_key}'
      export AWS_SECRET_ACCESS_KEY='${var.scw_secret_key}'
      export AWS_ENDPOINT_URL_S3=https://s3.pl-waw.scw.cloud
      export AWS_REGION=pl-waw

      aws s3 sync ${path.module}/../frontend/admin-spa/ s3://partypilot-admin-spa/ \
        --endpoint-url https://s3.pl-waw.scw.cloud \
        --exclude ".git/*" \
        --exclude "*.md" \
        --exclude ".build/*"

      aws s3api put-bucket-website \
        --bucket partypilot-admin-spa \
        --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}' \
        --endpoint-url https://s3.pl-waw.scw.cloud
    EOT
  }

  triggers = {
    frontend_hash = sha256(join("", [
      for f in fileset("${path.module}/../frontend/admin-spa/", "**/*") :
      fileexists("${path.module}/../frontend/admin-spa/${f}") ? filesha256("${path.module}/../frontend/admin-spa/${f}") : ""
    ]))
  }
}
