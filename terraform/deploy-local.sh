#!/usr/bin/env bash
#
# PartyPilot — Local Terraform Deployment Script
#
# Usage:
#   1. cp .env.example .env  (fill in your secrets)
#   2. ./terraform/deploy-local.sh init      # terraform init
#   3. ./terraform/deploy-local.sh plan      # terraform plan
#   4. ./terraform/deploy-local.sh apply     # terraform apply -auto-approve
#   5. ./terraform/deploy-local.sh destroy   # terraform destroy
#   6. ./terraform/deploy-local.sh output    # terraform output
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$REPO_DIR/.env"

# ── Load .env ────────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    echo "  Create it with:  cp .env.example .env"
    echo "  Then fill in your secrets."
    exit 1
fi

echo "Loading environment from .env ..."
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# ── Validate required vars ───────────────────────────────────────

REQUIRED_VARS=(
    SCW_ACCESS_KEY
    SCW_SECRET_KEY
    SCW_DEFAULT_PROJECT_ID
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "  WARNING: $var is not set"
        MISSING=1
    fi
done

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "ERROR: Required Scaleway credentials are missing."
    echo "  Check your .env file."
    exit 1
fi

echo "  SCW_ACCESS_KEY:        ${SCW_ACCESS_KEY:0:8}..."
echo "  SCW_DEFAULT_PROJECT_ID: $SCW_DEFAULT_PROJECT_ID"
echo ""

# ── Sync TF_VAR_ copies for Scaleway (provider needs both) ───────
export TF_VAR_scw_access_key="$SCW_ACCESS_KEY"
export TF_VAR_scw_secret_key="$SCW_SECRET_KEY"

# ── Run Terraform ────────────────────────────────────────────────

cd "$SCRIPT_DIR"

CMD="${1:-plan}"
shift || true

case "$CMD" in
    init)
        echo "→ terraform init"
        terraform init "$@"
        ;;
    plan)
        echo "→ terraform plan"
        terraform plan "$@"
        ;;
    apply)
        echo "→ terraform apply -auto-approve"
        terraform apply -auto-approve -input=false "$@"
        ;;
    destroy)
        echo "→ terraform destroy -auto-approve"
        terraform destroy -auto-approve -input=false "$@"
        ;;
    output)
        echo "→ terraform output"
        terraform output "$@"
        ;;
    fmt)
        echo "→ terraform fmt -recursive"
        terraform fmt -recursive "$@"
        ;;
    validate)
        echo "→ terraform validate"
        terraform validate "$@"
        ;;
    *)
        echo "Usage: $0 {init|plan|apply|destroy|output|fmt|validate}"
        echo ""
        echo "  init      — initialize backend + providers"
        echo "  plan      — show deployment plan"
        echo "  apply     — deploy infrastructure"
        echo "  destroy   — tear down infrastructure"
        echo "  output    — show outputs (admin password, endpoints)"
        echo "  fmt       — format .tf files"
        echo "  validate  — validate configuration"
        exit 1
        ;;
esac
