import { loadEnv } from "vite";

if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || (process.env.CF_PAGES !== "1" && !process.env.CI)) {
  console.log("Local development/testing environment detected. Bypassing build-time validation.");
  process.exit(0);
}

const env = loadEnv("production", process.cwd(), "");
const required = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
];

const placeholderPrefixes = ["replace-with-", "your-"];
const missing = required.filter((key) => {
  const value = (env[key] || process.env[key])?.trim();
  return !value || placeholderPrefixes.some((prefix) => value.startsWith(prefix));
});

if (missing.length > 0) {
  console.error("Cloudflare deploy is blocked. Configure these build-time variables:");
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  console.error("Use an ignored .env.production.local file; never commit credentials.");
  process.exit(1);
}

console.log("Cloudflare build-time environment is configured.");
