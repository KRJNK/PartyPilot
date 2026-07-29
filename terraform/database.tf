# ──────────────────────────────────────────────
# VPC Private Network (for DB — future Lambda access)
# ──────────────────────────────────────────────

resource "scaleway_vpc_private_network" "db" {
  name   = "wedding-saas-db-pn"
  region = "pl-waw"
  tags   = local.common_tags_list
}

# ──────────────────────────────────────────────
# Managed PostgreSQL Instance
# ──────────────────────────────────────────────

resource "scaleway_rdb_instance" "db" {
  name      = var.db_instance_name
  node_type = var.db_node_type
  engine    = "PostgreSQL-15"
  user_name = var.db_username
  password  = random_password.db_password.result
  region    = "pl-waw"
  tags      = local.common_tags_list

  # Attach to private network (for future serverless VPC integration)
  private_network {
    pn_id = scaleway_vpc_private_network.db.id
  }

  # Public access is required for Scaleway Serverless Functions
  # which cannot yet attach to private networks.
  # Restrict by ACL below if a static source IP range is available.
}

# ──────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────

resource "scaleway_rdb_database" "db" {
  instance_id = scaleway_rdb_instance.db.id
  name        = "wedding_saas"
}

# ──────────────────────────────────────────────
# ACL: Allow public access for Lambda functions
# (Serverless Functions use dynamic IPs; improve
#  once VPC attachment for functions is supported)
# ──────────────────────────────────────────────

resource "scaleway_rdb_acl" "db" {
  instance_id = scaleway_rdb_instance.db.id

  acl_rules {
    ip          = "0.0.0.0/0"
    description = "Allow public access (Lambda dynamic IPs)"
  }
}

# ──────────────────────────────────────────────
# Database Migration: add reminder_21_sent column
# ──────────────────────────────────────────────

resource "null_resource" "db_migrations" {
  depends_on = [scaleway_rdb_database.db]

  provisioner "local-exec" {
    command = <<-EOT
      PGPASSWORD='${random_password.db_password.result}' psql \
        -h ${scaleway_rdb_instance.db.load_balancer[0].ip} \
        -p ${scaleway_rdb_instance.db.load_balancer[0].port} \
        -U ${var.db_username} \
        -d wedding_saas \
        -c "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_21_sent BOOLEAN DEFAULT FALSE;" \
        -c "CREATE TABLE IF NOT EXISTS ai_config (
            tenant_id VARCHAR(32) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
            enabled BOOLEAN DEFAULT FALSE,
            system_prompt TEXT DEFAULT '',
            faq_text TEXT DEFAULT '',
            tone VARCHAR(20) DEFAULT 'friendly',
            business_hours VARCHAR(200) DEFAULT '',
            escalation_email TEXT DEFAULT '',
            auto_create_booking BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );" \
        -c "CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            client_email TEXT DEFAULT '',
            client_name TEXT DEFAULT '',
            status VARCHAR(20) DEFAULT 'active',
            lead_qualified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );" \
        -c "CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status);" \
        -c "CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );" \
        -c "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);"
    EOT
  }

  triggers = {
    db_id = scaleway_rdb_instance.db.id
  }
}
