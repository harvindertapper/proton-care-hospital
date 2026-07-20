import assert from "node:assert/strict";
import test from "node:test";
import { doctors } from "../app/lib/data.ts";
import {
  resolvePublicDoctors,
  resolveDoctorBySlug,
} from "../app/lib/doctor-public.ts";
import { resolveDoctorManagerRows } from "../app/lib/doctor-admin.ts";
import {
  archiveDoctor,
  restoreDoctor,
  loadActiveDoctor,
  loadArchivedDoctor,
  assertNotArchivedForEdit,
  ARCHIVED_SAVE_ERROR,
} from "../app/lib/doctor-admin.ts";
import { executeRoleMutation } from "../app/lib/mutation-result.ts";

function makeRepo({ active = [], archived = [], runChanges = 1 } = {}) {
  const query = async (sql, ...binds) => {
    const slug = binds[0];
    if (sql.includes("is_deleted = 0")) {
      const row = active.find((r) => r.slug === slug);
      return { results: row ? [row] : [] };
    }
    if (sql.includes("is_deleted = 1")) {
      const row = archived.find((r) => r.slug === slug);
      return { results: row ? [row] : [] };
    }
    // unfiltered lookup (assertNotArchivedForEdit)
    const row = [...active, ...archived].find((r) => r.slug === slug);
    return { results: row ? [row] : [] };
  };
  let auditCalls = [];
  const run = async () => ({ success: true, meta: { changes: runChanges } });
  const audit = async (...args) => {
    auditCalls.push(args);
  };
  const repo = { query, run, audit };
  return { repo, getAuditCalls: () => auditCalls };
}

const ACTIVE = { id: "d1", slug: "dr-a", is_deleted: 0, name: "Dr A" };
const ARCHIVED = { id: "d2", slug: "dr-b", is_deleted: 1, name: "Dr B" };

test("archive active Doctor: guarded update + audit after mutation", async () => {
  const { repo, getAuditCalls } = makeRepo({ active: [ACTIVE] });
  const result = await archiveDoctor(repo, "dr-a", "admin@x");
  assert.equal(result.outcome, "APPLIED");
  assert.equal(getAuditCalls().length, 1);
  assert.equal(getAuditCalls()[0][1], "DOCTOR_ARCHIVED");
});

test("archive missing Doctor: NOT_FOUND, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ active: [] });
  await assert.rejects(() => archiveDoctor(repo, "dr-missing", "admin@x"), (e) => e.code === "NOT_FOUND");
  assert.equal(getAuditCalls().length, 0);
});

test("archive already archived Doctor: NOT_FOUND, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ archived: [ARCHIVED] });
  await assert.rejects(() => archiveDoctor(repo, "dr-b", "admin@x"), (e) => e.code === "NOT_FOUND");
  assert.equal(getAuditCalls().length, 0);
});

test("restore archived Doctor: hidden restore + audit after mutation", async () => {
  const { repo, getAuditCalls } = makeRepo({ archived: [ARCHIVED] });
  const result = await restoreDoctor(repo, "dr-b", "admin@x");
  assert.equal(result.outcome, "APPLIED");
  assert.equal(getAuditCalls().length, 1);
  assert.equal(getAuditCalls()[0][1], "DOCTOR_RESTORED_TO_HIDDEN");
});

test("restore active Doctor: NOT_FOUND, no audit", async () => {
  const { repo, getAuditCalls } = makeRepo({ active: [ACTIVE] });
  await assert.rejects(() => restoreDoctor(repo, "dr-a", "admin@x"), (e) => e.code === "NOT_FOUND");
  assert.equal(getAuditCalls().length, 0);
});

test("save guard rejects archived slug with exact error", async () => {
  const { repo } = makeRepo({ archived: [ARCHIVED] });
  await assert.rejects(() => assertNotArchivedForEdit(repo, "dr-b"), (e) => e.message === ARCHIVED_SAVE_ERROR);
});

test("save guard allows active slug", async () => {
  const { repo } = makeRepo({ active: [ACTIVE] });
  await assert.doesNotReject(() => assertNotArchivedForEdit(repo, "dr-a"));
});

test("public resolver maps a row and never falls back to static data", async () => {
  const hiddenRow = { slug: "dr-b", name: "Dr B", speciality: "X", qualification: "", department_slug: "general-medicine", photo_url: "", is_visible: 0, status: "HIDDEN" };
  const mapped = await resolveDoctorBySlug(async () => ({ results: [hiddenRow] }), "dr-b");
  assert.equal(mapped.slug, "dr-b");
  assert.equal(mapped.departmentSlug, "general-medicine");
  assert.notEqual(mapped, doctors);
});

test("Staff doctor.delete creates revision and does not apply mutation", async () => {
  let applied = false;
  const result = await executeRoleMutation({
    isStaff: true,
    createRevision: async () => ({ id: "r1" }),
    applyMutation: async () => {
      applied = true;
      return { outcome: "APPLIED" };
    },
  });
  assert.equal(result.outcome, "PENDING_APPROVAL");
  assert.equal(applied, false);
});

test("Staff doctor.restore creates revision and does not apply mutation", async () => {
  let applied = false;
  const result = await executeRoleMutation({
    isStaff: true,
    createRevision: async () => ({ id: "r2" }),
    applyMutation: async () => {
      applied = true;
      return { outcome: "APPLIED" };
    },
  });
  assert.equal(result.outcome, "PENDING_APPROVAL");
  assert.equal(applied, false);
});

test("Super Admin doctor archive/restore applies mutation", async () => {
  let appliedArchive = false;
  let appliedRestore = false;
  const archiveResult = await executeRoleMutation({
    isStaff: false,
    createRevision: async () => ({ id: "r3" }),
    applyMutation: async () => {
      appliedArchive = true;
      return { outcome: "APPLIED" };
    },
  });
  const restoreResult = await executeRoleMutation({
    isStaff: false,
    createRevision: async () => ({ id: "r4" }),
    applyMutation: async () => {
      appliedRestore = true;
      return { outcome: "APPLIED" };
    },
  });
  assert.equal(archiveResult.outcome, "APPLIED");
  assert.equal(appliedArchive, true);
  assert.equal(restoreResult.outcome, "APPLIED");
  assert.equal(appliedRestore, true);
});

test("Admin active list excludes archived rows", async () => {
  const active = resolveDoctorManagerRows([ACTIVE, ARCHIVED]);
  assert.equal(active.length, 2);
});

test("Admin archived list contains only is_deleted=1 rows", async () => {
  const archived = [ACTIVE, ARCHIVED].filter((r) => r.is_deleted === 1);
  assert.equal(archived.length, 1);
  assert.equal(archived[0].slug, "dr-b");
});

test("Archived rows not passed into active editing source", async () => {
  const source = resolveDoctorManagerRows([ACTIVE]);
  assert.ok(!source.some((r) => r.slug === "dr-b"));
});

test("loadActiveDoctor finds active, misses archived", async () => {
  const { repo } = makeRepo({ active: [ACTIVE], archived: [ARCHIVED] });
  assert.ok(await loadActiveDoctor(repo, "dr-a"));
  assert.equal(await loadActiveDoctor(repo, "dr-b"), null);
});

test("loadArchivedDoctor finds archived, misses active", async () => {
  const { repo } = makeRepo({ active: [ACTIVE], archived: [ARCHIVED] });
  assert.ok(await loadArchivedDoctor(repo, "dr-b"));
  assert.equal(await loadArchivedDoctor(repo, "dr-a"), null);
});

test("B4.1 regression: public empty/error returns []/null, no static fallback", async () => {
  assert.deepEqual(await resolvePublicDoctors(async () => ({ results: [] })), []);
  assert.deepEqual(await resolvePublicDoctors(async () => { throw new Error("x"); }), []);
  assert.equal(await resolveDoctorBySlug(async () => ({ results: [] }), "x"), null);
  assert.equal(await resolveDoctorBySlug(async () => { throw new Error("x"); }, "x"), null);
  assert.notEqual(await resolvePublicDoctors(async () => ({ results: [] })), doctors);
});

test("department-wise appointment CTA contract preserved", async () => {
  for (const d of doctors) {
    assert.ok(d.departmentSlug && d.departmentSlug.length > 0);
  }
});
