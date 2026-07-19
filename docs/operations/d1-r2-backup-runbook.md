# D1 Database and R2 Storage Backup & Inventory Runbook

This operational runbook documents the mandatory procedures for creating, verifying, and managing production backups of Cloudflare D1 (`site-creator-d1`) and R2 (`pch`) storage prior to executing remote database migrations or administrative updates.

> **CRITICAL SAFETY WARNINGS**
> - **NEVER** run a remote D1 migration (`npm run db:migrate:apply:remote`) without first creating, encrypting, and verifying an off-repository backup archive and recording a D1 Time Travel recovery bookmark.
> - **NEVER** commit, track, or push SQL dump files, R2 inventories, or secret keys to Git repositories.
> - Operational records (patient appointments, contact messages, user sessions, audit trails) must be handled with strict privacy compliance and excluded from website-content rollbacks.

---

## 1. Path Scoping & Off-Repository Preconditions

> **Path & Execution Rules:**
> 1. Commands in this runbook MUST be executed from the **repository root directory**.
> 2. `.gitignore`'s `/.local-backups/` pattern scopes local temporary working files to the repository root directory (`${PWD}/.local-backups`).
> 3. The operator MUST provide an explicit absolute `OFFSITE_BACKUP_DIR` outside the repository tree (e.g., `/var/backups/pch` or `C:/secure_backups/pch`). Off-repository backups MUST NOT reside inside `${PWD}`, MUST NOT be Git-tracked, and MUST NOT be placed inside the public R2 `pch` bucket.

```bash
# 1. Verify execution from repository root
test -f package.json || { echo "Error: Must run from repository root"; exit 1; }

# 2. Verify Operator Identity (Fail closed if absent)
export OPERATOR_ID="${OPERATOR_ID:-$(git config user.email)}"
test -n "${OPERATOR_ID}" || { echo "Error: OPERATOR_ID or git config user.email must be set"; exit 1; }

# 3. Verify Off-Repository Destination (Must be absolute & outside repository)
test -n "${OFFSITE_BACKUP_DIR}" || { echo "Error: OFFSITE_BACKUP_DIR environment variable must be set to an absolute path"; exit 1; }
case "${OFFSITE_BACKUP_DIR}" in
  "${PWD}"*) echo "Error: OFFSITE_BACKUP_DIR must be outside the repository directory"; exit 1 ;;
  /*|[a-zA-Z]:*) mkdir -p "${OFFSITE_BACKUP_DIR}" ;;
  *) echo "Error: OFFSITE_BACKUP_DIR must be an absolute path"; exit 1 ;;
esac

# 4. Set Repository-Local Working Directories
export BACKUP_TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
export BACKUP_ROOT="${PWD}/.local-backups"
export BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"
```

---

## 2. Preconditions & Cloudflare Identity Check

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
# 1. Capture database metadata
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
test -s "${D1_DUMP_FILE}" || { echo "Error: D1 SQL export is missing or empty"; exit 1; }

# 2. Check schema table count markers
grep -c "CREATE TABLE" "${D1_DUMP_FILE}"
```

---

## 5. R2 Bucket Metadata & Inventory Input Options

> **Wrangler 4.92.0 CLI Limitation Note:**
> The installed Wrangler CLI version (`4.92.0`) exposes object operations (`get`, `put`, `delete`) but **does not support an object-listing command** (`wrangler r2 object list`).

### A. Supported Bucket Metadata Capture
Capture verified bucket metadata via Wrangler:

```bash
npx wrangler r2 bucket info pch --json > "${BACKUP_DIR}/r2_bucket_info.json"
```

### B. Authoritative Object Inventory Inputs (Optional / Operator-Supplied)
If an authoritative object inventory is available from the Cloudflare Dashboard or S3 API, set the optional variables before manifest generation:

```bash
# Optional operator-supplied inventory variables (leave unset if unavailable)
export R2_INVENTORY_METHOD="${R2_INVENTORY_METHOD:-dashboard_manual}"
export R2_INVENTORY_TIMESTAMP="${R2_INVENTORY_TIMESTAMP:-$BACKUP_TIMESTAMP}"
# export R2_OBJECT_COUNT=150
# export R2_OBJECT_BYTES=10485760
# export R2_INVENTORY_FILE="${BACKUP_DIR}/r2_dashboard_snapshot.png"
```

### C. D1 Asset Metadata Estimate (Non-Authoritative)
As a secondary metadata estimate (not equal to actual R2 bucket storage), you may query published D1 media records:

```bash
# Optional D1 estimate query (do NOT execute during automated migration checklist unless requested)
npx wrangler d1 execute DB --remote --command="SELECT COUNT(*) AS total_assets, COALESCE(SUM(size_bytes),0) AS total_bytes FROM media_assets WHERE is_visible = 1;" --json > "${BACKUP_DIR}/d1_media_assets_estimate.json"
```

---

## 6. Fail-Closed Backup Manifest Generator

Generate a strict, verified JSON manifest using Node.js. If any required artifact is missing or empty, manifest generation **aborts with exit code 1**:

```bash
node -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const backupDir = process.env.BACKUP_DIR;
const timestamp = process.env.BACKUP_TIMESTAMP;
const operatorId = process.env.OPERATOR_ID;

if (!backupDir || !timestamp || !operatorId) {
  console.error("❌ Abort: Missing required environment variables (BACKUP_DIR, BACKUP_TIMESTAMP, OPERATOR_ID).");
  process.exit(1);
}

const requiredFiles = [
  `protone_d1_backup_${timestamp}.sql`,
  "d1_info.json",
  "d1_time_travel_info.json",
  "remote_migrations_list.txt",
  "r2_bucket_info.json"
];

function inspectArtifact(filename, isRequired = true) {
  const fullPath = path.join(backupDir, filename);
  if (!fs.existsSync(fullPath)) {
    if (isRequired) console.error(`❌ Required artifact missing: ${filename}`);
    return { filename, size_bytes: 0, sha256: null, status: isRequired ? "missing" : "not_captured" };
  }
  const stat = fs.statSync(fullPath);
  if (stat.size === 0) {
    if (isRequired) console.error(`❌ Required artifact is zero bytes: ${filename}`);
    return { filename, size_bytes: 0, sha256: null, status: isRequired ? "empty" : "empty" };
  }
  const content = fs.readFileSync(fullPath);
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  return { filename, size_bytes: stat.size, sha256, status: "verified" };
}

// 1. Inspect required artifacts
const artifactMap = {};
let failedRequired = false;

for (const reqFile of requiredFiles) {
  const meta = inspectArtifact(reqFile, true);
  artifactMap[reqFile.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_")] = meta;
  if (meta.status !== "verified") {
    failedRequired = true;
  }
}

if (failedRequired) {
  console.error("❌ Manifest generation aborted: One or more required artifacts failed validation.");
  process.exit(1);
}

// 2. Inspect optional artifacts
const inventoryFileName = process.env.R2_INVENTORY_FILE ? path.basename(process.env.R2_INVENTORY_FILE) : null;
const optionalInventoryMeta = inventoryFileName ? inspectArtifact(inventoryFileName, false) : { filename: null, size_bytes: 0, sha256: null, status: "not_captured" };
const d1EstimateMeta = inspectArtifact("d1_media_assets_estimate.json", false);

// 3. Parse optional inventory metrics safely
function parseNonNegativeInt(val) {
  if (val === undefined || val === null || val === "") return null;
  const num = parseInt(val, 10);
  return (!isNaN(num) && num >= 0) ? num : null;
}

const objectCount = parseNonNegativeInt(process.env.R2_OBJECT_COUNT);
const objectBytes = parseNonNegativeInt(process.env.R2_OBJECT_BYTES);

const manifest = {
  utc_timestamp: timestamp,
  operator_identity: operatorId,
  git_head: process.env.GIT_HEAD_SHA || null,
  git_branch: process.env.GIT_BRANCH_NAME || null,
  wrangler_version: process.env.WRANGLER_VER || null,
  d1_database_name: "site-creator-d1",
  d1_database_id: "085be1f3-8d4a-459c-86b2-5f5d0d0f964f",
  r2_bucket: "pch",
  r2_inventory: {
    method: process.env.R2_INVENTORY_METHOD || "bucket_info_only",
    timestamp: process.env.R2_INVENTORY_TIMESTAMP || timestamp,
    object_count: objectCount,
    object_bytes: objectBytes,
    metrics_status: (objectCount !== null && objectBytes !== null) ? "verified" : "unavailable",
    artifact: optionalInventoryMeta
  },
  d1_media_estimate: {
    authoritative: false,
    artifact: d1EstimateMeta
  },
  required_artifacts: artifactMap,
  verification_status: "VERIFIED_SUCCESS"
};

fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("✅ Backup manifest successfully validated and generated.");
' || { echo "Error: Manifest generator failed"; exit 1; }

# Checksum the final manifest
sha256sum "${BACKUP_DIR}/manifest.json" > "${BACKUP_DIR}/manifest.json.sha256"
```

---

## 7. Compression, GPG AES-256 Encryption & Off-Repository Transfer

> **Important:** `.tar.gz` provides compression only, NOT encryption. Real symmetric encryption uses GPG AES-256. Plaintext files MUST NOT remain locally after backup completion.

1. **Verify GPG Tool Presence:**
   ```bash
   command -v gpg >/dev/null 2>&1 || { echo "Error: GPG utility is missing. Halt backup."; exit 1; }
   ```

2. **Compress Working Backup Directory:**
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

4. **Verify Local Encrypted Stream Integrity:**
   ```bash
   set -o pipefail
   gpg --decrypt "${ENCRYPTED_FILE}" | tar -tzf - >/dev/null || { echo "Error: Local encrypted archive verification failed"; exit 1; }
   ```

5. **Checksum Encrypted File:**
   ```bash
   export ENCRYPTED_FILENAME=$(basename "${ENCRYPTED_FILE}")
   (cd "${BACKUP_ROOT}" && sha256sum "${ENCRYPTED_FILENAME}" > "${ENCRYPTED_FILENAME}.sha256")
   ```

6. **Transfer Encrypted Archive & Checksum to Off-Repository Destination:**
   ```bash
   cp "${ENCRYPTED_FILE}" "${OFFSITE_BACKUP_DIR}/"
   cp "${BACKUP_ROOT}/${ENCRYPTED_FILENAME}.sha256" "${OFFSITE_BACKUP_DIR}/"

   # Verify off-repository copy against copied checksum
   (cd "${OFFSITE_BACKUP_DIR}" && sha256sum -c "${ENCRYPTED_FILENAME}.sha256") || {
     echo "Error: Off-repository backup checksum verification failed!"; exit 1;
   }
   ```

7. **Clean Up Local Repository Working Files:**
   ```bash
   # Remove unencrypted local directory, local archive, and local copy ONLY after off-repo verification succeeds
   rm -rf "${BACKUP_DIR}" "${ARCHIVE_FILE}" "${ENCRYPTED_FILE}" "${BACKUP_ROOT}/${ENCRYPTED_FILENAME}.sha256"
   echo "✅ Off-repository backup archive verified and stored at: ${OFFSITE_BACKUP_DIR}/${ENCRYPTED_FILENAME}"
   ```

---

## 8. Safe D1 Production Recovery Procedure

If a remote migration or administrative operation causes database issues, recovery begins from the verified **off-repository encrypted backup archive**.

### A. Secure Temporary Extraction & Verification
1. **Halt all administrative write operations** immediately.
2. Create a restricted temporary recovery directory:
   ```bash
   export RECOVERY_TMP=$(umask 077 && mktemp -d /tmp/pch_recovery_XXXXXX 2>/dev/null || mktemp -d -t pch_recovery_XXXXXX)
   ```
3. Verify the off-repository encrypted archive checksum:
   ```bash
   (cd "${OFFSITE_BACKUP_DIR}" && sha256sum -c "${ENCRYPTED_FILENAME}.sha256") || {
     echo "Error: Off-repository backup checksum invalid!"; exit 1;
   }
   ```
4. Decrypt and extract the off-repository backup into the restricted recovery directory:
   ```bash
   gpg --decrypt "${OFFSITE_BACKUP_DIR}/${ENCRYPTED_FILENAME}" | tar -xzf - -C "${RECOVERY_TMP}"
   ```
5. Locate the restored evidence directory `${RECOVERY_TMP}/${BACKUP_TIMESTAMP}` and inspect `d1_time_travel_info.json` to extract the recorded recovery bookmark or timestamp. *(Do NOT print SQL dump or patient records).*

### B. Capture Undo Bookmark & Execute Time Travel Restore
1. Record a pre-restore "undo" bookmark in the recovery directory before restoring:
   ```bash
   npx wrangler d1 time-travel info DB --json > "${RECOVERY_TMP}/undo_bookmark_${BACKUP_TIMESTAMP}.json"
   ```
2. Obtain explicit human operator approval.
3. Execute Time Travel restore using the recorded bookmark or timestamp:
   ```bash
   # Restore using bookmark:
   npx wrangler d1 time-travel restore DB --bookmark="<RECORDED_BOOKMARK>"
   # OR restore using timestamp:
   npx wrangler d1 time-travel restore DB --timestamp="<RECORDED_TIMESTAMP>"
   ```
4. Perform thorough application health checks (schema integrity, appointment lookups, login).

### C. Post-Recovery Cleanup & Off-Repository Archive Retention
1. Securely remove the temporary local recovery directory:
   ```bash
   rm -rf "${RECOVERY_TMP}"
   ```
2. **Retain the off-repository encrypted backup archive** (`${OFFSITE_BACKUP_DIR}/${ENCRYPTED_FILENAME}`) in accordance with operational data retention policies.

### Secondary Recovery Path: Off-Repo SQL Backup Dump
- The SQL dump file inside the off-repository archive is an **off-repo recovery artifact**.
- **Do NOT** directly pipe or execute a full `CREATE TABLE` SQL dump into an existing non-empty production database.
- Any SQL-based restoration must first be validated against a **fresh, isolated test/preview database** (`npx wrangler d1 create test-restore-db`) before applying to production.
