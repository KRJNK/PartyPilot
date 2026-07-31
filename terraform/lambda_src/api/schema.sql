-- PartyPilot — Full Schema + Seed Data
-- Local development database

-- ── Extensions ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tenants ──
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

-- ── Users ──
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'owner',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- ── Packages ──
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

-- ── Bookings ──
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

-- ── Booking Status History ──
CREATE TABLE IF NOT EXISTS booking_status_history (
    id          BIGSERIAL PRIMARY KEY,
    booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL,
    note        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AI Config ──
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

-- ── Conversations ──
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

-- ── Messages ──
CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ── Services (Add-on catalog) ──
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

-- ── Package Services (linking) ──
CREATE TABLE IF NOT EXISTS package_services (
    id          BIGSERIAL PRIMARY KEY,
    package_id  VARCHAR(32) NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    service_id  VARCHAR(32) NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(package_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_package_services_package ON package_services(package_id);
CREATE INDEX IF NOT EXISTS idx_package_services_service ON package_services(service_id);

-- ── Booking Services (add-ons per booking) ──
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

-- ── Seed: Demo Tenant + Admin User ──
-- Password hash for "partypilot123" (bcrypt)
-- Generated via: python3 -c "from passlib.context import CryptContext; ctx=CryptContext(schemes=['bcrypt'],deprecated='auto'); print(ctx.hash('partypilot123'))"
INSERT INTO tenants (id, company_name, owner_email, status, plan, primary_color, about_text, contact_email, contact_phone)
VALUES ('T-demo', 'PartyPilot Demo DJ', 'demo@partypilot.pl', 'active', 'pro', '#C9A96E', 'Profesjonalny DJ na wesele w całej Polsce. 10 lat doświadczenia, 500+ wesel.', 'demo@partypilot.pl', '+48 600 100 200')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, email, password_hash, role)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'T-demo',
    'admin@partypilot.pl',
    '$2b$12$EbO50zUAOFevVXC2mYQOgugFhE2EXQ.Cm63oWo.PylOHf8zfYdHCq',
    'owner'
)
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Seed: Demo Packages ──
INSERT INTO packages (id, tenant_id, name, price, duration, features, deposit_type, deposit_amount, sort_order)
VALUES
    ('PKG-demo001', 'T-demo', 'Pakiet Basic', 2500.00, '5 godzin', '["DJ + nagłośnienie", "Podstawowe oświetlenie", "Playlista dostosowana do Was"]', 'fixed', 500.00, 1),
    ('PKG-demo002', 'T-demo', 'Pakiet Premium', 4000.00, '8 godzin', '["DJ + nagłośnienie premium", "Oświetlenie sceniczne", "Fotobudka", "Smoke machine", "Playlista + MC"]', 'percent', 1000.00, 2),
    ('PKG-demo003', 'T-demo', 'Pakiet VIP', 6000.00, 'cała noc', '["DJ + nagłośnienie premium", "Oświetlenie pełne", "Fotobudka + album", "Smoke + confetti", "MC + animacje", "Wideo relacja"]', 'percent', 1500.00, 3)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: Demo Bookings ──
INSERT INTO bookings (id, tenant_id, status, client_name, client_email, client_phone, event_date, event_time_start, event_time_end, event_location, guest_count, package_id, package_price, package_final_price, deposit_amount, deposit_paid, source)
VALUES
    ('BOOK-2026-001', 'T-demo', 'inquiry', 'Anna i Marek Kowalscy', 'anna.kowalska@email.pl', '+48 600 200 300', '2026-08-15', '16:00', '24:00', 'Sala Weselna Złoty Róg, Warszawa', 120, 'PKG-demo002', 4000.00, 4000.00, 1000.00, FALSE, 'public_booking'),
    ('BOOK-2026-002', 'T-demo', 'offer_sent', 'Katarzyna Nowak', 'k.nowak@email.pl', '+48 600 300 400', '2026-09-20', '17:00', '24:00', 'Dwór Artus, Gdańsk', 80, 'PKG-demo001', 2500.00, 2500.00, 500.00, FALSE, 'admin'),
    ('BOOK-2026-003', 'T-demo', 'deposit_paid', 'Tomasz Wiśniewski', 't.wisniewski@email.pl', '+48 600 400 500', '2026-07-25', '16:00', '24:00', 'Pałac Mała Wieś, Wieliczka', 150, 'PKG-demo003', 6000.00, 5500.00, 1500.00, TRUE, 'admin'),
    ('BOOK-2026-004', 'T-demo', 'confirmed', 'Magdalena Zielińska', 'm.zielinska@email.pl', '+48 600 500 600', '2026-10-10', '15:00', '24:00', 'Hotel Bristol, Kraków', 200, 'PKG-demo003', 6000.00, 6000.00, 1500.00, TRUE, 'admin'),
    ('BOOK-2026-005', 'T-demo', 'completed', 'Piotr Lewandowski', 'p.lewandowski@email.pl', '+48 600 600 700', '2026-06-12', '16:00', '24:00', 'Sala Bankietowa Impuls, Poznań', 100, 'PKG-demo002', 4000.00, 4000.00, 1000.00, TRUE, 'admin')
ON CONFLICT (id) DO NOTHING;

-- ── Seed: AI Config ──
INSERT INTO ai_config (tenant_id, enabled, system_prompt, faq_text, tone, escalation_email, auto_create_booking)
VALUES ('T-demo', TRUE, 'Jesteś asystentem DJ-a na wesele. Odpowiadasz na pytania o pakiety, ceny, dostępność terminów. Bądź pomocny i zachęcaj do rezerwacji.', 'Pakiety: Basic 2500 zł, Premium 4000 zł, VIP 6000 zł. Każdy pakiet wymaga zadatku. Rezerwacja potwierdzana po wpłacie zadatku.', 'friendly', 'demo@partypilot.pl', TRUE)
ON CONFLICT (tenant_id) DO NOTHING;

-- ── Seed: Demo Services (Add-on catalog) ──
INSERT INTO services (id, tenant_id, name, description, base_price, category, sort_order) VALUES
('SVC-demo001', 'T-demo', 'DJ', 'Professional DJ service', 2000, 'Muzyka', 1),
('SVC-demo002', 'T-demo', 'Saksofonista', 'Live saxophone performance', 800, 'Muzyka', 2),
('SVC-demo003', 'T-demo', 'Ciężki dym', 'Heavy fog machine', 300, 'Efekty', 3),
('SVC-demo004', 'T-demo', 'Fotobudka', 'Photo booth with props', 500, 'Foto', 4),
('SVC-demo005', 'T-demo', 'Race z iskrami', 'Cold sparklers', 200, 'Efekty', 5),
('SVC-demo006', 'T-demo', 'Konferansjer', 'MC service (PL)', 600, 'Muzyka', 6),
('SVC-demo007', 'T-demo', 'Konferansjer EN', 'MC service (English)', 800, 'Muzyka', 7),
('SVC-demo008', 'T-demo', 'Celebrant ślubny', 'Wedding celebrant', 400, 'Inne', 8)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: Package ↔ Service links ──
INSERT INTO package_services (package_id, service_id) VALUES
('PKG-demo001', 'SVC-demo001'),
('PKG-demo002', 'SVC-demo001'),
('PKG-demo002', 'SVC-demo002'),
('PKG-demo002', 'SVC-demo003'),
('PKG-demo003', 'SVC-demo001'),
('PKG-demo003', 'SVC-demo002'),
('PKG-demo003', 'SVC-demo003'),
('PKG-demo003', 'SVC-demo004'),
('PKG-demo003', 'SVC-demo005')
ON CONFLICT DO NOTHING;

-- ── Seed: Booking Service (add-on for BOOK-2026-001) ──
INSERT INTO booking_services (booking_id, service_id, name, price, is_included, notes) VALUES
('BOOK-2026-001', 'SVC-demo006', 'Konferansjer', 600, FALSE, 'Dodany do rezerwacji')
ON CONFLICT DO NOTHING;