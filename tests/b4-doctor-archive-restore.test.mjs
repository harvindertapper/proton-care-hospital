import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  resolvePublicDoctors,
  resolveDoctorBySlug,
  DOCTOR_LIST_SQL,
  DOCTOR_BY_SLUG_SQL,
} from "../app/lib/doctor-public.ts";
import {
  resolveDoctorManagerRows,
  ACTIVE_DOCTORS_ADMIN_SQL,
  ARCHIVED_DOCTORS_ADMIN_SQL,
  archiveDoctor,
  restoreDoctor,
  createDoctor,
  updateDoctor,
  loadDoctor,
  assertNotArchivedForEdit,
  deriveLifecycleFromVisibility,
  ARCHIVED_SAVE_ERROR,
  parseExpectedVersion,
  throwInvalidExpectedVersion,
} from "../app/lib/doctor-admin.ts";
import { MutationConflictError, MutationNotFoundError, executeRoleMutation } from "../app/lib/mutation-result.ts";

const PUBLISHED_ROW = {
  id: "d1", slug: "dr-a", name: "Dr A", lifecycle_status: "PUBLISHED",
  version: 1, deleted_at: null, status: "APPROVED", is_visible: 1, is_deleted: 0,
  speciality: "Cardiology", qualification: "MD", department_slug: "cardiology",
  photo_url: "", profile_note: "", blocked_dates: "",
};
const ARCHIVED_ROW = {
  id: "d2", slug: "dr-b", name: "Dr B", lifecycle_status: "ARCHIVED",
  version: 3, deleted_at: "2026-07-20 10:00:00", status: "HIDDEN",
  is_visible: 0, is_deleted: 1, speciality: "Neurology", qualification: "DM",
  department_slug: "neurology", photo_url: "", profile_note: "", blocked_dates: "",
};
const HIDDEN_ROW = {
  id: "d3", slug: "dr-c", name: "Dr C", lifecycle_status: "HIDDEN",
  version: 2, deleted_at: null, status: "HIDDEN", is_visible: 0, is_deleted: 0,
  speciality: "Ortho", qualification: "MS", department_slug: "orthopaedics",
  photo_url: "", profile_note: "", blocked_dates: "",
};

function makeRepo({ rows = [] } = {}) {
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
          profile_note: binds[7], status: binds[8], is_visible: binds[9],
          approved_by: binds[10], blocked_dates: binds[11] || "",
          is_deleted: binds[12], lifecycle_status: binds[13], version: 1,
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
      matchBySlug.lifecycle_status = binds[11];
      matchBySlug.status = binds[8];
      matchBySlug.is_visible = binds[9];
      matchBySlug.is_deleted = binds[10];
      matchBySlug.deleted_at = null;
    }
    return { success: true, meta: { changes: 1 } };
  };
  const audit = async (...args) => { auditCalls.push(args); };
  return { repo: { query, run, audit }, getAuditCalls: () => auditCalls, db };
}

function fields(overrides = {}) {
  return {
    name: "Dr New", speciality: "Cardiology", qualification: "MD",
    departmentSlug: "cardiology", photoUrl: "", profileNote: "",
    blockedDates: "", isVisible: true, ...overrides,
  };
}

test("1. New visible Doctor: PUBLISHED/APPROVED/visible/version 1/deleted_at null", async () => {
  const { repo, db } = makeRepo({});
  const result = await createDoctor(repo, "dr-new", fields({ isVisible: true }), "admin@x");
  assert.equal(result.outcome, "APPLIED");
  const doc = db.get("dr-new");
  assert.equal(doc.lifecycle_status, "PUBLISHED");
  assert.equal(doc.status, "APPROVED");
  assert.equal(doc.is_visible, 1);
  assert.equal(doc.is_deleted, 0);
  assert.equal(doc.version, 1);
  assert.equal(doc.deleted_at, null);
});

test("2. New hidden Doctor: HIDDEN status/invisible/version 1", async () => {
  const { repo, db } = makeRepo({});
  const result = await createDoctor(repo, "dr-hidden", fields({ isVisible: false }), "admin@x");
  assert.equal(result.outcome, "APPLIED");
  const doc = db.get("dr-hidden");
  assert.equal(doc.lifecycle_status, "HIDDEN");
  assert.equal(doc.status, "HIDDEN");
  assert.equal(doc.is_visible, 0);
  assert.equal(doc.is_deleted, 0);
  assert.equal(doc.version, 1);
});

test("3. Existing visible save: expectedVersion required, version increments once", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [PUBLISHED_ROW] });
  const result = await updateDoctor(repo, "dr-a", 1, fields(), "admin@x");
  assert.equal(result.outcome, "APPLIED");
  assert.equal(db.get("dr-a").version, 2);
  assert.equal(getAuditCalls().length, 1);
  assert.equal(getAuditCalls()[0][1], "DOCTOR_APPROVED");
});

test("4. Existing hidden save: lifecycle HIDDEN, version increments once", async () => {
  const { repo, db } = makeRepo({ rows: [HIDDEN_ROW] });
  const result = await updateDoctor(repo, "dr-c", 2, fields({ isVisible: false }), "admin@x");
  assert.equal(result.outcome, "APPLIED");
  assert.equal(db.get("dr-c").version, 3);
  assert.equal(db.get("dr-c").lifecycle_status, "HIDDEN");
});

test("5. Existing save without expectedVersion: rejected", async () => {
  const { repo } = makeRepo({ rows: [PUBLISHED_ROW] });
  await assert.rejects(
    () => updateDoctor(repo, "dr-a", 0, fields(), "admin@x"),
    (e) => e instanceof MutationConflictError,
  );
});

test("6. Stale existing save: CONFLICT, no mutation, no audit", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [{ ...PUBLISHED_ROW, version: 5 }] });
  await assert.rejects(
    () => updateDoctor(repo, "dr-a", 3, fields(), "admin@x"),
    (e) => e instanceof MutationConflictError && e.code === "CONFLICT",
  );
  assert.equal(db.get("dr-a").version, 5);
  assert.equal(getAuditCalls().length, 0);
});

test("7. Archived save: exact archived-save error, no mutation, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ rows: [ARCHIVED_ROW] });
  await assert.rejects(
    () => updateDoctor(repo, "dr-b", 3, fields(), "admin@x"),
    (e) => e.message === ARCHIVED_SAVE_ERROR,
  );
  assert.equal(getAuditCalls().length, 0);
});

test("8. Archive success: ARCHIVED/HIDDEN/invisible/deleted/deleted_at set/version increments", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [{ ...PUBLISHED_ROW, version: 2 }] });
  const result = await archiveDoctor(repo, "dr-a", 2, "admin@x");
  assert.equal(result.outcome, "APPLIED");
  const doc = db.get("dr-a");
  assert.equal(doc.lifecycle_status, "ARCHIVED");
  assert.equal(doc.status, "HIDDEN");
  assert.equal(doc.is_visible, 0);
  assert.equal(doc.is_deleted, 1);
  assert.ok(doc.deleted_at);
  assert.equal(doc.version, 3);
  assert.equal(getAuditCalls()[0][1], "DOCTOR_ARCHIVED");
});

test("9. Stale archive: CONFLICT, no audit", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [{ ...PUBLISHED_ROW, version: 5 }] });
  await assert.rejects(
    () => archiveDoctor(repo, "dr-a", 2, "admin@x"),
    (e) => e instanceof MutationConflictError,
  );
  assert.equal(db.get("dr-a").version, 5);
  assert.equal(getAuditCalls().length, 0);
});

test("10. Already archived archive: NOT_FOUND, no false success, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ rows: [ARCHIVED_ROW] });
  await assert.rejects(
    () => archiveDoctor(repo, "dr-b", 3, "admin@x"),
    (e) => e.code === "NOT_FOUND",
  );
  assert.equal(getAuditCalls().length, 0);
});

test("11. Restore success: HIDDEN/invisible/not-deleted/deleted_at null/version increments", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [{ ...ARCHIVED_ROW, version: 3 }] });
  const result = await restoreDoctor(repo, "dr-b", 3, "admin@x");
  assert.equal(result.outcome, "APPLIED");
  const doc = db.get("dr-b");
  assert.equal(doc.lifecycle_status, "HIDDEN");
  assert.equal(doc.status, "HIDDEN");
  assert.equal(doc.is_visible, 0);
  assert.equal(doc.is_deleted, 0);
  assert.equal(doc.deleted_at, null);
  assert.equal(doc.version, 4);
  assert.equal(getAuditCalls()[0][1], "DOCTOR_RESTORED_TO_HIDDEN");
});

test("12. Stale restore: CONFLICT, no audit", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [{ ...ARCHIVED_ROW, version: 5 }] });
  await assert.rejects(
    () => restoreDoctor(repo, "dr-b", 2, "admin@x"),
    (e) => e instanceof MutationConflictError,
  );
  assert.equal(db.get("dr-b").version, 5);
  assert.equal(getAuditCalls().length, 0);
});

test("13. Restore active row: NOT_FOUND, no false success, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ rows: [PUBLISHED_ROW] });
  await assert.rejects(
    () => restoreDoctor(repo, "dr-a", 1, "admin@x"),
    (e) => e.code === "NOT_FOUND",
  );
  assert.equal(getAuditCalls().length, 0);
});

test("14. Missing Doctor: NOT_FOUND", async () => {
  const { repo } = makeRepo({});
  await assert.rejects(
    () => updateDoctor(repo, "dr-missing", 1, fields(), "admin@x"),
    (e) => e.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => archiveDoctor(repo, "dr-missing", 1, "admin@x"),
    (e) => e.code === "NOT_FOUND",
  );
});

test("15. Staff save: revision created, Doctor not mutated", async () => {
  let applied = false;
  const result = await executeRoleMutation({
    isStaff: true,
    createRevision: async () => ({ id: "r1" }),
    applyMutation: async () => { applied = true; return { outcome: "APPLIED" }; },
  });
  assert.equal(result.outcome, "PENDING_APPROVAL");
  assert.equal(applied, false);
});

test("16. Staff archive: revision created, Doctor not mutated", async () => {
  let applied = false;
  const result = await executeRoleMutation({
    isStaff: true,
    createRevision: async () => ({ id: "r2" }),
    applyMutation: async () => { applied = true; return { outcome: "APPLIED" }; },
  });
  assert.equal(result.outcome, "PENDING_APPROVAL");
  assert.equal(applied, false);
});

test("17. Staff restore: revision created, Doctor not mutated", async () => {
  let applied = false;
  const result = await executeRoleMutation({
    isStaff: true,
    createRevision: async () => ({ id: "r3" }),
    applyMutation: async () => { applied = true; return { outcome: "APPLIED" }; },
  });
  assert.equal(result.outcome, "PENDING_APPROVAL");
  assert.equal(applied, false);
});

test("18. Revision approval with unchanged version: mutation applied, version increments", async () => {
  const { repo, db } = makeRepo({ rows: [{ ...PUBLISHED_ROW, version: 1 }] });
  const result = await updateDoctor(repo, "dr-a", 1, fields(), "reviewer@x");
  assert.equal(result.outcome, "APPLIED");
  assert.equal(db.get("dr-a").version, 2);
});

test("19. Revision approval after intervening change: CONFLICT, Doctor not overwritten", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [{ ...PUBLISHED_ROW, version: 4 }] });
  await assert.rejects(
    () => updateDoctor(repo, "dr-a", 1, fields(), "reviewer@x"),
    (e) => e instanceof MutationConflictError,
  );
  assert.equal(db.get("dr-a").version, 4);
  assert.equal(getAuditCalls().length, 0);
});

test("20. Super Admin: direct guarded mutation", async () => {
  const { repo, db } = makeRepo({ rows: [PUBLISHED_ROW] });
  const result = await executeRoleMutation({
    isStaff: false,
    createRevision: async () => ({ id: "unused" }),
    applyMutation: async () => updateDoctor(repo, "dr-a", 1, fields(), "super@x"),
  });
  assert.equal(result.outcome, "APPLIED");
  assert.equal(db.get("dr-a").version, 2);
});

test("21. Admin active query: excludes lifecycle ARCHIVED and is_deleted=1", () => {
  assert.ok(ACTIVE_DOCTORS_ADMIN_SQL.includes("lifecycle_status != 'ARCHIVED'"));
  assert.ok(ACTIVE_DOCTORS_ADMIN_SQL.includes("is_deleted = 0"));
});

test("22. Admin archived query: requires ARCHIVED and is_deleted=1, returns version/deleted_at", () => {
  assert.ok(ARCHIVED_DOCTORS_ADMIN_SQL.includes("lifecycle_status = 'ARCHIVED'"));
  assert.ok(ARCHIVED_DOCTORS_ADMIN_SQL.includes("is_deleted = 1"));
  assert.ok(ARCHIVED_DOCTORS_ADMIN_SQL.includes("version"));
  assert.ok(ARCHIVED_DOCTORS_ADMIN_SQL.includes("deleted_at"));
});

test("23. Active manager defense: excludes either canonical or legacy archived rows", () => {
  const active = resolveDoctorManagerRows([PUBLISHED_ROW, ARCHIVED_ROW, HIDDEN_ROW]);
  assert.equal(active.length, 2);
  assert.ok(active.some((r) => r.slug === "dr-a"));
  assert.ok(active.some((r) => r.slug === "dr-c"));
  assert.ok(!active.some((r) => r.slug === "dr-b"));
});

test("24. UI payload: existing save carries expectedVersion, archive carries expectedVersion", async () => {
  const { repo, db } = makeRepo({ rows: [PUBLISHED_ROW] });
  const result = await updateDoctor(repo, "dr-a", 1, fields(), "admin@x");
  assert.equal(result.outcome, "APPLIED");
  assert.equal(db.get("dr-a").version, 2);
  const archiveResult = await archiveDoctor(repo, "dr-a", 2, "admin@x");
  assert.equal(archiveResult.outcome, "APPLIED");
  assert.equal(db.get("dr-a").lifecycle_status, "ARCHIVED");
});

test("25. Public list: only lifecycle PUBLISHED + legacy public conditions", () => {
  assert.ok(DOCTOR_LIST_SQL.includes("lifecycle_status = 'PUBLISHED'"));
  assert.ok(DOCTOR_LIST_SQL.includes("status = 'APPROVED'"));
  assert.ok(DOCTOR_LIST_SQL.includes("is_visible = 1"));
  assert.ok(DOCTOR_LIST_SQL.includes("is_deleted = 0"));
  assert.ok(DOCTOR_LIST_SQL.includes("deleted_at IS NULL"));
});

test("26. Public detail: same filters", () => {
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("lifecycle_status = 'PUBLISHED'"));
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("status = 'APPROVED'"));
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("is_visible = 1"));
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("is_deleted = 0"));
  assert.ok(DOCTOR_BY_SLUG_SQL.includes("deleted_at IS NULL"));
});

test("27. Public mismatch: lifecycle PUBLISHED but legacy hidden excluded; legacy approved but lifecycle HIDDEN excluded; ARCHIVED excluded; deleted_at non-null excluded", async () => {
  const mismatchLifecycle = {
    slug: "dr-x", name: "Dr X", speciality: "X", qualification: "", department_slug: "cardiology", photo_url: "",
    lifecycle_status: "PUBLISHED", status: "HIDDEN", is_visible: 0, is_deleted: 0,
  };
  const mismatchLegacy = {
    slug: "dr-y", name: "Dr Y", speciality: "Y", qualification: "", department_slug: "cardiology", photo_url: "",
    lifecycle_status: "HIDDEN", status: "APPROVED", is_visible: 1, is_deleted: 0,
  };
  const archived = {
    slug: "dr-z", name: "Dr Z", speciality: "Z", qualification: "", department_slug: "cardiology", photo_url: "",
    lifecycle_status: "ARCHIVED", status: "HIDDEN", is_visible: 0, is_deleted: 1,
  };
  const deletedAt = {
    slug: "dr-w", name: "Dr W", speciality: "W", qualification: "", department_slug: "cardiology", photo_url: "",
    lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, is_deleted: 0, deleted_at: "2026-07-20",
  };

  const listSql = DOCTOR_LIST_SQL.toLowerCase();
  assert.ok(listSql.includes("lifecycle_status = 'published'"));
  assert.ok(listSql.includes("status = 'approved'"));
  assert.ok(listSql.includes("is_visible = 1"));
  assert.ok(listSql.includes("is_deleted = 0"));
  assert.ok(listSql.includes("deleted_at is null"));

  for (const row of [mismatchLifecycle, mismatchLegacy, archived, deletedAt]) {
    const visible = await resolveDoctorBySlug(async (sql, _slug) => {
      if (sql.includes("lifecycle_status = 'PUBLISHED'") && row.lifecycle_status !== "PUBLISHED") return { results: [] };
      if (sql.includes("status = 'APPROVED'") && row.status !== "APPROVED") return { results: [] };
      if (sql.includes("is_visible = 1") && row.is_visible !== 1) return { results: [] };
      if (sql.includes("is_deleted = 0") && row.is_deleted !== 0) return { results: [] };
      if (sql.includes("deleted_at IS NULL") && row.deleted_at != null) return { results: [] };
      return { results: [row] };
    }, row.slug);
    assert.equal(visible, null, `${row.slug} should be excluded from public`);
  }
});

test("28. Public empty/error: []/null, no static fallback", async () => {
  assert.deepEqual(await resolvePublicDoctors(async () => ({ results: [] })), []);
  assert.deepEqual(await resolvePublicDoctors(async () => { throw new Error("x"); }), []);
  assert.equal(await resolveDoctorBySlug(async () => ({ results: [] }), "x"), null);
  assert.equal(await resolveDoctorBySlug(async () => { throw new Error("x"); }, "x"), null);
});

test("29. Appointment department contract preserved", async () => {
  const { readFile: rf } = await import("node:fs/promises");
  const publicData = await rf(new URL("../app/lib/public-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(publicData, /\[slug\]/);
});

test("30. Migration integrity: 0000/0001/0002 unchanged, no 0003", async () => {
  const migration0002 = await readFile(new URL("../migrations/0002_add_content_lifecycle_foundation.sql", import.meta.url), "utf8");
  assert.ok(migration0002.includes("lifecycle_status"));
  assert.ok(migration0002.includes("version"));
  assert.ok(migration0002.includes("deleted_at"));
  assert.ok(migration0002.includes("ALTER TABLE doctor_profiles"));
  await assert.rejects(
    readFile(new URL("../migrations/0003.sql", import.meta.url), "utf8"),
    { code: "ENOENT" },
  );
});

test("loadDoctor returns full lifecycle fields", async () => {
  const { repo } = makeRepo({ rows: [PUBLISHED_ROW] });
  const doc = await loadDoctor(repo, "dr-a");
  assert.ok(doc);
  assert.equal(doc.lifecycle_status, "PUBLISHED");
  assert.equal(doc.version, 1);
  assert.equal(doc.deleted_at, null);
  assert.equal(doc.is_deleted, 0);
});

test("loadDoctor returns null for missing", async () => {
  const { repo } = makeRepo({});
  assert.equal(await loadDoctor(repo, "dr-missing"), null);
});

test("deriveLifecycleFromVisibility visible -> PUBLISHED/APPROVED/1/0", () => {
  const result = deriveLifecycleFromVisibility(true);
  assert.deepEqual(result, { lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, is_deleted: 0 });
});

test("deriveLifecycleFromVisibility hidden -> HIDDEN/HIDDEN/0/0", () => {
  const result = deriveLifecycleFromVisibility(false);
  assert.deepEqual(result, { lifecycle_status: "HIDDEN", status: "HIDDEN", is_visible: 0, is_deleted: 0 });
});

test("assertNotArchivedForEdit rejects archived by lifecycle_status", async () => {
  const { repo } = makeRepo({ rows: [ARCHIVED_ROW] });
  await assert.rejects(
    () => assertNotArchivedForEdit(repo, "dr-b"),
    (e) => e.message === ARCHIVED_SAVE_ERROR,
  );
});

test("assertNotArchivedForEdit allows active", async () => {
  const { repo } = makeRepo({ rows: [PUBLISHED_ROW] });
  await assert.doesNotReject(() => assertNotArchivedForEdit(repo, "dr-a"));
});

test("B4.1 regression: public empty/error returns []/null, no static fallback", async () => {
  assert.deepEqual(await resolvePublicDoctors(async () => ({ results: [] })), []);
  assert.deepEqual(await resolvePublicDoctors(async () => { throw new Error("x"); }), []);
  assert.equal(await resolveDoctorBySlug(async () => ({ results: [] }), "x"), null);
  assert.equal(await resolveDoctorBySlug(async () => { throw new Error("x"); }, "x"), null);
});

test("source wiring guard: page.tsx and route.ts reference the SQL constants", async () => {
  const [pageSrc, routeSrc] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8"),
  ]);
  for (const src of [pageSrc, routeSrc]) {
    assert.ok(src.includes("ACTIVE_DOCTORS_ADMIN_SQL"), "source must reference ACTIVE_DOCTORS_ADMIN_SQL");
    assert.ok(src.includes("ARCHIVED_DOCTORS_ADMIN_SQL"), "source must reference ARCHIVED_DOCTORS_ADMIN_SQL");
  }
});

function makeInterleavingRepo({ rows = [], beforeGuard }) {
  const base = makeRepo({ rows });
  const originalRun = base.repo.run;
  base.repo.run = async (sql, ...binds) => {
    if (sql.includes("version = version + 1") && beforeGuard) {
      await beforeGuard(base.db);
      const slug = String(binds[binds.length - 2]);
      const expectedVersion = Number(binds[binds.length - 1]);
      const row = base.db.get(slug);
      if (!row) return { success: true, meta: { changes: 0 } };
      if (Number(row.version) !== expectedVersion) return { success: true, meta: { changes: 0 } };
      if (sql.includes("is_deleted = 0 AND lifecycle_status != 'ARCHIVED'")) {
        if (row.is_deleted === 1 || row.lifecycle_status === "ARCHIVED") {
          return { success: true, meta: { changes: 0 } };
        }
      }
      if (sql.includes("is_deleted = 1 AND lifecycle_status = 'ARCHIVED'")) {
        if (row.is_deleted !== 1 || row.lifecycle_status !== "ARCHIVED") {
          return { success: true, meta: { changes: 0 } };
        }
      }
    }
    return originalRun(sql, ...binds);
  };
  return base;
}

test("31. Interleave: update row version bumped between load and guard -> CONFLICT", async () => {
  const { repo, db } = makeInterleavingRepo({
    rows: [{ ...PUBLISHED_ROW, version: 1 }],
    beforeGuard: async (db) => { db.get("dr-a").version = 2; },
  });
  await assert.rejects(
    () => updateDoctor(repo, "dr-a", 1, fields(), "admin@x"),
    (e) => e instanceof MutationConflictError && e.code === "CONFLICT",
  );
  assert.equal(db.get("dr-a").version, 2);
});

test("32. Interleave: update row deleted between load and guard -> NOT_FOUND", async () => {
  const { repo, db } = makeInterleavingRepo({
    rows: [{ ...PUBLISHED_ROW, version: 1 }],
    beforeGuard: async (db) => { db.delete("dr-a"); },
  });
  await assert.rejects(
    () => updateDoctor(repo, "dr-a", 1, fields(), "admin@x"),
    (e) => e instanceof MutationNotFoundError && e.code === "NOT_FOUND",
  );
  assert.equal(db.get("dr-a"), undefined);
});

test("33. Interleave: update row archived between load and guard -> ARCHIVED_SAVE_ERROR", async () => {
  const { repo } = makeInterleavingRepo({
    rows: [{ ...PUBLISHED_ROW, version: 1 }],
    beforeGuard: async (db) => {
      const row = db.get("dr-a");
      row.lifecycle_status = "ARCHIVED";
      row.is_deleted = 1;
      row.status = "HIDDEN";
      row.is_visible = 0;
      row.deleted_at = "2026-07-20 12:00:00";
    },
  });
  await assert.rejects(
    () => updateDoctor(repo, "dr-a", 1, fields(), "admin@x"),
    (e) => e.message === ARCHIVED_SAVE_ERROR,
  );
});

test("34. Interleave: archive row version bumped while still active -> CONFLICT", async () => {
  const { repo, db } = makeInterleavingRepo({
    rows: [{ ...PUBLISHED_ROW, version: 2 }],
    beforeGuard: async (db) => { db.get("dr-a").version = 3; },
  });
  await assert.rejects(
    () => archiveDoctor(repo, "dr-a", 2, "admin@x"),
    (e) => e instanceof MutationConflictError && e.code === "CONFLICT",
  );
  assert.equal(db.get("dr-a").version, 3);
});

test("35. Interleave: archive row deleted between load and guard -> NOT_FOUND", async () => {
  const { repo } = makeInterleavingRepo({
    rows: [{ ...PUBLISHED_ROW, version: 2 }],
    beforeGuard: async (db) => { db.delete("dr-a"); },
  });
  await assert.rejects(
    () => archiveDoctor(repo, "dr-a", 2, "admin@x"),
    (e) => e instanceof MutationNotFoundError && e.code === "NOT_FOUND",
  );
});

test("36. Interleave: archive already completed by competitor -> NOT_FOUND, no audit", async () => {
  const { repo, getAuditCalls } = makeInterleavingRepo({
    rows: [{ ...PUBLISHED_ROW, version: 2 }],
    beforeGuard: async (db) => {
      const row = db.get("dr-a");
      row.lifecycle_status = "ARCHIVED";
      row.is_deleted = 1;
      row.status = "HIDDEN";
      row.is_visible = 0;
      row.deleted_at = "2026-07-20 12:00:00";
    },
  });
  await assert.rejects(
    () => archiveDoctor(repo, "dr-a", 2, "admin@x"),
    (e) => e instanceof MutationNotFoundError && e.code === "NOT_FOUND",
  );
  assert.equal(getAuditCalls().length, 0);
});

test("37. Interleave: restore row version bumped while still archived -> CONFLICT", async () => {
  const { repo, db } = makeInterleavingRepo({
    rows: [{ ...ARCHIVED_ROW, version: 3 }],
    beforeGuard: async (db) => { db.get("dr-b").version = 4; },
  });
  await assert.rejects(
    () => restoreDoctor(repo, "dr-b", 3, "admin@x"),
    (e) => e instanceof MutationConflictError && e.code === "CONFLICT",
  );
  assert.equal(db.get("dr-b").version, 4);
});

test("38. Interleave: restore row deleted between load and guard -> NOT_FOUND", async () => {
  const { repo } = makeInterleavingRepo({
    rows: [{ ...ARCHIVED_ROW, version: 3 }],
    beforeGuard: async (db) => { db.delete("dr-b"); },
  });
  await assert.rejects(
    () => restoreDoctor(repo, "dr-b", 3, "admin@x"),
    (e) => e instanceof MutationNotFoundError && e.code === "NOT_FOUND",
  );
});

test("39. Interleave: restore completed by competitor (row now active) -> NOT_FOUND, no audit", async () => {
  const { repo, getAuditCalls } = makeInterleavingRepo({
    rows: [{ ...ARCHIVED_ROW, version: 3 }],
    beforeGuard: async (db) => {
      const row = db.get("dr-b");
      row.lifecycle_status = "HIDDEN";
      row.is_deleted = 0;
      row.status = "HIDDEN";
      row.is_visible = 0;
      row.deleted_at = null;
    },
  });
  await assert.rejects(
    () => restoreDoctor(repo, "dr-b", 3, "admin@x"),
    (e) => e instanceof MutationNotFoundError && e.code === "NOT_FOUND",
  );
  assert.equal(getAuditCalls().length, 0);
});

test("40. Concurrent same-slug create: duplicate insert throws -> CONFLICT, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ rows: [PUBLISHED_ROW] });
  const conflictRepo = {
    ...repo,
    run: async () => {
      throw new Error("UNIQUE constraint failed: doctor_profiles.slug");
    },
  };
  await assert.rejects(
    () => createDoctor(conflictRepo, "dr-a", fields(), "admin@x"),
    (e) => e instanceof MutationConflictError,
  );
  assert.equal(getAuditCalls().length, 0);
});

test("41. Create zero-row and slug now exists -> CONFLICT, no audit", async () => {
  const { repo, db, getAuditCalls } = makeRepo({ rows: [] });
  const zeroRowRepo = {
    ...repo,
    run: async () => {
      db.set("dr-a", { ...PUBLISHED_ROW });
      return { success: true, meta: { changes: 0 } };
    },
  };
  await assert.rejects(
    () => createDoctor(zeroRowRepo, "dr-a", fields({ isVisible: true }), "admin@x"),
    (e) => e instanceof MutationConflictError,
  );
  assert.equal(getAuditCalls().length, 0);
});

test("42. Create zero-row and slug still absent -> internal failure, not NOT_FOUND", async () => {
  const { repo, getAuditCalls } = makeRepo({ rows: [] });
  const zeroRowRepo = {
    ...repo,
    run: async () => ({ success: true, meta: { changes: 0 } }),
  };
  await assert.rejects(
    () => createDoctor(zeroRowRepo, "dr-new", fields({ isVisible: true }), "admin@x"),
    (e) => e.message === "Doctor profile creation failed unexpectedly.",
  );
  assert.equal(getAuditCalls().length, 0);
});

test("43. parseExpectedVersion: strict raw-value validation", () => {
  assert.equal(parseExpectedVersion(undefined), 0);
  assert.equal(parseExpectedVersion(null), 0);
  assert.equal(parseExpectedVersion(1), 1);
  assert.equal(parseExpectedVersion(0), 0);
  assert.ok(Number.isNaN(parseExpectedVersion("1")));
  assert.ok(Number.isNaN(parseExpectedVersion(1.5)));
  assert.ok(Number.isNaN(parseExpectedVersion(NaN)));
  assert.ok(Number.isNaN(parseExpectedVersion(Infinity)));
  assert.ok(Number.isNaN(parseExpectedVersion(-1)));
  assert.ok(Number.isNaN(parseExpectedVersion(true)));
  assert.ok(Number.isNaN(parseExpectedVersion({})));
  assert.ok(Number.isNaN(parseExpectedVersion([])));
  assert.equal(parseExpectedVersion(undefined, { minimum: 1 }), NaN);
  assert.equal(parseExpectedVersion(null, { minimum: 1 }), NaN);
  assert.equal(parseExpectedVersion(1, { minimum: 1 }), 1);
});

test("44. parseExpectedVersion rejects all invalid doctor.save versions", () => {
  assert.ok(Number.isNaN(parseExpectedVersion("1")));
  assert.ok(Number.isNaN(parseExpectedVersion(1.5)));
  assert.ok(Number.isNaN(parseExpectedVersion(NaN)));
  assert.ok(Number.isNaN(parseExpectedVersion(Infinity)));
  assert.ok(Number.isNaN(parseExpectedVersion(-1)));
  assert.ok(Number.isNaN(parseExpectedVersion(true)));
  assert.ok(Number.isNaN(parseExpectedVersion({})));
  assert.ok(Number.isNaN(parseExpectedVersion([])));
});

test("45. parseExpectedVersion accepts all valid doctor.save versions", () => {
  assert.equal(parseExpectedVersion(undefined), 0);
  assert.equal(parseExpectedVersion(null), 0);
  assert.equal(parseExpectedVersion(0), 0);
  assert.equal(parseExpectedVersion(1), 1);
  assert.equal(parseExpectedVersion(999), 999);
});

test("46. parseExpectedVersion rejects invalid archive/restore versions (minimum: 1)", () => {
  assert.ok(Number.isNaN(parseExpectedVersion(undefined, { minimum: 1 })));
  assert.ok(Number.isNaN(parseExpectedVersion(null, { minimum: 1 })));
  assert.ok(Number.isNaN(parseExpectedVersion(0, { minimum: 1 })));
  assert.ok(Number.isNaN(parseExpectedVersion("1", { minimum: 1 })));
  assert.ok(Number.isNaN(parseExpectedVersion(1.5, { minimum: 1 })));
  assert.ok(Number.isNaN(parseExpectedVersion(-1, { minimum: 1 })));
});

test("47. parseExpectedVersion accepts valid archive/restore versions (minimum: 1)", () => {
  assert.equal(parseExpectedVersion(1, { minimum: 1 }), 1);
  assert.equal(parseExpectedVersion(5, { minimum: 1 }), 5);
});

test("48. throwInvalidExpectedVersion accepts custom message", () => {
  assert.throws(
    () => throwInvalidExpectedVersion("expectedVersion must be a positive integer."),
    (e) => e.message === "expectedVersion must be a positive integer.",
  );
  assert.throws(
    () => throwInvalidExpectedVersion(),
    (e) => e.message === "expectedVersion must be a non-negative integer.",
  );
});

test("49. route.ts wiring: validatePayload uses shared parseExpectedVersion for doctor.save", async () => {
  const routeSrc = await readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8");
  assert.ok(routeSrc.includes("parseExpectedVersion"), "route.ts must import parseExpectedVersion from doctor-admin");
  assert.ok(routeSrc.includes('parseExpectedVersion(obj.expectedVersion)'), "validatePayload doctor.save must use parseExpectedVersion");
  assert.ok(routeSrc.includes('parseExpectedVersion(obj.expectedVersion, { minimum: 1 })'), "validatePayload doctor.delete/restore must use parseExpectedVersion with minimum: 1");
});

test("50. route.ts wiring: validatePayload runs before executeRoleMutation in generic POST path", async () => {
  const routeSrc = await readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8");
  const preCheckIndex = routeSrc.indexOf("const preCheck = validatePayload(action, payload)");
  const executeIndex = routeSrc.indexOf("const result = await executeRoleMutation({");
  assert.ok(preCheckIndex > 0, "route.ts must call validatePayload before executeRoleMutation");
  assert.ok(executeIndex > preCheckIndex, "validatePayload must execute before executeRoleMutation");
});
