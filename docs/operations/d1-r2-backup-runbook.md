# D1 Database and R2 Storage Backup & Inventory Runbook

This operational runbook documents the mandatory procedures for creating, verifying, and managing production backups of Cloudflare D1 (`site-creator-d1`) and R2 (`pch`) storage prior to executing remote database migrations or administrative updates.

> **CRITICAL SAFETY WARNINGS**
> - **NEVER** run a remote D1 migration (`npm run db:migrate:apply:remote`) without first creating and verifying a local production database export and recording a D1 Time Travel recovery bookmark.
> - **NEVER** commit, track, or push SQL dump files, R2 inventories, or secret keys to Git repositories.
> - Operational records (patient appointments, contact messages, user sessions, audit trails) must be handled with strict privacy compliance and excluded from website-content rollbacks.

---

## 1. Path Scoping & Repository Root Requirement

> **Path Note:**
> Commands in this runbook MUST be executed from the **repository root directory**.
> - In `.gitignore`, the pattern `/.local-backups/` scopes ignoring to the repository root directory (`${PWD}/.local-backups`).
> - In shell, a leading slash `/` without `${PWD}` refers to the system filesystem root. Always use explicit quoted environment variables `${BACKUP_ROOT}` and `${BACKUP_DIR}`.

```bash
# Verify execution from repository root
test -f package.json || { echo "Error: Must run from repository root"; exit 1; }

export BACKUP_TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
export BACKUP_ROOT="${PWD}/.local-backups"
export BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"
```

---

## 2. Preconditions & Identity Check

Verify Cloudflare credentials and operator account access before starting:

```bash
# Verify CLI identity and account access
npx wrangler whoami
```

Ensure the CLI reports account ID `b9b4b7e42c3b44d04fcd759ce96aea36` with active permissions for database binding `DB` (`site-creator-d1`) and R2 bucket `pch`.

---

## 3. Pre-Migration D1 Information & Time Travel Bookmark

Capture D1 database metadata and record a Time Travel recovery point prior to applying any remote changes:

```bash
# 1. Capture database metadata (D1 database ID, bindings, schema metadata)
npx wrangler d1 info DB --json > "${BACKUP_DIR}/d1_info.json"

# 2. Capture real D1 Time Travel recovery point and bookmark
npx wrangler d1 time-travel info DB --json > "${BACKUP_DIR}/d1_time_travel_info.json"

# 3. Capture pending remote migrations list
npm run db:migrate:list:remote > "${BACKUP_DIR}/remote_migrations_list.txt"
```

> **Primary Short-Window Production Recovery Path (D1 Time Travel):**
> - `npx wrangler d1 info DB` records general database metadata only and does **NOT** contain a recovery bookmark.
> - `npx wrangler d1 time-travel info DB --json` captures the authoritative point-in-time state and bookmark.
> - Cloudflare D1 Time Travel provides point-in-time recovery (typically 7-day retention on Free plans; 30-day retention on Paid plans).
> - Time Travel restore is **destructive** to subsequent writes and requires explicit human approval.

---

## 4. Remote D1 Database Export & Verification

Export the remote D1 database to a local SQL file:

```bash
export D1_DUMP_FILE="${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql"
npx wrangler d1 export DB --remote --output "${D1_DUMP_FILE}"
```

Verify export integrity without printing sensitive patient data:

```bash
# 1. Verify file existence and non-zero byte size
ls -lh "${D1_DUMP_FILE}"

# 2. Check schema table count markers
grep -c "CREATE TABLE" "${D1_DUMP_FILE}"
```

---

## 5. R2 Bucket Metadata & Inventory Guidance

> **Wrangler 4.92.0 CLI Limitation Note:**
> The installed Wrangler CLI version (`4.92.0`) exposes object operations (`get`, `put`, `delete`) but **does not support an object-listing command** (`wrangler r2 object list`).

### A. Supported Bucket Metadata Capture
Capture verified bucket metadata via Wrangler:

```bash
npx wrangler r2 bucket info pch --json > "${BACKUP_DIR}/r2_bucket_info.json"
```

### B. Authoritative Object Inventory Methods
To record object counts and byte sizes, use one of the following safe manual sources:
1. **Cloudflare Dashboard (Manual):** Navigate to **R2 > Buckets > pch** to record current object count and storage usage. Save snapshot as `${BACKUP_DIR}/r2_dashboard_snapshot.png`.
2. **Configured Read-Only S3 API Client:** Use an authorized S3-compatible tool (e.g., AWS CLI configured with read-only R2 API credentials) if available.

### C. D1 Asset Metadata Estimate (Non-Authoritative)
As a secondary metadata estimate (not equal to actual R2 bucket storage), you may query published D1 media records via a read-only aggregate query:

```bash
# Note: DO NOT run during migration checklist unless explicitly requested
npx wrangler d1 execute DB --remote --command="SELECT COUNT(*) AS total_assets, COALESCE(SUM(size_bytes),0) AS total_bytes FROM media_assets WHERE is_visible = 1;" --json > "${BACKUP_DIR}/d1_media_assets_estimate.json"
```

---

## 6. Complete Backup Manifest & Evidence Model

Generate a complete, valid JSON manifest using Node.js to safely escape strings without raw shell string interpolation:

```bash
export OPERATOR_EMAIL=$(git config user.email || echo "operator@local")
export WRANGLER_VER=$(npx wrangler --version)
export GIT_HEAD_SHA=$(git rev-parse HEAD)
export GIT_BRANCH_NAME=$(git branch --show-current)

node -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const backupDir = process.env.BACKUP_DIR;
const timestamp = process.env.BACKUP_TIMESTAMP;

function getFileMeta(filename) {
  const fullPath = path.join(backupDir, filename);
  if (!fs.existsSync(fullPath)) return null;
  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath);
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  return { filename, size_bytes: stat.size, sha256 };
}

const manifest = {
  utc_timestamp: timestamp,
  operator_identity: process.env.OPERATOR_EMAIL,
  git_head: process.env.GIT_HEAD_SHA,
  git_branch: process.env.GIT_BRANCH_NAME,
  wrangler_version: process.env.WRANGLER_VER,
  d1_database_name: "site-creator-d1",
  d1_database_id: "085be1f3-8d4a-459c-86b2-5f5d0d0f964f",
  r2_bucket: "pch",
  r2_inventory_method: "dashboard_snapshot_or_bucket_info",
  r2_inventory_timestamp: timestamp,
  r2_object_count: null,
  r2_object_bytes: null,
  artifacts: {
    d1_sql_export: getFileMeta(`protone_d1_backup_${timestamp}.sql`),
    d1_info: getFileMeta("d1_info.json"),
    d1_time_travel_info: getFileMeta("d1_time_travel_info.json"),
    remote_migrations_list: getFileMeta("remote_migrations_list.txt"),
    r2_bucket_info: getFileMeta("r2_bucket_info.json"),
    r2_inventory_artifact: getFileMeta("r2_dashboard_snapshot.png")
  },
  verification_status: "VERIFIED_NON_EMPTY"
};

fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
'

# Checksum the final manifest
sha256sum "${BACKUP_DIR}/manifest.json" > "${BACKUP_DIR}/manifest.json.sha256"
```

---

## 7. Compression and Genuine GPG Symmetric Encryption

> **Important:** `.tar.gz` provides compression only, NOT encryption. Mandatory symmetric encryption uses GPG AES-256.

1. **Verify GPG Tool Presence:**
   ```bash
   command -v gpg >/dev/null 2>&1 || { echo "Error: GPG utility is missing. Halt backup."; exit 1; }
   ```

2. **Compress Backup Directory:**
   ```bash
   export ARCHIVE_FILE="${BACKUP_ROOT}/backup_${BACKUP_TIMESTAMP}.tar.gz"
   tar -czf "${ARCHIVE_FILE}" -C "${BACKUP_ROOT}" "${BACKUP_TIMESTAMP}"
   ```

3. **Encrypt Archive using GPG AES-256:**
   ```bash
   export ENCRYPTED_FILE="${ARCHIVE_FILE}.gpg"
   # Prompt interactively for passphrase (NEVER put passphrase in commands, environment, or scripts)
   gpg --symmetric --cipher-algo AES256 --output "${ENCRYPTED_FILE}" "${ARCHIVE_FILE}"
   ```

4. **Verify Encrypted Content Before Deleting Plaintext Files:**
   ```bash
   # Test decryption and archive listing without writing decrypted files to disk
   set -o pipefail
   gpg --decrypt "${ENCRYPTED_FILE}" | tar -tzf - >/dev/null
   VERIFY_EXIT=$?

   if [ $VERIFY_EXIT -ne 0 ]; then
     echo "Error: Encrypted backup verification failed! Retaining plaintext files."
     exit 1
   fi
   ```

5. **Clean Up Plaintext Backup Artifacts:**
   ```bash
   # Remove unencrypted plaintext files ONLY after verification succeeds
   rm -rf "${BACKUP_DIR}" "${ARCHIVE_FILE}"
   echo "✅ Backup archive verified and encrypted safely to ${ENCRYPTED_FILE}"
   ```

---

## 8. Safe D1 Production Recovery Procedure

If a remote migration or administrative operation causes database issues:

### Primary Path: D1 Time Travel Restore (Short Window)
1. **Freeze all administrative write operations** immediately.
2. Inspect `${BACKUP_DIR}/d1_time_travel_info.json` to extract the recorded bookmark or pre-migration timestamp.
3. Record an "undo" bookmark for the current state before executing recovery:
   ```bash
   npx wrangler d1 time-travel info DB --json > "${BACKUP_ROOT}/undo_bookmark_${BACKUP_TIMESTAMP}.json"
   ```
4. Obtain explicit human operator approval before restoring.
5. Execute Time Travel restore using the recorded bookmark or timestamp:
   ```bash
   # Example restore using bookmark
   npx wrangler d1 time-travel restore DB --bookmark="<RECORDED_BOOKMARK>"
   # OR using timestamp
   npx wrangler d1 time-travel restore DB --timestamp="<RECORDED_TIMESTAMP>"
   ```
6. Perform thorough application health checks (schema integrity, appointment lookups, login).
7. Retain the undo bookmark file until recovery is confirmed.

### Secondary Path: Off-Repo SQL Recovery Dump
- The local SQL export file is an **off-repo recovery artifact**.
- **Do NOT** directly pipe or execute a full `CREATE TABLE` SQL dump into an existing non-empty production database.
- Any SQL-based restoration must first be validated against a **fresh, isolated test/preview database** (`npx wrangler d1 create test-restore-db`) before applying to production.
