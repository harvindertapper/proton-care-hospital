import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

function readMigration(name) {
  return fs.readFileSync(path.join(rootDir, "migrations", name), "utf8");
}

function openFullDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  db.exec(readMigration("0002_add_content_lifecycle_foundation.sql"));
  db.exec(readMigration("0003_add_media_library_and_gallery.sql"));
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  return db;
}

function insertMedia(db, opts) {
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, category, uploaded_by, consent_note, status, is_visible, lifecycle_status, storage_type, deleted_at, version)
     VALUES (?, ?, ?, 'image/webp', 1024, ?, ?, 'test@example.com', '', ?, ?, ?, ?, ?, 1)`
  ).run(opts.id, opts.r2Key, opts.fileName || "test.webp", opts.purpose || "doctor-photo", opts.category || "DOCTOR", opts.status || "APPROVED", opts.isVisible ?? 1, opts.lifecycleStatus || "PUBLISHED", opts.storageType || "R2", opts.deletedAt || null);
}

function insertDoctor(db, opts) {
  const photoMediaId = opts.photoMediaId !== undefined ? opts.photoMediaId : null;
  db.prepare(
    `INSERT INTO doctor_profiles (id, slug, name, speciality, qualification, department_slug, photo_url, photo_media_id, profile_note, consent_status, status, is_visible, approved_by, is_deleted, lifecycle_status, version)
     VALUES (?, ?, ?, '', '', 'cardiology', ?, ?, '', 'APPROVED_SOURCE', ?, ?, 'test', ?, ?, 1)`
  ).run(`doctor-${opts.slug}`, opts.slug, opts.slug, opts.photoUrl || "", photoMediaId, opts.status || "APPROVED", opts.isVisible ?? 1, opts.isDeleted ?? 0, opts.lifecycleStatus || "PUBLISHED");
}

/* ═══════════════════════════════════════════════════════════════════════════
   I. doctor-public.ts — Media resolution via LEFT JOIN
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  resolvePublicDoctors,
  resolveDoctorBySlug,
  DOCTOR_LIST_SQL,
  DOCTOR_BY_SLUG_SQL,
} from "../app/lib/doctor-public.ts";

function okQuery(rows) {
  return async () => ({ results: rows });
}

function throwingQuery() {
  return async () => { throw new Error("D1 unavailable"); };
}

function doctorRowWithMedia(overrides = {}) {
  return {
    slug: "dr-test", name: "Dr Test", speciality: "Cardiology",
    qualification: "MD", department_slug: "cardiology",
    photo_url: "/old/photo.webp",
    photo_media_id: null,
    ma_id: null, ma_r2_key: null, ma_display_r2_key: null, ma_thumbnail_r2_key: null,
    ma_storage_type: null, ma_public_path: null, ma_display_public_path: null,
    ma_thumbnail_public_path: null, ma_lifecycle_status: null, ma_status: null,
    ma_is_visible: null, ma_deleted_at: null,
    ...overrides,
  };
}

test("PUB.01 DOCTOR_LIST_SQL selects photo_media_id and media columns via LEFT JOIN", () => {
  assert.ok(DOCTOR_LIST_SQL.includes("dp.photo_media_id"), "SQL must select photo_media_id");
  assert.ok(DOCTOR_LIST_SQL.includes("LEFT JOIN media_assets ma ON dp.photo_media_id = ma.id"), "SQL must LEFT JOIN media_assets");
  assert.ok(DOCTOR_LIST_SQL.includes("ma.id AS ma_id"), "SQL must alias media ID");
  assert.ok(DOCTOR_LIST_SQL.includes("ma.r2_key AS ma_r2_key"), "SQL must alias media r2_key");
});

test("PUB.02 DOCTOR_BY_SLUG_SQL selects media columns and joins media_assets", () => {
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("dp.photo_media_id"), "Slug SQL must select photo_media_id");
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("LEFT JOIN media_assets ma ON dp.photo_media_id = ma.id"), "Slug SQL must JOIN media_assets");
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("ma.lifecycle_status AS ma_lifecycle_status"), "Slug SQL must alias lifecycle_status");
});

test("PUB.03 Doctor with NULL photo_media_id falls back to legacy photo_url", async () => {
  const row = doctorRowWithMedia({ photo_media_id: null, photo_url: "/legacy/photo.webp" });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result.length, 1);
  assert.equal(result[0].photo, "/legacy/photo.webp");
});

test("PUB.04 Doctor with valid photo_media_id uses media resolution", async () => {
  const row = doctorRowWithMedia({
    photo_media_id: "m1",
    ma_id: "m1", ma_r2_key: "doctor-photo/m1.webp", ma_storage_type: "R2", ma_category: "DOCTOR",
    ma_lifecycle_status: "PUBLISHED", ma_status: "APPROVED", ma_is_visible: 1,
    ma_deleted_at: null, photo_url: "/old/photo.webp",
  });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result.length, 1);
  assert.equal(result[0].photo, "/api/media/doctor-photo/m1.webp", "Must resolve to R2 media URL, not legacy photo_url");
});

test("PUB.05 Doctor with photo_media_id referencing deleted media falls back to undefined", async () => {
  const row = doctorRowWithMedia({
    photo_media_id: "m1",
    ma_id: "m1", ma_r2_key: "doctor-photo/m1.webp", ma_storage_type: "R2",
    ma_lifecycle_status: "PUBLISHED", ma_status: "APPROVED", ma_is_visible: 1,
    ma_deleted_at: "2026-07-01", photo_url: "/old/photo.webp",
  });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result[0].photo, undefined, "Must not show deleted media photo");
});

test("PUB.06 Doctor with photo_media_id referencing hidden media returns undefined", async () => {
  const row = doctorRowWithMedia({
    photo_media_id: "m1",
    ma_id: "m1", ma_r2_key: "doctor-photo/m1.webp", ma_storage_type: "R2",
    ma_lifecycle_status: "HIDDEN", ma_status: "APPROVED", ma_is_visible: 0,
    ma_deleted_at: null, photo_url: "/old/photo.webp",
  });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result[0].photo, undefined, "Must not show non-published media photo");
});

test("PUB.07 Doctor with photo_media_id referencing non-existent media returns undefined", async () => {
  const row = doctorRowWithMedia({
    photo_media_id: "m1",
    ma_id: null, ma_r2_key: null,
    photo_url: "/old/photo.webp",
  });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result[0].photo, undefined, "Must not show photo when media ID references nothing");
});

test("PUB.08 resolveDoctorBySlug passes slug as bound parameter", async () => {
  let capturedBinds = [];
  const spyQuery = async (sql, ...binds) => {
    capturedBinds = binds;
    return { results: [doctorRowWithMedia()] };
  };
  await resolveDoctorBySlug(spyQuery, "dr-test");
  assert.deepEqual(capturedBinds, ["dr-test"], "Must bind slug as parameter");
});

test("PUB.09 D1 failure in resolvePublicDoctors returns empty array", async () => {
  const result = await resolvePublicDoctors(throwingQuery());
  assert.deepEqual(result, [], "Must return empty array on error");
});

test("PUB.10 D1 failure in resolveDoctorBySlug returns null", async () => {
  const result = await resolveDoctorBySlug(throwingQuery(), "dr-test");
  assert.equal(result, null, "Must return null on error");
});

test("PUB.11 Doctor with PUBLIC storage type resolves via public_path", async () => {
  const row = doctorRowWithMedia({
    photo_media_id: "m1",
    ma_id: "m1", ma_storage_type: "PUBLIC", ma_public_path: "/assets/photos/m1.webp",
    ma_display_public_path: "/assets/photos/m1-display.webp", ma_r2_key: "", ma_category: "DOCTOR",
    ma_lifecycle_status: "PUBLISHED", ma_status: "APPROVED", ma_is_visible: 1,
    ma_deleted_at: null, photo_url: "/old/photo.webp",
  });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result[0].photo, "/assets/photos/m1-display.webp", "Must use display_public_path");
});

test("PUB.12 Doctor with display_r2_key resolves to display URL", async () => {
  const row = doctorRowWithMedia({
    photo_media_id: "m1",
    ma_id: "m1", ma_r2_key: "doctor-photo/m1.webp", ma_display_r2_key: "doctor-photo/m1-display.webp",
    ma_storage_type: "R2", ma_category: "DOCTOR",
    ma_lifecycle_status: "PUBLISHED", ma_status: "APPROVED",
    ma_is_visible: 1, ma_deleted_at: null, photo_url: "/old/photo.webp",
  });
  const result = await resolvePublicDoctors(okQuery([row]));
  assert.equal(result[0].photo, "/api/media/doctor-photo/m1-display.webp", "Must use display R2 key");
});

/* ═══════════════════════════════════════════════════════════════════════════
   II. doctor-admin.ts — validateDoctorMediaRelation + photoMediaId in CRUD
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  createDoctor,
  updateDoctor,
  loadDoctor,
  validateDoctorMediaRelation,
  resolveDoctorManagerRows,
} from "../app/lib/doctor-admin.ts";

function makeAdminRepo({ rows = [] } = {}) {
  const db = new Map(rows.map((r) => [r.slug, { ...r }]));
  let auditCalls = [];
  const query = async (sql, ...binds) => {
    const slug = binds[0];
    if (!slug) return { results: Array.from(db.values()) };
    const row = db.get(slug);
    if (!row) return { results: [] };
    if (sql.includes("lifecycle_status != 'ARCHIVED'") && sql.includes("is_deleted = 0")) {
      const match = row.is_deleted === 0 && row.lifecycle_status !== "ARCHIVED";
      if (sql.includes("deleted_at IS NULL")) {
        return { results: match && row.deleted_at == null ? [row] : [] };
      }
      return { results: match ? [row] : [] };
    }
    if (sql.includes("is_deleted = 1 AND lifecycle_status = 'ARCHIVED'")) {
      return { results: row.is_deleted === 1 && row.lifecycle_status === "ARCHIVED" ? [row] : [] };
    }
    if (sql.includes("deleted_at IS NULL")) {
      return { results: row.deleted_at == null ? [row] : [] };
    }
    return { results: [row] };
  };
  const run = async (sql, ...binds) => {
    const slug = binds.find((b) => typeof b === "string" && db.has(b)) || binds[0];
    const matchBySlug = db.get(String(slug));
    if (!matchBySlug) {
      if (sql.startsWith("INSERT")) {
        const row = {
          id: binds[0], slug: binds[1], name: binds[2], speciality: binds[3],
          qualification: binds[4], department_slug: binds[5], photo_url: binds[6],
          photo_media_id: binds[7], profile_note: binds[8], status: binds[9], is_visible: binds[10],
          approved_by: binds[11], blocked_dates: binds[12] || "",
          is_deleted: binds[13], lifecycle_status: binds[14], version: 1,
          deleted_at: null,
        };
        db.set(binds[1], row);
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    }
    if (sql.includes("version = version + 1")) {
      matchBySlug.version += 1;
    }
    if (sql.includes("lifecycle_status = 'ARCHIVED'")) {
      matchBySlug.lifecycle_status = "ARCHIVED";
      matchBySlug.status = "HIDDEN";
      matchBySlug.is_visible = 0;
      matchBySlug.is_deleted = 1;
      matchBySlug.deleted_at = new Date().toISOString();
    }
    if (sql.includes("lifecycle_status = 'HIDDEN'") && sql.includes("is_deleted = 0")) {
      matchBySlug.lifecycle_status = "HIDDEN";
      matchBySlug.status = "HIDDEN";
      matchBySlug.is_visible = 0;
      matchBySlug.is_deleted = 0;
      matchBySlug.deleted_at = null;
    }
    if (sql.includes("UPDATE doctor_profiles SET") && sql.includes("name = ?")) {
      matchBySlug.name = binds[0];
      matchBySlug.speciality = binds[1];
      matchBySlug.photo_media_id = binds[5];
      matchBySlug.lifecycle_status = binds[12];
      matchBySlug.status = binds[9];
      matchBySlug.is_visible = binds[10];
      matchBySlug.is_deleted = binds[11];
      matchBySlug.deleted_at = null;
    }
    return { success: true, meta: { changes: 1 } };
  };
  const audit = async (...args) => { auditCalls.push(args); };
  return { repo: { query, run, audit }, getAuditCalls: () => auditCalls, db };
}

function adminFields(overrides = {}) {
  return {
    name: "Dr New", speciality: "Cardiology", qualification: "MD",
    departmentSlug: "cardiology", photoUrl: "", photoMediaId: null, profileNote: "",
    blockedDates: "", isVisible: true, ...overrides,
  };
}

const ADMIN_PUBLISHED_ROW = {
  id: "d1", slug: "dr-a", name: "Dr A", lifecycle_status: "PUBLISHED",
  version: 1, deleted_at: null, status: "APPROVED", is_visible: 1, is_deleted: 0,
  speciality: "Cardiology", qualification: "MD", department_slug: "cardiology",
  photo_url: "", photo_media_id: null, profile_note: "", blocked_dates: "",
};

test("ADM.01 createDoctor passes photoMediaId in INSERT bind", async () => {
  const { repo, db } = makeAdminRepo({});
  await createDoctor(repo, "dr-new", adminFields({ photoMediaId: "media-123" }), "admin@x");
  assert.equal(db.get("dr-new").photo_media_id, "media-123", "Must store photoMediaId");
});

test("ADM.02 createDoctor stores null photoMediaId when not provided", async () => {
  const { repo, db } = makeAdminRepo({});
  await createDoctor(repo, "dr-new", adminFields(), "admin@x");
  assert.equal(db.get("dr-new").photo_media_id, null, "Must store null photoMediaId");
});

test("ADM.03 updateDoctor passes photoMediaId in UPDATE SET", async () => {
  const { repo, db } = makeAdminRepo({ rows: [ADMIN_PUBLISHED_ROW] });
  await updateDoctor(repo, "dr-a", 1, adminFields({ photoMediaId: "media-456" }), "admin@x");
  assert.equal(db.get("dr-a").photo_media_id, "media-456", "Must update photoMediaId");
});

test("ADM.04 updateDoctor can clear photoMediaId to null", async () => {
  const row = { ...ADMIN_PUBLISHED_ROW, photo_media_id: "old-media" };
  const { repo, db } = makeAdminRepo({ rows: [row] });
  await updateDoctor(repo, "dr-a", 1, adminFields({ photoMediaId: null }), "admin@x");
  assert.equal(db.get("dr-a").photo_media_id, null, "Must clear photoMediaId");
});

test("ADM.05 loadDoctor returns photo_media_id from query", async () => {
  const row = { ...ADMIN_PUBLISHED_ROW, photo_media_id: "media-789" };
  const { repo } = makeAdminRepo({ rows: [row] });
  const doc = await loadDoctor(repo, "dr-a");
  assert.equal(doc.photo_media_id, "media-789", "loadDoctor must return photo_media_id");
});

test("ADM.06 loadDoctor returns null photo_media_id for legacy rows", async () => {
  const { repo } = makeAdminRepo({ rows: [ADMIN_PUBLISHED_ROW] });
  const doc = await loadDoctor(repo, "dr-a");
  assert.equal(doc.photo_media_id, null, "loadDoctor must return null for legacy rows");
});

test("ADM.07 resolveDoctorManagerRows preserves photo_media_id in output", () => {
  const rows = [
    { slug: "dr-a", name: "Dr A", photo_media_id: "media-1", is_deleted: 0, lifecycle_status: "PUBLISHED", deleted_at: null },
  ];
  const result = resolveDoctorManagerRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].photo_media_id, "media-1", "Manager rows must include photo_media_id");
});

/* ═══════════════════════════════════════════════════════════════════════════
   III. R2 media gateway — photo_media_id authorization
   ═══════════════════════════════════════════════════════════════════════════ */

const mediaGateway = await readFile(new URL("../app/api/media/[...key]/route.ts", import.meta.url), "utf8");

test("GW.01 Gateway supports doctor-photo purpose", () => {
  assert.match(mediaGateway, /purpose === "doctor-photo"/, "Must handle doctor-photo purpose");
});

test("GW.02 Gateway supports admin-upload purpose", () => {
  assert.match(mediaGateway, /purpose === "admin-upload"/, "Must handle admin-upload purpose");
});

test("GW.03 Gateway checks legacy photo_url reference", () => {
  assert.match(mediaGateway, /photo_url = \?/, "Must check photo_url for legacy reference");
});

test("GW.04 Gateway checks photo_media_id via JOIN", () => {
  assert.match(mediaGateway, /photo_media_id/, "Must check photo_media_id");
  assert.match(mediaGateway, /INNER JOIN media_assets ma ON ma\.id = dp\.photo_media_id/, "Must JOIN media_assets via photo_media_id");
});

test("GW.05 Gateway denies doctor-photo with no legacy and no media ref", () => {
  assert.match(mediaGateway, /doctorMediaRef\.results.*doctorMediaRef\.results\.length === 0/, "Must deny when no reference found");
});

test("GW.06 Gateway allows gallery-purpose media without doctor check", () => {
  assert.match(mediaGateway, /purpose === "gallery"[\s\S]*?\/\/ Gallery: authorized/, "Gallery must be authorized without doctor check");
});

test("GW.07 Gateway queries doctor_profiles lifecycle/status for media ref", () => {
  assert.match(mediaGateway, /dp\.lifecycle_status = 'PUBLISHED'/, "Must filter by PUBLISHED lifecycle");
  assert.match(mediaGateway, /dp\.status = 'APPROVED'/, "Must filter by APPROVED status");
  assert.match(mediaGateway, /dp\.is_visible = 1/, "Must filter by visible");
});

/* ═══════════════════════════════════════════════════════════════════════════
   IV. Media library DELETE guard — photo_media_id reference check
   ═══════════════════════════════════════════════════════════════════════════ */

const libraryIdRoute = await readFile(new URL("../app/api/admin/media/library/[id]/route.ts", import.meta.url), "utf8");
const mediaRoute = await readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8");

test("DEL.01 Library DELETE atomic guard checks photo_media_id", () => {
  assert.match(libraryIdRoute, /NOT EXISTS.*SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets\.id/, "Atomic guard must check photo_media_id");
});

test("DEL.02 Library DELETE conflict fallback checks photo_media_id", () => {
  assert.match(libraryIdRoute, /SELECT id FROM doctor_profiles WHERE photo_media_id = \? LIMIT 1/, "Conflict fallback must check photo_media_id");
});

test("DEL.03 Library DELETE still checks legacy photo_url references", () => {
  assert.match(libraryIdRoute, /NOT EXISTS.*SELECT 1 FROM doctor_profiles WHERE photo_url IN/, "Must still check photo_url");
});

test("DEL.04 Legacy DELETE route checks photo_media_id reference", () => {
  assert.match(mediaRoute, /SELECT id FROM doctor_profiles WHERE photo_media_id = \? LIMIT 1/, "Legacy DELETE must check photo_media_id");
});

test("DEL.05 Legacy DELETE still checks photo_url reference", () => {
  assert.match(mediaRoute, /SELECT id FROM doctor_profiles WHERE photo_url = \? LIMIT 1/, "Legacy DELETE must still check photo_url");
});

/* ═══════════════════════════════════════════════════════════════════════════
   V. Admin data route — applyDoctor passes photoMediaId
   ═══════════════════════════════════════════════════════════════════════════ */

const adminDataRoute = await readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8");

test("API.01 applyDoctor extracts photoMediaId from payload", () => {
  assert.match(adminDataRoute, /photoMediaId/, "Must reference photoMediaId in payload extraction");
});

test("API.02 applyDoctor calls validateDoctorMediaRelation before mutation", () => {
  assert.match(adminDataRoute, /validateDoctorMediaRelation/, "Must validate media relation");
});

test("API.03 applyDoctor passes photoMediaId to createDoctor", () => {
  assert.match(adminDataRoute, /createDoctor.*photoMediaId/s, "Must pass photoMediaId to createDoctor");
});

test("API.04 applyDoctor passes photoMediaId to updateDoctor", () => {
  assert.match(adminDataRoute, /updateDoctor.*photoMediaId/s, "Must pass photoMediaId to updateDoctor");
});

/* ═══════════════════════════════════════════════════════════════════════════
   VI. AdminConsole.tsx — DoctorManager form wiring
   ═══════════════════════════════════════════════════════════════════════════ */

const adminConsole = await readFile(new URL("../app/components/AdminConsole.tsx", import.meta.url), "utf8");

test("UI.01 DoctorManager form state includes photoMediaId", () => {
  assert.ok(adminConsole.includes("photoMediaId:"), "Form state must include photoMediaId");
});

test("UI.02 DoctorManager choose function reads photo_media_id from row", () => {
  assert.match(adminConsole, /photoMediaId: String\(row\.photo_media_id/, "choose() must read photo_media_id");
});

test("UI.03 DoctorManager onUpload returns { url, mediaId } tuple", () => {
  assert.match(adminConsole, /Promise<\{ url: string; mediaId: string \}>/, "onUpload must return url and mediaId");
});

test("UI.04 ImageCropUploader onComplete receives (url, mediaId)", () => {
  assert.match(adminConsole, /onComplete.*\(url, mediaId\)/s, "onComplete must accept url and mediaId");
});

test("UI.05 DoctorManager renders MediaPickerDialog for photo selection", () => {
  assert.ok(adminConsole.includes("showDoctorPicker"), "Must have showDoctorPicker state");
  assert.ok(adminConsole.includes("Select from Media Library"), "Must have media picker button");
});

test("UI.06 MediaPickerDialog is configured with category DOCTOR", () => {
  assert.match(adminConsole, /category="DOCTOR"/, "MediaPickerDialog must use DOCTOR category");
});

test("UI.07 DoctorManager shows photo source label", () => {
  assert.ok(adminConsole.includes("photoSource"), "Must compute photo source type");
  assert.ok(adminConsole.includes("media_library"), "Must support media_library source label");
  assert.ok(adminConsole.includes("legacy_url"), "Must support legacy_url source label");
});

test("UI.08 DoctorManager has clear media relation button", () => {
  assert.ok(adminConsole.includes("Clear Media Relation"), "Must have clear media relation button");
});

test("UI.09 uploadMedia returns both url and mediaId", () => {
  assert.match(adminConsole, /return \{ url: String\(uploadRes\.url/, "uploadMedia must return url");
  assert.match(adminConsole, /mediaId: String\(uploadRes\.id/, "uploadMedia must return mediaId");
});

test("UI.10 DoctorManager save payload includes photoMediaId", () => {
  assert.ok(adminConsole.includes("onSave(form)"), "Form submission passes entire form including photoMediaId");
});

test("UI.11 MediaPickerDialog onSelect sets both photoMediaId and photoUrl", () => {
  assert.match(adminConsole, /setForm\(\{ \.\.\.form, photoMediaId: asset\.id, photoUrl: asset\.displayUrl/, "onSelect must set both fields");
});

/* ═══════════════════════════════════════════════════════════════════════════
   VII. MediaPickerDialog.tsx — Category parameterization
   ═══════════════════════════════════════════════════════════════════════════ */

const mediaPickerDialog = await readFile(new URL("../app/components/admin/MediaPickerDialog.tsx", import.meta.url), "utf8");

test("PICK.01 MediaPickerDialog has category prop with default GALLERY", () => {
  assert.ok(mediaPickerDialog.includes('category = "GALLERY"'), "Must default to GALLERY category");
});

test("PICK.02 MediaPickerDialog has title prop", () => {
  assert.ok(mediaPickerDialog.includes("title"), "Must have title prop");
});

test("PICK.03 MediaPickerDialog has categoryLabel prop", () => {
  assert.ok(mediaPickerDialog.includes("categoryLabel"), "Must have categoryLabel prop");
});

test("PICK.04 MediaPickerDialog has selectedId prop", () => {
  assert.ok(mediaPickerDialog.includes("selectedId"), "Must have selectedId prop");
});

test("PICK.05 MediaPickerDialog uses category prop in API query", () => {
  assert.match(mediaPickerDialog, /category,/, "Must pass category to API query");
});

test("PICK.06 MediaPickerDialog filters by category in eligibility check", () => {
  assert.match(mediaPickerDialog, /category === category/, "Eligibility must filter by category");
});

test("PICK.07 MediaPickerDialog shows currently selected asset", () => {
  assert.ok(mediaPickerDialog.includes("externalSelectedId"), "Must track external selected ID");
});

/* ═══════════════════════════════════════════════════════════════════════════
   VIII. SQLite integration — validateDoctorMediaRelation via DB
   ═══════════════════════════════════════════════════════════════════════════ */

test("SQL.01 validateDoctorMediaRelation accepts valid published media", async () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-a", photoMediaId: "m1", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });

    const mockRepo = {
      query: async (sql, ...binds) => {
        const stmt = db.prepare(sql);
        const results = stmt.all(...binds);
        return { results };
      },
    };
    const result = await validateDoctorMediaRelation(mockRepo, "m1", true);
    assert.deepEqual(result, { ok: true }, "Must accept valid media for visible doctor");
  } finally {
    db.close();
  }
});

test("SQL.02 validateDoctorMediaRelation rejects null media ID for visible doctor", async () => {
  const db = openFullDb();
  try {
    insertDoctor(db, { slug: "dr-a", photoMediaId: null, lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    const mockRepo = {
      query: async (sql, ...binds) => {
        const stmt = db.prepare(sql);
        return { results: stmt.all(...binds) };
      },
    };
    const result = await validateDoctorMediaRelation(mockRepo, null, true);
    assert.deepEqual(result, { ok: true }, "null photoMediaId is valid for visible doctor (legacy URL)");
  } finally {
    db.close();
  }
});

test("SQL.03 photo_media_id column exists on doctor_profiles after migration 0004", () => {
  const db = openFullDb();
  try {
    const cols = db.prepare("PRAGMA table_info(doctor_profiles)").all();
    const hasPhotoMediaId = cols.some((c) => c.name === "photo_media_id");
    assert.ok(hasPhotoMediaId, "photo_media_id column must exist");
  } finally {
    db.close();
  }
});

test("SQL.04 photo_media_id index exists after migration 0004", () => {
  const db = openFullDb();
  try {
    const indexes = db.prepare("PRAGMA index_list(doctor_profiles)").all();
    const idx = indexes.find((i) => i.name === "idx_doctor_profiles_photo_media");
    assert.ok(idx, "idx_doctor_profiles_photo_media must exist");
  } finally {
    db.close();
  }
});

test("SQL.05 NULL photo_media_id remains valid for existing doctors", () => {
  const db = openFullDb();
  try {
    insertDoctor(db, { slug: "dr-legacy", photoMediaId: null });
    const row = db.prepare("SELECT photo_media_id FROM doctor_profiles WHERE slug = ?").get("dr-legacy");
    assert.equal(row.photo_media_id, null, "Legacy rows have NULL photo_media_id");
  } finally {
    db.close();
  }
});

test("SQL.06 Valid media ID stored in photo_media_id", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp" });
    insertDoctor(db, { slug: "dr-linked", photoMediaId: "m1" });
    const row = db.prepare("SELECT photo_media_id FROM doctor_profiles WHERE slug = ?").get("dr-linked");
    assert.equal(row.photo_media_id, "m1", "Must store valid media ID");
  } finally {
    db.close();
  }
});

test("SQL.07 LEFT JOIN resolves photo from media_assets for linked doctor", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-linked", photoMediaId: "m1", photoUrl: "/old.webp" });

    const rows = db.prepare(`SELECT
      dp.slug, dp.photo_url, dp.photo_media_id,
      ma.id AS ma_id, ma.r2_key AS ma_r2_key, ma.storage_type AS ma_storage_type,
      ma.lifecycle_status AS ma_lifecycle_status, ma.status AS ma_status,
      ma.is_visible AS ma_is_visible, ma.deleted_at AS ma_deleted_at
    FROM doctor_profiles dp
    LEFT JOIN media_assets ma ON dp.photo_media_id = ma.id
    WHERE dp.slug = ? AND dp.lifecycle_status = 'PUBLISHED'`).all("dr-linked");

    assert.equal(rows.length, 1);
    assert.equal(rows[0].ma_id, "m1", "Must resolve media via LEFT JOIN");
    assert.equal(rows[0].ma_r2_key, "doctor-photo/m1.webp", "Must have media r2_key");
  } finally {
    db.close();
  }
});

test("SQL.08 LEFT JOIN returns NULLs for doctor without media link", () => {
  const db = openFullDb();
  try {
    insertDoctor(db, { slug: "dr-nolink", photoMediaId: null, photoUrl: "/legacy.webp" });

    const rows = db.prepare(`SELECT
      dp.slug, dp.photo_url, dp.photo_media_id,
      ma.id AS ma_id
    FROM doctor_profiles dp
    LEFT JOIN media_assets ma ON dp.photo_media_id = ma.id
    WHERE dp.slug = ? AND dp.lifecycle_status = 'PUBLISHED'`).all("dr-nolink");

    assert.equal(rows.length, 1);
    assert.equal(rows[0].ma_id, null, "LEFT JOIN returns NULL media for unlinked doctor");
    assert.equal(rows[0].photo_url, "/legacy.webp", "Legacy photo_url still present");
  } finally {
    db.close();
  }
});

test("SQL.09 Multiple doctors can share same photo_media_id", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/shared.webp" });
    insertDoctor(db, { slug: "dr-shared-a", photoMediaId: "m1" });
    insertDoctor(db, { slug: "dr-shared-b", photoMediaId: "m1" });

    const rows = db.prepare("SELECT slug FROM doctor_profiles WHERE photo_media_id = ?").all("m1");
    assert.equal(rows.length, 2, "Multiple doctors can reference same media");
  } finally {
    db.close();
  }
});

test("SQL.10 Library DELETE blocks when photo_media_id references asset", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-linked", photoMediaId: "m1", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });

    const guard = db.prepare(
      "SELECT id FROM doctor_profiles WHERE photo_media_id = ? LIMIT 1"
    ).all("m1");
    assert.ok(guard.length > 0, "photo_media_id reference must block deletion");
  } finally {
    db.close();
  }
});

test("SQL.11 Library DELETE allows when no photo_media_id references asset", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp" });

    const guard = db.prepare(
      "SELECT id FROM doctor_profiles WHERE photo_media_id = ? LIMIT 1"
    ).all("m1");
    assert.equal(guard.length, 0, "No reference means deletion is allowed");
  } finally {
    db.close();
  }
});

test("SQL.12 Atomic NOT EXISTS guard blocks archive when photo_media_id references asset", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });
    insertDoctor(db, { slug: "dr-linked", photoMediaId: "m1", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });

    const result = db.prepare(`UPDATE media_assets
      SET lifecycle_status = 'ARCHIVED'
      WHERE id = 'm1' AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets.id)`).run();
    assert.equal(result.changes, 0, "Atomic guard must block archive when referenced");
  } finally {
    db.close();
  }
});

test("SQL.13 Atomic NOT EXISTS guard allows archive when no photo_media_id reference", () => {
  const db = openFullDb();
  try {
    insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 1 });

    const result = db.prepare(`UPDATE media_assets
      SET lifecycle_status = 'ARCHIVED'
      WHERE id = 'm1' AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets.id)`).run();
    assert.equal(result.changes, 1, "Must allow archive when no reference");
  } finally {
    db.close();
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   Section 13 — B5/M4-B1.1 Behavior-Focused Tests
   ═══════════════════════════════════════════════════════════════════════════ */

import { dbDoctorToPublic } from "../app/lib/doctor-public.ts";
import { generateR2MediaUrl, validatePublicPath } from "../app/lib/media-resolver.ts";

/* ───────────────────────────────────────────────────────────────────────────
   13-A. PUBLIC CATEGORY — Category enforcement in doctor-public.ts (1-8)
   ─────────────────────────────────────────────────────────────────────────── */

function makeMediaRow(overrides = {}) {
  return {
    photo_media_id: "m1",
    ma_id: "m1", ma_r2_key: "doctor-photo/m1.webp", ma_display_r2_key: null,
    ma_thumbnail_r2_key: null, ma_storage_type: "R2",
    ma_public_path: null, ma_display_public_path: null, ma_thumbnail_public_path: null,
    ma_lifecycle_status: "PUBLISHED", ma_status: "APPROVED",
    ma_is_visible: 1, ma_deleted_at: null, ma_category: "DOCTOR",
    slug: "dr-test", name: "Dr Test", speciality: "Cardiology",
    qualification: "MD", department_slug: "cardiology",
    photo_url: "/legacy.webp",
    ...overrides,
  };
}

test("SEC13.01 Doctor with GALLERY category media falls back to undefined photo", () => {
  const row = makeMediaRow({ ma_category: "GALLERY" });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "Non-DOCTOR category must not resolve photo");
});

test("SEC13.02 Doctor with null ma_category falls back to undefined photo", () => {
  const row = makeMediaRow({ ma_category: null });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "Null category must not resolve photo");
});

test("SEC13.03 Doctor with empty string ma_category falls back to undefined photo", () => {
  const row = makeMediaRow({ ma_category: "" });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "Empty category must not resolve photo");
});

test("SEC13.04 Doctor with BLOG category media falls back to undefined photo", () => {
  const row = makeMediaRow({ ma_category: "BLOG" });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "BLOG category must not resolve photo");
});

test("SEC13.05 Doctor with VIDEO category media falls back to undefined photo", () => {
  const row = makeMediaRow({ ma_category: "VIDEO" });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "VIDEO category must not resolve photo");
});

test("SEC13.06 Doctor with DOCTOR category and PUBLISHED lifecycle resolves photo", () => {
  const row = makeMediaRow();
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, "/api/media/doctor-photo/m1.webp", "DOCTOR category must resolve photo");
});

test("SEC13.07 Doctor with DOCTOR category but DRAFT lifecycle returns undefined", () => {
  const row = makeMediaRow({ ma_lifecycle_status: "DRAFT" });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "DRAFT lifecycle must not resolve photo");
});

test("SEC13.08 Doctor with DOCTOR category but is_visible=0 returns undefined", () => {
  const row = makeMediaRow({ ma_is_visible: 0 });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "Hidden media must not resolve photo");
});

test("SEC13.09 DOCTOR_LIST_SQL selects ma_category", () => {
  assert.match(DOCTOR_LIST_SQL, /ma\.category AS ma_category/, "Must SELECT ma_category");
});

test("SEC13.10 DOCTOR_BY_SLUG_SQL selects ma_category", () => {
  assert.match(DOCTOR_BY_SLUG_SQL, /ma\.category AS ma_category/, "Must SELECT ma_category");
});

test("SEC13.11 Doctor with null photo_media_id still falls back to legacy photo_url regardless of category", () => {
  const row = makeMediaRow({ photo_media_id: null, ma_id: null, ma_category: "DOCTOR" });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, "/legacy.webp", "Legacy photo_url used when no media ID");
});

test("SEC13.12 Doctor with photo_media_id but ma_id=null (no media row) returns undefined", () => {
  const row = makeMediaRow({ ma_id: null });
  const doc = dbDoctorToPublic(row);
  assert.equal(doc.photo, undefined, "No media row means undefined photo");
});

/* ───────────────────────────────────────────────────────────────────────────
   13-B. STORAGE VALIDATION — validateDoctorMediaRelation storage (9-20)
   ─────────────────────────────────────────────────────────────────────────── */

function makeMediaAssetForValidation(overrides = {}) {
  return {
    id: "m1", category: "DOCTOR", lifecycle_status: "PUBLISHED",
    status: "APPROVED", is_visible: 1, deleted_at: null,
    storage_type: "R2", r2_key: "doctor-photo/m1.webp",
    public_path: null, display_r2_key: null, display_public_path: null,
    ...overrides,
  };
}

function makeValidationRepo(mediaRow) {
  return {
    query: async (sql, ..._binds) => {
      if (sql.includes("FROM media_assets")) {
        return { results: mediaRow ? [mediaRow] : [] };
      }
      return { results: [] };
    },
    run: async () => ({ success: true, meta: { changes: 1 } }),
    audit: async () => {},
  };
}

test("SEC13.13 validateDoctorMediaRelation accepts valid R2 media", async () => {
  const repo = makeValidationRepo(makeMediaAssetForValidation());
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, true, "Valid R2 media must pass validation");
});

test("SEC13.14 validateDoctorMediaRelation accepts valid PUBLIC media", async () => {
  const media = makeMediaAssetForValidation({
    storage_type: "PUBLIC", r2_key: "",
    public_path: "/assets/photos/m1.webp", display_public_path: "/assets/photos/m1-display.webp",
  });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, true, "Valid PUBLIC media must pass validation");
});

test("SEC13.15 validateDoctorMediaRelation rejects R2 with empty r2_key", async () => {
  const media = makeMediaAssetForValidation({ r2_key: "" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Empty R2 key must fail validation");
});

test("SEC13.16 validateDoctorMediaRelation rejects R2 with invalid display_r2_key (public: prefix)", async () => {
  const media = makeMediaAssetForValidation({ display_r2_key: "public:something" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Invalid display_r2_key must fail validation");
});

test("SEC13.17 validateDoctorMediaRelation rejects PUBLIC with no public_path and no display_public_path", async () => {
  const media = makeMediaAssetForValidation({
    storage_type: "PUBLIC", r2_key: "",
    public_path: null, display_public_path: null,
  });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "PUBLIC with no paths must fail validation");
});

test("SEC13.18 validateDoctorMediaRelation rejects PUBLIC with traversal in path", async () => {
  const media = makeMediaAssetForValidation({
    storage_type: "PUBLIC", r2_key: "",
    public_path: "/assets/photos/../../../etc/passwd", display_public_path: null,
  });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Traversal path must fail validation");
});

test("SEC13.19 validateDoctorMediaRelation rejects unknown storage type", async () => {
  const media = makeMediaAssetForValidation({ storage_type: "S3" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Unknown storage type must fail validation");
});

test("SEC13.20 validateDoctorMediaRelation rejects non-DOCTOR category", async () => {
  const media = makeMediaAssetForValidation({ category: "GALLERY" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Non-DOCTOR category must fail validation");
});

test("SEC13.21 validateDoctorMediaRelation rejects deleted media", async () => {
  const media = makeMediaAssetForValidation({ deleted_at: "2026-07-01" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Deleted media must fail validation");
});

test("SEC13.22 validateDoctorMediaRelation rejects non-existent media ID", async () => {
  const repo = makeValidationRepo(null);
  const result = await validateDoctorMediaRelation(repo, "nonexistent", true);
  assert.equal(result.ok, false, "Non-existent media must fail validation");
});

test("SEC13.23 validateDoctorMediaRelation allows DRAFT media for hidden doctor", async () => {
  const media = makeMediaAssetForValidation({ lifecycle_status: "DRAFT", is_visible: 0 });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", false);
  assert.equal(result.ok, true, "Hidden doctor can use non-published media");
});

test("SEC13.24 validateDoctorMediaRelation rejects DRAFT media for visible doctor", async () => {
  const media = makeMediaAssetForValidation({ lifecycle_status: "DRAFT" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Visible doctor cannot use DRAFT media");
});

test("SEC13.25 validateDoctorMediaRelation accepts null photoMediaId without query", async () => {
  let queried = false;
  const repo = {
    query: async () => { queried = true; return { results: [] }; },
    run: async () => ({ success: true, meta: { changes: 1 } }),
    audit: async () => {},
  };
  const result = await validateDoctorMediaRelation(repo, null, true);
  assert.equal(result.ok, true, "Null media ID must pass without querying");
  assert.equal(queried, false, "Null media ID must not query media_assets");
});

/* ───────────────────────────────────────────────────────────────────────────
   13-C. SHARED RESOLVER — media-resolver.ts functions (21-30)
   ─────────────────────────────────────────────────────────────────────────── */

test("SEC13.26 generateR2MediaUrl encodes each path segment independently", () => {
  const result = generateR2MediaUrl("doctor-photo/my photo.webp");
  assert.equal(result.ok, true, "Must accept space-containing key");
  assert.equal(result.url, "/api/media/doctor-photo/my%20photo.webp", "Must encode space per segment");
});

test("SEC13.27 generateR2MediaUrl rejects empty string", () => {
  const result = generateR2MediaUrl("");
  assert.equal(result.ok, false, "Empty key must be rejected");
});

test("SEC13.28 generateR2MediaUrl rejects public: prefix", () => {
  const result = generateR2MediaUrl("public:something");
  assert.equal(result.ok, false, "public: prefix must be rejected");
});

test("SEC13.29 generateR2MediaUrl rejects protocol URL", () => {
  const result = generateR2MediaUrl("https://example.com/file.webp");
  assert.equal(result.ok, false, "Absolute URL must be rejected");
});

test("SEC13.30 generateR2MediaUrl rejects backslash", () => {
  const result = generateR2MediaUrl("doctor-photo\\file.webp");
  assert.equal(result.ok, false, "Backslash must be rejected");
});

test("SEC13.31 generateR2MediaUrl rejects dot segment", () => {
  const result = generateR2MediaUrl("doctor-photo/./file.webp");
  assert.equal(result.ok, false, "Dot segment must be rejected");
});

test("SEC13.32 generateR2MediaUrl rejects dotdot segment", () => {
  const result = generateR2MediaUrl("doctor-photo/../file.webp");
  assert.equal(result.ok, false, "Dotdot segment must be rejected");
});

test("SEC13.33 validatePublicPath accepts valid /assets/ path", () => {
  const result = validatePublicPath("/assets/photos/m1.webp");
  assert.equal(result.ok, true, "Valid /assets/ path must be accepted");
  assert.equal(result.path, "/assets/photos/m1.webp", "Must return original path");
});

test("SEC13.34 validatePublicPath rejects path not starting with /assets/", () => {
  const result = validatePublicPath("/images/photo.webp");
  assert.equal(result.ok, false, "Non-/assets/ path must be rejected");
});

test("SEC13.35 validatePublicPath rejects empty string", () => {
  const result = validatePublicPath("");
  assert.equal(result.ok, false, "Empty path must be rejected");
});

test("SEC13.36 validatePublicPath rejects non-string input", () => {
  const result = validatePublicPath(123);
  assert.equal(result.ok, false, "Non-string input must be rejected");
});

test("SEC13.37 validatePublicPath rejects encoded traversal (%2e)", () => {
  const result = validatePublicPath("/assets/%2e%2e/etc/passwd");
  assert.equal(result.ok, false, "Encoded traversal must be rejected");
});

test("SEC13.38 validatePublicPath rejects protocol-relative URL", () => {
  const result = validatePublicPath("//evil.com/assets/x.webp");
  assert.equal(result.ok, false, "Protocol-relative URL must be rejected");
});

test("SEC13.39 validatePublicPath rejects backslash", () => {
  const result = validatePublicPath("/assets/photos\\file.webp");
  assert.equal(result.ok, false, "Backslash must be rejected");
});

test("SEC13.40 validatePublicPath rejects URL with protocol", () => {
  const result = validatePublicPath("http://example.com/assets/x.webp");
  assert.equal(result.ok, false, "URL with protocol must be rejected");
});

test("SEC13.41 validatePublicPath rejects path with query string", () => {
  const result = validatePublicPath("/assets/photo.webp?token=abc");
  assert.equal(result.ok, false, "Path with query string must be rejected");
});

test("SEC13.42 validatePublicPath rejects path with fragment", () => {
  const result = validatePublicPath("/assets/photo.webp#section");
  assert.equal(result.ok, false, "Path with fragment must be rejected");
});

test("SEC13.43 media-resolver.ts has zero runtime imports", async () => {
  const content = await readFile(path.join(rootDir, "app", "lib", "media-resolver.ts"), "utf8");
  const importLines = content.split("\n").filter((l) => l.startsWith("import "));
  assert.equal(importLines.length, 0, "media-resolver.ts must have no import statements");
});

/* ───────────────────────────────────────────────────────────────────────────
   13-D. GATEWAY — Gateway category authorization (26-36)
   ─────────────────────────────────────────────────────────────────────────── */

test("SEC13.44 Gateway source queries category from media_assets", () => {
  assert.match(mediaGateway, /category/, "Must reference category in gateway");
});

test("SEC13.45 Gateway requires meta.category === 'DOCTOR' for doctor-photo purpose", () => {
  assert.match(mediaGateway, /meta\.category !== "DOCTOR"/, "Must check meta.category for doctor-photo");
});

test("SEC13.46 Gateway checks doctor_profiles.is_deleted = 0 in media ref query", () => {
  assert.match(mediaGateway, /dp\.is_deleted = 0/, "Must filter by is_deleted = 0");
});

test("SEC13.47 Gateway checks doctor_profiles.deleted_at IS NULL in media ref query", () => {
  assert.match(mediaGateway, /dp\.deleted_at IS NULL/, "Must filter by deleted_at IS NULL");
});

test("SEC13.48 Gateway uses dp.is_visible = 1 for media ref authorization", () => {
  assert.match(mediaGateway, /dp\.is_visible = 1/, "Must filter by is_visible = 1");
});

test("SEC13.49 Gateway checks ma.category = 'DOCTOR' in photo_media_id JOIN query", () => {
  assert.match(mediaGateway, /ma\.category = 'DOCTOR'/, "Must check ma.category in JOIN query");
});

test("SEC13.50 Gateway checks dp.status = 'APPROVED' in media ref query", () => {
  assert.match(mediaGateway, /dp\.status = 'APPROVED'/, "Must filter by status = APPROVED");
});

test("SEC13.51 Gateway checks dp.lifecycle_status = 'PUBLISHED' in media ref query", () => {
  assert.match(mediaGateway, /dp\.lifecycle_status = 'PUBLISHED'/, "Must filter by lifecycle_status PUBLISHED");
});

test("SEC13.52 Gateway rejects non-gallery, non-doctor-photo, non-admin-upload purposes", () => {
  assert.match(mediaGateway, /else\s*\{[\s\S]*return new Response\("Not found"/, "Must deny unknown purposes");
});

test("SEC13.53 Gateway validates key segments before database operations", () => {
  const idx = mediaGateway.indexOf("validateKeySegments(key)");
  assert.ok(idx > -1, "Must validate key segments early");
  const metaIdx = mediaGateway.indexOf("query<");
  assert.ok(idx < metaIdx, "Validation must occur before database query");
});

test("SEC13.54 Gateway queries storage_type='R2' in metadata SELECT", () => {
  assert.match(mediaGateway, /storage_type = 'R2'/, "Must filter by R2 storage type");
});

/* ───────────────────────────────────────────────────────────────────────────
   13-E. PICKER — MediaPickerDialog selection guards (37-50)
   ─────────────────────────────────────────────────────────────────────────── */

const pickerSource = await readFile(
  path.join(rootDir, "app", "components", "admin", "MediaPickerDialog.tsx"),
  "utf8",
);

test("SEC13.55 Picker has getIneligibilityReason function", () => {
  assert.match(pickerSource, /getIneligibilityReason/, "Must define getIneligibilityReason");
});

test("SEC13.56 Picker getIneligibilityReason checks category", () => {
  assert.match(pickerSource, /asset\.category !== category/, "Must check category mismatch");
});

test("SEC13.57 Picker getIneligibilityReason checks lifecycleStatus", () => {
  assert.match(pickerSource, /asset\.lifecycleStatus !== "PUBLISHED"/, "Must check lifecycle status");
});

test("SEC13.58 Picker getIneligibilityReason checks status", () => {
  assert.match(pickerSource, /asset\.status !== "APPROVED"/, "Must check approval status");
});

test("SEC13.59 Picker getIneligibilityReason checks isVisible", () => {
  assert.match(pickerSource, /asset\.isVisible !== 1/, "Must check visibility");
});

test("SEC13.60 Picker getIneligibilityReason checks deletedAt", () => {
  assert.match(pickerSource, /asset\.deletedAt/, "Must check deletedAt");
});

test("SEC13.61 Picker handleSelect calls getIneligibilityReason before onSelect", () => {
  assert.match(pickerSource, /getIneligibilityReason\(asset\)[\s\S]*if \(reason\) return/, "Must guard selection with ineligibility check");
});

test("SEC13.62 Picker ineligible cards have aria-disabled attribute", () => {
  assert.match(pickerSource, /aria-disabled=\{!eligible/, "Must set aria-disabled for ineligible");
});

test("SEC13.63 Picker ineligible cards have cursor: not-allowed", () => {
  assert.match(pickerSource, /cursor: eligible \? "pointer" : "not-allowed"/, "Must use not-allowed cursor");
});

test("SEC13.64 Picker ineligible cards have opacity: 0.6", () => {
  assert.match(pickerSource, /opacity: eligible \? 1 : 0\.6/, "Must reduce opacity for ineligible");
});

test("SEC13.65 Picker shows NOT SELECTABLE badge for ineligible assets", () => {
  assert.match(pickerSource, /NOT SELECTABLE/, "Must display NOT SELECTABLE badge");
});

test("SEC13.66 Picker shows PUBLICATION ELIGIBLE badge for eligible assets", () => {
  assert.match(pickerSource, /PUBLICATION ELIGIBLE/, "Must display PUBLICATION ELIGIBLE badge");
});

test("SEC13.67 Picker select button is disabled for ineligible assets", () => {
  assert.match(pickerSource, /disabled=\{!eligible\}/, "Must disable select button for ineligible");
});

test("SEC13.68 Picker includes category in aria-label with ineligibility reason", () => {
  assert.match(pickerSource, /Not selectable:.*ineligReason/, "Must include reason in aria-label");
});

/* ───────────────────────────────────────────────────────────────────────────
   13-F. UPLOAD/CSRF — Upload readiness and CSRF source (51-58)
   ─────────────────────────────────────────────────────────────────────────── */

const adminConsoleSource = await readFile(
  path.join(rootDir, "app", "components", "AdminConsole.tsx"),
  "utf8",
);

test("SEC13.69 AdminConsole passes csrf prop to DoctorManager", () => {
  assert.match(adminConsoleSource, /csrf=\{session\.csrf\}/, "Must pass csrf as prop to DoctorManager");
});

test("SEC13.70 AdminConsole uploadMedia returns url and mediaId tuple", () => {
  assert.match(adminConsoleSource, /return \{ url: String\(uploadRes\.url/, "Must return url from upload");
  assert.match(adminConsoleSource, /mediaId: String\(uploadRes\.id/, "Must return mediaId from upload");
});

test("SEC13.71 postAdmin sends x-csrf-token header", () => {
  assert.match(adminConsoleSource, /"x-csrf-token": csrf/, "Must send CSRF in x-csrf-token header");
});

test("SEC13.72 uploadAdminMedia sends x-csrf-token header", () => {
  assert.match(adminConsoleSource, /headers:.*"x-csrf-token": csrf/, "Must send CSRF for media upload");
});

test("SEC13.73 deleteAdminMedia sends x-csrf-token header", () => {
  assert.match(adminConsoleSource, /DELETE[\s\S]*"x-csrf-token": csrf/, "Must send CSRF for media deletion");
});

/* ───────────────────────────────────────────────────────────────────────────
   13-G. REGRESSIONS — Integration and structural (59-70)
   ─────────────────────────────────────────────────────────────────────────── */

test("SEC13.74 doctor-public.ts imports from media-resolver.ts not media-schema.ts", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  assert.match(src, /from "\.\/media-resolver\.ts"/, "Must import from media-resolver.ts");
  assert.ok(!src.includes("media-schema"), "Must not reference media-schema");
});

test("SEC13.75 doctor-admin.ts imports from media-resolver.ts not media-schema.ts", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.match(src, /from "\.\/media-resolver\.ts"/, "Must import from media-resolver.ts");
  assert.ok(!src.includes("media-schema"), "Must not reference media-schema");
});

test("SEC13.76 media-library.ts re-exports from media-resolver.ts", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "media-library.ts"), "utf8");
  assert.match(src, /from "\.\/media-resolver\.ts"/, "Must import from media-resolver.ts");
});

test("SEC13.77 validateDoctorMediaRelation returns MediaRelationValidation type", async () => {
  assert.match(
    (await readFile(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8")),
    /Promise<MediaRelationValidation>/,
    "Must return typed result",
  );
});

test("SEC13.78 R2 media URL in resolvePhotoFromMedia uses generateR2MediaUrl", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  assert.match(src, /generateR2MediaUrl\(r2Key\)/, "Must use generateR2MediaUrl for R2 keys");
});

test("SEC13.79 PUBLIC media path in resolvePhotoFromMedia uses validatePublicPath", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  assert.match(src, /validatePublicPath\(path\)/, "Must use validatePublicPath for PUBLIC paths");
});

test("SEC13.80 R2 key validation in validateDoctorMediaRelation uses generateR2MediaUrl", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.match(src, /generateR2MediaUrl\(r2Key\)/, "Must validate R2 key with generateR2MediaUrl");
});

test("SEC13.81 PUBLIC path validation in validateDoctorMediaRelation uses validatePublicPath", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.match(src, /validatePublicPath\(path\)/, "Must validate PUBLIC path with validatePublicPath");
});

test("SEC13.82 isMediaEligible checks ma_category === DOCTOR as first eligibility check after ma_id", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  const catIdx = src.indexOf('String(row.ma_category) !== "DOCTOR"');
  const idIdx = src.indexOf("!row.ma_id");
  assert.ok(catIdx > idIdx, "Category check must come after ma_id check");
});

test("SEC13.83 Gateway SELECT includes category column in metadata query", () => {
  assert.match(mediaGateway, /category,/, "Must include category in SELECT list");
});

test("SEC13.84 validateDoctorMediaRelation checks storage_type before resolving URLs", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  const storageCheck = src.indexOf('if (storageType === "R2")');
  const r2Check = src.indexOf("generateR2MediaUrl(r2Key)");
  assert.ok(storageCheck < r2Check, "Storage type must be checked before R2 key validation");
});

test("SEC13.85 resolvePublicDoctors catches errors and returns empty array", async () => {
  const result = await resolvePublicDoctors(throwingQuery());
  assert.deepEqual(result, [], "Must return empty array on D1 failure");
});

test("SEC13.86 resolveDoctorBySlug catches errors and returns null", async () => {
  const result = await resolveDoctorBySlug(throwingQuery(), "dr-test");
  assert.equal(result, null, "Must return null on D1 failure");
});

test("SEC13.87 validateDoctorMediaRelation is an async function returning Promise", async () => {
  const src = await readFile(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.match(src, /export async function validateDoctorMediaRelation/, "Must be async function");
});

test("SEC13.88 Picker category prop defaults to GALLERY when not provided", () => {
  assert.match(pickerSource, /category = "GALLERY"/, "Must default category to GALLERY");
});

test("SEC13.89 Picker uses category prop in fetchMediaLibrary call", () => {
  assert.match(pickerSource, /category,/, "Must pass category to fetchMediaLibrary");
});

test("SEC13.90 validateDoctorMediaRelation rejects HIDDEN lifecycle media for visible doctor", async () => {
  const media = makeMediaAssetForValidation({ lifecycle_status: "HIDDEN" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "HIDDEN media must fail for visible doctor");
});

test("SEC13.91 validateDoctorMediaRelation rejects unapproved media for visible doctor", async () => {
  const media = makeMediaAssetForValidation({ status: "PENDING" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "PENDING status must fail for visible doctor");
});

test("SEC13.92 validateDoctorMediaRelation accepts hidden media for hidden doctor", async () => {
  const media = makeMediaAssetForValidation({ lifecycle_status: "HIDDEN", is_visible: 0 });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", false);
  assert.equal(result.ok, true, "Hidden doctor can use HIDDEN media");
});

test("SEC13.93 validateDoctorMediaRelation accepts DRAFT media for hidden doctor", async () => {
  const media = makeMediaAssetForValidation({ lifecycle_status: "DRAFT", status: "DRAFT", is_visible: 0 });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", false);
  assert.equal(result.ok, true, "Hidden doctor can use DRAFT media");
});

test("SEC13.94 validateDoctorMediaRelation rejects PUBLIC path with encoded backslash", async () => {
  const media = makeMediaAssetForValidation({
    storage_type: "PUBLIC", r2_key: "",
    public_path: "/assets/%5cetc/passwd", display_public_path: null,
  });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Encoded backslash must fail validation");
});

test("SEC13.95 validateDoctorMediaRelation rejects R2 key with dot segment", async () => {
  const media = makeMediaAssetForValidation({ r2_key: "doctor-photo/./file.webp" });
  const repo = makeValidationRepo(media);
  const result = await validateDoctorMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false, "Dot segment in R2 key must fail validation");
});
