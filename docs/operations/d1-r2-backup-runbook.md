# D1 Database and R2 Storage Backup & Inventory Runbook

This operational runbook documents the mandatory procedures for creating, verifying, and managing production backups of Cloudflare D1 (`site-creator-d1`) and R2 (`pch`) storage prior to executing remote database migrations or administrative updates.

> **CRITICAL SAFETY WARNINGS**
> - **NEVER** run a remote D1 migration (`npm run db:migrate:apply:remote`) without first creating, encrypting, and verifying an off-repository backup archive and recording a D1 Time Travel recovery bookmark.
> - **NEVER** commit, track, or push SQL dump files, R2 inventories, or secret keys to Git repositories.
> - Operational records (patient appointments, contact messages, user sessions, audit trails) must be handled with strict privacy compliance and excluded from website-content rollbacks.

---

## 1. Prerequisites, Environment, and Path Initialization

> **Environment Preconditions:**
> 1. Commands in this runbook MUST be executed using **Bash on Linux/macOS or WSL (Windows Subsystem for Linux)** with POSIX paths.
> 2. Commands MUST be executed from the **repository root directory**.
> 3. Use one dedicated shell session for backup creation.
> 4. `OFFSITE_BACKUP_DIR` MUST be set by the operator to an absolute POSIX path representing restricted non-Git storage outside the repository tree and outside the public R2 `pch` bucket.

```bash
set -Eeuo pipefail
umask 077

test -f package.json || {
  echo "Error: run this procedure from the repository root"
  exit 1
}

export REPO_ROOT="$(pwd -P)"

export OPERATOR_ID="${OPERATOR_ID:-$(git config --get user.email || true)}"
test -n "${OPERATOR_ID}" || {
  echo "Error: set OPERATOR_ID or configure git user.email"
  exit 1
}

: "${OFFSITE_BACKUP_DIR:?Set OFFSITE_BACKUP_DIR to an absolute directory outside the repository}"
case "${OFFSITE_BACKUP_DIR}" in
  /*) ;;
  *) echo "Error: OFFSITE_BACKUP_DIR must be an absolute POSIX path"; exit 1 ;;
esac

mkdir -p "${OFFSITE_BACKUP_DIR}"
export OFFSITE_BACKUP_DIR="$(cd "${OFFSITE_BACKUP_DIR}" && pwd -P)"

case "${OFFSITE_BACKUP_DIR}/" in
  "${REPO_ROOT}/"*)
    echo "Error: OFFSITE_BACKUP_DIR resolves inside the repository"
    exit 1
    ;;
esac

export BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
export BACKUP_ROOT="${REPO_ROOT}/.local-backups"
export BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TIMESTAMP}"
export GIT_HEAD_SHA="$(git rev-parse HEAD)"
export GIT_BRANCH_NAME="$(git branch --show-current)"
export WRANGLER_VER="$(npx wrangler --version)"

mkdir -p "${BACKUP_DIR}"
```

---

## 2. Cloudflare Identity Verification

Verify Cloudflare credentials and operator account access before starting:

```bash
npx wrangler whoami
```

Ensure the CLI reports account ID `b9b4b7e42c3b44d04fcd759ce96aea36` with active permissions for database binding `DB` (`site-creator-d1`) and R2 bucket `pch`.

---

## 3. Production Evidence Collection & Validation

Capture D1 database metadata and record a Time Travel recovery point prior to applying any remote changes:

```bash
npx wrangler d1 info DB --json \
  > "${BACKUP_DIR}/d1_info.json"

npx wrangler d1 time-travel info DB --json \
  > "${BACKUP_DIR}/d1_time_travel_info.json"

npm run db:migrate:list:remote \
  > "${BACKUP_DIR}/remote_migrations_list.txt"

npx wrangler r2 bucket info pch --json \
  > "${BACKUP_DIR}/r2_bucket_info.json"

export D1_DUMP_FILE="${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql"
npx wrangler d1 export DB --remote --output "${D1_DUMP_FILE}"
```

> **Primary Short-Window Production Recovery Path (D1 Time Travel):**
> - `npx wrangler d1 info DB` records general database metadata only and does **NOT** contain a recovery bookmark.
> - `npx wrangler d1 time-travel info DB --json` captures the authoritative point-in-time state and bookmark.
> - Cloudflare D1 Time Travel provides point-in-time recovery (typically 7-day retention on Free plans; 30-day retention on Paid plans).
> - Time Travel restore is **destructive** to subsequent writes and requires explicit human approval.

### Evidence File Non-Empty Validation
```bash
for required_file in \
  "${BACKUP_DIR}/d1_info.json" \
  "${BACKUP_DIR}/d1_time_travel_info.json" \
  "${BACKUP_DIR}/remote_migrations_list.txt" \
  "${BACKUP_DIR}/r2_bucket_info.json" \
  "${D1_DUMP_FILE}"
do
  test -s "${required_file}" || {
    echo "Error: required backup evidence is missing or empty: ${required_file}"
    exit 1
  }
done
```

### Privacy-Safe Schema Marker Validation
Validate SQL export schema markers without printing sensitive patient data or database records:

```bash
TABLE_MARKER_COUNT="$(grep -c 'CREATE TABLE' "${D1_DUMP_FILE}" || true)"
case "${TABLE_MARKER_COUNT}" in
  ''|*[!0-9]*) echo "Error: invalid CREATE TABLE marker count"; exit 1 ;;
esac

test "${TABLE_MARKER_COUNT}" -ge 20 || {
  echo "Error: D1 export contains fewer than the expected 20 table markers"
  exit 1
}

for required_table in appointments contact_messages doctor_profiles media_assets audit_logs
do
  grep -Eiq "CREATE TABLE( IF NOT EXISTS)? [\"\[]?${required_table}[\"\]]?" "${D1_DUMP_FILE}" || {
    echo "Error: expected schema marker missing for table ${required_table}"
    exit 1
  }
done
```

---

## 4. R2 Inventory Evidence & Optional D1 Estimate

> **Wrangler 4.92.0 CLI Limitation Note:**
> Installed Wrangler CLI `v4.92.0` exposes object operations (`get`, `put`, `delete`) but **does not support an object-listing command** (`wrangler r2 object list`).

### Authoritative Inventory Inputs (Optional / Operator-Supplied)
Authoritative inventory evidence is accepted ONLY from the Cloudflare Dashboard (manually exported) or a separately configured read-only S3-compatible client:

```bash
# Optional. Leave all unset when no authoritative inventory is available.
# export R2_INVENTORY_METHOD="cloudflare_dashboard"
# export R2_INVENTORY_TIMESTAMP="20260719T201731Z"
# export R2_OBJECT_COUNT="150"
# export R2_OBJECT_BYTES="10485760"
# export R2_INVENTORY_SOURCE="/absolute/restricted/path/r2_inventory.json"
```

If `R2_INVENTORY_SOURCE` is supplied, handle it safely:

```bash
if test -n "${R2_INVENTORY_SOURCE:-}"; then
  case "${R2_INVENTORY_SOURCE}" in
    /*) ;;
    *) echo "Error: R2_INVENTORY_SOURCE must be absolute"; exit 1 ;;
  esac

  test -f "${R2_INVENTORY_SOURCE}" && test -s "${R2_INVENTORY_SOURCE}" || {
    echo "Error: R2 inventory evidence is missing or empty"
    exit 1
  }

  cp -- "${R2_INVENTORY_SOURCE}" "${BACKUP_DIR}/r2_inventory_evidence"
fi
```

### Optional D1 Asset Metadata Estimate (Non-Authoritative)
Query published D1 media records as a secondary metadata estimate:

```bash
npx wrangler d1 execute DB --remote \
  --command="SELECT COUNT(*) AS total_assets, COALESCE(SUM(size_bytes), 0) AS total_bytes FROM media_assets WHERE is_visible = 1;" \
  --json > "${BACKUP_DIR}/d1_media_assets_estimate.json"
```

*(Note: This query provides a database metadata estimate and must NEVER be described as actual R2 bucket inventory).*

---

## 5. Strict Fail-Closed Backup Manifest Generator

Execute the strict Node.js manifest generator. If any required environment variable or required artifact is missing or zero bytes, or if metric values are invalid, manifest generation **fails closed with a non-zero exit code**:

```bash
node <<'NODE'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const requiredEnv = [
  'BACKUP_DIR',
  'BACKUP_TIMESTAMP',
  'OPERATOR_ID',
  'GIT_HEAD_SHA',
  'GIT_BRANCH_NAME',
  'WRANGLER_VER',
];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const backupDir = process.env.BACKUP_DIR;
const timestamp = process.env.BACKUP_TIMESTAMP;

function inspectArtifact(filename, required) {
  const fullPath = path.join(backupDir, filename);
  if (!fs.existsSync(fullPath)) {
    if (required) throw new Error(`Required artifact missing: ${filename}`);
    return { filename, status: 'not_captured', size_bytes: 0, sha256: null };
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    throw new Error(`Artifact is not a regular file: ${filename}`);
  }

  if (stat.size <= 0) {
    if (required) throw new Error(`Required artifact is empty: ${filename}`);
    return { filename, status: 'empty', size_bytes: 0, sha256: null };
  }

  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(fullPath))
    .digest('hex');

  return {
    filename,
    status: 'verified',
    size_bytes: stat.size,
    sha256,
  };
}

function parseOptionalNonNegativeSafeInteger(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return null;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`${name} must be a complete non-negative integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} exceeds JavaScript safe-integer range`);
  }
  return value;
}

const objectCount = parseOptionalNonNegativeSafeInteger('R2_OBJECT_COUNT');
const objectBytes = parseOptionalNonNegativeSafeInteger('R2_OBJECT_BYTES');

if ((objectCount === null) !== (objectBytes === null)) {
  throw new Error('R2_OBJECT_COUNT and R2_OBJECT_BYTES must be supplied together');
}

const requiredArtifacts = {
  d1_sql_export: inspectArtifact(
    `protone_d1_backup_${timestamp}.sql`,
    true,
  ),
  d1_info: inspectArtifact('d1_info.json', true),
  d1_time_travel_info: inspectArtifact('d1_time_travel_info.json', true),
  remote_migration_list: inspectArtifact('remote_migrations_list.txt', true),
  r2_bucket_info: inspectArtifact('r2_bucket_info.json', true),
};

const inventoryArtifact = inspectArtifact('r2_inventory_evidence', false);
const d1EstimateArtifact = inspectArtifact(
  'd1_media_assets_estimate.json',
  false,
);

const metricsAvailable = objectCount !== null && objectBytes !== null;

const manifest = {
  manifest_version: 1,
  utc_timestamp: timestamp,
  operator_identity: process.env.OPERATOR_ID,
  source: {
    git_head: process.env.GIT_HEAD_SHA,
    git_branch: process.env.GIT_BRANCH_NAME,
    wrangler_version: process.env.WRANGLER_VER,
  },
  cloudflare: {
    account_id: 'b9b4b7e42c3b44d04fcd759ce96aea36',
    d1_binding: 'DB',
    d1_database_name: 'site-creator-d1',
    d1_database_id: '085be1f3-8d4a-459c-86b2-5f5d0d0f964f',
    r2_binding: 'MEDIA',
    r2_bucket: 'pch',
  },
  required_artifacts: requiredArtifacts,
  r2_inventory: {
    method: process.env.R2_INVENTORY_METHOD || 'unavailable',
    timestamp: process.env.R2_INVENTORY_TIMESTAMP || null,
    object_count: objectCount,
    object_bytes: objectBytes,
    metrics_status: metricsAvailable ? 'verified' : 'unavailable',
    artifact: inventoryArtifact,
  },
  d1_media_estimate: {
    authoritative: false,
    artifact: d1EstimateArtifact,
  },
  verification_status: 'verified',
};

const manifestPath = path.join(backupDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o600,
});

console.log('Manifest generated after all required checks passed.');
NODE

sha256sum "${BACKUP_DIR}/manifest.json" \
  > "${BACKUP_DIR}/manifest.json.sha256"

test -s "${BACKUP_DIR}/manifest.json.sha256" || {
  echo "Error: manifest checksum was not created"
  exit 1
}
```

---

## 6. Compression, GPG Encryption, Verification & Off-Repository Transfer

> **Important:** `.tar.gz` provides compression only, NOT encryption. Mandatory symmetric encryption uses GPG AES-256. Plaintext backup evidence MUST NOT remain in local working directories after backup completion.

### Verification of Required System Utilities
```bash
for required_command in node tar gpg sha256sum cp
do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "Error: required command missing: ${required_command}"
    exit 1
  }
done
```

### Compression and GPG AES-256 Encryption
```bash
export ARCHIVE_FILE="${BACKUP_ROOT}/backup_${BACKUP_TIMESTAMP}.tar.gz"
export ENCRYPTED_FILE="${ARCHIVE_FILE}.gpg"
export ENCRYPTED_FILENAME="$(basename "${ENCRYPTED_FILE}")"
export CHECKSUM_FILENAME="${ENCRYPTED_FILENAME}.sha256"

for destination_name in "${ENCRYPTED_FILENAME}" "${CHECKSUM_FILENAME}"
do
  test ! -e "${OFFSITE_BACKUP_DIR}/${destination_name}" || {
    echo "Error: refusing to overwrite existing off-repository artifact: ${destination_name}"
    exit 1
  }
done

tar -czf "${ARCHIVE_FILE}" -C "${BACKUP_ROOT}" "${BACKUP_TIMESTAMP}"
test -s "${ARCHIVE_FILE}" || { echo "Error: archive creation failed"; exit 1; }

gpg --symmetric --cipher-algo AES256 \
  --output "${ENCRYPTED_FILE}" \
  "${ARCHIVE_FILE}"
test -s "${ENCRYPTED_FILE}" || { echo "Error: encryption failed"; exit 1; }
```

### Local Decryption Stream Verification & Off-Repository Copy
```bash
set -o pipefail
gpg --decrypt "${ENCRYPTED_FILE}" | tar -tzf - >/dev/null || {
  echo "Error: encrypted archive cannot be decrypted/listed"
  exit 1
}

(
  cd "${BACKUP_ROOT}"
  sha256sum "${ENCRYPTED_FILENAME}" > "${CHECKSUM_FILENAME}"
)

cp -- "${ENCRYPTED_FILE}" "${OFFSITE_BACKUP_DIR}/${ENCRYPTED_FILENAME}"
cp -- "${BACKUP_ROOT}/${CHECKSUM_FILENAME}" "${OFFSITE_BACKUP_DIR}/${CHECKSUM_FILENAME}"

chmod 600 \
  "${OFFSITE_BACKUP_DIR}/${ENCRYPTED_FILENAME}" \
  "${OFFSITE_BACKUP_DIR}/${CHECKSUM_FILENAME}"

(
  cd "${OFFSITE_BACKUP_DIR}"
  sha256sum -c "${CHECKSUM_FILENAME}"
)
```

### Local Plaintext Cleanup
```bash
rm -rf -- "${BACKUP_DIR}"
rm -f -- \
  "${ARCHIVE_FILE}" \
  "${ENCRYPTED_FILE}" \
  "${BACKUP_ROOT}/${CHECKSUM_FILENAME}"

printf 'Verified off-repository backup: %s\n' \
  "${OFFSITE_BACKUP_DIR}/${ENCRYPTED_FILENAME}"
```

> **Off-Repository Storage & Passphrase Rules:**
> - NEVER use the public R2 `pch` bucket as a backup destination.
> - NEVER commit backup archives or checksums to Git.
> - NEVER delete the off-repository encrypted backup until retention policy permits.
> - Store the GPG passphrase separately from the encrypted archive in an authorized credential vault.
> - If any step fails, retain local evidence, halt, and escalate; do NOT apply remote database migrations.

---

## 7. Standalone Production Recovery Procedure

Recovery MUST be self-contained and executable in a brand-new shell session without relying on environment variables left over from backup creation.

```bash
set -Eeuo pipefail
umask 077

# Operator MUST set RECOVERY_ARCHIVE to the absolute path of the existing encrypted off-repo archive file.
: "${RECOVERY_ARCHIVE:?Set RECOVERY_ARCHIVE to the absolute off-repository .tar.gz.gpg file}"

case "${RECOVERY_ARCHIVE}" in
  /*) ;;
  *) echo "Error: RECOVERY_ARCHIVE must be absolute"; exit 1 ;;
esac

test -f "${RECOVERY_ARCHIVE}" && test -s "${RECOVERY_ARCHIVE}" || {
  echo "Error: recovery archive is missing or empty"
  exit 1
}

export RECOVERY_ARCHIVE="$(cd "$(dirname "${RECOVERY_ARCHIVE}")" && pwd -P)/$(basename "${RECOVERY_ARCHIVE}")"
export RECOVERY_DIR="$(dirname "${RECOVERY_ARCHIVE}")"
export ENCRYPTED_FILENAME="$(basename "${RECOVERY_ARCHIVE}")"
export RECOVERY_CHECKSUM="${RECOVERY_DIR}/${ENCRYPTED_FILENAME}.sha256"

test -s "${RECOVERY_CHECKSUM}" || {
  echo "Error: recovery checksum file is missing"
  exit 1
}

case "${ENCRYPTED_FILENAME}" in
  backup_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.tar.gz.gpg) ;;
  *) echo "Error: unexpected recovery archive filename"; exit 1 ;;
esac

export BACKUP_TIMESTAMP="${ENCRYPTED_FILENAME#backup_}"
export BACKUP_TIMESTAMP="${BACKUP_TIMESTAMP%.tar.gz.gpg}"

case "${BACKUP_TIMESTAMP}" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
  *)
    echo "Error: failed to derive a valid backup timestamp"
    exit 1
    ;;
esac

(
  cd "${RECOVERY_DIR}"
  sha256sum -c "$(basename "${RECOVERY_CHECKSUM}")"
)

export RECOVERY_TMP="$(mktemp -d -t pch-recovery-XXXXXXXX)"

cleanup_recovery_tmp() {
  if test -n "${RECOVERY_TMP:-}" && test -d "${RECOVERY_TMP}"; then
    rm -rf -- "${RECOVERY_TMP}"
  fi
}
trap cleanup_recovery_tmp EXIT INT TERM

set -o pipefail
gpg --decrypt "${RECOVERY_ARCHIVE}" | tar -xzf - -C "${RECOVERY_TMP}" || {
  echo "Error: recovery decryption/extraction failed"
  exit 1
}

export RECOVERED_EVIDENCE_DIR="${RECOVERY_TMP}/${BACKUP_TIMESTAMP}"

test -s "${RECOVERED_EVIDENCE_DIR}/d1_time_travel_info.json" || {
  echo "Error: recovered Time Travel evidence is missing"
  exit 1
}
```

*(Note: Do NOT `cat` the SQL export or patient records. Inspect only the specific `d1_time_travel_info.json` file to obtain the recovery bookmark or timestamp).*

---

## 8. Capture & Retain Pre-Restore Undo Bookmark

Before performing any destructive Time Travel restore:

```bash
export UNDO_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
export UNDO_FILE="${RECOVERY_TMP}/undo_bookmark_${UNDO_TIMESTAMP}.json"
export UNDO_ENCRYPTED_FILE="${RECOVERY_DIR}/undo_bookmark_${UNDO_TIMESTAMP}.json.gpg"

npx wrangler d1 time-travel info DB --json > "${UNDO_FILE}"

test -s "${UNDO_FILE}" || {
  echo "Error: failed to capture current undo bookmark"
  exit 1
}

gpg --symmetric --cipher-algo AES256 \
  --output "${UNDO_ENCRYPTED_FILE}" \
  "${UNDO_FILE}"

test -s "${UNDO_ENCRYPTED_FILE}" || {
  echo "Error: failed to encrypt undo bookmark"
  exit 1
}

(
  cd "${RECOVERY_DIR}"
  sha256sum "$(basename "${UNDO_ENCRYPTED_FILE}")" \
    > "$(basename "${UNDO_ENCRYPTED_FILE}").sha256"
  sha256sum -c "$(basename "${UNDO_ENCRYPTED_FILE}").sha256"
)
```

> **Undo Bookmark & Recovery Rules:**
> - `npx wrangler d1 time-travel info DB --json` is a read-only remote operation.
> - The encrypted undo bookmark (`${UNDO_ENCRYPTED_FILE}`) MUST remain stored off-repository until recovery sign-off and retention expiry.
> - Temporary plaintext files are cleaned up automatically by the recovery trap (`cleanup_recovery_tmp`).
> - Do NOT restore until an authorized human verifies the target bookmark and explicitly approves the destructive operation.

### Destructive Time Travel Restore (Operator-Approved Examples)
```bash
# Choose exactly one option after explicit human approval:

npx wrangler d1 time-travel restore DB --bookmark="<VERIFIED_BOOKMARK>"

# OR

npx wrangler d1 time-travel restore DB --timestamp="<VERIFIED_RFC3339_TIMESTAMP>"
```

### Post-Restore Health Verification
Without printing patient data or sensitive records, verify:
1. D1 database identity (`npx wrangler d1 info DB --json`).
2. Migration status (`npm run db:migrate:list:remote`).
3. Expected table/schema markers.
4. Admin console login (`/admin/login`).
5. Appointment status lookup using an authorized synthetic/test identifier only.
6. Public content rendering (`/doctors`, `/blog`, `/careers`, `/gallery`).
7. Error log check.
8. Confirmation that no R2 object changed.
9. Authorized human recovery sign-off.

*(Temporary plaintext directory `${RECOVERY_TMP}` is cleaned up upon shell exit. The encrypted original backup and encrypted undo bookmark MUST NOT be deleted merely because initial health checks pass).*

---

## 9. Secondary SQL Recovery Wording & Operational Isolation

- **Isolation Rule:** Operational patient records (`appointments`, `contact_messages`, `feedback`, `sessions`, `admin_email_otps`, `audit_logs`, `rate_limits`) represent live patient/system activity and are **never altered, wiped, or rolled back** during website content updates.
- **SQL Restore Constraints:** Never import the full SQL export file directly into a non-empty production D1 database. Any SQL-based recovery MUST first be tested against a fresh, isolated recovery database (`npx wrangler d1 create test-restore-db`). Creating a recovery database is a remote mutation requiring separate explicit approval.
