import { getR2, query } from "@/app/lib/server";

function validateKeySegments(segments: string[]): { ok: true; objectKey: string } | { ok: false; error: string } {
  if (segments.length === 0) {
    return { ok: false, error: "Empty key." };
  }

  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      return { ok: false, error: `Invalid path segment: ${seg}` };
    }
    if (seg.startsWith("/")) {
      return { ok: false, error: "Segments must not start with /." };
    }
    if (seg.includes("\\")) {
      return { ok: false, error: "Segments must not contain backslashes." };
    }
  }

  const objectKey = segments.join("/");

  // Reject public: compatibility keys
  if (objectKey.startsWith("public:")) {
    return { ok: false, error: "public: locator keys are not valid R2 keys." };
  }

  // Reject absolute/protocol URLs
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(objectKey)) {
    return { ok: false, error: "Key must not be an absolute URL." };
  }

  return { ok: true, objectKey };
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;

  // 1. Validate key segments before any database or R2 operation
  const validation = validateKeySegments(key);
  if (!validation.ok) {
    return new Response("Not found", { status: 404 });
  }
  const { objectKey } = validation;

  // 2. Query and authorize metadata — must be R2, not public:, active, not deleted
  const metaResult = await query<{
    id: string;
    r2_key: string;
    purpose: string;
    category: string;
    lifecycle_status: string;
    status: string;
    is_visible: number;
    deleted_at: string | null;
    storage_type: string;
  }>(
    `SELECT id, r2_key, purpose, category, lifecycle_status, status, is_visible, deleted_at, storage_type
     FROM media_assets
     WHERE storage_type = 'R2'
       AND r2_key = ?
       AND r2_key NOT LIKE 'public:%'
       AND deleted_at IS NULL
       AND lifecycle_status = 'PUBLISHED'
       AND status = 'APPROVED'
       AND is_visible = 1
     LIMIT 1`,
    objectKey,
  );

  const meta = metaResult.results?.[0];
  if (!meta) return new Response("Not found", { status: 404 });

  // 3. Authorize by purpose
  if (meta.purpose === "gallery") {
    // Gallery: authorized
  } else if (meta.purpose === "blog-cover") {
    // Blog cover: must be BLOG category and referenced by an eligible blog post
    if (meta.category !== "BLOG") {
      return new Response("Not found", { status: 404 });
    }
    const blogRef = await query<{ slug: string }>(
      `SELECT slug FROM blog_posts
       WHERE cover_media_id = (SELECT id FROM media_assets WHERE r2_key = ? AND deleted_at IS NULL LIMIT 1)
         AND status = 'APPROVED'
         AND is_visible = 1
         AND is_deleted = 0
         AND deleted_at IS NULL
         AND lifecycle_status = 'PUBLISHED'
       LIMIT 1`,
      objectKey,
    );
    if (!blogRef.results || blogRef.results.length === 0) {
      return new Response("Not found", { status: 404 });
    }
  } else if (meta.purpose === "doctor-photo" || meta.purpose === "admin-upload") {
    // Doctor photo or admin-upload: must be DOCTOR or BLOG category and referenced by an eligible entity
    if (meta.category === "BLOG") {
      // Blog cover: check if referenced by an eligible blog post
      const blogMediaRef = await query<{ slug: string }>(
        `SELECT bp.slug FROM blog_posts bp
         INNER JOIN media_assets ma ON bp.cover_media_id = ma.id
         WHERE ma.r2_key = ?
           AND ma.category = 'BLOG'
           AND bp.status = 'APPROVED'
           AND bp.is_visible = 1
           AND bp.is_deleted = 0
           AND bp.deleted_at IS NULL
           AND bp.lifecycle_status = 'PUBLISHED'
         LIMIT 1`,
        objectKey,
      );
      if (!blogMediaRef.results || blogMediaRef.results.length === 0) {
        return new Response("Not found", { status: 404 });
      }
    } else if (meta.category !== "DOCTOR") {
      return new Response("Not found", { status: 404 });
    } else {
      // Check 1: Legacy photo_url match
      const doctorRef = await query<{ slug: string }>(
        `SELECT slug FROM doctor_profiles
         WHERE photo_url = ?
           AND lifecycle_status = 'PUBLISHED'
           AND status = 'APPROVED'
           AND is_visible = 1
           AND is_deleted = 0
           AND deleted_at IS NULL
         LIMIT 1`,
        `/api/media/${objectKey}`,
      );
      if (doctorRef.results && doctorRef.results.length > 0) {
        // Authorized via legacy photo_url
      } else {
        // Check 2: photo_media_id match (media_assets.id reference)
        const doctorMediaRef = await query<{ slug: string }>(
          `SELECT dp.slug FROM doctor_profiles dp
           INNER JOIN media_assets ma ON ma.id = dp.photo_media_id
           WHERE ma.r2_key = ?
             AND ma.category = 'DOCTOR'
             AND dp.lifecycle_status = 'PUBLISHED'
             AND dp.status = 'APPROVED'
             AND dp.is_visible = 1
             AND dp.is_deleted = 0
             AND dp.deleted_at IS NULL
           LIMIT 1`,
          objectKey,
        );
        if (!doctorMediaRef.results || doctorMediaRef.results.length === 0) {
          return new Response("Not found", { status: 404 });
        }
      }
    }
  } else {
    return new Response("Not found", { status: 404 });
  }

  // 4. Obtain R2 binding only after metadata authorization passes
  const bucket = getR2();
  if (!bucket) return new Response("Media storage is not configured.", { status: 503 });

  // 5. Fetch from R2
  const object = await bucket.get(objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  // 6. Return safe response headers
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
