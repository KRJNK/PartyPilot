-- PartyPilot — Feature: Assignments + Location + Files
-- Migration for local development database

-- ── Users: add location fields ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';

-- ── Booking Assignments (many-to-many: bookings <-> users) ──
CREATE TABLE IF NOT EXISTS booking_assignments (
    id          BIGSERIAL PRIMARY KEY,
    booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(30) NOT NULL DEFAULT 'dj', -- dj, mc, technician, photographer, other
    checked_in  BOOLEAN NOT NULL DEFAULT FALSE,
    checked_in_at TIMESTAMPTZ,
    notes       TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(booking_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_assignments_booking ON booking_assignments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_assignments_user ON booking_assignments(user_id);

-- ── Booking Files (uploaded documents) ──
CREATE TABLE IF NOT EXISTS booking_files (
    id          BIGSERIAL PRIMARY KEY,
    booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    filename    TEXT NOT NULL,
    file_path   TEXT NOT NULL,       -- local path or S3 key
    file_size   BIGINT NOT NULL DEFAULT 0,
    file_type   VARCHAR(100) DEFAULT '',  -- MIME type
    category    VARCHAR(50) NOT NULL DEFAULT 'document', -- document, contract, invoice, playlist, photo, other
    description TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_booking_files_booking ON booking_files(booking_id);

-- ── Seed: Extra demo users (staff members with locations) ──
INSERT INTO users (id, tenant_id, email, password_hash, role, location, lat, lng, phone)
VALUES
    ('a0000000-0000-0000-0000-000000000002', 'T-demo', 'dj1@partypilot.pl', '$2b$12$EbO50zUAOFevVXC2mYQOgugFhE2EXQ.Cm63oWo.PylOHf8zfYdHCq', 'manager', 'Warszawa', 52.2297, 21.0122, '+48 600 111 222'),
    ('a0000000-0000-0000-0000-000000000003', 'T-demo', 'dj2@partypilot.pl', '$2b$12$EbO50zUAOFevVXC2mYQOgugFhE2EXQ.Cm63oWo.PylOHf8zfYdHCq', 'manager', 'Kraków', 50.0647, 19.9450, '+48 600 333 444'),
    ('a0000000-0000-0000-0000-000000000004', 'T-demo', 'dj3@partypilot.pl', '$2b$12$EbO50zUAOFevVXC2mYQOgugFhE2EXQ.Cm63oWo.PylOHf8zfYdHCq', 'manager', 'Gdańsk', 54.3520, 18.6466, '+48 600 555 666')
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Seed: Demo assignments ──
INSERT INTO booking_assignments (booking_id, user_id, role, notes)
VALUES
    ('BOOK-2026-001', 'a0000000-0000-0000-0000-000000000002', 'dj', 'Główny DJ'),
    ('BOOK-2026-003', 'a0000000-0000-0000-0000-000000000003', 'dj', 'DJ + MC'),
    ('BOOK-2026-004', 'a0000000-0000-0000-0000-000000000004', 'dj', 'DJ'),
    ('BOOK-2026-004', 'a0000000-0000-0000-0000-000000000002', 'technician', 'Technik dźwięku')
ON CONFLICT (booking_id, user_id) DO NOTHING;