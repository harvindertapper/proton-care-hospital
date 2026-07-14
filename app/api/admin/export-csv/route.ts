import { query, requireAdmin } from "@/app/lib/server";

function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (str.startsWith("=") || str.startsWith("+") || str.startsWith("-") || str.startsWith("@")) {
    return `'${str}`;
  }
  return str;
}

function escapeCsv(str: string): string {
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET() {
  const admin = await requireAdmin("SUPER_ADMIN");
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const appointments = await query<Record<string, unknown>>(
      "SELECT id, request_id, patient_name, phone, email, department_slug, department_name, requested_date, requested_time, status, concern, consent, otp_verified, created_at, schedule_version FROM appointments ORDER BY created_at DESC"
    );
    const rows = appointments.results || [];

    let totalConfirmed = 0;
    let totalContacted = 0;
    let totalEmergency = 0;

    const csvRows: string[] = [];

    // Header
    csvRows.push("Request ID,Patient Name,Phone,Email,Department Name,Requested Date,Requested Time,Status,Concern,Consent,OTP Verified,Created At,Schedule Version");

    for (const row of rows) {
      const status = String(row.status || "").toUpperCase();
      const deptSlug = String(row.department_slug || "").toLowerCase();

      if (status === "CONFIRMED") totalConfirmed++;
      if (status === "CONTACTED") totalContacted++;
      if (deptSlug === "emergency-medicine") totalEmergency++;

      const cells = [
        sanitizeCsvCell(row.request_id),
        sanitizeCsvCell(row.patient_name),
        sanitizeCsvCell(row.phone),
        sanitizeCsvCell(row.email),
        sanitizeCsvCell(row.department_name),
        sanitizeCsvCell(row.requested_date),
        sanitizeCsvCell(row.requested_time),
        sanitizeCsvCell(row.status),
        sanitizeCsvCell(row.concern),
        row.consent ? "Yes" : "No",
        row.otp_verified ? "Yes" : "No",
        sanitizeCsvCell(row.created_at),
        sanitizeCsvCell(row.schedule_version),
      ];

      csvRows.push(cells.map(escapeCsv).join(","));
    }

    // Add empty lines and summary block
    csvRows.push("");
    csvRows.push("Summary Metrics");
    csvRows.push(`Metric,Value`);
    csvRows.push(`Total Confirmed,${totalConfirmed}`);
    csvRows.push(`Total Contacted,${totalContacted}`);
    csvRows.push(`Total Emergency Bypasses,${totalEmergency}`);

    const csvContent = csvRows.join("\n");

    return new Response(csvContent, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=appointments_export_${Date.now()}.csv`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to export CSV." },
      { status: 500 }
    );
  }
}
