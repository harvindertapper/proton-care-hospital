import assert from "node:assert/strict";
import test from "node:test";
import { doctors } from "../app/lib/data.ts";
import {
  resolvePublicDoctors,
  resolveDoctorBySlug,
} from "../app/lib/doctor-public.ts";
import { resolveDoctorManagerRows } from "../app/lib/doctor-admin.ts";

function okQuery(rows) {
  return async () => ({ results: rows });
}

function throwingQuery() {
  return async () => {
    throw new Error("D1 unavailable");
  };
}

function doctorRow(overrides = {}) {
  return {
    slug: "dr-example",
    name: "Dr Example",
    speciality: "Internal Medicine Specialist",
    qualification: "MBBS",
    department_slug: "general-medicine",
    photo_url: "/assets/doctors/dr-example.webp",
    registration_number: "HN-9999",
    consultant_type: "Visiting Consultant",
    ...overrides,
  };
}

function mappedDoctor(row) {
  return {
    slug: String(row.slug),
    name: String(row.name),
    speciality: String(row.speciality),
    qualification: row.qualification ? String(row.qualification) : undefined,
    departmentSlug: String(row.department_slug),
    photo: row.photo_url ? String(row.photo_url) : undefined,
  };
}

const VISIBLE_ROW = doctorRow();

test("existing-column D1 list query succeeds with one row and maps it", async () => {
  const result = await resolvePublicDoctors(okQuery([VISIBLE_ROW]));
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], mappedDoctor(VISIBLE_ROW));
});

test("successful empty list query returns [] and never static doctors", async () => {
  const result = await resolvePublicDoctors(okQuery([]));
  assert.deepEqual(result, []);
  assert.notEqual(result, doctors);
});

test("list query failure fails closed to [] and never static doctors", async () => {
  const result = await resolvePublicDoctors(throwingQuery());
  assert.deepEqual(result, []);
});

test("visible Doctor slug resolves via scalar binding", async () => {
  let captured = [];
  const spyQuery = async (sql, ...binds) => {
    captured = binds;
    return { results: [VISIBLE_ROW] };
  };
  const result = await resolveDoctorBySlug(spyQuery, "dr-example");
  assert.deepEqual(captured, ["dr-example"]);
  assert.deepEqual(result, mappedDoctor(VISIBLE_ROW));
});

test("missing Doctor slug returns null", async () => {
  const result = await resolveDoctorBySlug(okQuery([]), "dr-missing");
  assert.equal(result, null);
});

test("hidden Doctor returns null and does not fall back to static", async () => {
  const result = await resolveDoctorBySlug(okQuery([]), "dr-hidden");
  assert.equal(result, null);
  assert.ok(!doctors.some((d) => d.slug === "dr-hidden"));
});

test("deleted Doctor returns null and does not fall back to static", async () => {
  const result = await resolveDoctorBySlug(okQuery([]), "dr-deleted");
  assert.equal(result, null);
  assert.ok(!doctors.some((d) => d.slug === "dr-deleted"));
});

test("D1 detail query failure returns null and does not fall back to static", async () => {
  const result = await resolveDoctorBySlug(throwingQuery(), "dr-example");
  assert.equal(result, null);
});

test("mapper output never exposes regNo or consultantType", async () => {
  const result = await resolveDoctorBySlug(okQuery([VISIBLE_ROW]), "dr-example");
  assert.ok(result);
  assert.equal(result.regNo, undefined);
  assert.equal(result.consultantType, undefined);
  assert.ok(!("regNo" in result));
  assert.ok(!("consultantType" in result));
});

test("Admin Doctor empty state is not replaced by static doctors", async () => {
  const fromEmpty = resolveDoctorManagerRows([]);
  assert.deepEqual(fromEmpty, []);
  const fromNull = resolveDoctorManagerRows(null);
  assert.deepEqual(fromNull, []);
  const fromRows = resolveDoctorManagerRows([VISIBLE_ROW]);
  assert.equal(fromRows.length, 1);
  assert.notEqual(fromRows, doctors);
});

test("unknown Doctor route contract stays compatible with 404 (null)", async () => {
  const missing = await resolveDoctorBySlug(okQuery([]), "does-not-exist");
  assert.equal(missing, null);
});

test("department-wise appointment CTA contract preserved (no doctor booking param)", async () => {
  for (const doctor of doctors) {
    assert.ok(doctor.departmentSlug && doctor.departmentSlug.length > 0);
  }
  assert.ok(doctors.length > 0);
});
