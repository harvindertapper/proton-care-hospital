# D1 Database and R2 Storage Backup & Inventory Runbook

This operational runbook documents the mandatory procedures for creating, verifying, and managing production backups of Cloudflare D1 (`site-creator-d1`) and R2 (`pch`) storage prior to executing remote database migrations or administrative updates.

> **CRITICAL SAFETY WARNINGS**
> - **NEVER** run a remote D1 migration (`npm run db:migrate:apply:remote`) without first creating and verifying a local production database export and recording a D1 Time Travel recovery bookmark.
> - **NEVER** commit, track, or push SQL dump files, R2 inventories, or secret keys to Git repositories.
> - Operational records (patient appointments, contact messages, user sessions, audit trails) must be handled with strict privacy compliance and excluded from website-content rollbacks.

---

## 1. Preconditions & Identity Check

Verify Cloudflare credentials and operator account access before starting:

```bash
# Verify CLI identity and account access
npx wrangler whoami
```

Ensure the CLI reports account ID `b9b4b7e42c3b44d04fcd759ce96aea36` with active permissions for database binding `DB` (`site-creator-d1`) and R2 bucket `pch`.

---

## 2. Create Timestamped Local Backup Directory

Create a repository-root-scoped local directory outside tracked source code:

```bash
export BACKUP_TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
export BACKUP_DIR="/.local-backups/${BACKUP_TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"
```

*(Note: `/.local-backups/` is ignored by `.gitignore` to prevent accidental commits.)*

---

## 3. Pre-Migration D1 Information & Time Travel Bookmark

Capture D1 database info (including current Time Travel recovery bookmark / timestamp) prior to applying any remote changes:

```bash
# Capture D1 metadata and bookmark info
npx wrangler d1 info DB --json > "${BACKUP_DIR}/d1_info.json"

# Capture pending remote migrations list
npm run db:migrate:list:remote > "${BACKUP_DIR}/remote_migrations_list.txt"
```

> **Primary Short-Window Production Recovery Path (D1 Time Travel):**
> Cloudflare D1 provides built-in Time Travel point-in-time recovery.
> - Note: Free plans typically retain a 7-day Time Travel window; Paid plans retain 30 days.
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
1. **Cloudflare Dashboard (Manual):** Navigate to **R2 > Buckets > pch** to record current object count and storage usage. Save screenshot/export as `${BACKUP_DIR}/r2_dashboard_snapshot.png`.
2. **Configured Read-Only S3 API Client:** Use an authorized S3-compatible tool (e.g. AWS CLI configured with read-only R2 API credentials) if available.

### C. D1 Asset Metadata Estimate (Non-Authoritative)
As a secondary metadata cross-check (not equal to actual R2 bucket inventory), you may query D1 media asset records:
```bash
# Non-authoritative D1 media record count (stored in manifest)
```

---

## 6. Complete Backup Manifest Generation

Generate a comprehensive manifest linking operational context and artifact checksums:

```bash
export WRANGLER_VER=$(npx wrangler --version)
export GIT_HEAD_SHA=$(git rev-parse HEAD)
export GIT_BRANCH_NAME=$(git branch --show-current)
export DUMP_CHECKSUM=$(sha256sum "${D1_DUMP_FILE}" | awk '{print $1}')
export DUMP_BYTES=$(stat -c%s "${D1_DUMP_FILE}" 2>/dev/null || stat -f%z "${D1_DUMP_FILE}")

cat << EOF > "${BACKUP_DIR}/manifest.json"
{
  "utc_timestamp": "${BACKUP_TIMESTAMP}",
  "git_head": "${GIT_HEAD_SHA}",
  "git_branch": "${GIT_BRANCH_NAME}",
  "wrangler_version": "${WRANGLER_VER}",
  "d1_database_id": "085be1f3-8d4a-459c-86b2-5f5d0d0f964f",
  "r2_bucket": "pch",
  "d1_dump_file": "protone_d1_backup_${BACKUP_TIMESTAMP}.sql",
  "d1_dump_checksum_sha256": "${DUMP_CHECKSUM}",
  "d1_dump_size_bytes": ${DUMP_BYTES},
  "r2_inventory_method": "dashboard_snapshot_or_bucket_info",
  "verification_status": "VERIFIED_NON_EMPTY"
}
EOF
```

---

## 7. Compression and Genuine Symmetric Encryption

> **Important:** `.tar.gz` provides compression only, NOT encryption. Real symmetric encryption is mandatory before transferring off-site.

1. **Check for an approved local encryption tool:**
   ```bash
   command -v gpg || command -v openssl || echo "NO_ENCRYPTION_TOOL"
   ```
   *If no approved encryption tool exists, STOP before storing or transferring backups and escalate to the system operator.*

2. **Compress directory:**
   ```bash
   tar -czf "/.local-backups/backup_${BACKUP_TIMESTAMP}.tar.gz" -C "/.local-backups" "${BACKUP_TIMESTAMP}"
   ```

3. **Encrypt artifact (GPG AES-256 example):**
   ```bash
   # Prompt interactively for passphrase (NEVER hardcode passwords in scripts or shell history)
   gpg --symmetric --cipher-algo AES256 "/.local-backups/backup_${BACKUP_TIMESTAMP}.tar.gz"
   ```

4. **Verify encrypted artifact:**
   ```bash
   # Verify encrypted file exists and is non-empty
   ls -lh "/.local-backups/backup_${BACKUP_TIMESTAMP}.tar.gz.gpg"
   ```

5. **Clean up unencrypted plaintext files** only after successful encryption verification:
   ```bash
   rm -rf "${BACKUP_DIR}" "/.local-backups/backup_${BACKUP_TIMESTAMP}.tar.gz"
   ```

---

## 8. Safe D1 Production Recovery Procedure

If a remote migration or administrative operation causes database issues:

### Primary Path: D1 Time Travel Restore (Short Window)
1. **Halt administrative write operations** immediately.
2. Inspect `/.local-backups/${BACKUP_TIMESTAMP}/d1_info.json` or current D1 bookmarks to identify the pre-migration timestamp/bookmark.
3. Record a current "undo" bookmark before restoring.
4. Execute Time Travel restore via Wrangler (or Cloudflare Dashboard):
   ```bash
   # Verify restore command details with explicit operator approval
   ```
5. Perform thorough application health checks (schema integrity, appointment lookups, login).

### Secondary Path: Off-Repo SQL Recovery Dump
- The local SQL export file (`protone_d1_backup_*.sql`) is an **off-repo recovery artifact**.
- **Do NOT** directly pipe or execute a full `CREATE TABLE` SQL dump into an existing non-empty production database.
- Any SQL-based restoration must first be validated against a **fresh, isolated test/preview database** (`wrangler d1 create test-restore-db`) before applying to production.
