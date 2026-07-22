import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// ---------------------------------------------------------------------------
// Helper: load the raw source of a file so tests can do structural assertions
// ---------------------------------------------------------------------------
async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

// ---------------------------------------------------------------------------
// 1. appointment-email.ts exists and is non-empty
// ---------------------------------------------------------------------------
test("appointment-email.ts exists", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.length > 100, "appointment-email.ts must be substantive");
});

// ---------------------------------------------------------------------------
// 2. getHospitalAppointmentAlertTemplate is exported
// ---------------------------------------------------------------------------
test("getHospitalAppointmentAlertTemplate is exported", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(
    src.includes("export function getHospitalAppointmentAlertTemplate"),
    "must export getHospitalAppointmentAlertTemplate",
  );
});

// ---------------------------------------------------------------------------
// 3. sendHospitalAppointmentAlert is exported
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert is exported", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(
    src.includes("export async function sendHospitalAppointmentAlert"),
    "must export sendHospitalAppointmentAlert",
  );
});

// ---------------------------------------------------------------------------
// 4. Template contains all required data fields
// ---------------------------------------------------------------------------
test("template includes requestId", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("requestId"), "template must reference requestId");
});

test("template includes patientName", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("patientName"), "template must reference patientName");
});

test("template includes phone", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("phone"), "template must reference phone");
});

test("template includes email", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("email"), "template must reference email");
});

test("template includes departmentName", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("departmentName"), "template must reference departmentName");
});

test("template includes requestedDate", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("requestedDate"), "template must reference requestedDate");
});

test("template includes requestedTime", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("requestedTime"), "template must reference requestedTime");
});

test("template includes concern", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("concern"), "template must reference concern");
});

// ---------------------------------------------------------------------------
// 5. Template renders actual values (runtime test)
// ---------------------------------------------------------------------------
test("getHospitalAppointmentAlertTemplate renders all fields", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    requestId: "PCH-2026-TEST01",
    patientName: "Ravi Kumar",
    phone: "9220463438",
    email: "ravi@example.com",
    departmentName: "Cardiology",
    requestedDate: "2026-08-15",
    requestedTime: "10:30 AM",
    concern: "Chest pain and shortness of breath",
  });
  assert.ok(html.includes("PCH-2026-TEST01"), "must render requestId");
  assert.ok(html.includes("Ravi Kumar"), "must render patientName");
  assert.ok(html.includes("9220463438"), "must render phone");
  assert.ok(html.includes("ravi@example.com"), "must render email");
  assert.ok(html.includes("Cardiology"), "must render departmentName");
  assert.ok(html.includes("2026-08-15"), "must render requestedDate");
  assert.ok(html.includes("10:30 AM"), "must render requestedTime");
  assert.ok(html.includes("Chest pain and shortness of breath"), "must render concern");
});

// ---------------------------------------------------------------------------
// 6. Template HTML-escapes special characters (XSS prevention)
// ---------------------------------------------------------------------------
test("getHospitalAppointmentAlertTemplate escapes HTML entities", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    requestId: "PCH-2026-XSS",
    patientName: '<script>alert("xss")</script>',
    phone: "1234567890",
    email: "test@example.com",
    departmentName: "Dept & Co",
    requestedDate: "2026-08-01",
    requestedTime: "10:00 AM",
    concern: 'Hello "world" <b>bold</b>',
  });
  assert.ok(!html.includes("<script>"), "must escape <script> tags");
  assert.ok(!html.includes("</script>"), "must escape closing script tags");
  assert.ok(html.includes("&amp;"), "must escape ampersand");
  assert.ok(html.includes("&lt;"), "must escape <");
  assert.ok(html.includes("&gt;"), "must escape >");
  assert.ok(html.includes("&quot;"), "must escape double quotes");
});

// ---------------------------------------------------------------------------
// 7. sendHospitalAppointmentAlert skips when no recipient configured
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert returns sent:false when no recipient", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  delete process.env.ADMIN_SUPER_EMAIL;
  try {
    const result = await mod.sendHospitalAppointmentAlert({
      requestId: "PCH-2026-NO01",
      patientName: "Test",
      phone: "9999999999",
      email: "test@test.com",
      departmentName: "Dept",
      requestedDate: "2026-08-01",
      requestedTime: "10:00 AM",
      concern: "Test concern text",
    });
    assert.equal(result.sent, false, "must not send");
    assert.equal(result.recipient, null, "recipient must be null");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
  }
});

// ---------------------------------------------------------------------------
// 8. sendHospitalAppointmentAlert uses APPOINTMENT_ALERT_TO_EMAIL when set
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert uses APPOINTMENT_ALERT_TO_EMAIL", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  process.env.APPOINTMENT_ALERT_TO_EMAIL = "alert-hospital@test.com";
  delete process.env.ADMIN_SUPER_EMAIL;
  try {
    // RESEND_API_KEY is not set → mocked → success
    const result = await mod.sendHospitalAppointmentAlert({
      requestId: "PCH-2026-AL01",
      patientName: "Asha Devi",
      phone: "9123456789",
      email: "asha@test.com",
      departmentName: "Neurology",
      requestedDate: "2026-09-01",
      requestedTime: "11:00 AM",
      concern: "Persistent headache",
    });
    assert.equal(result.sent, true, "must succeed in mock mode");
    assert.equal(result.recipient, "alert-hospital@test.com", "must use APPOINTMENT_ALERT_TO_EMAIL");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    else delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  }
});

// ---------------------------------------------------------------------------
// 9. sendHospitalAppointmentAlert falls back to ADMIN_SUPER_EMAIL
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert falls back to ADMIN_SUPER_EMAIL", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAdmin = process.env.ADMIN_SUPER_EMAIL;
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  process.env.ADMIN_SUPER_EMAIL = "admin-fallback@test.com";
  try {
    const result = await mod.sendHospitalAppointmentAlert({
      requestId: "PCH-2026-FB01",
      patientName: "Raj Patel",
      phone: "9876543210",
      email: "raj@test.com",
      departmentName: "Orthopedics",
      requestedDate: "2026-10-01",
      requestedTime: "02:00 PM",
      concern: "Knee pain after injury",
    });
    assert.equal(result.sent, true, "must succeed in mock mode");
    assert.equal(result.recipient, "admin-fallback@test.com", "must fall back to ADMIN_SUPER_EMAIL");
  } finally {
    if (origAdmin) process.env.ADMIN_SUPER_EMAIL = origAdmin;
    else delete process.env.ADMIN_SUPER_EMAIL;
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    else delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  }
});

// ---------------------------------------------------------------------------
// 10. sendHospitalAppointmentAlert returns error details on failure
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert captures email errors", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("} catch (error)"), "must have catch(error) block around sendEmail");
  assert.ok(src.includes("return { sent: false, recipient, error:"), "must return sent:false with error on failure");
});

// ---------------------------------------------------------------------------
// 11. Template contains "New Appointment Request" heading
// ---------------------------------------------------------------------------
test("template has correct heading", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    requestId: "PCH-2026-HD01",
    patientName: "Test",
    phone: "9000000000",
    email: "test@test.com",
    departmentName: "Test",
    requestedDate: "2026-01-01",
    requestedTime: "10:00 AM",
    concern: "Heading test",
  });
  assert.ok(html.includes("New Appointment Request"), "must have New Appointment Request heading");
});

// ---------------------------------------------------------------------------
// 12. Template contains hospital branding
// ---------------------------------------------------------------------------
test("template contains Protone Care Hospital branding", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    requestId: "PCH-2026-BR01",
    patientName: "Test",
    phone: "9000000000",
    email: "test@test.com",
    departmentName: "Test",
    requestedDate: "2026-01-01",
    requestedTime: "10:00 AM",
    concern: "Branding test",
  });
  assert.ok(html.includes("Protone Care Hospital"), "must include hospital name");
});

// ---------------------------------------------------------------------------
// 13. sendHospitalAppointmentAlert replyTo is patient email
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert passes replyTo as patient email", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("replyTo: details.email"), "must pass replyTo: details.email to sendEmail");
});

// ---------------------------------------------------------------------------
// 14. resend.ts now supports replyTo in SendEmailParams interface
// ---------------------------------------------------------------------------
test("resend.ts SendEmailParams includes replyTo", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("replyTo"), "sendEmail params must accept replyTo");
});

// ---------------------------------------------------------------------------
// 15. resend.ts SendEmailResult interface exists
// ---------------------------------------------------------------------------
test("resend.ts exports SendEmailResult type", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("SendEmailResult"), "must export SendEmailResult type");
});

// ---------------------------------------------------------------------------
// 16. resend.ts resolveFromEmail reads RESEND_FROM_EMAIL
// ---------------------------------------------------------------------------
test("resend.ts resolveFromEmail supports RESEND_FROM_EMAIL override", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("RESEND_FROM_EMAIL"), "must support RESEND_FROM_EMAIL env");
});

// ---------------------------------------------------------------------------
// 17. resend.ts sendEmail includes replyTo in fetch body when provided
// ---------------------------------------------------------------------------
test("resend.ts sendEmail conditionally includes reply_to in request body", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("reply_to"), "must send reply_to in Resend API body");
});

// ---------------------------------------------------------------------------
// 18. Appointment route imports appointment-email
// ---------------------------------------------------------------------------
test("appointments/route.ts imports sendHospitalAppointmentAlert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(
    src.includes('import { sendHospitalAppointmentAlert } from "@/app/lib/appointment-email"'),
    "must import sendHospitalAppointmentAlert from appointment-email",
  );
});

// ---------------------------------------------------------------------------
// 19. Appointment route calls sendHospitalAppointmentAlert after D1 insert
// ---------------------------------------------------------------------------
test("appointments/route.ts calls sendHospitalAppointmentAlert after insert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const insertPos = src.indexOf("INSERT INTO appointments");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  assert.ok(insertPos > 0, "must contain INSERT INTO appointments");
  assert.ok(alertCallPos > 0, "must call sendHospitalAppointmentAlert({");
  assert.ok(alertCallPos > insertPos, "alert call must be after D1 insert");
});

// ---------------------------------------------------------------------------
// 20. Appointment route audits APPOINTMENT_ALERT_SENT
// ---------------------------------------------------------------------------
test("appointments/route.ts audits APPOINTMENT_ALERT_SENT", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(src.includes("APPOINTMENT_ALERT_SENT"), "must audit APPOINTMENT_ALERT_SENT");
});

// ---------------------------------------------------------------------------
// 21. Appointment route audits APPOINTMENT_ALERT_SKIPPED
// ---------------------------------------------------------------------------
test("appointments/route.ts audits APPOINTMENT_ALERT_SKIPPED", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  assert.ok(src.includes("APPOINTMENT_ALERT_SKIPPED"), "must audit APPOINTMENT_ALERT_SKIPPED");
});

// ---------------------------------------------------------------------------
// 22. Alert call is inside try/catch (never blocks booking)
// ---------------------------------------------------------------------------
test("appointments/route.ts wraps alert in try/catch", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  const catchPos = src.indexOf("} catch {", alertCallPos);
  assert.ok(catchPos > alertCallPos, "alert call must be wrapped in try/catch");
});

// ---------------------------------------------------------------------------
// 23. Alert is after audit(APOINTMENT_CREATED) and before responseData
// ---------------------------------------------------------------------------
test("appointments/route.ts alert ordering: APPOINTMENT_CREATED → alert → responseData", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const createdAuditPos = src.indexOf("APPOINTMENT_CREATED");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  const responseDataPos = src.indexOf("const responseData = {", alertCallPos);
  assert.ok(createdAuditPos < alertCallPos, "APPOINTMENT_CREATED audit must precede alert");
  assert.ok(alertCallPos < responseDataPos, "alert must precede responseData construction");
});

// ---------------------------------------------------------------------------
// 24. appointment-email.ts resolves APPOINTMENT_ALERT_TO_EMAIL before ADMIN_SUPER_EMAIL
// ---------------------------------------------------------------------------
test("appointment-email.ts priority: APPOINTMENT_ALERT_TO_EMAIL > ADMIN_SUPER_EMAIL", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  const alertToPos = src.indexOf("APPOINTMENT_ALERT_TO_EMAIL");
  const adminPos = src.indexOf("ADMIN_SUPER_EMAIL");
  assert.ok(alertToPos >= 0, "must check APPOINTMENT_ALERT_TO_EMAIL");
  assert.ok(adminPos >= 0, "must check ADMIN_SUPER_EMAIL");
  assert.ok(alertToPos < adminPos, "APPOINTMENT_ALERT_TO_EMAIL must have higher priority (checked first)");
});

// ---------------------------------------------------------------------------
// 25. appointment-email.ts never throws (always returns result)
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert never throws", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const origAlertTo = process.env.APPOINTMENT_ALERT_TO_EMAIL;
  process.env.APPOINTMENT_ALERT_TO_EMAIL = "test@test.com";
  try {
    const result = await mod.sendHospitalAppointmentAlert({
      requestId: "PCH-2026-NT01",
      patientName: "No Throw",
      phone: "9000000000",
      email: "nothrow@test.com",
      departmentName: "Test",
      requestedDate: "2026-01-01",
      requestedTime: "10:00 AM",
      concern: "No throw test concern",
    });
    assert.ok(typeof result === "object", "must return object");
    assert.ok(typeof result.sent === "boolean", "must have boolean sent");
  } finally {
    if (origAlertTo) process.env.APPOINTMENT_ALERT_TO_EMAIL = origAlertTo;
    else delete process.env.APPOINTMENT_ALERT_TO_EMAIL;
  }
});

// ---------------------------------------------------------------------------
// 26. Template contains current year (dynamic footer)
// ---------------------------------------------------------------------------
test("template footer includes current year", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    requestId: "PCH-2026-YR01",
    patientName: "Test",
    phone: "9000000000",
    email: "test@test.com",
    departmentName: "Test",
    requestedDate: "2026-01-01",
    requestedTime: "10:00 AM",
    concern: "Year test",
  });
  const currentYear = String(new Date().getFullYear());
  assert.ok(html.includes(currentYear), `must include current year ${currentYear}`);
});

// ---------------------------------------------------------------------------
// 27. sendHospitalAppointmentAlert subject includes patient name and requestId
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert subject includes patient name and requestId", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("details.patientName"), "subject must reference patientName");
  assert.ok(src.includes("details.requestId"), "subject must reference requestId");
  assert.ok(src.includes("New Appointment Request"), "subject must contain New Appointment Request");
});

// ---------------------------------------------------------------------------
// 28. sendHospitalAppointmentAlert sends to the right `to` field
// ---------------------------------------------------------------------------
test("sendHospitalAppointmentAlert sends to resolved recipient", async () => {
  const src = await readSource("../app/lib/appointment-email.ts");
  assert.ok(src.includes("to: recipient"), "must send to: recipient to sendEmail");
});

// ---------------------------------------------------------------------------
// 29. resend.ts SendEmailResult includes id, mocked, error, recipientBlocked
// ---------------------------------------------------------------------------
test("resend.ts SendEmailResult has all expected fields", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(src.includes("id?:"), "SendEmailResult must have optional id");
  assert.ok(src.includes("mocked?:"), "SendEmailResult must have optional mocked");
  assert.ok(src.includes("error?:"), "SendEmailResult must have optional error");
  assert.ok(src.includes("recipientBlocked?:"), "SendEmailResult must have optional recipientBlocked");
});

// ---------------------------------------------------------------------------
// 30. resend.ts sendEmail parses response JSON to extract id
// ---------------------------------------------------------------------------
test("resend.ts sendEmail extracts id from response", async () => {
  const src = await readSource("../app/lib/resend.ts");
  assert.ok(
    src.includes("await response.json()") || src.includes("response.json()"),
    "sendEmail must parse response JSON for id",
  );
});

// ---------------------------------------------------------------------------
// 31. Appointment route alert always returns success response to patient
// ---------------------------------------------------------------------------
test("appointments/route.ts success response is always returned after alert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  const responseDataPos = src.indexOf("const responseData = {", alertCallPos);
  const returnJsonPos = src.indexOf("return json(responseData)", responseDataPos);
  assert.ok(responseDataPos > alertCallPos, "responseData must be constructed after alert");
  assert.ok(returnJsonPos > responseDataPos, "return json(responseData) must follow responseData");
});

// ---------------------------------------------------------------------------
// 32. appointments/route.ts APPOINTMENT_CREATED audit comes before alert
// ---------------------------------------------------------------------------
test("appointments/route.ts APPOINTMENT_CREATED audit precedes alert", async () => {
  const src = await readSource("../app/api/appointments/route.ts");
  const createdAuditPos = src.indexOf("APPOINTMENT_CREATED");
  const alertCallPos = src.indexOf("sendHospitalAppointmentAlert({");
  assert.ok(createdAuditPos < alertCallPos, "APPOINTMENT_CREATED audit must precede alert call");
});

// ---------------------------------------------------------------------------
// 33. Template uses standard HTML table layout (not markdown)
// ---------------------------------------------------------------------------
test("template uses HTML table layout", async () => {
  const mod = await import("../app/lib/appointment-email.ts");
  const html = mod.getHospitalAppointmentAlertTemplate({
    requestId: "PCH-2026-TB01",
    patientName: "Test",
    phone: "9000000000",
    email: "test@test.com",
    departmentName: "Test",
    requestedDate: "2026-01-01",
    requestedTime: "10:00 AM",
    concern: "Table test",
  });
  assert.ok(html.includes("<table"), "template must use HTML table");
  assert.ok(html.includes("</table>"), "template must close table tag");
  assert.ok(html.includes("<tr>"), "template must use table rows");
});
