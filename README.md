# Wedding SaaS — Platforma dla branży ślubnej

Multi-tenant SaaS dla DJ-ów i sal weselnych. Trzy moduły: rezerwacje online, automatyzacja biura, AI asystent kontaktu.

## Architektura

- **Tenancy:** Bridge model — współdzielone Lambda/DynamoDB/SES, izolacja danych przez PK prefix `TENANT#{id}#`
- **Baza:** DynamoDB single-table, IAM `dynamodb:LeadingKeys` dla izolacji tenantów
- **Compute:** Lambda + API Gateway v2 (REST), WebSocket dla AI chatbota (później)
- **Auth:** AWS Cognito (vendorzy) + JWT z `tenant_id` w claimach
- **IaC:** Terraform, GitHub Actions OIDC
- **Region:** eu-central-1 (dane w EU — RODO)
- **AI:** Amazon Bedrock + Claude 3.5 Haiku (później)

## Moduły

1. **Rezerwacje** — embeddable booking widget na stronie vendor'a, self-service w 3 krokach, Google Calendar sync per-tenant, email + SMS, zaliczka jako manualna flaga
2. **Biuro** — CRUD rezerwacji, kontrakty PDF (fpdf2), przypomnienia D-21, pipeline Kanban, baza klientów
3. **AI asystent** — widget chat na stronie vendor'a, Bedrock Claude, kwalifikacja leadów, eskalacja (później)

## Struktura repo

```
wedding-saas/
├── terraform/
│   ├── *.tf                  # Global infrastructure
│   └── lambda_src/
│       ├── api/              # REST API (bookings, tenants, auth)
│       └── onboarding/       # Tenant provisioning
├── frontend/
│   ├── admin-spa/            # Vendor dashboard (vanilla JS SPA)
│   └── booking-widget/       # Embeddable booking widget
├── .github/workflows/        # CI/CD
└── docs/                     # Dokumentacja
```

## Fazy

- **Faza 0 (teraz):** Fundament — Terraform, DynamoDB, Cognito, API Gateway, Lambda skeleton, admin SPA skeleton
- **Faza 1:** Rezerwacje — booking widget, formularz, kalendarz, auto-reply, Google Calendar
- **Faza 2:** Biuro — kontrakty PDF, przypomnienia, pipeline, baza klientów
- **Faza 3:** AI asystent — WebSocket chatbot, Bedrock, kwalifikacja, eskalacja