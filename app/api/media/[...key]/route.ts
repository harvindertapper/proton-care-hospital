import { getR2 } from "@/app/lib/server";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;

  // Reject path traversal / absolute segments before touching R2.
  if (key.some((segment) => segment === ".." || segment.startsWith("/") || segment === "")) {
    return new Response("Invalid key", { status: 400 });
  }

  const bucket = getR2();
  if (!bucket) return new Response("Media storage is not configured.", { status: 503 });

  // Restrict public reads to the public-uploads namespace.
  const objectKey = `public-uploads/${key.join("/")}`;
  const object = await bucket.get(objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
