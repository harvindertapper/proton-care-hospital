import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import {
  MEDIA_LIBRARY_SELECT,
  toAdminDto,
  validatePublicPath,
  validateSourceUrl,
  generateR2MediaUrl,
  isValidLifecycleStatus,
  isValidMediaCategory,
  isValidRightsStatus,
  isValidMediaStatus,
  FIELD_LENGTHS,
} from "@/app/lib/media-library";
import { isPublicStorage } from "@/app/lib/media-schema";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   PATCH /api/admin/media/library/[id]
   ─────────────────────────────────────────────────────────────────────────── */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin({ role: "SUPER_ADMIN" });
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return json({ error: "Media ID is required." }, { status: 400 });

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-media-library", `${auth.session.email}:${ip}`, 40, 15 * 60);
    if (!rateCheck.ok) {
      return json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (parsed === null || parsed === undefined || Array.isArray(parsed) || typeof parsed !== "object") {
        return json({ error: "Request body must be a JSON object." }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Malformed or empty request body." }, { status: 400 });
    }

    // Optimistic concurrency: require expectedVersion
    const expectedVersion = body.expectedVersion;
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return json({ error: "expectedVersion is required and must be a positive integer." }, { status: 400 });
    }

    // Load current row
    const rows = await query<Row>(
      `SELECT ${MEDIA_LIBRARY_SELECT} FROM media_assets WHERE id = ? LIMIT 1`,
      id,
    );
    const current = rows.results?.[0];
    if (!current || current.deleted_at) {
      return json({ error: "Media asset not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    if ((current.version as number) !== expectedVersion) {
      return json(
        { error: "Version conflict. The asset has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    // Validate and collect updates
    const updates: string[] = [];
    const binds: unknown[] = [];

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.length > FIELD_LENGTHS.title) {
        return json({ error: `title must be a string of at most ${FIELD_LENGTHS.title} characters.` }, { status: 400 });
      }
      updates.push("title = ?");
      binds.push(body.title);
    }

    if (body.altText !== undefined) {
      if (typeof body.altText !== "string" || body.altText.length > FIELD_LENGTHS.altText) {
        return json({ error: `altText must be a string of at most ${FIELD_LENGTHS.altText} characters.` }, { status: 400 });
      }
      updates.push("alt_text = ?");
      binds.push(body.altText);
    }

    if (body.caption !== undefined) {
      if (typeof body.caption !== "string" || body.caption.length > FIELD_LENGTHS.caption) {
        return json({ error: `caption must be a string of at most ${FIELD_LENGTHS.caption} characters.` }, { status: 400 });
      }
      updates.push("caption = ?");
      binds.push(body.caption);
    }

    if (body.category !== undefined) {
      if (typeof body.category !== "string" || !isValidMediaCategory(body.category)) {
        return json({ error: "Invalid category." }, { status: 400 });
      }
      updates.push("category = ?");
      binds.push(body.category);
    }

    if (body.rightsStatus !== undefined) {
      if (typeof body.rightsStatus !== "string" || !isValidRightsStatus(body.rightsStatus)) {
        return json({ error: "Invalid rightsStatus." }, { status: 400 });
      }
      updates.push("rights_status = ?");
      binds.push(body.rightsStatus);
    }

    if (body.rightsSource !== undefined) {
      if (typeof body.rightsSource !== "string" || body.rightsSource.length > FIELD_LENGTHS.rightsSource) {
        return json({ error: `rightsSource must be a string of at most ${FIELD_LENGTHS.rightsSource} characters.` }, { status: 400 });
      }
      updates.push("rights_source = ?");
      binds.push(body.rightsSource);
    }

    if (body.sourceUrl !== undefined) {
      if (body.sourceUrl === null || body.sourceUrl === "") {
        updates.push("source_url = NULL");
      } else {
        const urlCheck = validateSourceUrl(body.sourceUrl);
        if (!urlCheck.ok) return json({ error: urlCheck.error }, { status: 400 });
        if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > FIELD_LENGTHS.sourceUrl) {
          return json({ error: `sourceUrl must be a string of at most ${FIELD_LENGTHS.sourceUrl} characters.` }, { status: 400 });
        }
        updates.push("source_url = ?");
        binds.push(body.sourceUrl);
      }
    }

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !isValidMediaStatus(body.status)) {
        return json({ error: "Invalid status." }, { status: 400 });
      }
      updates.push("status = ?");
      binds.push(body.status);
    }

    if (body.isVisible !== undefined) {
      if (typeof body.isVisible !== "number" || (body.isVisible !== 0 && body.isVisible !== 1)) {
        return json({ error: "isVisible must be 0 or 1." }, { status: 400 });
      }
      updates.push("is_visible = ?");
      binds.push(body.isVisible);
    }

    if (body.lifecycleStatus !== undefined) {
      if (typeof body.lifecycleStatus !== "string" || !isValidLifecycleStatus(body.lifecycleStatus)) {
        return json({ error: "Invalid lifecycleStatus." }, { status: 400 });
      }
      updates.push("lifecycle_status = ?");
      binds.push(body.lifecycleStatus);
    }

    if (updates.length === 0) {
      return json({ error: "No editable fields provided." }, { status: 400 });
    }

    // Compute effective values for coherence checks
    const effective = { ...current };
    if (body.status !== undefined) effective.status = body.status;
    if (body.isVisible !== undefined) effective.is_visible = body.isVisible;
    if (body.lifecycleStatus !== undefined) effective.lifecycle_status = body.lifecycleStatus;

    // PUBLIC path validation: if storage_type is PUBLIC, ensure locator validity
    if (isPublicStorage(current.storage_type as string)) {
      const pathCheck = validatePublicPath(current.public_path);
      if (!pathCheck.ok) {
        return json({ error: `Asset has invalid public_path: ${pathCheck.error}` }, { status: 400 });
      }
    }

    // Coherence: lifecycleStatus=PUBLISHED requires valid storage locator
    if (effective.lifecycle_status === "PUBLISHED") {
      if (isPublicStorage(current.storage_type as string)) {
        const pubCheck = validatePublicPath(current.public_path);
        if (!pubCheck.ok) {
          return json({ error: `Cannot publish asset with invalid public_path: ${pubCheck.error}` }, { status: 400 });
        }
      } else {
        const r2Check = generateR2MediaUrl(current.r2_key as string);
        if (!r2Check.ok) {
          return json({ error: `Cannot publish asset with invalid r2_key: ${r2Check.error}` }, { status: 400 });
        }
      }
    }

    // Coherence: lifecycleStatus=PUBLISHED requires status=APPROVED, isVisible=1
    if (effective.lifecycle_status === "PUBLISHED") {
      if (effective.status !== "APPROVED") {
        return json({ error: "lifecycleStatus=PUBLISHED requires status=APPROVED." }, { status: 400 });
      }
      if (effective.is_visible !== 1) {
        return json({ error: "lifecycleStatus=PUBLISHED requires isVisible=1." }, { status: 400 });
      }
    }

    // Coherence: lifecycleStatus=ARCHIVED requires isVisible=0
    if (effective.lifecycle_status === "ARCHIVED") {
      if (effective.is_visible !== 0) {
        return json({ error: "lifecycleStatus=ARCHIVED requires isVisible=0." }, { status: 400 });
      }
    }

    // published_at handling
    const publishingNow =
      effective.lifecycle_status === "PUBLISHED" && current.lifecycle_status !== "PUBLISHED";
    const unpublishingNow =
      effective.lifecycle_status !== "PUBLISHED" && current.lifecycle_status === "PUBLISHED";

    if (publishingNow && !current.published_at) {
      updates.push("published_at = CURRENT_TIMESTAMP");
    }
    if (unpublishingNow) {
      updates.push("published_at = NULL");
    }

    // Always increment version and update timestamp
    updates.push("version = version + 1");
    updates.push("updated_at = CURRENT_TIMESTAMP");

    // Execute update
    const updateSql = `UPDATE media_assets SET ${updates.join(", ")} WHERE id = ? AND version = ? AND deleted_at IS NULL`;
    const result = await run(updateSql, ...binds, id, expectedVersion);

    if (result.meta?.changes === 0) {
      // Race: re-read to classify 404 vs 409
      const recheck = await query<Row>(
        "SELECT id, version, deleted_at FROM media_assets WHERE id = ? LIMIT 1",
        id,
      );
      const recheckRow = recheck.results?.[0];
      if (!recheckRow || recheckRow.deleted_at) {
        return json({ error: "Media asset not found.", outcome: "NOT_FOUND" }, { status: 404 });
      }
      return json(
        { error: "Version conflict. The asset has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    // Fetch updated row
    const updatedRows = await query<Row>(
      `SELECT ${MEDIA_LIBRARY_SELECT} FROM media_assets WHERE id = ? LIMIT 1`,
      id,
    );
    const updated = updatedRows.results?.[0];
    if (!updated) {
      return json({ error: "Media asset not found after update.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    const dtoResult = toAdminDto(updated as Parameters<typeof toAdminDto>[0]);
    if (!dtoResult.ok) {
      console.error(`Media asset ${id} failed DTO conversion:`, dtoResult.error);
      return json({ error: "Media Library contains invalid asset metadata." }, { status: 500 });
    }

    // Audit after successful mutation
    try {
      await audit(
        auth.session.email,
        "MEDIA_LIBRARY_UPDATED",
        "MediaAsset",
        id,
        JSON.stringify({ fields: Object.keys(body).filter((k) => k !== "expectedVersion") }),
      );
    } catch (auditErr) {
      console.error("Audit failure after MEDIA_LIBRARY_UPDATED:", auditErr);
    }

    return json({ success: true, outcome: "APPLIED", item: dtoResult.dto });
  } catch (error) {
    console.error("Media Library PATCH error:", error);
    return json({ error: "Failed to update media asset." }, { status: 500 });
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   DELETE /api/admin/media/library/[id]
   Reference-safe logical deletion only.
   ─────────────────────────────────────────────────────────────────────────── */

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin({ role: "SUPER_ADMIN" });
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return json({ error: "Media ID is required." }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid request body." }, { status: 400 });
    }
    const expectedVersion = body?.expectedVersion;
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return json({ error: "expectedVersion is required and must be a positive integer." }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-media-library-delete", `${auth.session.email}:${ip}`, 20, 15 * 60);
    if (!rateCheck.ok) {
      return json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    // Load asset
    const rows = await query<Row>(
      `SELECT ${MEDIA_LIBRARY_SELECT} FROM media_assets WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      id,
    );
    const row = rows.results?.[0];
    if (!row) {
      return json({ error: "Media asset not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    if ((row.version as number) !== expectedVersion) {
      return json(
        { error: "Version conflict. The asset has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    // ── Build deduplicated reference URL set via canonical resolvers ──

    const storageType = row.storage_type as string;

    const doctorRefUrls: string[] = [];
    if (storageType === "R2") {
      const originalResult = generateR2MediaUrl(row.r2_key as string);
      if (!originalResult.ok) {
        return json({ error: `Failed to resolve media URL: ${originalResult.error}` }, { status: 500 });
      }
      doctorRefUrls.push(originalResult.url);

      const displayR2Key = row.display_r2_key as string | null;
      if (displayR2Key) {
        const displayResult = generateR2MediaUrl(displayR2Key);
        if (!displayResult.ok) {
          return json({ error: `Failed to resolve display URL: ${displayResult.error}` }, { status: 500 });
        }
        if (!doctorRefUrls.includes(displayResult.url)) doctorRefUrls.push(displayResult.url);
      }

      const thumbnailR2Key = row.thumbnail_r2_key as string | null;
      if (thumbnailR2Key) {
        const thumbResult = generateR2MediaUrl(thumbnailR2Key);
        if (!thumbResult.ok) {
          return json({ error: `Failed to resolve thumbnail URL: ${thumbResult.error}` }, { status: 500 });
        }
        if (!doctorRefUrls.includes(thumbResult.url)) doctorRefUrls.push(thumbResult.url);
      }
    } else {
      const publicPath = row.public_path as string;
      if (publicPath) doctorRefUrls.push(publicPath);
      const displayPublicPath = row.display_public_path as string | null;
      if (displayPublicPath && displayPublicPath !== publicPath) doctorRefUrls.push(displayPublicPath);
      const thumbnailPublicPath = row.thumbnail_public_path as string | null;
      if (thumbnailPublicPath && thumbnailPublicPath !== publicPath && thumbnailPublicPath !== displayPublicPath) {
        doctorRefUrls.push(thumbnailPublicPath);
      }
    }

    // ── Atomic reference-guard UPDATE (Section 1) ──────────────────────────

    const placeholders = doctorRefUrls.length > 0 ? doctorRefUrls.map(() => "?").join(", ") : "NULL";
    const atomicSql = `
      UPDATE media_assets
      SET lifecycle_status = 'ARCHIVED',
          status = 'HIDDEN',
          is_visible = 0,
          deleted_at = CURRENT_TIMESTAMP,
          cleanup_candidate_at = CURRENT_TIMESTAMP,
          purge_status = 'CANDIDATE',
          purge_error = NULL,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ? AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE media_id = media_assets.id)
        AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets.id)
        AND NOT EXISTS (SELECT 1 FROM blog_posts WHERE cover_media_id = media_assets.id AND is_deleted = 0)
        ${doctorRefUrls.length > 0 ? `AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_url IN (${placeholders}))` : ""}
    `;

    const result = await run(atomicSql, id, expectedVersion, ...doctorRefUrls);

    if (result.meta?.changes === 0) {
      // Classify zero-row change: 404 vs 409-version vs 409-reference
      const recheck = await query<Row>(
        "SELECT id, version, deleted_at FROM media_assets WHERE id = ? LIMIT 1",
        id,
      );
      const recheckRow = recheck.results?.[0];
      if (!recheckRow || recheckRow.deleted_at) {
        return json({ error: "Media asset not found.", outcome: "NOT_FOUND" }, { status: 404 });
      }
      if ((recheckRow.version as number) !== expectedVersion) {
        return json(
          { error: "Version conflict. The asset has been modified since you loaded it.", outcome: "CONFLICT" },
          { status: 409 },
        );
      }

      // Reference conflict: re-check which reference type blocked the update
      for (const url of doctorRefUrls) {
        const ref = await query<Row>("SELECT id FROM doctor_profiles WHERE photo_url = ? LIMIT 1", url);
        if (ref.results && ref.results.length > 0) {
          return json(
            { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
            { status: 409 },
          );
        }
      }

      const doctorMediaRef = await query<Row>(
        "SELECT id FROM doctor_profiles WHERE photo_media_id = ? LIMIT 1",
        id,
      );
      if (doctorMediaRef.results && doctorMediaRef.results.length > 0) {
        return json(
          { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
          { status: 409 },
        );
      }

      const galleryRef = await query<Row>("SELECT id FROM gallery_items WHERE media_id = ? LIMIT 1", id);
      if (galleryRef.results && galleryRef.results.length > 0) {
        return json(
          { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
          { status: 409 },
        );
      }

      const blogRef = await query<Row>("SELECT id FROM blog_posts WHERE cover_media_id = ? AND is_deleted = 0 LIMIT 1", id);
      if (blogRef.results && blogRef.results.length > 0) {
        return json(
          { success: false, outcome: "CONFLICT", error: "Media is still in use. Replace or remove its references before deleting it." },
          { status: 409 },
        );
      }

      return json(
        { error: "Version conflict. The asset has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    // Audit after successful logical deletion
    try {
      await audit(
        auth.session.email,
        "MEDIA_LIBRARY_ARCHIVED",
        "MediaAsset",
        id,
        JSON.stringify({ storageType, r2Key: row.r2_key }),
      );
    } catch (auditErr) {
      console.error("Audit failure after MEDIA_LIBRARY_ARCHIVED:", auditErr);
    }

    return json({ success: true, outcome: "APPLIED" });
  } catch (error) {
    console.error("Media Library DELETE error:", error);
    return json({ error: "Failed to archive media asset." }, { status: 500 });
  }
}
