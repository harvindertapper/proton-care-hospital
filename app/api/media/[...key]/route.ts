import { getR2, query } from "@/app/lib/server";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;

  if (key.some((segment) => segment === ".." || segment.startsWith("/") || segment === "")) {
    return new Response("Invalid key", { status: 400 });
  }

  const bucket = getR2();
  if (!bucket) return new Response("Media storage is not configured.", { status: 503 });

  const objectKey = key.join("/");

  const metaResult = await query<{
    id: string;
    r2_key: string;
    purpose: string;
    lifecycle_status: string;
    status: string;
    is_visible: number;
    deleted_at: string | null;
  }>(
    `SELECT id, r2_key, purpose, lifecycle_status, status, is_visible, deleted_at
     FROM media_assets
     WHERE r2_key = ?
     LIMIT 1`,
    objectKey,
  );

  const meta = metaResult.results?.[0];
  if (!meta) return new Response("Not found", { status: 404 });
  if (meta.deleted_at) return new Response("Not found", { status: 404 });
  if (meta.lifecycle_status !== "PUBLISHED") return new Response("Not found", { status: 404 });
  if (meta.status !== "APPROVED" || meta.is_visible !== 1) return new Response("Not found", { status: 404 });

  if (meta.purpose === "gallery") {
    // Gallery: authorized
  } else if (meta.purpose === "doctor-photo") {
    const doctorRef = await query<{ slug: string }>(
      `SELECT slug FROM doctor_profiles
       WHERE photo_url LIKE ?
         AND lifecycle_status = 'PUBLISHED'
         AND status = 'APPROVED'
         AND is_visible = 1
         AND is_deleted = 0
         AND deleted_at IS NULL
       LIMIT 1`,
      `%${objectKey}%`,
    );
    if (!doctorRef.results || doctorRef.results.length === 0) {
      return new Response("Not found", { status: 404 });
    }
  } else if (meta.purpose === "admin-upload") {
    const pubRef = await query<{ id: string }>(
      `SELECT id FROM media_assets
       WHERE r2_key = ?
         AND lifecycle_status = 'PUBLISHED'
         AND status = 'APPROVED'
         AND is_visible = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      objectKey,
    );
    if (!pubRef.results || pubRef.results.length === 0) {
      return new Response("Not found", { status: 404 });
    }
  } else {
    return new Response("Not found", { status: 404 });
  }

  const object = await bucket.get(objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
