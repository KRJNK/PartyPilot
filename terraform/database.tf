# ──────────────────────────────────────────────
# VPC Private Network (for DB — future Lambda access)
# ──────────────────────────────────────────────

resource "scaleway_vpc_private_network" "db" {
  name   = "partypilot-db-pn"
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
  name        = "partypilot"
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
# Database Migrations: Full Schema
# ──────────────────────────────────────────────

resource "null_resource" "db_migrations" {
  depends_on = [scaleway_rdb_database.db, scaleway_rdb_acl.db]

  provisioner "local-exec" {
    command = <<-EOT
      PGPASSWORD='${random_password.db_password.result}' psql \
        -h ${scaleway_rdb_instance.db.endpoint_ip} \
        -p ${scaleway_rdb_instance.db.endpoint_port} \
        -U ${var.db_username} \
        -d partypilot \
        -v ON_ERROR_STOP=1 \
        <<'SQL'
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS tenants (
          id          VARCHAR(32) PRIMARY KEY,
          status      VARCHAR(20) NOT NULL DEFAULT 'active',
          plan        VARCHAR(20) NOT NULL DEFAULT 'starter',
          company_name TEXT NOT NULL DEFAULT '',
          owner_email TEXT NOT NULL,
          logo_url    TEXT DEFAULT '',
          primary_color VARCHAR(7) DEFAULT '#C9A96E',
          about_text  TEXT DEFAULT '',
          contact_email TEXT DEFAULT '',
          contact_phone TEXT DEFAULT '',
          gcal_refresh_token TEXT DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id   VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          email       TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role        VARCHAR(20) NOT NULL DEFAULT 'owner',
          location    TEXT DEFAULT '',
          lat         DECIMAL(10,7) DEFAULT NULL,
          lng         DECIMAL(10,7) DEFAULT NULL,
          phone       TEXT DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(tenant_id, email)
      );

      CREATE TABLE IF NOT EXISTS packages (
          id              VARCHAR(32) PRIMARY KEY,
          tenant_id       VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name            TEXT NOT NULL,
          price           DECIMAL(10,2) NOT NULL DEFAULT 0,
          duration        TEXT DEFAULT '',
          features        JSONB DEFAULT '[]',
          deposit_type    VARCHAR(20) DEFAULT 'fixed',
          deposit_amount  DECIMAL(10,2) DEFAULT 0,
          sort_order      INTEGER DEFAULT 0,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id);

      CREATE TABLE IF NOT EXISTS bookings (
          id              VARCHAR(20) PRIMARY KEY,
          tenant_id       VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          status          VARCHAR(20) NOT NULL DEFAULT 'inquiry',
          client_type     VARCHAR(20) DEFAULT '',
          client_name     TEXT NOT NULL,
          client_email    TEXT DEFAULT '',
          client_phone    TEXT DEFAULT '',
          client_address  TEXT DEFAULT '',
          client_pesel    TEXT DEFAULT '',
          client_id_document TEXT DEFAULT '',
          company_name    TEXT DEFAULT '',
          company_nip     TEXT DEFAULT '',
          wants_contract  BOOLEAN DEFAULT FALSE,
          event_date      DATE NOT NULL,
          event_time_start VARCHAR(20) DEFAULT '',
          event_time_end  VARCHAR(20) DEFAULT '',
          event_location  TEXT DEFAULT '',
          guest_count     INTEGER DEFAULT 0,
          package_id      VARCHAR(32) REFERENCES packages(id),
          package_price   DECIMAL(10,2) DEFAULT 0,
          package_final_price DECIMAL(10,2) DEFAULT 0,
          package_notes   TEXT DEFAULT '',
          deposit_amount  DECIMAL(10,2) DEFAULT 0,
          deposit_paid    BOOLEAN DEFAULT FALSE,
          deposit_paid_at TIMESTAMPTZ,
          internal_notes  TEXT DEFAULT '',
          contract_url    TEXT DEFAULT '',
          gcal_event_id   TEXT DEFAULT '',
          gcal_event_link TEXT DEFAULT '',
          source          VARCHAR(20) DEFAULT 'admin',
          reminder_21_sent BOOLEAN DEFAULT FALSE,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bookings_tenant_status ON bookings(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_bookings_tenant_date ON bookings(tenant_id, event_date);
      CREATE INDEX IF NOT EXISTS idx_bookings_tenant_email ON bookings(tenant_id, client_email);
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, event_date);

      CREATE TABLE IF NOT EXISTS booking_status_history (
          id          BIGSERIAL PRIMARY KEY,
          booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          status      VARCHAR(20) NOT NULL,
          note        TEXT DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS booking_assignments (
          id          BIGSERIAL PRIMARY KEY,
          booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role        VARCHAR(30) NOT NULL DEFAULT 'dj',
          checked_in  BOOLEAN NOT NULL DEFAULT FALSE,
          checked_in_at TIMESTAMPTZ,
          notes       TEXT DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(booking_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_booking_assignments_booking ON booking_assignments(booking_id);
      CREATE INDEX IF NOT EXISTS idx_booking_assignments_user ON booking_assignments(user_id);

      CREATE TABLE IF NOT EXISTS booking_files (
          id          BIGSERIAL PRIMARY KEY,
          booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
          filename    TEXT NOT NULL,
          file_path   TEXT NOT NULL,
          file_size   BIGINT NOT NULL DEFAULT 0,
          file_type   VARCHAR(100) DEFAULT '',
          category    VARCHAR(50) NOT NULL DEFAULT 'document',
          description TEXT DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_booking_files_booking ON booking_files(booking_id);

      CREATE TABLE IF NOT EXISTS ai_config (
          tenant_id       VARCHAR(32) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
          enabled         BOOLEAN DEFAULT FALSE,
          system_prompt   TEXT DEFAULT '',
          faq_text        TEXT DEFAULT '',
          tone            VARCHAR(20) DEFAULT 'friendly',
          business_hours  VARCHAR(200) DEFAULT '',
          escalation_email TEXT DEFAULT '',
          auto_create_booking BOOLEAN DEFAULT TRUE,
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS conversations (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id   VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          client_email TEXT DEFAULT '',
          client_name  TEXT DEFAULT '',
          status      VARCHAR(20) DEFAULT 'active',
          lead_qualified BOOLEAN DEFAULT FALSE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status);

      CREATE TABLE IF NOT EXISTS messages (
          id          BIGSERIAL PRIMARY KEY,
          conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role        VARCHAR(20) NOT NULL,
          content     TEXT NOT NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS services (
          id          VARCHAR(32) PRIMARY KEY,
          tenant_id   VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          description TEXT DEFAULT '',
          base_price  DECIMAL(10,2) NOT NULL DEFAULT 0,
          category    VARCHAR(50) DEFAULT 'Inne',
          is_active   BOOLEAN DEFAULT TRUE,
          sort_order  INTEGER DEFAULT 0,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);

      CREATE TABLE IF NOT EXISTS package_services (
          id          BIGSERIAL PRIMARY KEY,
          package_id  VARCHAR(32) NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
          service_id  VARCHAR(32) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(package_id, service_id)
      );
      CREATE INDEX IF NOT EXISTS idx_package_services_package ON package_services(package_id);
      CREATE INDEX IF NOT EXISTS idx_package_services_service ON package_services(service_id);

      CREATE TABLE IF NOT EXISTS booking_services (
          id          BIGSERIAL PRIMARY KEY,
          booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
          service_id  VARCHAR(32) REFERENCES services(id) ON DELETE SET NULL,
          name        TEXT NOT NULL,
          price       DECIMAL(10,2) NOT NULL DEFAULT 0,
          is_included BOOLEAN DEFAULT FALSE,
          notes       TEXT DEFAULT '',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_booking_services_booking ON booking_services(booking_id);
      CREATE INDEX IF NOT EXISTS idx_booking_services_service ON booking_services(service_id);
      SQL
    EOT
  }

  triggers = {
    db_id = scaleway_rdb_instance.db.id
  }
}

# ──────────────────────────────────────────────
# Seed Data: Initial admin tenant + user
# ──────────────────────────────────────────────

resource "random_password" "admin_password" {
  length  = 16
  special = false
  upper   = true
  lower   = true
  numeric = true
}

resource "null_resource" "db_seed" {
  depends_on = [null_resource.db_migrations]

  provisioner "local-exec" {
    command = <<-EOT
      python3 -c "
      import bcrypt, psycopg2
      password = '${random_password.admin_password.result}'
      pw_hash = bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()
      conn = psycopg2.connect('${local.database_url}')
      cur = conn.cursor()
      cur.execute(\"\"\"INSERT INTO tenants (id, company_name, owner_email, status, plan)
                     VALUES ('T-admin', 'PartyPilot Admin', 'admin@partypilot.pl', 'active', 'pro')
                     ON CONFLICT (id) DO NOTHING\"\"\")
      cur.execute(\"\"\"INSERT INTO users (tenant_id, email, password_hash, role)
                     VALUES ('T-admin', 'admin@partypilot.pl', %s, 'owner')
                     ON CONFLICT (tenant_id, email) DO NOTHING\"\"\", (pw_hash,))
      conn.commit()
      conn.close()
      print('Seed data created. Admin login: admin@partypilot.pl / ' + password)
      "
    EOT
  }

  triggers = {
    db_id      = scaleway_rdb_instance.db.id
    admin_pass = random_password.admin_password.result
  }
}
