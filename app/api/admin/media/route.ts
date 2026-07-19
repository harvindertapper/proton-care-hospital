import { audit, checkRateLimit, getClientIp, getR2, json, requireAdmin, requireAppliedMutation, run, verifyCsrf, query } from "@/app/lib/server";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

  if (!(file instanceof File)) return json({ error: "Image file is required." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return json({ error: "Only JPEG, PNG, GIF, and WebP images are allowed." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return json({ error: "Image must be under 8 MB." }, { status: 400 });

  const key = `${purpose}/${crypto.randomUUID()}-${safeName(file.name)}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: admin.session.email, consentNote },
  });

  const id = crypto.randomUUID();
  await run(
    "INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    key,
    file.name,
    file.type,
    file.size,
    purpose,
    admin.session.email,
    consentNote,
  );
  await audit(admin.session.email, "MEDIA_UPLOADED", "MediaAsset", id, key);
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

  const rows = await query<{ r2_key: string }>("SELECT r2_key FROM media_assets WHERE id = ? LIMIT 1", id);
  const asset = rows.results?.[0];
  if (!asset) return json({ error: "Media asset not found." }, { status: 404 });

  try {
    await bucket.delete(asset.r2_key);
  } catch (err) {
    console.error("Failed to delete R2 object", err);
    return json({ success: false, outcome: "FAILED", error: "Media object deletion failed; metadata was retained." }, { status: 502 });
  }

  const result = await run("DELETE FROM media_assets WHERE id = ?", id);
  requireAppliedMutation(result, true, "Media asset");
  await audit(admin.session.email, "MEDIA_DELETED", "MediaAsset", id, asset.r2_key);

  return json({ success: true, outcome: "APPLIED" });
}
