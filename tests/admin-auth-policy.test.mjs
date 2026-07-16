import assert from "node:assert/strict";
import test from "node:test";

import {
  applySuperAdminBootstrap,
  decideSuperAdminBootstrap,
  hashAdminPassword,
  readSuperAdminBootstrapConfig,
  resolveAdminSessionAccess,
  validateStaffAccountInput,
  validateAdminPassword,
  verifyAdminPassword,
} from "../app/lib/adminAuth.ts";

function bootstrapStore(initialAccounts = []) {
  const accounts = initialAccounts.map((account) => ({ ...account }));
  const audits = [];
  const revokedEmails = [];
  return {
    accounts,
    audits,
    revokedEmails,
    async listAccounts() {
      return accounts.map((account) => ({ ...account }));
    },
    async createSuperAdmin(input) {
      accounts.push({
        id: "created-super",
        email: input.email,
        role: "SUPER_ADMIN",
        isActive: true,
        passwordHash: input.passwordHash,
      });
    },
    async migrateLegacySuperAdmin(input) {
      const account = accounts.find((item) => item.id === input.id);
      account.email = input.email;
      account.passwordHash = input.passwordHash;
      account.isActive = true;
    },
    async reactivateSuperAdmin(input) {
      const account = accounts.find((item) => item.id === input.id);
      account.passwordHash = input.passwordHash;
      account.isActive = true;
    },
    async deactivateAccounts(ids) {
      for (const account of accounts) {
        if (ids.includes(account.id)) account.isActive = false;
      }
    },
    async revokeSessionsForEmails(emails) {
      revokedEmails.push(...emails);
    },
    async recordAudit(event) {
      audits.push(event);
    },
  };
}

async function legacyHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hex = (value) => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex(salt)}:${hex(new Uint8Array(hash))}`;
}

test("admin password policy accepts 15-128 character passphrases", () => {
  assert.equal(validateAdminPassword("a".repeat(14)).ok, false);
  assert.equal(validateAdminPassword("a".repeat(15)).ok, true);
  assert.equal(validateAdminPassword("a".repeat(128)).ok, true);
  assert.equal(validateAdminPassword("a".repeat(129)).ok, false);
  assert.equal(validateAdminPassword("same password value", "same password value").ok, false);
});

test("new password hashes are versioned and verify without rehash", async () => {
  const password = "correct horse battery staple";
  const stored = await hashAdminPassword(password);
  assert.match(stored, /^pbkdf2-sha256\$600000\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.deepEqual(await verifyAdminPassword(password, stored), { valid: true, needsRehash: false });
  assert.deepEqual(await verifyAdminPassword("incorrect password", stored), { valid: false, needsRehash: false });
});

test("legacy password hashes verify and request an upgrade", async () => {
  const password = "legacy password value";
  const stored = await legacyHash(password);
  assert.deepEqual(await verifyAdminPassword(password, stored), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyAdminPassword("incorrect password", stored), { valid: false, needsRehash: false });
});

test("bootstrap config uses only ADMIN_SUPER variables", () => {
  assert.equal(readSuperAdminBootstrapConfig({ ADMIN_EMAIL: "legacy@example.com", ADMIN_PASSWORD: "legacy-password" }).ok, false);
  assert.equal(readSuperAdminBootstrapConfig({ ADMIN_SUPER_EMAIL: "Admin@Example.com" }).ok, false);
  assert.deepEqual(
    readSuperAdminBootstrapConfig({
      ADMIN_SUPER_EMAIL: " Admin@Example.com ",
      ADMIN_SUPER_PASSWORD: "correct horse battery staple",
    }),
    { ok: true, email: "admin@example.com", password: "correct horse battery staple" },
  );
});

test("bootstrap creates once and never overwrites a changed database password", async () => {
  const store = bootstrapStore();
  const first = await applySuperAdminBootstrap(store, {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "first bootstrap passphrase",
  });
  assert.deepEqual(first, { ok: true, status: "created" });
  assert.equal(store.accounts.length, 1);
  const originalHash = store.accounts[0].passwordHash;
  const second = await applySuperAdminBootstrap(store, {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "different environment passphrase",
  });
  assert.deepEqual(second, { ok: true, status: "preserved" });
  assert.equal(store.accounts[0].passwordHash, originalHash);
  assert.equal((await verifyAdminPassword("first bootstrap passphrase", originalHash)).valid, true);
  assert.equal((await verifyAdminPassword("different environment passphrase", originalHash)).valid, false);
});

test("bootstrap migrates only the known legacy super admin and revokes sessions", async () => {
  const store = bootstrapStore([
    {
      id: "legacy",
      email: "admin@protoncare.in",
      role: "SUPER_ADMIN",
      isActive: true,
      passwordHash: await legacyHash("legacy password value"),
    },
  ]);
  const result = await applySuperAdminBootstrap(store, {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "new owner bootstrap passphrase",
  });
  assert.deepEqual(result, { ok: true, status: "migrated" });
  assert.equal(store.accounts[0].email, "owner@example.com");
  assert.equal((await verifyAdminPassword("new owner bootstrap passphrase", store.accounts[0].passwordHash)).valid, true);
  assert.deepEqual(store.revokedEmails.sort(), ["admin@protoncare.in", "owner@example.com"]);
  assert.equal(store.audits.at(-1).action, "SUPER_ADMIN_LEGACY_MIGRATED");
});

test("bootstrap conflict performs no credential mutation", async () => {
  const store = bootstrapStore([
    { id: "other", email: "other@example.com", role: "SUPER_ADMIN", isActive: true, passwordHash: "unchanged" },
  ]);
  const result = await applySuperAdminBootstrap(store, {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "owner bootstrap passphrase",
  });
  assert.deepEqual(result, { ok: false, status: "conflict" });
  assert.equal(store.accounts[0].passwordHash, "unchanged");
  assert.equal(store.audits.length, 0);
});

test("bootstrap creates, preserves, migrates legacy, and blocks conflicts", () => {
  const config = { ok: true, email: "owner@example.com", password: "correct horse battery staple" };

  assert.deepEqual(decideSuperAdminBootstrap([], config), { kind: "create" });
  assert.deepEqual(
    decideSuperAdminBootstrap([
      { id: "owner", email: "owner@example.com", role: "SUPER_ADMIN", isActive: true },
    ], config),
    { kind: "preserve", legacyIdsToDeactivate: [] },
  );
  assert.deepEqual(
    decideSuperAdminBootstrap([
      { id: "legacy", email: "admin@protoncare.in", role: "SUPER_ADMIN", isActive: true },
    ], config),
    { kind: "migrate_legacy", legacyId: "legacy" },
  );
  assert.equal(
    decideSuperAdminBootstrap([
      { id: "other", email: "other@example.com", role: "SUPER_ADMIN", isActive: true },
    ], config).kind,
    "conflict",
  );
  assert.equal(
    decideSuperAdminBootstrap([
      { id: "staff", email: "owner@example.com", role: "STAFF", isActive: true },
    ], config).kind,
    "conflict",
  );
});

test("session access uses the current database account state", () => {
  assert.deepEqual(
    resolveAdminSessionAccess({ role: "STAFF", isActive: true, mustChangePassword: false }),
    { allowed: true, role: "STAFF", mustChangePassword: false },
  );
  assert.deepEqual(
    resolveAdminSessionAccess({ role: "STAFF", isActive: false, mustChangePassword: false }),
    { allowed: false, reason: "inactive" },
  );
  assert.deepEqual(
    resolveAdminSessionAccess({ role: "STAFF", isActive: true, mustChangePassword: true }),
    { allowed: true, role: "STAFF", mustChangePassword: true },
  );
});

test("staff creation always produces an active STAFF account requiring a password change", () => {
  assert.equal(validateStaffAccountInput({ name: "A", email: "bad", password: "short" }).ok, false);
  assert.deepEqual(
    validateStaffAccountInput({
      name: "Reception Team",
      email: " Staff@Example.com ",
      password: "temporary staff passphrase",
    }),
    {
      ok: true,
      account: {
        name: "Reception Team",
        email: "staff@example.com",
        password: "temporary staff passphrase",
        role: "STAFF",
        isActive: true,
        mustChangePassword: true,
      },
    },
  );
});

test("bootstrap permits config removal if super admin already exists", async () => {
  const store = bootstrapStore([
    { id: "owner", email: "owner@example.com", role: "SUPER_ADMIN", isActive: true, passwordHash: "existing-hash" }
  ]);
  const result = await applySuperAdminBootstrap(store, {});
  assert.deepEqual(result, { ok: true, status: "preserved" });
});

test("bootstrap re-creates the super admin after external row deletion (warm-isolate incident)", async () => {
  const store = bootstrapStore();
  const environment = {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "first bootstrap passphrase",
  };
  const first = await applySuperAdminBootstrap(store, environment);
  assert.deepEqual(first, { ok: true, status: "created" });

  // Simulate someone deleting the row via the D1 console while the isolate
  // stays warm. A later re-evaluation must see the deletion and re-create.
  store.accounts.length = 0;
  const second = await applySuperAdminBootstrap(store, environment);
  assert.deepEqual(second, { ok: true, status: "created" });
  assert.equal(store.accounts.length, 1);
  assert.equal(store.accounts[0].email, "owner@example.com");
  assert.equal((await verifyAdminPassword("first bootstrap passphrase", store.accounts[0].passwordHash)).valid, true);
});

test("bootstrap recovers a deactivated super admin with the current secret", async () => {
  const store = bootstrapStore([
    { id: "owner", email: "owner@example.com", role: "SUPER_ADMIN", isActive: false, passwordHash: "forgotten-hash" },
  ]);
  const result = await applySuperAdminBootstrap(store, {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "fresh recovery passphrase",
  });
  assert.deepEqual(result, { ok: true, status: "recovered" });
  assert.equal(store.accounts[0].isActive, true);
  assert.equal((await verifyAdminPassword("fresh recovery passphrase", store.accounts[0].passwordHash)).valid, true);
  assert.deepEqual(store.revokedEmails, ["owner@example.com"]);
  assert.equal(store.audits.at(-1).action, "SUPER_ADMIN_RECOVERED");
});

test("recovery is refused while another active super admin exists", async () => {
  const store = bootstrapStore([
    { id: "owner", email: "owner@example.com", role: "SUPER_ADMIN", isActive: false, passwordHash: "old-hash" },
    { id: "other", email: "other@example.com", role: "SUPER_ADMIN", isActive: true, passwordHash: "other-hash" },
  ]);
  const result = await applySuperAdminBootstrap(store, {
    ADMIN_SUPER_EMAIL: "owner@example.com",
    ADMIN_SUPER_PASSWORD: "fresh recovery passphrase",
  });
  assert.deepEqual(result, { ok: false, status: "conflict" });
  assert.equal(store.accounts[0].passwordHash, "old-hash");
  assert.equal(store.accounts[0].isActive, false);
});

test("a STAFF account holding the configured email stays a conflict, never escalates", () => {
  const config = { ok: true, email: "owner@example.com", password: "correct horse battery staple" };
  assert.equal(
    decideSuperAdminBootstrap(
      [{ id: "staff", email: "owner@example.com", role: "STAFF", isActive: false }],
      config,
    ).kind,
    "conflict",
  );
});
