import { audit, checkRateLimit, getClientIp, getR2, json, query, requireAdmin, run, verifyCsrf } from "@/app/lib/server";
import { executeMediaDeletion } from "@/app/lib/mutation-result";
import { validateMediaUpload } from "@/app/lib/media-policy";

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "upload";
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return json({ error: admin.error, ...(admin.code ? { code: admin.code } : {}) }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });

  const ip = getClientIp(request);
  const limit = await checkRateLimit("admin-media", `${admin.session.email}:${ip}`, 20, 15 * 60);
  if (!limit.ok) return json({ error: "Too many uploads. Please wait and try again." }, { status: 429 });

  const bucket = getR2();
  if (!bucket) return json({ error: "R2 media binding is not configured." }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  const purpose = typeof form.get("purpose") === "string"
    ? String(form.get("purpose")).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "admin-upload"
    : "admin-upload";
  const consentNote = typeof form.get("consentNote") === "string" ? String(form.get("consentNote")).slice(0, 600) : "";

  if (!(file instanceof File)) {
    return json({ error: "Image file is required." }, { status: 400 });
  }

  if (purpose === "gallery" && admin.session.role !== "SUPER_ADMIN") {
    return json({ error: "Only super admin may upload gallery assets directly." }, { status: 403 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const validation = validateMediaUpload({ file, purpose, bytes });
  if (!validation.ok) {
    return json({ error: validation.error }, { status: validation.status });
  }

  const key = `${validation.purpose}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const id = crypto.randomUUID();

  try {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: validation.contentType },
      customMetadata: { uploadedBy: admin.session.email, consentNote },
    });
  } catch (r2Error) {
    console.error("R2 upload failed", r2Error);
    return json({ success: false, outcome: "FAILED", error: "Media upload to storage failed." }, { status: 502 });
  }

  let status: string;
  let isVisible: number;
  let lifecycleStatus: string;

  if (validation.purpose === "gallery") {
    status = "APPROVED";
    isVisible = 1;
    lifecycleStatus = "PUBLISHED";
  } else if (validation.purpose === "doctor-photo") {
    status = "APPROVED";
    isVisible = 1;
    lifecycleStatus = "PUBLISHED";
  } else {
    status = "HIDDEN";
    isVisible = 0;
    lifecycleStatus = "HIDDEN";
  }

  try {
    const result = await run(
      `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      key,
      file.name,
      validation.contentType,
      bytes.length,
      validation.purpose,
      admin.session.email,
      consentNote,
      status,
      isVisible,
      lifecycleStatus,
    );
    const changes = Number(result.meta?.changes || 0);
    if (changes < 1) {
      try { await bucket.delete(key); } catch (compErr) { console.error("Compensation delete failed after D1 zero-row", { key, compErr }); }
      return json({ success: false, outcome: "FAILED", error: "Media metadata creation failed." }, { status: 500 });
    }
  } catch (d1Error) {
    console.error("D1 insert failed after R2 write; compensating", { key, d1Error });
    try { await bucket.delete(key); } catch (compErr) { console.error("Compensation delete failed", { key, compErr }); }
    return json({ success: false, outcome: "FAILED", error: "Media metadata creation failed. Orphan was cleaned up." }, { status: 500 });
  }

  try {
    await audit(admin.session.email, "MEDIA_UPLOADED", "MediaAsset", id, key);
  } catch (auditError) {
    console.error("Audit write failed after successful upload", { key, auditError });
  }

  return json({ success: true, id, url: `/api/media/${key}`, key });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin({ role: "SUPER_ADMIN" });
  if (!admin.ok) return json({ error: admin.error, ...(admin.code ? { code: admin.code } : {}) }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });

  const bucket = getR2();
  if (!bucket) return json({ error: "R2 media binding is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return json({ error: "Media asset ID is required." }, { status: 400 });

  const refCheck = await query<{ r2_key: string; purpose: string }>(
    "SELECT r2_key, purpose FROM media_assets WHERE id = ? LIMIT 1",
    id,
  );
  const asset = refCheck.results?.[0];
  if (!asset) return json({ success: false, outcome: "NOT_FOUND", error: "Media asset not found." }, { status: 404 });

  const photoRefs = await query<{ id: string }>(
    "SELECT id FROM doctor_profiles WHERE photo_url LIKE ? AND is_deleted = 0 LIMIT 1",
    `%${asset.r2_key}%`,
  );
  if (photoRefs.results && photoRefs.results.length > 0) {
    return json(
      { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
      { status: 409 },
    );
  }

  try {
    const result = await executeMediaDeletion<{ r2_key: string }>({
      loadMetadata: async () => {
        const rows = await query<{ r2_key: string }>("SELECT r2_key FROM media_assets WHERE id = ? LIMIT 1", id);
        return rows.results?.[0] || null;
      },
      deleteObject: (a) => bucket.delete(a.r2_key),
      deleteMetadata: () => run("DELETE FROM media_assets WHERE id = ?", id),
      writeAudit: (a) => audit(admin.session.email, "MEDIA_DELETED", "MediaAsset", id, a.r2_key),
      logError: (message, error) => console.error(message, error),
    });

    if (result.outcome === "FAILED") {
      const objectFailed = result.stage === "OBJECT";
      return json(
        {
          success: false,
          outcome: "FAILED",
          error: objectFailed
            ? "Media object deletion failed; metadata was retained."
            : "Media deletion could not be finalized. The inconsistency was logged for recovery.",
        },
        { status: objectFailed ? 502 : 500 },
      );
    }

    return json({ success: true, outcome: "APPLIED" });
  } catch (error) {
    if (error instanceof Error && error.name === "MutationNotFoundError") {
      return json(
        { success: false, outcome: "NOT_FOUND", error: error.message },
        { status: 404 },
      );
    }
    console.error("Media deletion failed", error);
    return json(
      { success: false, outcome: "FAILED", error: "Media deletion failed." },
      { status: 500 },
    );
  }
}
