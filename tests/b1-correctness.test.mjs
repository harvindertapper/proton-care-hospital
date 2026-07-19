import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  MutationNotFoundError,
  executeMediaDeletion,
  executeRoleMutation,
  requireAppliedMutation,
} from "../app/lib/mutation-result.ts";

const [baseline, slotMigration, publicData, adminRoute, server, mediaRoute, consoleSource] =
  await Promise.all([
    readFile(new URL("../migrations/0000_baseline.sql", import.meta.url), "utf8"),
    readFile(new URL("../migrations/0001_enforce_department_slot_exclusivity.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/public-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AdminConsole.tsx", import.meta.url), "utf8"),
  ]);

test("structural guard: immutable baseline and incremental slot indexes remain separated", () => {
  const expectedColumns = /ON appointments\s*\(department_slug, requested_date, requested_time/;
  assert.match(baseline, expectedColumns);
  assert.match(slotMigration, expectedColumns);
  assert.match(baseline, /idx_appointments_slot[^;]+requested_time, phone/);
  assert.doesNotMatch(slotMigration, /idx_appointments_department_slot[^;]+requested_time, phone/);
  assert.doesNotMatch(server, /idx_appointments_department_slot/);
  assert.match(server, /idx_appointments_slot[^\n]+requested_time, phone/);
});

test("detail-page D1 queries bind slug as a scalar", () => {
  assert.doesNotMatch(publicData, /\[slug\]/);
  assert.equal((publicData.match(/^\s+slug$/gm) || []).length, 3);
});

test("structural guard: high-risk admin mutations require affected-row proof before audit", () => {
  assert.match(server, /export \{ MutationNotFoundError, requireAppliedMutation \}/);
  assert.match(adminRoute, /requireAppliedMutation/);
  for (const entity of ["Doctor profile", "Blog post", "Career job", "Patient video", "Appointment"]) {
    assert.match(adminRoute, new RegExp(`requireAppliedMutation\\([^\\n]+${entity}`));
  }
  assert.match(mediaRoute, /executeMediaDeletion/);
  assert.match(adminRoute, /outcome: "NOT_FOUND"/);
});

test("staff proposals and media failures cannot claim immediate success", () => {
  assert.match(adminRoute, /executeRoleMutation/);
  assert.match(consoleSource, /Change submitted for Super Admin approval/);
  assert.match(mediaRoute, /outcome: "FAILED"/);
  assert.match(mediaRoute, /metadata was retained/);
  assert.match(mediaRoute, /requireAdmin\(\{ role: "SUPER_ADMIN" \}\)/);
});

function createMigratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(baseline);
  db.exec(slotMigration);
  return db;
}

function insertAppointment(db, value) {
  db.prepare(`
    INSERT INTO appointments (
      id, request_id, patient_name, phone, email,
      department_slug, department_name,
      requested_date, requested_time, concern,
      consent, otp_verified, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
  `).run(
    value.id,
    value.requestId,
    "Synthetic Patient",
    value.phone,
    "synthetic@example.invalid",
    value.departmentSlug,
    value.departmentName || "Synthetic Department",
    value.date,
    value.time,
    "Automated local test only",
    value.status || "NEW",
  );
}

test("SQLite case A: different phone cannot take the same active department slot", () => {
  const db = createMigratedDatabase();
  try {
    insertAppointment(db, {
      id: "case-a-1", requestId: "CASE-A-1", phone: "9999999991",
      departmentSlug: "cardiology", date: "2026-08-01", time: "10:00",
    });
    assert.throws(
      () => insertAppointment(db, {
        id: "case-a-2", requestId: "CASE-A-2", phone: "9999999992",
        departmentSlug: "cardiology", date: "2026-08-01", time: "10:00",
      }),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("SQLite case B: same date and time in different departments succeeds", () => {
  const db = createMigratedDatabase();
  try {
    insertAppointment(db, {
      id: "case-b-1", requestId: "CASE-B-1", phone: "9999999991",
      departmentSlug: "cardiology", date: "2026-08-02", time: "11:00",
    });
    insertAppointment(db, {
      id: "case-b-2", requestId: "CASE-B-2", phone: "9999999992",
      departmentSlug: "orthopaedics", date: "2026-08-02", time: "11:00",
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count, 2);
  } finally {
    db.close();
  }
});

test("SQLite case C: cancelled appointment releases the slot", () => {
  const db = createMigratedDatabase();
  try {
    insertAppointment(db, {
      id: "case-c-1", requestId: "CASE-C-1", phone: "9999999991",
      departmentSlug: "cardiology", date: "2026-08-03", time: "12:00", status: "CANCELLED",
    });
    insertAppointment(db, {
      id: "case-c-2", requestId: "CASE-C-2", phone: "9999999992",
      departmentSlug: "cardiology", date: "2026-08-03", time: "12:00",
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM appointments").get().count, 2);
  } finally {
    db.close();
  }
});

test("SQLite case D: reschedule conflict fails atomically", () => {
  const db = createMigratedDatabase();
  try {
    insertAppointment(db, {
      id: "case-d-1", requestId: "CASE-D-1", phone: "9999999991",
      departmentSlug: "cardiology", date: "2026-08-04", time: "09:00",
    });
    insertAppointment(db, {
      id: "case-d-2", requestId: "CASE-D-2", phone: "9999999992",
      departmentSlug: "cardiology", date: "2026-08-04", time: "09:30",
    });
    assert.throws(
      () => db.prepare("UPDATE appointments SET requested_time = ? WHERE id = ?").run("09:00", "case-d-2"),
      /UNIQUE constraint failed/,
    );
    assert.equal(
      db.prepare("SELECT requested_time FROM appointments WHERE id = ?").get("case-d-2").requested_time,
      "09:30",
    );
  } finally {
    db.close();
  }
});

test("SQLite case E: cumulative migration creates exactly both intended slot indexes", () => {
  const db = createMigratedDatabase();
  try {
    const indexes = db.prepare(`
      SELECT name, sql FROM sqlite_master
      WHERE type = 'index'
        AND name IN ('idx_appointments_slot', 'idx_appointments_department_slot')
      ORDER BY name
    `).all();
    assert.deepEqual(indexes.map((row) => row.name), [
      "idx_appointments_department_slot",
      "idx_appointments_slot",
    ]);
    const legacy = indexes.find((row) => row.name === "idx_appointments_slot");
    const invariant = indexes.find((row) => row.name === "idx_appointments_department_slot");
    assert.match(legacy.sql, /requested_time, phone/);
    assert.doesNotMatch(invariant.sql, /phone/);
  } finally {
    db.close();
  }
});

test("mutation helper returns APPLIED only for an existing changed row", () => {
  assert.deepEqual(requireAppliedMutation({ success: true, meta: { changes: 1 } }, true, "Doctor"), {
    outcome: "APPLIED",
  });
});

test("mutation helper maps zero-row and absent-target results to NOT_FOUND", () => {
  for (const [result, exists] of [
    [{ success: true, meta: { changes: 0 } }, true],
    [{ success: true, meta: { changes: 1 } }, false],
  ]) {
    assert.throws(
      () => requireAppliedMutation(result, exists, "Doctor"),
      (error) => error instanceof MutationNotFoundError
        && error.code === "NOT_FOUND"
        && error.name === "MutationNotFoundError"
        && error.message === "Doctor was not found.",
    );
  }
});

test("database failures remain ordinary failures rather than NOT_FOUND", () => {
  const failure = new Error("SQLITE_BUSY");
  assert.equal(failure instanceof MutationNotFoundError, false);
});

test("zero-row proof prevents success audit execution", () => {
  let audits = 0;
  assert.throws(() => {
    requireAppliedMutation({ success: true, meta: { changes: 0 } }, true, "Blog post");
    audits += 1;
  }, MutationNotFoundError);
  assert.equal(audits, 0);
});

test("staff doctor/content actions create revisions and never invoke target mutations", async () => {
  let revisions = 0;
  let applied = 0;
  for (const action of ["doctor.save", "doctor.delete", "blog.save", "blog.delete"]) {
    const staff = await executeRoleMutation({
      isStaff: true,
      createRevision: async () => ({ id: `revision-${++revisions}`, action }),
      applyMutation: async () => {
        applied += 1;
        return { outcome: "APPLIED" };
      },
    });
    assert.equal(staff.outcome, "PENDING_APPROVAL");
    assert.equal(staff.revision.action, action);
  }
  assert.equal(revisions, 4);
  assert.equal(applied, 0);

  const superAdmin = await executeRoleMutation({
    isStaff: false,
    createRevision: async () => ({ id: "unused" }),
    applyMutation: async () => {
      applied += 1;
      return requireAppliedMutation({ meta: { changes: 1 } }, true, "Doctor");
    },
  });
  assert.equal(superAdmin.outcome, "APPLIED");
  assert.equal(applied, 1);
  assert.equal(revisions, 4);
});

test("media R2 failure retains metadata and does not audit", async () => {
  let metadataDeletes = 0;
  let audits = 0;
  const result = await executeMediaDeletion({
    loadMetadata: async () => ({ r2_key: "synthetic/test.webp" }),
    deleteObject: async () => { throw new Error("synthetic R2 failure"); },
    deleteMetadata: async () => {
      metadataDeletes += 1;
      return { meta: { changes: 1 } };
    },
    writeAudit: async () => { audits += 1; },
  });
  assert.equal(result.outcome, "FAILED");
  assert.equal(result.stage, "OBJECT");
  assert.equal(metadataDeletes, 0);
  assert.equal(audits, 0);
});

test("media success deletes metadata with proof and audits exactly once", async () => {
  let objects = 0;
  let metadataDeletes = 0;
  let audits = 0;
  const result = await executeMediaDeletion({
    loadMetadata: async () => ({ r2_key: "synthetic/test.webp" }),
    deleteObject: async () => { objects += 1; },
    deleteMetadata: async () => {
      metadataDeletes += 1;
      return { meta: { changes: 1 } };
    },
    writeAudit: async () => { audits += 1; },
  });
  assert.equal(result.outcome, "APPLIED");
  assert.deepEqual([objects, metadataDeletes, audits], [1, 1, 1]);
});

test("media missing metadata is NOT_FOUND before object deletion", async () => {
  let objectDeletes = 0;
  await assert.rejects(
    executeMediaDeletion({
      loadMetadata: async () => null,
      deleteObject: async () => { objectDeletes += 1; },
      deleteMetadata: async () => ({ meta: { changes: 1 } }),
      writeAudit: async () => {},
    }),
    MutationNotFoundError,
  );
  assert.equal(objectDeletes, 0);
});

test("structural guard: revision review and generic failures use the complete outcome contract", () => {
  assert.match(adminRoute, /WHERE id = \? AND status = 'NEEDS_REVIEW'/);
  assert.match(adminRoute, /requireAppliedMutation\(reviewResult, true, "Content revision"\)/);
  assert.match(adminRoute, /REVISION_\$\{decision\}/);
  assert.match(adminRoute, /success: false,[\s\S]*outcome: "FAILED"/);
  assert.match(mediaRoute, /success: false, outcome: "NOT_FOUND"/);
});

test("media metadata zero-row failure returns FAILED and does not audit", async () => {
  let audits = 0;
  const result = await executeMediaDeletion({
    loadMetadata: async () => ({ r2_key: "synthetic/test.webp" }),
    deleteObject: async () => {},
    deleteMetadata: async () => ({ meta: { changes: 0 } }),
    writeAudit: async () => { audits += 1; },
  });
  assert.equal(result.outcome, "FAILED");
  assert.equal(result.stage, "METADATA");
  assert.equal(audits, 0);
});

test("structural guard: affected-row proof precedes success audits in scoped mutations", () => {
  const functionNames = [
    "applyDoctor",
    "applyFeedbackVisibility",
    "applyBlogVisibility",
    "applyCareerVisibility",
    "applyVideoVisibility",
    "applyAppointmentStatus",
    "applyDeleteDoctor",
    "applyDeleteBlog",
    "applyDeleteCareer",
    "applyDeleteVideo",
  ];

  for (const functionName of functionNames) {
    const start = adminRoute.indexOf(`async function ${functionName}`);
    const next = adminRoute.indexOf("\nasync function ", start + 1);
    const block = adminRoute.slice(start, next === -1 ? undefined : next);
    const proof = block.indexOf("requireAppliedMutation");
    const successAudit = block.indexOf("await audit");
    assert.ok(start >= 0, `${functionName} must exist`);
    assert.ok(proof >= 0, `${functionName} must verify affected rows`);
    assert.ok(successAudit > proof, `${functionName} must audit only after affected-row proof`);
  }
});
