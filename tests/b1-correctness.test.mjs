import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("appointment slots are unique by department, date, and time across phone numbers", () => {
  const expectedColumns = /appointments\s*\(department_slug, requested_date, requested_time\)/;
  assert.match(baseline, expectedColumns);
  assert.match(slotMigration, expectedColumns);
  assert.doesNotMatch(baseline, /idx_appointments_slot[^;]+requested_time, phone/);
  assert.doesNotMatch(slotMigration, /idx_appointments_department_slot[^;]+requested_time, phone/);
});

test("detail-page D1 queries bind slug as a scalar", () => {
  assert.doesNotMatch(publicData, /\[slug\]/);
  assert.equal((publicData.match(/^\s+slug$/gm) || []).length, 3);
});

test("high-risk admin mutations require affected-row proof before audit", () => {
  assert.match(server, /function requireAppliedMutation/);
  assert.match(server, /meta\?\.changes/);
  for (const entity of ["Doctor profile", "Blog post", "Career job", "Patient video", "Appointment"]) {
    assert.match(adminRoute, new RegExp(`requireAppliedMutation\\([^\\n]+${entity}`));
  }
  assert.match(mediaRoute, /requireAppliedMutation\(result, true, "Media asset"\)/);
  assert.match(adminRoute, /outcome: "NOT_FOUND"/);
});

test("staff proposals and media failures cannot claim immediate success", () => {
  assert.match(adminRoute, /outcome: "PENDING_APPROVAL"/);
  assert.match(consoleSource, /Change submitted for Super Admin approval/);
  assert.match(mediaRoute, /outcome: "FAILED"/);
  assert.match(mediaRoute, /metadata was retained/);
  assert.match(mediaRoute, /requireAdmin\(\{ role: "SUPER_ADMIN" \}\)/);
});
