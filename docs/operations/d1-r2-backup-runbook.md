# D1 Database and R2 Storage Backup & Inventory Runbook

This operational runbook documents the mandatory procedures for creating, verifying, and managing production backups of Cloudflare D1 (`site-creator-d1`) and R2 (`pch`) storage prior to executing remote database migrations or major administrative content revisions.

> **CRITICAL SAFETY WARNINGS**
> - **NEVER** run a remote D1 migration (`npm run db:migrate:apply:remote`) without first creating and verifying a local production database export.
> - **NEVER** commit, track, or push SQL dump files, R2 inventories, or secret keys to Git repositories.
> - Operational records (such as patient appointment requests, contact form submissions, and user session logs) must be handled with strict privacy compliance and excluded from public content rollbacks.

---

## 1. Preconditions & Identity Check

Before initiating a backup, verify that Cloudflare credentials and operator permissions are active:

```bash
# Check Cloudflare account identity
npx wrangler whoami
```

Verify that the CLI reports the correct account (`b9b4b7e42c3b44d04fcd759ce96aea36`) and database binding access for `site-creator-d1` and R2 bucket `pch`.

---

## 2. Create Timestamped Backup Directory

Create an untracked, local directory to hold the backup assets:

```bash
export BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
export BACKUP_DIR=".local-backups/${BACKUP_TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"
```

*(Note: `.local-backups/` is ignored by `.gitignore` to prevent accidental commits.)*

---

## 3. Remote D1 Database Export

Export the entire remote D1 database schema and data into a local SQL dump file:

```bash
npx wrangler d1 export DB --remote --output "${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql"
```

---

## 4. Verify Database Export File Integrity

Confirm the export was generated successfully and contains valid schema markers:

```bash
# 1. Verify file exists and is non-empty
ls -lh "${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql"

# 2. Check for required schema markers without printing sensitive patient or user data
grep -E "CREATE TABLE" "${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql"
```

Verify that key tables (`appointments`, `admin_users`, `doctor_profiles`, `feedback`) appear in the table creation list.

---

## 5. R2 Bucket Inventory & Usage Snapshot

Generate a read-only inventory of all objects stored in the `pch` R2 bucket:

```bash
npx wrangler r2 object list pch > "${BACKUP_DIR}/r2_inventory_${BACKUP_TIMESTAMP}.json"
```

If Wrangler CLI version limitations prevent object listing in certain environments, inspect the Cloudflare Dashboard under **R2 > Objects > Bucket pch** to record current object count and storage size.

---

## 6. Generate Backup Manifest

Create a audit manifest capturing the exact operational context:

```bash
cat << EOF > "${BACKUP_DIR}/manifest.json"
{
  "timestamp": "${BACKUP_TIMESTAMP}",
  "git_head": "$(git rev-parse HEAD)",
  "git_branch": "$(git branch --show-current)",
  "d1_database_id": "085be1f3-8d4a-459c-86b2-5f5d0d0f964f",
  "r2_bucket": "pch",
  "sql_dump_checksum": "$(sha256sum ${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql | awk '{print $1}')",
  "operator": "$(git config user.email || echo 'automated-operator')"
}
EOF
```

---

## 7. Storage and Encryption

Compress and encrypt the backup folder prior to long-term storage outside the code repository:

```bash
tar -czf "${BACKUP_DIR}.tar.gz" -C .local-backups "${BACKUP_TIMESTAMP}"
# Transfer ${BACKUP_DIR}.tar.gz to secure off-site backup storage
```

---

## 8. Migration Execution & Verification Checklist

Once the backup is verified, proceed with planned migration operations:

1. **Check pending remote migrations:**
   ```bash
   npm run db:migrate:list:remote
   ```
2. **Apply migrations with explicit human approval:**
   ```bash
   npm run db:migrate:apply:remote
   ```
3. **Verify applied migration status:**
   ```bash
   npm run db:migrate:list:remote
   ```

---

## 9. Restore & Emergency Recovery Procedure

If a migration or administrative mutation fails or causes data corruption:

1. **Stop all administrative writes** immediately.
2. **Review the manifest** to confirm target Git HEAD and SQL dump checksum.
3. **Execute SQL import to D1 (if required):**
   ```bash
   npx wrangler d1 execute DB --remote --file="${BACKUP_DIR}/protone_d1_backup_${BACKUP_TIMESTAMP}.sql"
   ```
4. **Verify application health and database consistency.**
