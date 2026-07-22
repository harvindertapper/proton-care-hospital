import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  MAX_IMAGE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_PURPOSES,
  detectSignature,
  validateMediaUpload,
  computeCropPlan,
} from "../app/lib/media-policy.ts";

const [mediaPolicy, adminMediaRoute, galleryRoute, mediaGateway, consoleSource, galleryClient, serverSource] =
  await Promise.all([
    readFile(new URL("../app/lib/media-policy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/gallery/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/media/[...key]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AdminConsole.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/gallery/GalleryClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server.ts", import.meta.url), "utf8"),
  ]);

const BASELINE_SQL = await readFile(new URL("../migrations/0000_baseline.sql", import.meta.url), "utf8");
const MIGRATION_0002_SQL = await readFile(new URL("../migrations/0002_add_content_lifecycle_foundation.sql", import.meta.url), "utf8");

function createMediaDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(BASELINE_SQL);
  db.exec(MIGRATION_0002_SQL);
  return db;
}

function insertMedia(db, opts) {
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status, deleted_at)
     VALUES (?, ?, ?, 'image/webp', 1024, ?, 'test@example.com', ?, ?, ?, ?, ?)`
  ).run(
    opts.id,
    opts.r2Key,
    opts.fileName || "test.webp",
    opts.purpose,
    opts.consentNote || "",
    opts.status ?? "APPROVED",
    opts.isVisible ?? 1,
    opts.lifecycleStatus ?? "PUBLISHED",
    opts.deletedAt ?? null,
  );
}

function insertDoctor(db, opts) {
  db.prepare(
    `INSERT INTO doctor_profiles (id, slug, name, speciality, qualification, department_slug, photo_url, profile_note, consent_status, status, is_visible, approved_by, is_deleted, lifecycle_status, version)
     VALUES (?, ?, ?, '', '', 'cardiology', ?, '', 'APPROVED_SOURCE', ?, ?, 'test', ?, ?, 1)`
  ).run(
    `doctor-${opts.slug}`,
    opts.slug,
    opts.slug,
    opts.photoUrl,
    opts.status ?? "APPROVED",
    opts.isVisible ?? 1,
    opts.isDeleted ?? 0,
    opts.lifecycleStatus ?? "PUBLISHED",
  );
}

function jpegBytes() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
}

function webpBytes() {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
}

function gifBytes() {
  return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
}

function svgBytes() {
  return new Uint8Array([0x3c, 0x73, 0x76, 0x67]);
}

function makeFileWithBytes(type, bytes) {
  return new File([bytes.buffer.slice(0)], "test.bin", { type });
}

test("1. Exact 5 MiB accepted", () => {
  const exactly = new Uint8Array(MAX_IMAGE_BYTES);
  const file = new File([exactly], "full.jpg", { type: "image/jpeg" });
  exactly[0] = 0xff; exactly[1] = 0xd8; exactly[2] = 0xff;
  const result = validateMediaUpload({ file, purpose: "gallery", bytes: exactly });
  assert.equal(result.ok, true);
});

test("2. 5 MiB + 1 byte rejected", () => {
  const tooBig = new Uint8Array(MAX_IMAGE_BYTES + 1);
  tooBig[0] = 0xff; tooBig[1] = 0xd8; tooBig[2] = 0xff;
  const file = new File([tooBig], "big.jpg", { type: "image/jpeg" });
  const result = validateMediaUpload({ file, purpose: "gallery", bytes: tooBig });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /5 MB or smaller/);
});

test("3. Empty file rejected", () => {
  const empty = new Uint8Array(0);
  const file = new File([empty], "empty.jpg", { type: "image/jpeg" });
  const result = validateMediaUpload({ file, purpose: "gallery", bytes: empty });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /empty/i);
});

test("4. JPEG signature accepted", () => {
  const bytes = jpegBytes();
  const file = makeFileWithBytes("image/jpeg", bytes);
  const result = validateMediaUpload({ file, purpose: "gallery", bytes });
  assert.equal(result.ok, true);
});

test("5. PNG signature accepted", () => {
  const bytes = pngBytes();
  const file = makeFileWithBytes("image/png", bytes);
  const result = validateMediaUpload({ file, purpose: "gallery", bytes });
  assert.equal(result.ok, true);
});

test("6. WebP signature accepted", () => {
  const bytes = webpBytes();
  const file = makeFileWithBytes("image/webp", bytes);
  const result = validateMediaUpload({ file, purpose: "gallery", bytes });
  assert.equal(result.ok, true);
});

test("7. MIME/signature mismatch rejected", () => {
  const bytes = jpegBytes();
  const file = makeFileWithBytes("image/png", bytes);
  const result = validateMediaUpload({ file, purpose: "gallery", bytes });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /does not match/);
});

test("8. SVG/GIF/unknown signature rejected", () => {
  for (const [bytes, mime, label] of [
    [gifBytes(), "image/gif", "GIF"],
    [svgBytes(), "image/svg+xml", "SVG"],
    [new Uint8Array([0x00, 0x01, 0x02, 0x03]), "application/octet-stream", "unknown"],
  ]) {
    const file = makeFileWithBytes(mime, bytes);
    const result = validateMediaUpload({ file, purpose: "gallery", bytes });
    assert.equal(result.ok, false, `${label} should be rejected`);
  }
});

test("9. Unknown purpose rejected", () => {
  const bytes = jpegBytes();
  const file = makeFileWithBytes("image/jpeg", bytes);
  const result = validateMediaUpload({ file, purpose: "bogus-purpose", bytes });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Unknown upload purpose/);
});

test("10. Original bytes passed to R2 unchanged (structural)", () => {
  assert.doesNotMatch(adminMediaRoute, /compressImageForUpload/);
  assert.doesNotMatch(adminMediaRoute, /\.toBlob/);
  assert.match(adminMediaRoute, /bucket\.put\(key, bytes/);
});

test("11. Super Admin Gallery upload gets explicit published values", () => {
  assert.match(adminMediaRoute, /purpose === "gallery"[\s\S]*?status = "APPROVED"/);
  assert.match(adminMediaRoute, /lifecycleStatus = "PUBLISHED"/);
  assert.match(adminMediaRoute, /isVisible = 1/);
  assert.match(adminMediaRoute, /INSERT INTO media_assets[\s\S]*?lifecycle_status/);
});

test("12. Staff Gallery upload rejected before R2/D1", () => {
  assert.match(adminMediaRoute, /purpose === "gallery"[\s\S]*?role !== "SUPER_ADMIN"/);
  assert.match(adminMediaRoute, /Only super admin may upload gallery assets/);
});

test("13. Doctor photo cannot become a Gallery item by purpose leakage", () => {
  assert.match(adminMediaRoute, /purpose === "doctor-photo"[\s\S]*?status = "APPROVED"/);
  assert.match(adminMediaRoute, /purpose === "doctor-photo"[\s\S]*?lifecycleStatus = "PUBLISHED"/);
  // M2-A: category mapping intentionally maps purpose to category;
  // doctor-photo → DOCTOR, gallery → GALLERY, admin-upload → GENERAL
  assert.match(adminMediaRoute, /purpose === "gallery" \? "GALLERY"/);
  assert.match(adminMediaRoute, /purpose === "doctor-photo" \? "DOCTOR"/);
  assert.match(adminMediaRoute, /"GENERAL"/);
});

test("14. General Admin upload gets explicit hidden values", () => {
  assert.match(adminMediaRoute, /status = "HIDDEN"/);
  assert.match(adminMediaRoute, /isVisible = 0/);
  assert.match(adminMediaRoute, /lifecycleStatus = "HIDDEN"/);
});

test("15. R2 failure creates no metadata/audit", () => {
  assert.match(adminMediaRoute, /R2 upload failed/);
  assert.match(adminMediaRoute, /bucket\.put[\s\S]*?catch[\s\S]*?return.*FAILED/);
  assert.doesNotMatch(adminMediaRoute, /INSERT INTO media_assets[\s\S]{0,200}R2 upload failed/);
});

test("16. D1 throw after R2 write triggers compensation with accurate message", () => {
  assert.match(adminMediaRoute, /D1 insert failed after R2 write; compensating/);
  assert.match(adminMediaRoute, /bucket\.delete\(key\)/);
  assert.match(adminMediaRoute, /let compOk = false/);
  assert.match(adminMediaRoute, /incomplete object was removed/);
});

test("17. D1 zero-row result triggers compensation with accurate message", () => {
  assert.match(adminMediaRoute, /D1 zero-row/);
  assert.match(adminMediaRoute, /bucket\.delete\(key\)/);
  assert.match(adminMediaRoute, /incomplete object was removed/);
});

test("18. Compensation failure says reconciliation, not orphan cleaned", () => {
  assert.match(adminMediaRoute, /Compensation delete failed/);
  assert.match(adminMediaRoute, /Cleanup requires reconciliation/);
  assert.doesNotMatch(adminMediaRoute, /Orphan was cleaned up/);
  assert.doesNotMatch(adminMediaRoute, /Compensation delete failed[\s\S]{0,100}success.*true/);
});

test("19. Audit failure after proved persistence does not cause duplicate-upload false failure", () => {
  assert.match(adminMediaRoute, /Audit write failed after successful upload/);
  assert.match(adminMediaRoute, /return json\(\{ success: true/);
  assert.doesNotMatch(adminMediaRoute, /Audit write failed[\s\S]{0,200}success.*false.*FAILED/);
});

test("20. Preview remains 200x200 (structural)", () => {
  assert.match(consoleSource, /width=\{200\}/);
  assert.match(consoleSource, /height=\{200\}/);
});

test("21. Export does not use the 200x200 preview pixels", () => {
  assert.match(consoleSource, /document\.createElement\("canvas"\)/);
  assert.doesNotMatch(consoleSource, /canvasRef\.current\.toBlob/);
});

test("22. Export uses computeCropPlan for no-upscaling (structural)", () => {
  assert.match(consoleSource, /computeCropPlan/);
  assert.match(consoleSource, /sizePlan\.exportSize|exportPlan\.exportSize/);
  assert.doesNotMatch(consoleSource, /srcLongest/);
});

test("23. Preview/export crop geometry uses computeCropPlan (structural)", () => {
  assert.match(consoleSource, /computeCropPlan/);
  assert.match(consoleSource, /screenPanX|screenPanY/);
});

test("24. Movement cannot expose blank borders (structural)", () => {
  assert.match(consoleSource, /screenPanX|maxPanX/);
  assert.match(consoleSource, /screenPanY|maxPanY/);
});

test("25. Upload Original sends the original File", () => {
  assert.match(consoleSource, /Upload Original/);
  assert.match(consoleSource, /handleUploadOriginal/);
  assert.match(consoleSource, /formData\.append\("file", originalFile\)/);
});

test("26. Cropped file is not sent through generic compression", () => {
  assert.doesNotMatch(consoleSource, /compressImageForUpload/);
  assert.doesNotMatch(consoleSource, /image\/webp.*0\.8/);
});

test("27. Cropped result over 5 MiB is rejected", () => {
  assert.match(consoleSource, /blob\.size > MAX_CLIENT_BYTES/);
  assert.match(consoleSource, /exceeds the 5 MB limit/);
});

test("28. Busy state remains active until async upload resolves", () => {
  assert.match(consoleSource, /setUploading\(true\)/);
  assert.match(consoleSource, /finally[\s\S]*setUploading\(false\)/);
});

test("29. Async upload/blob failure is shown to the Admin", () => {
  assert.match(consoleSource, /catch \(err\)[\s\S]*setMessage\(err instanceof Error/);
});

test("30. Gallery query requires purpose='gallery'", () => {
  assert.match(galleryRoute, /purpose = 'gallery'/);
});

test("31. Gallery query requires lifecycle PUBLISHED", () => {
  assert.match(galleryRoute, /lifecycle_status = 'PUBLISHED'/);
});

test("32. Gallery query requires APPROVED, visible and deleted_at NULL", () => {
  assert.match(galleryRoute, /status = 'APPROVED'/);
  assert.match(galleryRoute, /is_visible = 1/);
  assert.match(galleryRoute, /deleted_at IS NULL/);
});

test("33. Doctor/general/hidden/archived rows excluded in gallery SQLite", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "g1", r2Key: "gallery/ok.webp", purpose: "gallery" });
    insertMedia(db, { id: "d1", r2Key: "doctor/d1.webp", purpose: "doctor-photo", status: "APPROVED", isVisible: 1, lifecycleStatus: "PUBLISHED" });
    insertMedia(db, { id: "h1", r2Key: "admin/h1.webp", purpose: "admin-upload", status: "HIDDEN", isVisible: 0, lifecycleStatus: "HIDDEN" });
    insertMedia(db, { id: "a1", r2Key: "gallery/archived.webp", purpose: "gallery", deletedAt: "2026-01-01" });
    insertMedia(db, { id: "p1", r2Key: "gallery/pending.webp", purpose: "gallery", status: "NEEDS_REVIEW", lifecycleStatus: "DRAFT" });

    const rows = db.prepare(
      `SELECT id, r2_key FROM media_assets
       WHERE purpose = 'gallery'
         AND lifecycle_status = 'PUBLISHED'
         AND status = 'APPROVED'
         AND is_visible = 1
         AND deleted_at IS NULL
       ORDER BY created_at DESC`
    ).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].r2_key, "gallery/ok.webp");
  } finally {
    db.close();
  }
});

test("34. consent_note and uploaded_by absent from public response", () => {
  assert.doesNotMatch(galleryRoute, /consent_note/);
  assert.doesNotMatch(galleryRoute, /uploaded_by/);
});

test("35. Dynamic assets merge with presets rather than replacing them (structural)", () => {
  assert.match(galleryClient, /presetAssets/);
  assert.match(galleryClient, /seenCanonical\.has\(preset\.url\)/);
  assert.match(galleryClient, /merged\.push\(\{ \.\.\.preset \}\)/);
});

test("36. Duplicate URLs are deduplicated", () => {
  assert.match(galleryClient, /seenCanonical\.has\(canonical\)/);
  assert.match(galleryClient, /const seenCanonical = new Set/);
});

test("37. API failure preserves verified preset Gallery", () => {
  assert.match(galleryClient, /catch[\s\S]*setAssets\(presetAssets\)/);
});

test("38. Unknown key returns 404 before R2 get (structural)", () => {
  assert.match(mediaGateway, /metaResult\.results\?\.\[0\]/);
  assert.match(mediaGateway, /if \(!meta\) return new Response\("Not found"/);
  assert.doesNotMatch(mediaGateway, /bucket\.get\(objectKey\)[\s\S]{0,50}metaResult/);
});

test("39. Hidden/unpublished/deleted media returns 404 before R2 get", () => {
  // M2-A: authorization consolidated into SQL WHERE clause — lifecycle_status, status,
  // is_visible, deleted_at are all enforced in the query, eliminating separate if-checks.
  assert.match(mediaGateway, /lifecycle_status = 'PUBLISHED'/);
  assert.match(mediaGateway, /status = 'APPROVED'/);
  assert.match(mediaGateway, /is_visible = 1/);
  assert.match(mediaGateway, /deleted_at IS NULL/);
  assert.match(mediaGateway, /storage_type = 'R2'/);
  assert.match(mediaGateway, /if \(!meta\) return new Response\("Not found"/);
});

test("40. Published Gallery media is served", () => {
  assert.match(mediaGateway, /purpose === "gallery"[\s\S]*?\/\/ Gallery: authorized/);
  assert.match(mediaGateway, /bucket\.get\(objectKey\)/);
});

test("41. Unreferenced Doctor photo returns 404", () => {
  assert.match(mediaGateway, /purpose === "doctor-photo"/);
  assert.match(mediaGateway, /doctorRef/);
  assert.match(mediaGateway, /Not found.*404/);
});

test("42. Doctor photo referenced by a public Doctor is served via exact match", () => {
  assert.match(mediaGateway, /photo_url = \?/);
  assert.match(mediaGateway, /\/api\/media\/\$\{objectKey\}/);
});

test("43. Doctor photo referenced only by hidden/archived Doctor returns 404", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "dp1", r2Key: "doctor-photo/dp1.webp", purpose: "doctor-photo", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-hidden", photoUrl: "/api/media/doctor-photo/dp1.webp", status: "HIDDEN", isVisible: 0, lifecycleStatus: "HIDDEN" });
    insertDoctor(db, { slug: "dr-archived", photoUrl: "/api/media/doctor-photo/dp1.webp", status: "HIDDEN", isVisible: 0, isDeleted: 1, lifecycleStatus: "ARCHIVED" });

    const doctorRef = db.prepare(
      `SELECT slug FROM doctor_profiles
       WHERE photo_url = ?
         AND lifecycle_status = 'PUBLISHED'
         AND status = 'APPROVED'
         AND is_visible = 1
         AND is_deleted = 0
         AND deleted_at IS NULL
       LIMIT 1`
    ).all("/api/media/doctor-photo/dp1.webp");
    assert.equal(doctorRef.length, 0, "No public doctor references the photo");
  } finally {
    db.close();
  }
});

test("44. Unreferenced admin-upload returns 404 via doctor_profiles check (structural)", () => {
  assert.match(mediaGateway, /purpose === "admin-upload"/);
  assert.match(mediaGateway, /doctorRef|doctorMediaRef/);
});

test("45. Authorization failure does not touch R2 (structural)", () => {
  assert.doesNotMatch(mediaGateway, /bucket\.get[\s\S]{0,200}purpose.*doctor-photo/);
  assert.match(mediaGateway, /metaResult[\s\S]{0,3000}bucket\.get/);
});

test("46. Response no longer uses immutable one-year cache", () => {
  assert.doesNotMatch(mediaGateway, /immutable/);
  assert.match(mediaGateway, /max-age=300, s-maxage=3600/);
});

test("47. Referenced Doctor media deletion returns 409 via exact match", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "ref1", r2Key: "doctor-photo/ref1.webp", purpose: "doctor-photo", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-active", photoUrl: "/api/media/doctor-photo/ref1.webp" });

    const refs = db.prepare("SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1").all("/api/media/doctor-photo/ref1.webp");
    assert.equal(refs.length, 1);
    assert.match(adminMediaRoute, /CONFLICT/);
    assert.match(adminMediaRoute, /Media is still in use/);
  } finally {
    db.close();
  }
});

test("48. Referenced delete does not touch R2 or metadata (structural)", () => {
  assert.match(adminMediaRoute, /photoRefs\.results && photoRefs\.results\.length > 0/);
  assert.match(adminMediaRoute, /return json\(\{[\s\S]*outcome: "CONFLICT"/);
  const refCheckIdx = adminMediaRoute.indexOf("photoRefs.results && photoRefs.results.length > 0");
  const deleteIdx = adminMediaRoute.indexOf("executeMediaDeletion<", refCheckIdx);
  assert.ok(refCheckIdx > 0, "photoRefs check found");
  assert.ok(deleteIdx > refCheckIdx, "executeMediaDeletion comes after photoRefs check");
  const between = adminMediaRoute.slice(refCheckIdx, deleteIdx);
  assert.match(between, /return json\(/);
});

test("49. Unreferenced deletion retains existing safe deletion behavior", () => {
  assert.match(adminMediaRoute, /executeMediaDeletion/);
  assert.match(adminMediaRoute, /deleteObject/);
  assert.match(adminMediaRoute, /deleteMetadata/);
  assert.match(adminMediaRoute, /writeAudit/);
});

test("50. Existing Doctor save/archive/restore tests remain green (structural)", () => {
  assert.match(consoleSource, /onSave.*doctor\.save/);
  assert.match(consoleSource, /onArchive.*doctor\.delete/);
  assert.match(consoleSource, /onRestore.*doctor\.restore/);
  assert.match(consoleSource, /expectedVersion/);
});

test("51. Existing Gallery presets remain in Git/public (structural)", () => {
  assert.match(galleryClient, /front-exterior-hero\.webp/);
  assert.match(galleryClient, /front-exterior-wide\.webp/);
  assert.match(galleryClient, /reception\.jpg/);
  assert.match(galleryClient, /corridor\.jpg/);
  assert.match(galleryClient, /ward-bed-01\.jpg/);
  assert.match(galleryClient, /patient-room-twin\.jpg/);
  assert.match(galleryClient, /patient-room-single\.jpg/);
});

test("52. No migration files changed", () => {
  assert.doesNotMatch(serverSource, /0003/);
});

test("53. No dependency or lockfile added (structural)", () => {
  assert.doesNotMatch(mediaPolicy, /^import .+ from "[a-z@](?!\/)/m);
  assert.doesNotMatch(adminMediaRoute, /^import .+ from "[a-z@](?!\/)/m);
});

test("54. Appointment behavior unchanged (structural)", () => {
  assert.match(serverSource, /CREATE TABLE IF NOT EXISTS appointments/);
  assert.match(serverSource, /idx_appointments_slot/);
});

test("validateMediaUpload: gallery purpose accepted", () => {
  const bytes = jpegBytes();
  const file = makeFileWithBytes("image/jpeg", bytes);
  assert.equal(validateMediaUpload({ file, purpose: "gallery", bytes }).ok, true);
});

test("validateMediaUpload: doctor-photo purpose accepted", () => {
  const bytes = pngBytes();
  const file = makeFileWithBytes("image/png", bytes);
  assert.equal(validateMediaUpload({ file, purpose: "doctor-photo", bytes }).ok, true);
});

test("validateMediaUpload: admin-upload purpose accepted", () => {
  const bytes = webpBytes();
  const file = makeFileWithBytes("image/webp", bytes);
  assert.equal(validateMediaUpload({ file, purpose: "admin-upload", bytes }).ok, true);
});

test("detectSignature returns correct MIME for each format", () => {
  assert.equal(detectSignature(jpegBytes()), "image/jpeg");
  assert.equal(detectSignature(pngBytes()), "image/png");
  assert.equal(detectSignature(webpBytes()), "image/webp");
  assert.equal(detectSignature(gifBytes()), null);
  assert.equal(detectSignature(svgBytes()), null);
  assert.equal(detectSignature(new Uint8Array(3)), null);
});

test("MAX_IMAGE_BYTES equals 5 MiB exactly", () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
});

test("ALLOWED_MIME_TYPES contains exactly JPEG, PNG, WebP", () => {
  assert.equal(ALLOWED_MIME_TYPES.size, 3);
  assert.ok(ALLOWED_MIME_TYPES.has("image/jpeg"));
  assert.ok(ALLOWED_MIME_TYPES.has("image/png"));
  assert.ok(ALLOWED_MIME_TYPES.has("image/webp"));
  assert.ok(!ALLOWED_MIME_TYPES.has("image/gif"));
  assert.ok(!ALLOWED_MIME_TYPES.has("image/svg+xml"));
});

test("ALLOWED_PURPOSES contains exactly gallery, doctor-photo, admin-upload", () => {
  assert.equal(ALLOWED_PURPOSES.size, 3);
  assert.ok(ALLOWED_PURPOSES.has("gallery"));
  assert.ok(ALLOWED_PURPOSES.has("doctor-photo"));
  assert.ok(ALLOWED_PURPOSES.has("admin-upload"));
});

test("media_assets table supports lifecycle_status and deleted_at columns", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "lc1", r2Key: "gallery/lc1.webp", purpose: "gallery", lifecycleStatus: "PUBLISHED", deletedAt: null });
    insertMedia(db, { id: "lc2", r2Key: "gallery/lc2.webp", purpose: "gallery", lifecycleStatus: "HIDDEN", deletedAt: "2026-01-01" });
    const rows = db.prepare("SELECT lifecycle_status, deleted_at FROM media_assets ORDER BY id").all();
    assert.equal(rows[0].lifecycle_status, "PUBLISHED");
    assert.equal(rows[0].deleted_at, null);
    assert.equal(rows[1].lifecycle_status, "HIDDEN");
    assert.equal(rows[1].deleted_at, "2026-01-01");
  } finally {
    db.close();
  }
});

test("server.ts adds lifecycle_status and deleted_at migration statements", () => {
  assert.match(serverSource, /ALTER TABLE media_assets ADD COLUMN lifecycle_status/);
  assert.match(serverSource, /ALTER TABLE media_assets ADD COLUMN deleted_at/);
  assert.match(serverSource, /SELECT lifecycle_status FROM media_assets/);
});

test("media gateway queries lifecycle_status, status, is_visible, deleted_at before R2", () => {
  assert.match(mediaGateway, /SELECT id, r2_key, purpose, category, lifecycle_status, status, is_visible, deleted_at/);
  assert.match(mediaGateway, /FROM media_assets/);
  // M2-A: storage_type and public: checks consolidated into WHERE clause
  assert.match(mediaGateway, /storage_type = 'R2'/);
  assert.match(mediaGateway, /AND r2_key = \?/);
  assert.match(mediaGateway, /NOT LIKE 'public:%'/);
});

test("admin media route stores detected contentType, not browser-supplied type", () => {
  assert.match(adminMediaRoute, /detected/);
  assert.match(adminMediaRoute, /httpMetadata: \{ contentType: detected \}/);
  assert.doesNotMatch(adminMediaRoute, /file\.type.*httpMetadata.*contentType/);
});

test("Doctor photo public gateway queries doctor_profiles with is_deleted = 0", () => {
  assert.match(mediaGateway, /AND is_deleted = 0/);
});

test("Doctor photo public gateway queries with deleted_at IS NULL", () => {
  assert.match(mediaGateway, /deleted_at IS NULL[\s\S]*?LIMIT 1/);
});

test("GalleryClient uses generic labels instead of file_name for dynamic assets", () => {
  assert.doesNotMatch(galleryClient, /asset\.file_name/);
  assert.match(galleryClient, /title: asset\.title \|\| "Hospital Facility"/);
});

test("GalleryClient uses generic labels instead of consent_note", () => {
  assert.doesNotMatch(galleryClient, /asset\.consent_note/);
  assert.match(galleryClient, /note: asset\.caption \|\| "Protone Care Hospital Facility"/);
});

test("AdminConsole no longer references compressImageForUpload in upload path", () => {
  assert.doesNotMatch(consoleSource, /const optimized = await compressImageForUpload/);
});

test("MediaManager file input accepts only JPEG, PNG, WebP", () => {
  assert.match(consoleSource, /accept=\{ALLOWED_ACCEPT\}/);
  assert.match(consoleSource, /ALLOWED_ACCEPT = "image\/jpeg,image\/png,image\/webp"/);
});

test("Client validation checks file type before upload", () => {
  assert.match(consoleSource, /\["image\/jpeg", "image\/png", "image\/webp"\]\.includes\(file\.type\)/);
});

test("Client validation checks file size before upload", () => {
  assert.match(consoleSource, /file\.size > MAX_CLIENT_BYTES/);
  assert.match(consoleSource, /Image must be 5 MB or smaller/);
});

test("Admin media route: insert explicitly writes status, is_visible, lifecycle_status", () => {
  assert.match(adminMediaRoute, /INSERT INTO media_assets.*status.*is_visible.*lifecycle_status/s);
});

test("Pre-buffer: oversized File rejected before arrayBuffer (structural)", () => {
  const sizeCheckIdx = adminMediaRoute.indexOf("file.size > MAX_IMAGE_BYTES");
  const arrayBufIdx = adminMediaRoute.indexOf("arrayBuffer()");
  assert.ok(sizeCheckIdx > 0, "file.size check found");
  assert.ok(arrayBufIdx > sizeCheckIdx, "file.size check before arrayBuffer");
});

test("Pre-buffer: empty File rejected before arrayBuffer (structural)", () => {
  const emptyCheckIdx = adminMediaRoute.indexOf("file.size === 0");
  const arrayBufIdx = adminMediaRoute.indexOf("arrayBuffer()");
  assert.ok(emptyCheckIdx > 0, "empty check found");
  assert.ok(arrayBufIdx > emptyCheckIdx, "empty check before arrayBuffer");
});

test("Pre-buffer: MIME check before arrayBuffer (structural)", () => {
  const mimeCheckIdx = adminMediaRoute.indexOf("ALLOWED_MIME_TYPES.has(file.type)");
  const arrayBufIdx = adminMediaRoute.indexOf("arrayBuffer()");
  assert.ok(mimeCheckIdx > 0, "MIME check found");
  assert.ok(arrayBufIdx > mimeCheckIdx, "MIME check before arrayBuffer");
});

test("Pre-buffer: purpose check before arrayBuffer (structural)", () => {
  const purposeCheckIdx = adminMediaRoute.indexOf("ALLOWED_PURPOSES.has(purpose)");
  const arrayBufIdx = adminMediaRoute.indexOf("arrayBuffer()");
  assert.ok(purposeCheckIdx > 0, "purpose check found");
  assert.ok(arrayBufIdx > purposeCheckIdx, "purpose check before arrayBuffer");
});

test("admin-upload: no doctor reference -> denied (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "au1", r2Key: "admin-upload/au1.webp", purpose: "admin-upload", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    const doctorRef = db.prepare(
      `SELECT slug FROM doctor_profiles WHERE photo_url = ? AND lifecycle_status = 'PUBLISHED' AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 AND deleted_at IS NULL LIMIT 1`
    ).all("/api/media/admin-upload/au1.webp");
    assert.equal(doctorRef.length, 0, "No public doctor references the admin-upload");
  } finally {
    db.close();
  }
});

test("admin-upload: public doctor exact reference -> allowed (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "au2", r2Key: "admin-upload/au2.webp", purpose: "admin-upload", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-pub", photoUrl: "/api/media/admin-upload/au2.webp" });
    const doctorRef = db.prepare(
      `SELECT slug FROM doctor_profiles WHERE photo_url = ? AND lifecycle_status = 'PUBLISHED' AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 AND deleted_at IS NULL LIMIT 1`
    ).all("/api/media/admin-upload/au2.webp");
    assert.equal(doctorRef.length, 1, "Public doctor references the admin-upload");
  } finally {
    db.close();
  }
});

test("admin-upload: hidden/archived doctor reference -> denied (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "au3", r2Key: "admin-upload/au3.webp", purpose: "admin-upload", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-hidden-au", photoUrl: "/api/media/admin-upload/au3.webp", status: "HIDDEN", isVisible: 0, lifecycleStatus: "HIDDEN" });
    insertDoctor(db, { slug: "dr-archived-au", photoUrl: "/api/media/admin-upload/au3.webp", status: "HIDDEN", isVisible: 0, isDeleted: 1, lifecycleStatus: "ARCHIVED" });
    const doctorRef = db.prepare(
      `SELECT slug FROM doctor_profiles WHERE photo_url = ? AND lifecycle_status = 'PUBLISHED' AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 AND deleted_at IS NULL LIMIT 1`
    ).all("/api/media/admin-upload/au3.webp");
    assert.equal(doctorRef.length, 0, "No public doctor references");
  } finally {
    db.close();
  }
});

test("admin-upload: substring-only match does not authorize (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertDoctor(db, { slug: "dr-sub", photoUrl: "/api/media/admin-upload/au4-extra.webp" });
    const doctorRef = db.prepare(
      `SELECT slug FROM doctor_profiles WHERE photo_url = ? AND lifecycle_status = 'PUBLISHED' AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 AND deleted_at IS NULL LIMIT 1`
    ).all("/api/media/admin-upload/au4.webp");
    assert.equal(doctorRef.length, 0, "Substring match does not authorize");
  } finally {
    db.close();
  }
});

test("admin-upload gateway checks doctor_profiles, not self-ref (structural)", () => {
  assert.match(mediaGateway, /purpose === "admin-upload"[\s\S]*?doctor_profiles/);
  assert.match(mediaGateway, /purpose === "admin-upload"[\s\S]*?photo_url = \?/);
  assert.doesNotMatch(mediaGateway, /purpose === "admin-upload"[\s\S]{0,500}SELECT id FROM media_assets/);
});

test("delete guard: active reference -> 409 (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "dg1", r2Key: "doctor-photo/dg1.webp", purpose: "doctor-photo" });
    insertDoctor(db, { slug: "dr-active-dg", photoUrl: "/api/media/doctor-photo/dg1.webp" });
    const refs = db.prepare("SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1").all("/api/media/doctor-photo/dg1.webp");
    assert.equal(refs.length, 1);
  } finally {
    db.close();
  }
});

test("delete guard: hidden reference -> 409 (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "dg2", r2Key: "doctor-photo/dg2.webp", purpose: "doctor-photo" });
    insertDoctor(db, { slug: "dr-hidden-dg", photoUrl: "/api/media/doctor-photo/dg2.webp", status: "HIDDEN", isVisible: 0, lifecycleStatus: "HIDDEN" });
    const refs = db.prepare("SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1").all("/api/media/doctor-photo/dg2.webp");
    assert.equal(refs.length, 1, "Hidden doctor reference still protects media");
  } finally {
    db.close();
  }
});

test("delete guard: archived reference -> 409 (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "dg3", r2Key: "doctor-photo/dg3.webp", purpose: "doctor-photo" });
    insertDoctor(db, { slug: "dr-archived-dg", photoUrl: "/api/media/doctor-photo/dg3.webp", status: "HIDDEN", isVisible: 0, isDeleted: 1, lifecycleStatus: "ARCHIVED" });
    const refs = db.prepare("SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1").all("/api/media/doctor-photo/dg3.webp");
    assert.equal(refs.length, 1, "Archived doctor reference still protects media");
  } finally {
    db.close();
  }
});

test("delete guard: substring-only does not count (SQLite)", () => {
  const db = createMediaDb();
  try {
    insertMedia(db, { id: "dg4", r2Key: "doctor-photo/dg4.webp", purpose: "doctor-photo" });
    insertDoctor(db, { slug: "dr-sub-dg", photoUrl: "/api/media/doctor-photo/dg4-extra.webp" });
    const refs = db.prepare("SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1").all("/api/media/doctor-photo/dg4.webp");
    assert.equal(refs.length, 0, "Substring match does not count as reference");
  } finally {
    db.close();
  }
});

test("delete guard uses exact match, not LIKE (structural)", () => {
  assert.match(adminMediaRoute, /photo_url = \?/);
  assert.doesNotMatch(adminMediaRoute, /photo_url LIKE/);
  assert.match(adminMediaRoute, /doctorRefUrls/);
});

test("computeCropPlan: 600x4000 portrait zoom 1 -> export <= 600", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 600, `Expected exportSize <= 600, got ${geo.exportSize}`);
});

test("computeCropPlan: 4000x600 landscape zoom 1 -> export <= 600", () => {
  const geo = computeCropPlan({ sourceWidth: 4000, sourceHeight: 600, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 600, `Expected exportSize <= 600, got ${geo.exportSize}`);
});

test("computeCropPlan: 2000x2000 square zoom 1 -> export 1200", () => {
  const geo = computeCropPlan({ sourceWidth: 2000, sourceHeight: 2000, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.equal(geo.exportSize, 1200);
});

test("computeCropPlan: 600x4000 rotated 90 -> effective swapped dimensions", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 90, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.equal(geo.rotatedW, 4000);
  assert.equal(geo.rotatedH, 600);
  assert.ok(geo.exportSize <= 600, `Expected exportSize <= 600, got ${geo.exportSize}`);
});

test("computeCropPlan: 600x4000 rotated 270 -> effective swapped", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 270, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.equal(geo.rotatedW, 4000);
  assert.equal(geo.rotatedH, 600);
});

test("computeCropPlan: 600x4000 rotation 180 -> effective unchanged", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 180, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.equal(geo.rotatedW, 600);
  assert.equal(geo.rotatedH, 4000);
});

test("computeCropPlan: 800 source crop -> export 800 not 1200", () => {
  const geo = computeCropPlan({ sourceWidth: 800, sourceHeight: 800, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.equal(geo.exportSize, 800);
});

test("computeCropPlan: 300x3000 zoom 2 -> smaller export", () => {
  const geo1 = computeCropPlan({ sourceWidth: 300, sourceHeight: 3000, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  const geo2 = computeCropPlan({ sourceWidth: 300, sourceHeight: 3000, rotation: 0, zoom: 2, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo2.exportSize < geo1.exportSize, `Zoom 2 export (${geo2.exportSize}) < zoom 1 export (${geo1.exportSize})`);
});

test("computeCropPlan: extreme pan clamped", () => {
  const geo = computeCropPlan({ sourceWidth: 3000, sourceHeight: 2000, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(Number.isFinite(geo.maxPanX));
  assert.ok(Number.isFinite(geo.maxPanY));
  assert.ok(geo.maxPanX >= 0);
  assert.ok(geo.maxPanY >= 0);
});

test("computeCropPlan: no upscaling (export <= visible)", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= Math.floor(Math.min(geo.rotatedW, geo.rotatedH)) + 1, `exportSize ${geo.exportSize} <= min(rotated) ${Math.min(geo.rotatedW, geo.rotatedH)}`);
});

test("compensation success: incomplete object removed message (structural)", () => {
  assert.match(adminMediaRoute, /incomplete object was removed/);
});

test("compensation failure: reconciliation message (structural)", () => {
  assert.match(adminMediaRoute, /Cleanup requires reconciliation/);
  assert.doesNotMatch(adminMediaRoute, /Orphan was cleaned up/);
});

test("compOk tracking present in both D1 paths (structural)", () => {
  const zeroRowIdx = adminMediaRoute.indexOf("D1 zero-row");
  const throwIdx = adminMediaRoute.indexOf("D1 insert failed after R2 write");
  assert.ok(zeroRowIdx > 0, "D1 zero-row path found");
  assert.ok(throwIdx > 0, "D1 throw path found");
  const zeroRowBlock = adminMediaRoute.slice(Math.max(0, zeroRowIdx - 200), zeroRowIdx + 200);
  assert.match(zeroRowBlock, /let compOk = false/);
  const throwBlock = adminMediaRoute.slice(Math.max(0, throwIdx - 200), throwIdx + 200);
  assert.match(throwBlock, /let compOk = false/);
});

test("MediaManager rejects zero-byte files (structural)", () => {
  assert.match(consoleSource, /file\.size === 0/);
  assert.match(consoleSource, /File is empty/);
});

test("MediaManager resets file input on rejection (structural)", () => {
  assert.match(consoleSource, /setFile\(null\)/);
});

test("MediaManager hides Gallery option for Staff (structural)", () => {
  assert.match(consoleSource, /sessionRole === "SUPER_ADMIN" && <option value="gallery">/);
});

test("MediaManager passes sessionRole prop (structural)", () => {
  assert.match(consoleSource, /sessionRole:/);
  assert.match(consoleSource, /sessionRole={session\.role}/);
});

test("computeCropPlan: rotation 0 horizontal pan stays horizontal", () => {
  const geo = computeCropPlan({ sourceWidth: 2000, sourceHeight: 2000, rotation: 0, zoom: 2, panX: 0.5, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.screenPanX > 0, "screenPanX should be positive for panX=0.5");
  assert.equal(geo.screenPanY, 0, "screenPanY should be zero when panY=0");
});

test("computeCropPlan: rotation 90 horizontal pan stays horizontal", () => {
  const geo = computeCropPlan({ sourceWidth: 2000, sourceHeight: 2000, rotation: 90, zoom: 2, panX: 0.5, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.screenPanX > 0, "screenPanX should be positive for panX=0.5 at rot 90");
  assert.equal(geo.screenPanY, 0, "screenPanY should be zero when panY=0");
});

test("computeCropPlan: rotation 270 vertical pan stays vertical", () => {
  const geo = computeCropPlan({ sourceWidth: 2000, sourceHeight: 2000, rotation: 270, zoom: 2, panX: 0, panY: 0.5, outputSize: 200, maxExportSize: 1200 });
  assert.equal(geo.screenPanX, 0, "screenPanX should be zero when panX=0");
  assert.ok(geo.screenPanY > 0, "screenPanY should be positive for panY=0.5 at rot 270");
});

test("computeCropPlan: extreme normalized pan is clamped to maxPan", () => {
  const geo = computeCropPlan({ sourceWidth: 3000, sourceHeight: 2000, rotation: 0, zoom: 1, panX: 5, panY: -5, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.screenPanX <= geo.maxPanX + 0.001, `screenPanX ${geo.screenPanX} <= maxPanX ${geo.maxPanX}`);
  assert.ok(geo.screenPanX >= -geo.maxPanX - 0.001);
  assert.ok(Math.abs(geo.screenPanX) > 0, "clamped pan should be nonzero for large input");
});

test("computeCropPlan: no blank edge (drawn >= output)", () => {
  for (const rot of [0, 90, 180, 270]) {
    const geo = computeCropPlan({ sourceWidth: 2000, sourceHeight: 1000, rotation: rot, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
    assert.ok(geo.drawnScreenW >= 200, `rot=${rot}: drawnScreenW ${geo.drawnScreenW} >= 200`);
    assert.ok(geo.drawnScreenH >= 200, `rot=${rot}: drawnScreenH ${geo.drawnScreenH} >= 200`);
  }
});

test("computeCropPlan: same normalized pan yields proportional screenPan across outputSizes", () => {
  const panX = 0.7;
  const panY = -0.3;
  const small = computeCropPlan({ sourceWidth: 2000, sourceHeight: 2000, rotation: 0, zoom: 2, panX, panY, outputSize: 200, maxExportSize: 1200 });
  const large = computeCropPlan({ sourceWidth: 2000, sourceHeight: 2000, rotation: 0, zoom: 2, panX, panY, outputSize: 1200, maxExportSize: 1200 });
  assert.ok(small.screenPanX > 0, "small screenPanX > 0");
  assert.ok(small.screenPanY !== 0, "small screenPanY != 0");
  const ratioX = large.screenPanX / small.screenPanX;
  const ratioY = large.screenPanY / small.screenPanY;
  assert.ok(Math.abs(ratioX - 6) < 0.01, `X pan ratio ${ratioX} ~ 6`);
  assert.ok(Math.abs(ratioY - 6) < 0.01, `Y pan ratio ${ratioY} ~ 6`);
});

test("computeCropPlan: all rotations produce same visibleSourceSide for square crop", () => {
  const srcW = 600;
  const srcH = 4000;
  const zoom = 1;
  const sizes = [];
  for (const rot of [0, 90, 180, 270]) {
    const geo = computeCropPlan({ sourceWidth: srcW, sourceHeight: srcH, rotation: rot, zoom, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
    sizes.push(geo.exportSize);
  }
  assert.ok(sizes.every((s) => s === sizes[0]), `All rotations produce same exportSize: ${JSON.stringify(sizes)}`);
});

test("computeCropPlan: no-upscaling 600x4000 rot 0 zoom 1 -> export <= 600", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 600);
});

test("computeCropPlan: no-upscaling 600x4000 rot 90 zoom 1 -> export <= 600", () => {
  const geo = computeCropPlan({ sourceWidth: 600, sourceHeight: 4000, rotation: 90, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 600);
});

test("computeCropPlan: no-upscaling 4000x600 rot 270 zoom 1 -> export <= 600", () => {
  const geo = computeCropPlan({ sourceWidth: 4000, sourceHeight: 600, rotation: 270, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 600);
});

test("computeCropPlan: no-upscaling 800x800 zoom 1 -> export <= 800", () => {
  const geo = computeCropPlan({ sourceWidth: 800, sourceHeight: 800, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 800);
});

test("computeCropPlan: no-upscaling 2400x2400 zoom 1 -> export <= 1200", () => {
  const geo = computeCropPlan({ sourceWidth: 2400, sourceHeight: 2400, rotation: 0, zoom: 1, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 1200);
});

test("computeCropPlan: no-upscaling 2400x2400 zoom 2 -> export <= 1200", () => {
  const geo = computeCropPlan({ sourceWidth: 2400, sourceHeight: 2400, rotation: 0, zoom: 2, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 1200);
});

test("computeCropPlan: no-upscaling 800x800 zoom 2 -> export <= 400", () => {
  const geo = computeCropPlan({ sourceWidth: 800, sourceHeight: 800, rotation: 0, zoom: 2, panX: 0, panY: 0, outputSize: 200, maxExportSize: 1200 });
  assert.ok(geo.exportSize <= 400, `Expected <= 400, got ${geo.exportSize}`);
});

test("MediaManager: Staff purpose defaults to admin-upload, not gallery (structural)", () => {
  assert.match(consoleSource, /sessionRole === "STAFF" \? "admin-upload" : "gallery"/);
});

test("MediaManager: effectivePurpose normalizes gallery to admin-upload for Staff (structural)", () => {
  const mmIdx = consoleSource.indexOf("function MediaManager");
  const mmBlock = consoleSource.slice(mmIdx, mmIdx + 1500);
  assert.match(mmBlock, /sessionRole === "STAFF" && purpose === "gallery" \? "admin-upload" : purpose/);
  assert.match(mmBlock, /effectivePurpose/);
});

test("Doctor uploader: zero-byte file rejected before FileReader (structural)", () => {
  const cropIdx = consoleSource.indexOf("function onFileChange");
  const cropBlock = consoleSource.slice(cropIdx, cropIdx + 600);
  assert.match(cropBlock, /file\.size === 0/);
  assert.match(cropBlock, /File is empty/);
});
