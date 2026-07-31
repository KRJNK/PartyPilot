# Data Contract — PartyPilot (Scaleway)

Wspólny punkt odniesienia dla Terraform, API i Frontend SPA.

## Stack

- **Compute:** Scaleway Serverless Functions (Python 3.12)
- **Database:** Scaleway Managed PostgreSQL (pl-waw-1, Warsaw)
- **Storage:** Scaleway Object Storage (S3-compatible)
- **Email:** Scaleway Transactional Email (TEM)
- **CDN/DNS:** Cloudflare free tier
- **Auth:** Własny JWT (PostgreSQL + bcrypt + python-jose)
- **IaC:** Terraform (Scaleway provider + Cloudflare provider)

## PostgreSQL Schema

### `tenants` table

```sql
CREATE TABLE tenants (
    id          VARCHAR(32) PRIMARY KEY,   -- T-a1b2c3
    status      VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, suspended, cancelled
    plan        VARCHAR(20) NOT NULL DEFAULT 'starter', -- starter, pro
    company_name TEXT NOT NULL DEFAULT '',
    owner_email TEXT NOT NULL,
    logo_url    TEXT DEFAULT '',
    primary_color VARCHAR(7) DEFAULT '#C9A96E',
    about_text  TEXT DEFAULT '',
    contact_email TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    gcal_refresh_token TEXT DEFAULT '',   -- encrypted, per-tenant Google Calendar
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `users` table

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    password_hash TEXT NOT NULL,           -- bcrypt
    role        VARCHAR(20) NOT NULL DEFAULT 'owner', -- owner, admin, manager
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);
```

### `bookings` table

```sql
CREATE TABLE bookings (
    id              VARCHAR(20) PRIMARY KEY,   -- BOOK-2026-001 (per-tenant sequence)
    tenant_id       VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'inquiry',
    client_type     VARCHAR(20) DEFAULT '',     -- bride_groom, dj, agency
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
    source          VARCHAR(20) DEFAULT 'admin', -- admin, public_booking, ai_qualified
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_tenant_status ON bookings(tenant_id, status);
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, event_date);
CREATE INDEX idx_bookings_tenant_email ON bookings(tenant_id, client_email);
CREATE INDEX idx_bookings_status ON bookings(status, event_date);
```

### `booking_status_history` table

```sql
CREATE TABLE booking_status_history (
    id          BIGSERIAL PRIMARY KEY,
    booking_id  VARCHAR(20) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL,
    note        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `packages` table

```sql
CREATE TABLE packages (
    id              VARCHAR(32) PRIMARY KEY,   -- PKG-{uuid}
    tenant_id       VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           DECIMAL(10,2) NOT NULL DEFAULT 0,
    duration        TEXT DEFAULT '',
    features        JSONB DEFAULT '[]',
    deposit_type    VARCHAR(20) DEFAULT 'fixed', -- fixed, percent
    deposit_amount  DECIMAL(10,2) DEFAULT 0,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_packages_tenant ON packages(tenant_id);
```

### `conversations` table (AI assistant)

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   VARCHAR(32) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_email TEXT DEFAULT '',
    client_name  TEXT DEFAULT '',
    status      VARCHAR(20) DEFAULT 'active', -- active, handoff, closed
    lead_qualified BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_tenant_status ON conversations(tenant_id, status);
```

### `messages` table (AI assistant)

```sql
CREATE TABLE messages (
    id          BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL, -- user, assistant
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

### `ai_config` table (per-tenant AI training)

```sql
CREATE TABLE ai_config (
    tenant_id       VARCHAR(32) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    enabled         BOOLEAN DEFAULT FALSE,
    system_prompt   TEXT DEFAULT '',
    faq_text        TEXT DEFAULT '',          -- vendor's FAQ, pricing, policies
    tone            VARCHAR(20) DEFAULT 'friendly', -- friendly, professional, casual
    business_hours  VARCHAR(200) DEFAULT '',   -- JSON: {mon: "9-18", ...}
    escalation_email TEXT DEFAULT '',          -- where to send qualified leads
    auto_create_booking BOOLEAN DEFAULT TRUE,  -- auto-create booking when lead qualified
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Booking Statuses

```
inquiry → offer_sent → deposit_paid → confirmed → completed
                    ↘ cancelled (terminal)
```

## ID Formats

- **Tenant:** `T-{short_uuid}` (e.g. `T-a1b2c3`)
- **Booking:** `BOOK-{YYYY}-{NNN}` (per-tenant sequence, e.g. `BOOK-2026-001`)
- **Package:** `PKG-{uuid}`
- **User:** UUID (PostgreSQL gen_random_uuid)

## API Endpoints

### Public (no auth, tenant resolved from path)

```
GET  /api/public/{tenant_id}/packages          — list packages for booking widget
POST /api/public/{tenant_id}/bookings          — create booking (self-service)
GET  /api/public/{tenant_id}/availability      — booked dates from DB (NOT Google Calendar)
   Query params: ?month=YYYY-MM (returns all booked dates in that month)
   Response: { "booked_dates": ["2026-07-18", "2026-07-25"], "bookings": [{date, status, client_name}] }
GET  /api/public/{tenant_id}                   — public tenant info (name, logo, color)
```

### Auth (custom JWT)

```
POST /api/auth/register                         — register new tenant + owner user
POST /api/auth/login                            — email + password → JWT tokens
POST /api/auth/refresh                          — refresh access token
GET  /api/auth/me                               — current user info (from JWT)
```

### Admin (JWT auth, tenant_id from JWT claim)

```
GET  /api/admin/bookings                        — list (filter by status, date)
POST /api/admin/bookings                        — create
GET  /api/admin/bookings/{id}                   — detail
PUT  /api/admin/bookings/{id}                   — update
POST /api/admin/bookings/{id}/cancel            — cancel
DELETE /api/admin/bookings/{id}                 — hard delete
POST /api/admin/bookings/{id}/mark-deposit-paid — mark deposit as paid (manual)

GET  /api/admin/packages                        — list packages
POST /api/admin/packages                        — create package
PUT  /api/admin/packages/{id}                   — update package
DELETE /api/admin/packages/{id}                 — delete package

GET  /api/admin/tenant                          — tenant profile
PUT  /api/admin/tenant                          — update tenant (branding, etc.)

GET  /api/admin/calendar                        — calendar view (bookings in date range)
   Query params: ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
   Response: { "events": [{date, booking_id, status, client_name, event_time_start, event_time_end, event_location, package_id}] }

GET  /api/admin/ai-config                      — get AI assistant config
PUT  /api/admin/ai-config                       — update AI config (enabled, faq_text, tone, escalation_email)
GET  /api/admin/conversations                   — list conversations (filter by status)
GET  /api/admin/conversations/{id}              — conversation detail with messages
POST /api/admin/conversations/{id}/close        — close conversation
```

### Public AI Chat (no auth, tenant from path)

```
POST /api/public/{tenant_id}/chat               — send message, get AI response
   Body: { "message": "text", "conversation_id": "uuid (optional)" }
   Response: { "conversation_id": "uuid", "reply": "AI response text", "lead_qualified": false }
   If no conversation_id: creates new conversation
   AI uses tenant's ai_config (system_prompt, faq_text, tone) + packages for context
   If lead qualified: sets lead_qualified=true, sends escalation email to vendor
```

### Response Format

All responses: `{ "statusCode": N, "body": "{...json...}" }`

Error format: `{ "error": "message", "detail": "optional" }`

## JWT Auth

- **Algorithm:** HS256 (symmetric, secret stored in env var `JWT_SECRET`)
- **Access token:** 15 min expiry, payload: `{ sub: user_id, tenant_id, role, email }`
- **Refresh token:** 30 day expiry, stored in `users` table as `refresh_token_hash`
- **Login flow:** POST `/api/auth/login` with `{email, password}` → returns `{access_token, refresh_token, user}`
- **Auth header:** `Authorization: Bearer {access_token}`
- **Tenant isolation:** `tenant_id` from JWT claim, enforced in every SQL query (`WHERE tenant_id = $1`)

## Environment Variables (API Functions)

```
DATABASE_URL=postgresql://user:pass@host:port/dbname
JWT_SECRET=<random-64-chars>
SMTP_HOST=smtp.tem.scw.cloud
SMTP_PORT=587
SMTP_USER=<tem-username>
SMTP_PASS=<tem-password>
ALLOWED_ORIGINS=*
STORAGE_BUCKET=partypilot-storage
SCW_REGION=pl-waw-1
```

## Scaleway Services

| Service | Resource | Region |
|---------|----------|--------|
| Serverless Functions | `partypilot-api` | pl-waw-1 |
| Managed PostgreSQL | `partypilot-db` (DB-DEV-S, 2GB RAM) | pl-waw-1 |
| Object Storage | `partypilot-storage` | pl-waw-1 |
| Transactional Email | `partypilot-tem` | pl-waw-1 |
| CDN/DNS | Cloudflare (external) | global |

## Cost Estimate

| Tenants | Monthly Cost |
|---------|-------------|
| 10 | ~€8-12 |
| 50 | ~€20-35 |
| 200 | ~€50-90 |