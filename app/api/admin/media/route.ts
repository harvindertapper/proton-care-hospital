import { audit, checkRateLimit, getClientIp, getR2, json, query, requireAdmin, run, verifyCsrf } from "@/app/lib/server";
import { executeMediaDeletion } from "@/app/lib/mutation-result";
import { ALLOWED_MIME_TYPES, ALLOWED_PURPOSES, MAX_IMAGE_BYTES, detectSignature } from "@/app/lib/media-policy";
import { generateR2MediaUrl } from "@/app/lib/media-library";

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

  if (file.size === 0) {
    return json({ error: "File is empty.", status: 400 }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return json({ error: "Only JPEG, PNG, and WebP images are allowed." }, { status: 400 });
  }

  if (!ALLOWED_PURPOSES.has(purpose)) {
    return json({ error: "Unknown upload purpose." }, { status: 400 });
  }

  if (purpose === "gallery" && admin.session.role !== "SUPER_ADMIN") {
    return json({ error: "Only super admin may upload gallery assets directly." }, { status: 403 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.length === 0) {
    return json({ error: "File is empty." }, { status: 400 });
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    return json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  const detected = detectSignature(bytes);
  if (!detected) {
    return json({ error: "Unsupported file format." }, { status: 400 });
  }

  if (detected !== file.type) {
    return json({ error: "Declared type does not match file content." }, { status: 400 });
  }

  const key = `${purpose}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const id = crypto.randomUUID();

  try {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: detected },
      customMetadata: { uploadedBy: admin.session.email, consentNote },
    });
  } catch (r2Error) {
    console.error("R2 upload failed", r2Error);
    return json({ success: false, outcome: "FAILED", error: "Media upload to storage failed." }, { status: 502 });
  }

  let status: string;
  let isVisible: number;
  let lifecycleStatus: string;

  if (purpose === "gallery") {
    status = "APPROVED";
    isVisible = 1;
    lifecycleStatus = "PUBLISHED";
  } else if (purpose === "doctor-photo") {
    status = "APPROVED";
    isVisible = 1;
    lifecycleStatus = "PUBLISHED";
  } else {
    status = "HIDDEN";
    isVisible = 0;
    lifecycleStatus = "HIDDEN";
  }

  // Map purpose to M1 category
  const category = purpose === "gallery" ? "GALLERY" : purpose === "doctor-photo" ? "DOCTOR" : "GENERAL";

  try {
    const result = await run(
      `INSERT INTO media_assets (
        id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note,
        status, is_visible, lifecycle_status,
        storage_type, display_r2_key, display_content_type, display_size_bytes,
        category, updated_at, rights_status, purge_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'R2', ?, ?, ?, ?, CURRENT_TIMESTAMP, 'UNVERIFIED', 'NONE')`,
      id,
      key,
      file.name,
      detected,
      bytes.length,
      purpose,
      admin.session.email,
      consentNote,
      status,
      isVisible,
      lifecycleStatus,
      key,
      detected,
      bytes.length,
      category,
    );
    const changes = Number(result.meta?.changes || 0);
    if (changes < 1) {
      let compOk = false;
      try { await bucket.delete(key); compOk = true; } catch (compErr) { console.error("Compensation delete failed after D1 zero-row", { key, compErr }); }
      return json({ success: false, outcome: "FAILED", error: compOk ? "Media metadata creation failed. The incomplete object was removed." : "Media metadata creation failed. Cleanup requires reconciliation." }, { status: 500 });
    }
  } catch (d1Error) {
    console.error("D1 insert failed after R2 write; compensating", { key, d1Error });
    let compOk = false;
    try { await bucket.delete(key); compOk = true; } catch (compErr) { console.error("Compensation delete failed", { key, compErr }); }
    return json({ success: false, outcome: "FAILED", error: compOk ? "Media metadata creation failed. The incomplete object was removed." : "Media metadata creation failed. Cleanup requires reconciliation." }, { status: 500 });
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

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return json({ error: "Media asset ID is required." }, { status: 400 });

  // Load asset with storage family
  const refCheck = await query<{ r2_key: string; purpose: string; storage_type: string }>(
    "SELECT r2_key, purpose, storage_type FROM media_assets WHERE id = ? LIMIT 1",
    id,
  );
  const asset = refCheck.results?.[0];
  if (!asset) return json({ success: false, outcome: "NOT_FOUND", error: "Media asset not found." }, { status: 404 });

  const isPublic = asset.storage_type === "PUBLIC";

  // PUBLIC assets cannot be physically deleted through this endpoint
  if (isPublic) {
    return json(
      { success: false, outcome: "CONFLICT", error: "This PUBLIC asset cannot be physically deleted. Archive it through the Media Library." },
      { status: 409 },
    );
  }

  // Gallery item reference check (blocks before any R2 operation)
  const galleryRef = await query<{ id: string }>(
    "SELECT id FROM gallery_items WHERE media_id = ? LIMIT 1",
    id,
  );
  if (galleryRef.results && galleryRef.results.length > 0) {
    return json(
      { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
      { status: 409 },
    );
  }

  // Doctor reference check: use canonical segment-encoded URLs for all R2 key variants
  const originalResult = generateR2MediaUrl(asset.r2_key);
  if (!originalResult.ok) {
    return json({ error: "Media asset has invalid storage locator." }, { status: 500 });
  }
  const doctorRefUrls: string[] = [originalResult.url];

  const dKeyRow = await query<{ display_r2_key: string | null; thumbnail_r2_key: string | null }>(
    "SELECT display_r2_key, thumbnail_r2_key FROM media_assets WHERE id = ? LIMIT 1",
    id,
  );
  const dKey = dKeyRow.results?.[0]?.display_r2_key;
  if (dKey) {
    const displayResult = generateR2MediaUrl(dKey);
    if (displayResult.ok && !doctorRefUrls.includes(displayResult.url)) doctorRefUrls.push(displayResult.url);
  }
  const tKey = dKeyRow.results?.[0]?.thumbnail_r2_key;
  if (tKey) {
    const thumbResult = generateR2MediaUrl(tKey);
    if (thumbResult.ok && !doctorRefUrls.includes(thumbResult.url)) doctorRefUrls.push(thumbResult.url);
  }

  for (const url of doctorRefUrls) {
    const photoRefs = await query<{ id: string }>(
      "SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1",
      url,
    );
    if (photoRefs.results && photoRefs.results.length > 0) {
      return json(
        { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
        { status: 409 },
      );
    }
  }

  const doctorMediaRef = await query<{ id: string }>(
    "SELECT id FROM doctor_profiles WHERE photo_media_id = ? LIMIT 1",
    id,
  );
  if (doctorMediaRef.results && doctorMediaRef.results.length > 0) {
    return json(
      { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
      { status: 409 },
    );
  }

  // R2 assets: preserve existing compensation behavior
  const bucket = getR2();
  if (!bucket) return json({ error: "R2 media binding is not configured." }, { status: 503 });

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
