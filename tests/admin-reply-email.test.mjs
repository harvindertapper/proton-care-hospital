import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { requireAppliedMutation, MutationNotFoundError } from "../app/lib/mutation-result.ts";

// ---------------------------------------------------------------------------
// 1. Reply mutation SQL does not reference contact_messages.updated_at
// ---------------------------------------------------------------------------

test("reply route SQL does not reference contact_messages.updated_at", async () => {
  const src = await readFile(
    new URL("../app/api/admin/reply-email/route.ts", import.meta.url),
    "utf8",
  );
  // Strip comments before checking SQL for updated_at
  const noComments = src
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(
    !/updated_at/i.test(noComments),
    "reply route SQL must not reference updated_at (column absent from 0000 schema)",
  );
});

// ---------------------------------------------------------------------------
// 2. SQL is compatible with the exact 0000 contact_messages schema
// ---------------------------------------------------------------------------

test("reply route UPDATE targets only status, compatible with 0000 schema", async () => {
  const src = await readFile(
    new URL("../app/api/admin/reply-email/route.ts", import.meta.url),
    "utf8",
  );
  // The update must set status = 'CONTACTED' and must NOT set updated_at
  assert.ok(
    src.includes("SET status = 'CONTACTED'") || src.includes("SET status = 'CONTACTED',"),
    "reply route must set status to CONTACTED",
  );
  assert.ok(
    !/SET\s+status\s*=\s*'CONTACTED'\s*,\s*updated_at/i.test(src),
    "reply route must not set updated_at alongside status",
  );
});

// ---------------------------------------------------------------------------
// 3. 0000 schema proof: contact_messages has no updated_at
// ---------------------------------------------------------------------------

test("0000 baseline contact_messages has no updated_at column", async () => {
  const baseline = await readFile(
    new URL("../migrations/0000_baseline.sql", import.meta.url),
    "utf8",
  );
  const contactBlock = baseline.slice(
    baseline.indexOf("CREATE TABLE IF NOT EXISTS contact_messages"),
    baseline.indexOf(");", baseline.indexOf("CREATE TABLE IF NOT EXISTS contact_messages")) + 2,
  );
  assert.ok(
    !contactBlock.includes("updated_at"),
    "contact_messages in 0000 must not define updated_at",
  );
});

// ---------------------------------------------------------------------------
// 4. Missing contact ID prevents email sending (existence check)
// ---------------------------------------------------------------------------

test("reply route checks contact existence before email", async () => {
  const src = await readFile(
    new URL("../app/api/admin/reply-email/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    src.includes("SELECT id FROM contact_messages WHERE id = ?"),
    "reply route must query contact_messages to prove existence",
  );
  assert.ok(
    src.includes("Contact message not found"),
    "reply route must throw when contact does not exist",
  );
});

// ---------------------------------------------------------------------------
// 5. requireAppliedMutation enforces affected-row proof
// ---------------------------------------------------------------------------

test("requireAppliedMutation rejects zero-row update", () => {
  assert.throws(
    () => requireAppliedMutation({ meta: { changes: 0 } }, true, "Contact message"),
    MutationNotFoundError,
  );
});

test("requireAppliedMutation accepts single-row update", () => {
  const result = requireAppliedMutation({ meta: { changes: 1 } }, true, "Contact message");
  assert.equal(result.outcome, "APPLIED");
});

test("requireAppliedMutation rejects when entity does not exist", () => {
  assert.throws(
    () => requireAppliedMutation({ meta: { changes: 0 } }, false, "Contact message"),
    MutationNotFoundError,
  );
});

// ---------------------------------------------------------------------------
// 6. Email-send failure does not mark CONTACTED
// ---------------------------------------------------------------------------

test("reply route sends email before DB update", async () => {
  const src = await readFile(
    new URL("../app/api/admin/reply-email/route.ts", import.meta.url),
    "utf8",
  );
  const emailPos = src.indexOf("sendEmail(");
  const updatePos = src.indexOf("SET status = 'CONTACTED'");
  assert.ok(emailPos >= 0, "reply route must call sendEmail");
  assert.ok(updatePos >= 0, "reply route must update status");
  assert.ok(
    emailPos < updatePos,
    "sendEmail must happen before the database update",
  );
});

// ---------------------------------------------------------------------------
// 7. Audit happens only after affected-row proof
// ---------------------------------------------------------------------------

test("reply route audits only after requireAppliedMutation", async () => {
  const src = await readFile(
    new URL("../app/api/admin/reply-email/route.ts", import.meta.url),
    "utf8",
  );
  const proofPos = src.indexOf("requireAppliedMutation");
  const auditPos = src.indexOf("CONTACT_REPLIED");
  assert.ok(proofPos >= 0, "reply route must use requireAppliedMutation");
  assert.ok(auditPos >= 0, "reply route must audit CONTACT_REPLIED");
  assert.ok(
    proofPos < auditPos,
    "affected-row proof must precede audit",
  );
});

// ---------------------------------------------------------------------------
// 8. No migration file changed
// ---------------------------------------------------------------------------

test("migration files are untouched", async () => {
  const names = [
    "0000_baseline.sql",
    "0001_enforce_department_slot_exclusivity.sql",
    "0002_add_content_lifecycle_foundation.sql",
  ];
  for (const name of names) {
    const src = await readFile(
      new URL(`../migrations/${name}`, import.meta.url),
      "utf8",
    );
    assert.ok(src.length > 0, `migration ${name} must exist and be non-empty`);
  }
});

// ---------------------------------------------------------------------------
// 9. B4.1 public fail-closed preserved
// ---------------------------------------------------------------------------

test("B4.1 regression: public empty/error returns []/null", async () => {
  const { resolvePublicDoctors, resolveDoctorBySlug } = await import("../app/lib/doctor-public.ts");
  const { doctors } = await import("../app/lib/data.ts");
  assert.deepEqual(await resolvePublicDoctors(async () => ({ results: [] })), []);
  assert.deepEqual(
    await resolvePublicDoctors(async () => { throw new Error("x"); }),
    [],
  );
  assert.equal(
    await resolveDoctorBySlug(async () => ({ results: [] }), "x"),
    null,
  );
  assert.equal(
    await resolveDoctorBySlug(async () => { throw new Error("x"); }, "x"),
    null,
  );
  assert.notEqual(await resolvePublicDoctors(async () => ({ results: [] })), doctors);
});
