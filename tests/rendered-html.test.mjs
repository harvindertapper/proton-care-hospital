import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import test, { after } from "node:test";
import {
  resetMockDb,
  addMockAppointment,
  setMockAdminSession,
  checkRateLimit,
  verifyFirebaseToken
} from "./server-mocked.js";

// 1. Setup dynamic mock for status route
const statusRouteContent = await readFile(new URL("../app/api/appointments/status/route.ts", import.meta.url), "utf8");
const mockedStatusRouteContent = statusRouteContent
  .replace('import { NextResponse } from "next/server";', '')
  .replace(
    'import { query, checkRateLimit, getClientIp, json } from "@/app/lib/server";',
    'import { query, checkRateLimit, getClientIp, json } from "./server-mocked.js";'
  );
await writeFile(new URL("./status-route-real-mocked.ts", import.meta.url), mockedStatusRouteContent, "utf8");

// 2. Setup dynamic mock for admin data route
const dataRouteContent = await readFile(new URL("../app/api/admin/data/route.ts", import.meta.url), "utf8");
const mockedDataRouteContent = dataRouteContent
  .replace('from "@/app/lib/server";', 'from "./server-mocked.js";')
  .replace('from "@/app/lib/data";', 'from "../app/lib/data.ts";');
await writeFile(new URL("./data-route-real-mocked.ts", import.meta.url), mockedDataRouteContent, "utf8");

// Import the dynamically generated production-logic routes
const { POST: statusPostHandler } = await import("./status-route-real-mocked.ts");
const { GET: getDashboardData } = await import("./data-route-real-mocked.ts");

// Cleanup generated mock files on completion
after(async () => {
  try {
    await Promise.all([
      unlink(new URL("./status-route-real-mocked.ts", import.meta.url)),
      unlink(new URL("./data-route-real-mocked.ts", import.meta.url))
    ]);
  } catch (err) {
    // Ignore cleanup errors
  }
});

test("homepage source contains the Protone public experience", async () => {
  const [page, shell, data] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SiteShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Protone Care Hospital/);
  assert.match(page, /Department-only request/);
  assert.match(page, /24x7 confirmed/);
  assert.match(shell, /tel:\+919220463438|hospital\.phoneHref/);
  assert.match(shell, /https:\/\/wa\.me\/919220463438|hospital\.whatsappHref/);
  assert.match(data, /1\/23 Laxmi Garden, Sector 11/);
  assert.match(data, /सामान्य चिकित्सा/);
});

test("starter preview files are no longer referenced", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("redaction test: STAFF sees redacted sensitive concerns, SUPER_ADMIN sees full concerns", async () => {
  resetMockDb();
  
  // Add a sensitive concern appointment
  addMockAppointment({
    id: "app-1",
    request_id: "PCH-2026-PSY101",
    patient_name: "John Doe",
    phone: "919876543210",
    email: "john@example.com",
    department_slug: "psychiatry",
    department_name: "Psychiatry",
    requested_date: "2026-07-20",
    requested_time: "10:00",
    concern: "Feeling anxious and depressed",
    status: "NEW",
  });
  
  // Add a non-sensitive concern appointment
  addMockAppointment({
    id: "app-2",
    request_id: "PCH-2026-GEN101",
    patient_name: "Jane Smith",
    phone: "919999999999",
    email: "jane@example.com",
    department_slug: "general-medicine",
    department_name: "General Medicine",
    requested_date: "2026-07-20",
    requested_time: "11:00",
    concern: "Fever and cold symptoms",
    status: "NEW",
  });

  // Test for STAFF role
  setMockAdminSession({ ok: true, session: { email: "staff@protoncare.in", role: "STAFF" } });
  const staffRes = await getDashboardData(new Request("http://localhost/api/admin/data"));
  const staffData = await staffRes.json();
  
  const staffApp1 = staffData.data.appointments.find(a => a.id === "app-1");
  const staffApp2 = staffData.data.appointments.find(a => a.id === "app-2");
  
  assert.equal(staffApp1.concern, "[REDACTED - SENSITIVE DEPT]");
  assert.equal(staffApp2.concern, "Fever and cold symptoms");

  // Test for SUPER_ADMIN role
  setMockAdminSession({ ok: true, session: { email: "admin@protoncare.in", role: "SUPER_ADMIN" } });
  const adminRes = await getDashboardData(new Request("http://localhost/api/admin/data"));
  const adminData = await adminRes.json();
  
  const adminApp1 = adminData.data.appointments.find(a => a.id === "app-1");
  const adminApp2 = adminData.data.appointments.find(a => a.id === "app-2");
  
  assert.equal(adminApp1.concern, "Feeling anxious and depressed");
  assert.equal(adminApp2.concern, "Fever and cold symptoms");
});

test("OTP token validation test: rejects invalid, accepts valid mock", async () => {
  const invalidResult = await verifyFirebaseToken("bad-token", "919876543210");
  assert.equal(invalidResult.ok, false);

  const validResult = await verifyFirebaseToken("valid-token", "919876543210");
  assert.equal(validResult.ok, true);
  assert.equal(validResult.phone, "919876543210");
});

test("rate-limiting test: permits within limit, restricts above limit", async () => {
  resetMockDb();
  
  // Call rate limiter 5 times with limit of 5
  for (let i = 0; i < 5; i++) {
    const res = await checkRateLimit("test-action", "127.0.0.1", 5, 60);
    assert.equal(res.ok, true);
  }
  
  // The 6th call should be blocked
  const blockedRes = await checkRateLimit("test-action", "127.0.0.1", 5, 60);
  assert.equal(blockedRes.ok, false);
});

test("status lookup IDOR check: rejects guess only, requires matching last-4 digits", async () => {
  resetMockDb();
  
  addMockAppointment({
    id: "app-1",
    request_id: "PCH-2026-X8B9Z1",
    patient_name: "Alice Smith",
    phone: "919876543210",
    email: "alice@example.com",
    department_slug: "dental",
    department_name: "Dental",
    requested_date: "2026-07-22",
    requested_time: "14:00",
    concern: "Toothache",
    status: "PENDING",
  });

  // 1. Check with missing phone verification (should return 400)
  const req1 = new Request("http://localhost/api/appointments/status", {
    method: "POST",
    body: JSON.stringify({ requestId: "PCH-2026-X8B9Z1" })
  });
  const res1 = await statusPostHandler(req1);
  assert.equal(res1.status, 400);
  const data1 = await res1.json();
  assert.match(data1.error, /phone number verification/);

  // 2. Check with wrong last 4 digits (should return 404 to avoid enumeration disclosure)
  const req2 = new Request("http://localhost/api/appointments/status", {
    method: "POST",
    body: JSON.stringify({ requestId: "PCH-2026-X8B9Z1", phoneLast4: "9999" })
  });
  const res2 = await statusPostHandler(req2);
  assert.equal(res2.status, 404);
  const data2 = await res2.json();
  assert.match(data2.error, /not found or verification failed/);

  // 3. Check with valid last 4 digits (should return 200 with data, and phone number MUST be excluded)
  const req3 = new Request("http://localhost/api/appointments/status", {
    method: "POST",
    body: JSON.stringify({ requestId: "PCH-2026-X8B9Z1", phoneLast4: "3210" })
  });
  const res3 = await statusPostHandler(req3);
  assert.equal(res3.status, 200);
  const data3 = await res3.json();
  assert.equal(data3.data.status, "PENDING");
  assert.equal(data3.data.phone, undefined); // verified phone is excluded
  assert.equal(data3.data.department_name, "Dental");
});
