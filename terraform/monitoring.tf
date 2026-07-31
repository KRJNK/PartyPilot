# ──────────────────────────────────────────────
# Monitoring & Alerting
# ──────────────────────────────────────────────
#
# Scaleway provider support for monitoring/alerting
# is limited as of v2.x. Below are placeholders for
# future implementation.
#
# For now, set up alerts manually via:
#   - Scaleway Console → Observability → Alerts
#   - Cloudflare Dashboard → Analytics → Notifications
#
# ──────────────────────────────────────────────

# ── Budget Alert (placeholder) ──
# Scaleway billing alerts must be configured via
# the console under Billing → Budgets.
#
# resource "scaleway_budget_alert" "monthly" {
#   name        = "partypilot-monthly-budget"
#   limit       = 100
#   threshold   = 80
#   emails      = ["admin@${var.domain_name}"]
#   frequency   = "monthly"
# }

resource "null_resource" "budget_alert_note" {
  triggers = {
    note = "Budget alerts must be configured manually in Scaleway Console → Billing → Budgets"
  }
  lifecycle {
    ignore_changes = all
  }
}

# ── Function Error Alert (placeholder) ──
# Scaleway Cockpit alerts for function error rates
# can be created via Scaleway Observability once
# the Cockpit API supports programmatic alert rules.
#
# resource "scaleway_cockpit_alert" "function_errors" {
#   name   = "partypilot-api-errors"
#   period = "5m"
#   condition {
#     metric    = "scw_function_error_count"
#     operator  = ">"
#     value     = 10
#   }
#   notification {
#     email = ["admin@${var.domain_name}"]
#   }
# }

resource "null_resource" "function_alert_note" {
  triggers = {
    note = "Function error alerts must be configured manually in Scaleway Console → Observability → Alerts"
  }
  lifecycle {
    ignore_changes = all
  }
}
