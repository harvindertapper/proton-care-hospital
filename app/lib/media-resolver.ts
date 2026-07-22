/**
 * Canonical media URL resolution and storage path validation.
 *
 * Zero runtime dependencies — safe for server, client, and Node test imports.
 */

/* ───────────────────────────────────────────────────────────────────────────
   PUBLIC path validation
   ─────────────────────────────────────────────────────────────────────────── */

export type PathValidationResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Validate a PUBLIC storage path. Must be an absolute site-local asset path.
 * The `public:` r2_key locator is never a browser URL.
 */
export function validatePublicPath(raw: unknown): PathValidationResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "Public path is required." };
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes("%2e") ||
    lower.includes("%2f") ||
    lower.includes("%5c") ||
    lower.includes("%00")
  ) {
    return { ok: false, error: "Public path must not contain encoded traversal characters." };
  }

  if (raw.includes("\\")) {
    return { ok: false, error: "Public path must not contain backslashes." };
  }

  try {
    const decoded = decodeURIComponent(raw);
    const segments = decoded.split("/");
    for (const seg of segments) {
      if (seg === "..") {
        return { ok: false, error: "Public path must not contain .. segments." };
      }
      if (seg === ".") {
        return { ok: false, error: "Public path must not contain . segments." };
      }
    }
  } catch {
    return { ok: false, error: "Public path contains malformed percent-encoding." };
  }

  if (raw.startsWith("//")) {
    return { ok: false, error: "Public path must not be protocol-relative." };
  }

  if (!raw.startsWith("/assets/")) {
    return { ok: false, error: "Public path must start with /assets/." };
  }

  const rawSegments = raw.split("/");
  for (const seg of rawSegments) {
    if (seg === "..") {
      return { ok: false, error: "Public path must not contain .. segments." };
    }
  }

  if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return { ok: false, error: "Public path must not contain a URL protocol." };
  }

  if (raw.includes("?") || raw.includes("#")) {
    return { ok: false, error: "Public path must not contain query or fragment." };
  }

  return { ok: true, path: raw };
}

/* ───────────────────────────────────────────────────────────────────────────
   R2 URL generation
   ─────────────────────────────────────────────────────────────────────────── */

export type UrlGenerationResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Generate an R2 media gateway URL from an r2_key.
 * Encodes each path segment independently while preserving / separators.
 */
export function generateR2MediaUrl(r2Key: string): UrlGenerationResult {
  if (typeof r2Key !== "string" || r2Key.length === 0) {
    return { ok: false, error: "R2 key is required." };
  }

  if (r2Key.startsWith("public:")) {
    return { ok: false, error: "public: locator keys cannot produce R2 URLs." };
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(r2Key)) {
    return { ok: false, error: "R2 key must not be an absolute URL." };
  }

  if (r2Key.includes("\\")) {
    return { ok: false, error: "R2 key must not contain backslashes." };
  }

  const segments = r2Key.split("/");
  const encoded: string[] = [];

  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      return { ok: false, error: "R2 key contains invalid path segments." };
    }
    encoded.push(encodeURIComponent(seg));
  }

  return { ok: true, url: `/api/media/${encoded.join("/")}` };
}
