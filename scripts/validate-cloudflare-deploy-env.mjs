import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "");
const required = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
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
