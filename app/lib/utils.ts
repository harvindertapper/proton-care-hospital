// Shared, dependency-free helpers used across API routes and client components.

/** Trim and clamp a string value; non-strings become an empty string. */
export function clean(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** URL/DB-safe slug from arbitrary text (lowercased, non-alphanumerics to dashes). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

/** SHA-256 hex digest of an OTP, used to store/verify challenges without plaintext. */
export async function hashOtp(otp: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
