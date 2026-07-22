import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// ---------------------------------------------------------------------------
// Helper: load the raw source of a file so tests can do structural assertions
// ---------------------------------------------------------------------------
async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

const SAMPLE_DETAILS = {
  requestId: "PCH-2026-TEST01",
  patientName: "Ravi Kumar",
  phone: "9220463438",
  email: "ravi@example.com",
  departmentName: "Cardiology",
  requestedDate: "2026-08-15",
  requestedTime: "10:30 AM",
  concern: "Chest pain and shortness of breath",
};

// ---------------------------------------------------------------------------
// 1. appointment-email.ts exists and exports the two expected functions
// ---------------------------------------------------------------------------
test("appointment-email.ts exists and exports required functions", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.length > 100, "appointment-email.ts must be substantive");
  assert.ok(
    src.includes("export function getHospitalAppointmentAlertTemplate"),
    "must export getHospitalAppointmentAlertTemplate",
  );
  assert.ok(
    src.includes("export async function sendHospitalAppointmentAlert"),
    "must export sendHospitalAppointmentAlert",
  );
});

// ---------------------------------------------------------------------------
// 2. AppointmentAlertResult is a discriminated union with SENT/FAILED/SKIPPED
// ---------------------------------------------------------------------------
test("AppointmentAlertResult uses typed status discriminant", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("AppointmentAlertResult"), "must define AppointmentAlertResult type");
  assert.ok(src.includes('status: "SENT"'), "must have SENT status");
  assert.ok(src.includes('status: "FAILED"'), "must have FAILED status");
  assert.ok(src.includes('status: "SKIPPED"'), "must have SKIPPED status");
});

// ---------------------------------------------------------------------------
// 3. sendHospitalAppointmentAlert returns status: SKIPPED when no recipient
// ---------------------------------------------------------------------------
test("returns SKIPPED/NOT_CONFIGURED when no recipient configured", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  delete process.env.ADMIN_SUPER_EMAIL;
  try {
    const result = await mod.sendHospitalAppointmentAlert(SAMPLE_DETAILS);
    assert.equal(result.status, "SKIPPED", "must return SKIPPED status");
    assert.equal(result.reason, "NOT_CONFIGURED", "reason must be NOT_CONFIGURED");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
  }
});

// ---------------------------------------------------------------------------
// 4. sendHospitalAppointmentAlert returns status: SKIPPED/MOCKED in mock mode
// ---------------------------------------------------------------------------
test("returns SKIPPED/MOCKED when RESEND_API_KEY is absent", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  const origKey = process.env.RESEND_API_KEY;
  process.env.APPOINTMENT_ALERT_TO_EMAIL = "alert-hospital@test.com";
  delete process.env.ADMIN_SUPER_EMAIL;
  delete process.env.RESEND_API_KEY;
  try {
    const result = await mod.sendHospitalAppointmentAlert(SAMPLE_DETAILS);
    assert.equal(result.status, "SKIPPED", "mocked mode must return SKIPPED, not SENT");
    assert.equal(result.reason, "MOCKED", "reason must be MOCKED");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    else delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
    if (origKey) process.env.RESEND_API_KEY = origKey;
    else delete process.env.RESEND_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// 5. sendHospitalAppointmentAlert uses APPOINTMENT_ALERT_TO_EMAIL when set
// ---------------------------------------------------------------------------
test("uses APPOINTMENT_ALERT_TO_EMAIL over ADMIN_SUPER_EMAIL", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  const origKey = process.env.RESEND_API_KEY;
  process.env.APPOINTMENT_ALERT_TO_EMAIL = "alert-hospital@test.com";
  process.env.ADMIN_SUPER_EMAIL = "admin-fallback@test.com";
  delete process.env.RESEND_API_KEY;
  try {
    const result = await mod.sendHospitalAppointmentAlert(SAMPLE_DETAILS);
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.reason, "MOCKED");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    else delete process.env.ADMIN_SUPER_EMAIL;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    else delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
    if (origKey) process.env.RESEND_API_KEY = origKey;
    else delete process.env.RESEND_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// 6. sendHospitalAppointmentAlert falls back to ADMIN_SUPER_EMAIL
// ---------------------------------------------------------------------------
test("falls back to ADMIN_SUPER_EMAIL when APPOINTMENT_ALERT_TO_EMAIL is absent", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  const origKey = process.env.RESEND_API_KEY;
  process.env.ADMIN_SUPER_EMAIL = "admin-fallback@test.com";
  delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  delete process.env.RESEND_API_KEY;
  try {
    const result = await mod.sendHospitalAppointmentAlert(SAMPLE_DETAILS);
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.reason, "MOCKED");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    else delete process.env.ADMIN_SUPER_EMAIL;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    if (origKey) process.env.RESEND_API_KEY = origKey;
    else delete process.env.RESEND_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// 7. Template renders all data fields including submittedAt
// ---------------------------------------------------------------------------
test("getHospitalAppointmentAlertTemplate renders all fields", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    ...SAMPLE_DETAILS,
    submittedAt: "2026-07-22T10:00:00.000Z",
  });
  assert.ok(html.includes("PCH-2026-TEST01"), "must render requestId");
  assert.ok(html.includes("Ravi Kumar"), "must render patientName");
  assert.ok(html.includes("9220463438"), "must render phone");
  assert.ok(html.includes("ravi@example.com"), "must render email");
  assert.ok(html.includes("Cardiology"), "must render departmentName");
  assert.ok(html.includes("2026-08-15"), "must render requestedDate");
  assert.ok(html.includes("10:30 AM"), "must render requestedTime");
  assert.ok(html.includes("Chest pain and shortness of breath"), "must render concern");
  assert.ok(html.includes("2026-07-22T10:00:00.000Z"), "must render submittedAt");
});

// ---------------------------------------------------------------------------
// 8. Template escapes HTML entities (XSS prevention)
// ---------------------------------------------------------------------------
test("getHospitalAppointmentAlertTemplate escapes HTML entities", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    ...SAMPLE_DETAILS,
    patientName: '<script>alert("xss")</script>',
    departmentName: "Dept & Co",
    concern: 'Hello "world" <b>bold</b>',
    submittedAt: "2026-07-22T10:00:00.000Z",
  });
  assert.ok(!html.includes("<script>"), "must escape <script> tags");
  assert.ok(!html.includes("</script>"), "must escape closing script tags");
  assert.ok(html.includes("&amp;"), "must escape ampersand");
  assert.ok(html.includes("&lt;"), "must escape <");
  assert.ok(html.includes("&gt;"), "must escape >");
  assert.ok(html.includes("&quot;"), "must escape double quotes");
});

// ---------------------------------------------------------------------------
// 9. Subject is safe: no patient name, includes requestId and departmentName
// ---------------------------------------------------------------------------
test("subject must not contain patient name", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  const subjectLine = src.match(/subject\s*=\s*`([^`]+)`/);
  assert.ok(subjectLine, "must define subject using template literal");
  assert.ok(!subjectLine[1].includes("patientName"), "subject must NOT include patientName");
  assert.ok(subjectLine[1].includes("requestId"), "subject must include requestId");
  assert.ok(subjectLine[1].includes("departmentName"), "subject must include departmentName");
});

// ---------------------------------------------------------------------------
// 10. Template includes "New Appointment Request" heading and hospital branding
// ---------------------------------------------------------------------------
test("template contains heading and branding", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    ...SAMPLE_DETAILS,
    submittedAt: "2026-07-22T10:00:00.000Z",
  });
  assert.ok(html.includes("New Appointment Request"), "must have heading");
  assert.ok(html.includes("Protone Care Hospital"), "must include hospital branding");
});

// ---------------------------------------------------------------------------
// 11. Template uses HTML table layout
// ---------------------------------------------------------------------------
test("template uses HTML table layout", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    ...SAMPLE_DETAILS,
    submittedAt: "2026-07-22T10:00:00.000Z",
  });
  assert.ok(html.includes("<table"), "must use HTML table");
  assert.ok(html.includes("</table>"), "must close table tag");
  assert.ok(html.includes("<tr>"), "must use table rows");
});

// ---------------------------------------------------------------------------
// 12. Template footer includes current year
// ---------------------------------------------------------------------------
test("template footer includes current year", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    ...SAMPLE_DETAILS,
    submittedAt: "2026-07-22T10:00:00.000Z",
  });
  const currentYear = String(new Date().getFullYear());
  assert.ok(html.includes(currentYear), `must include current year ${currentYear}`);
});

// ---------------------------------------------------------------------------
// 13. sendHospitalAppointmentAlert never throws
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert never throws", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  process.env.APPOINTMENT_ALERT_TO_EMAIL = "test@test.com";
  try {
    const result = await mod.sendHospitalAppointmentAlert(SAMPLE_DETAILS);
    assert.ok(typeof result === "object", "must return object");
    assert.ok("status" in result, "must have status field");
    assert.ok(["SENT", "FAILED", "SKIPPED"].includes(result.status), "status must be valid discriminant");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    else delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  }
});

// ---------------------------------------------------------------------------
// 14. sendHospitalAppointmentAlert passes replyTo as patient email
// ---------------------------------------------------------------------------
test("replyTo is patient email", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("replyTo: details.email"), "must pass replyTo: details.email to sendEmail");
});

// ---------------------------------------------------------------------------
// 15. appointment-email.ts validates recipient email with a regex helper
// ---------------------------------------------------------------------------
test("appointment-email.ts validates recipient email locally", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("isValidEmail"), "must define an isValidEmail helper");
  assert.ok(src.includes("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/"), "must use a standard email regex");
});

// ---------------------------------------------------------------------------
// 16. Resend.ts: SendEmailResult includes all expected fields
// ---------------------------------------------------------------------------
test("resend.ts SendEmailResult has all expected fields", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("SendEmailResult"), "must export SendEmailResult type");
  assert.ok(src.includes("success:"), "must have success field");
  assert.ok(src.includes("mocked?:"), "must have optional mocked");
  assert.ok(src.includes("id?:"), "must have optional id");
  assert.ok(src.includes("error?:"), "must have optional error");
  assert.ok(src.includes("errorCode?:"), "must have optional errorCode");
  assert.ok(src.includes("recipientBlocked?:"), "must have optional recipientBlocked");
});

// ---------------------------------------------------------------------------
// 17. Resend.ts: sendEmail includes replyTo in request body
// ---------------------------------------------------------------------------
test("resend.ts sendEmail conditionally includes reply_to in request body", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("reply_to"), "must send reply_to in Resend API body");
});

// ---------------------------------------------------------------------------
// 18. Resend.ts: replyTo in SendEmailParams
// ---------------------------------------------------------------------------
test("resend.ts SendEmailParams includes replyTo", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("replyTo"), "sendEmail params must accept replyTo");
});

// ---------------------------------------------------------------------------
// 19. Resend.ts: resolveFromEmail reads RESEND_FROM_EMAIL
// ---------------------------------------------------------------------------
test("resend.ts resolveFromEmail supports RESEND_FROM_EMAIL override", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("RESEND_FROM_EMAIL"), "must support RESEND_FROM_EMAIL env");
});

// ---------------------------------------------------------------------------
// 20. Route imports sendHospitalAppointmentAlert
// ---------------------------------------------------------------------------
test("appointments/route.ts imports sendHospitalAppointmentAlert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(
    src.includes('import { sendHospitalAppointmentAlert } from "@/app/lib/appointment-email"'),
    "must import sendHospitalAppointmentAlert from appointment-email",
  );
});

// ---------------------------------------------------------------------------
// 21. Route calls sendHospitalAppointmentAlert after D1 insert
// ---------------------------------------------------------------------------
test("route calls sendHospitalAppointmentAlert after insert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const insertPos = src.indexOf("INSERT INTO appointments");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  assert.ok(insertPos > 0, "must contain INSERT INTO appointments");
  assert.ok(alertCallPos > 0, "must call sendHospitalAppointmentAlert({");
  assert.ok(alertCallPos > insertPos, "alert call must be after D1 insert");
});

// ---------------------------------------------------------------------------
// 22. Route audits APPOINTMENT_ALERT_SENT
// ---------------------------------------------------------------------------
test("route audits APPOINTMENT_ALERT_SENT", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(src.includes("APPOINTMENT_ALERT_SENT"), "must audit APPOINTMENT_ALERT_SENT");
});

// ---------------------------------------------------------------------------
// 23. Route audits APPOINTMENT_ALERT_FAILED
// ---------------------------------------------------------------------------
test("route audits APPOINTMENT_ALERT_FAILED", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(src.includes("APPOINTMENT_ALERT_FAILED"), "must audit APPOINTMENT_ALERT_FAILED");
});

// ---------------------------------------------------------------------------
// 24. Route audits APPOINTMENT_ALERT_SKIPPED
// ---------------------------------------------------------------------------
test("route audits APPOINTMENT_ALERT_SKIPPED", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(src.includes("APPOINTMENT_ALERT_SKIPPED"), "must audit APPOINTMENT_ALERT_SKIPPED");
});

// ---------------------------------------------------------------------------
// 25. Route wraps alert in try/catch
// ---------------------------------------------------------------------------
test("route wraps alert in try/catch", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  const catchPos = src.indexOf("} catch {", alertCallPos);
  assert.ok(catchPos > alertCallPos, "alert call must be wrapped in try/catch");
});

// ---------------------------------------------------------------------------
// 26. Route audit details contain no PII (no patientName, email, phone)
// ---------------------------------------------------------------------------
test("audit details contain no PII", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const alertSentBlock = src.substring(
    src.indexOf("APPOINTMENT_ALERT_SENT"),
    src.indexOf("APPOINTMENT_ALERT_SENT") + 200,
  );
  assert.ok(!alertSentBlock.includes("patientName"), "APPOINTMENT_ALERT_SENT must not contain patientName");
  assert.ok(!alertSentBlock.includes("email"), "APPOINTMENT_ALERT_SENT must not contain email field");
  assert.ok(!alertSentBlock.includes("phone"), "APPOINTMENT_ALERT_SENT must not contain phone");
  const alertSkippedBlock = src.substring(
    src.indexOf("APPOINTMENT_ALERT_SKIPPED"),
    src.indexOf("APPOINTMENT_ALERT_SKIPPED") + 200,
  );
  assert.ok(!alertSkippedBlock.includes("patientName"), "APPOINTMENT_ALERT_SKIPPED must not contain patientName");
});

// ---------------------------------------------------------------------------
// 27. Route alert ordering: APPOINTMENT_CREATED -> alert -> responseData
// ---------------------------------------------------------------------------
test("alert ordering: APPOINTMENT_CREATED -> alert -> responseData", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const createdAuditPos = src.indexOf("APPOINTMENT_CREATED");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  const responseDataPos = src.indexOf("const responseData = {", alertCallPos);
  assert.ok(createdAuditPos < alertCallPos, "APPOINTMENT_CREATED audit must precede alert");
  assert.ok(alertCallPos < responseDataPos, "alert must precede responseData construction");
});

// ---------------------------------------------------------------------------
// 28. Route success response always returned after alert
// ---------------------------------------------------------------------------
test("success response is always returned after alert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  const responseDataPos = src.indexOf("const responseData = {", alertCallPos);
  const returnJsonPos = src.indexOf("return json(responseData)", responseDataPos);
  assert.ok(responseDataPos > alertCallPos, "responseData must be constructed after alert");
  assert.ok(returnJsonPos > responseDataPos, "return json(responseData) must follow responseData");
});

// ---------------------------------------------------------------------------
// 29. appointment-email.ts never uses result.mocked to report sent:true
// ---------------------------------------------------------------------------
test("appointment-email.ts never treats mocked as sent", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  const sentTrueLines = src.split("\n").filter((l) => l.includes("sent: true"));
  assert.equal(sentTrueLines.length, 0, "must not contain any 'sent: true' pattern");
  assert.ok(src.includes('status: "SKIPPED"'), "must use SKIPPED status for mocked/no-key");
});

// ---------------------------------------------------------------------------
// 30. worker-configuration.d.ts includes APPOINTMENT_ALERT_TO_EMAIL in env types
// ---------------------------------------------------------------------------
test("worker-configuration.d.ts includes APPOINTMENT_ALERT_TO_EMAIL", async () => {
  const src = await readSource("../worker-configuration.d.ts");
  assert.ok(
    src.includes("APPOINTMENT_ALERT_TO_EMAIL"),
    "worker-configuration.d.ts must declare APPOINTMENT_ALERT_TO_EMAIL in env types",
  );
});
