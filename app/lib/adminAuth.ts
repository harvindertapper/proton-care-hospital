export const ADMIN_PASSWORD_MIN_LENGTH = 15;
export const ADMIN_PASSWORD_MAX_LENGTH = 128;
export const ADMIN_PASSWORD_ITERATIONS = 100_000;
export const LEGACY_SUPER_ADMIN_EMAIL = "admin@protoncare.in";

const encoder = new TextEncoder();

function toHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return null;
  return new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const normalizedSalt = Uint8Array.from(salt) as Uint8Array<ArrayBuffer>;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: normalizedSalt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return new Uint8Array(hash);
}

export function validateAdminPassword(password: string, currentPassword?: string) {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return { ok: false as const, error: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > ADMIN_PASSWORD_MAX_LENGTH) {
    return { ok: false as const, error: `Password must be at most ${ADMIN_PASSWORD_MAX_LENGTH} characters.` };
  }
  if (currentPassword !== undefined && password === currentPassword) {
    return { ok: false as const, error: "New password must be different from the current password." };
  }
  return { ok: true as const };
}

export function resolveAdminSessionAccess(account: {
  role: "SUPER_ADMIN" | "STAFF";
  isActive: boolean;
  mustChangePassword: boolean;
}) {
  if (!account.isActive) return { allowed: false as const, reason: "inactive" as const };
  return {
    allowed: true as const,
    role: account.role,
    mustChangePassword: account.mustChangePassword,
  };
}

export function validateStaffAccountInput(input: { name?: unknown; email?: unknown; password?: unknown }) {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 254) : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!name) return { ok: false as const, error: "Staff name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false as const, error: "A valid staff email is required." };
  }
  const passwordResult = validateAdminPassword(password);
  if (!passwordResult.ok) return passwordResult;
  return {
    ok: true as const,
    account: {
      name,
      email,
      password,
      role: "STAFF" as const,
      isActive: true,
      mustChangePassword: true,
    },
  };
}

export async function hashAdminPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, ADMIN_PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${ADMIN_PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyAdminPassword(password: string, storedHash: string) {
  try {
    if (storedHash.startsWith("pbkdf2-sha256$")) {
      const [algorithm, iterationsValue, saltValue, hashValue] = storedHash.split("$");
      const iterations = Number.parseInt(iterationsValue, 10);
      const salt = fromHex(saltValue);
      const expected = fromHex(hashValue);
      if (algorithm !== "pbkdf2-sha256" || !salt || !expected || !Number.isSafeInteger(iterations) || iterations < 1) {
        return { valid: false, needsRehash: false };
      }
      const computed = await derivePassword(password, salt, iterations);
      const valid = equalBytes(computed, expected);
      return { valid, needsRehash: valid && iterations < ADMIN_PASSWORD_ITERATIONS };
    }

    const [saltValue, hashValue, extra] = storedHash.split(":");
    const salt = fromHex(saltValue);
    const expected = fromHex(hashValue);
    if (extra !== undefined || !salt || !expected) return { valid: false, needsRehash: false };
    const computed = await derivePassword(password, salt, 100_000);
    const valid = equalBytes(computed, expected);
    return { valid, needsRehash: valid };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

type BootstrapConfig =
  | { ok: true; email: string; password: string }
  | { ok: false; reason: "missing" | "invalid_email" | "invalid_password" };

export function readSuperAdminBootstrapConfig(environment: Record<string, string | undefined>): BootstrapConfig {
  const email = (environment.ADMIN_SUPER_EMAIL || "").trim().toLowerCase();
  const password = environment.ADMIN_SUPER_PASSWORD || "";
  if (!email || !password) return { ok: false, reason: "missing" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return { ok: false, reason: "invalid_email" };
  }
  if (!validateAdminPassword(password).ok) return { ok: false, reason: "invalid_password" };
  return { ok: true, email, password };
}

export type BootstrapAccount = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "STAFF";
  isActive: boolean;
};

export type BootstrapDecision =
  | { kind: "not_configured" }
  | { kind: "create" }
  | { kind: "preserve"; legacyIdsToDeactivate: string[] }
  | { kind: "migrate_legacy"; legacyId: string }
  | { kind: "recover"; id: string }
  | { kind: "conflict" };

export function decideSuperAdminBootstrap(
  accounts: BootstrapAccount[],
  config: BootstrapConfig,
): BootstrapDecision {
  if (!config.ok) return { kind: "not_configured" };

  const target = accounts.find((account) => account.email.toLowerCase() === config.email);
  const activeSuperAdmins = accounts.filter((account) => account.role === "SUPER_ADMIN" && account.isActive);

  if (target) {
    if (target.role !== "SUPER_ADMIN") return { kind: "conflict" };
    if (!target.isActive) {
      // Documented recovery path: deactivate the super admin row (never delete it),
      // set a fresh ADMIN_SUPER_PASSWORD secret, and the next login attempt
      // reactivates the account with the new credential.
      if (activeSuperAdmins.length === 0) return { kind: "recover", id: target.id };
      return { kind: "conflict" };
    }
    const otherNonLegacySuperAdmin = activeSuperAdmins.find(
      (account) => account.id !== target.id && account.email.toLowerCase() !== LEGACY_SUPER_ADMIN_EMAIL,
    );
    if (otherNonLegacySuperAdmin) return { kind: "conflict" };
    return {
      kind: "preserve",
      legacyIdsToDeactivate: activeSuperAdmins
        .filter((account) => account.id !== target.id && account.email.toLowerCase() === LEGACY_SUPER_ADMIN_EMAIL)
        .map((account) => account.id),
    };
  }

  if (activeSuperAdmins.length === 0) return { kind: "create" };
  if (
    activeSuperAdmins.length === 1 &&
    activeSuperAdmins[0].email.toLowerCase() === LEGACY_SUPER_ADMIN_EMAIL
  ) {
    return { kind: "migrate_legacy", legacyId: activeSuperAdmins[0].id };
  }
  return { kind: "conflict" };
}

export type SuperAdminBootstrapStore = {
  listAccounts(): Promise<BootstrapAccount[]>;
  createSuperAdmin(input: { email: string; passwordHash: string }): Promise<void>;
  migrateLegacySuperAdmin(input: { id: string; email: string; passwordHash: string }): Promise<void>;
  reactivateSuperAdmin(input: { id: string; passwordHash: string }): Promise<void>;
  deactivateAccounts(ids: string[]): Promise<void>;
  revokeSessionsForEmails(emails: string[]): Promise<void>;
  recordAudit(event: {
    actorEmail: string;
    action: string;
    entityType: string;
    entityId: string;
    details: string;
  }): Promise<void>;
};

export type SuperAdminBootstrapResult =
  | { ok: true; status: "created" | "preserved" | "migrated" | "recovered" }
  | { ok: false; status: "not_configured" | "conflict" };

export async function applySuperAdminBootstrap(
  store: SuperAdminBootstrapStore,
  environment: Record<string, string | undefined>,
): Promise<SuperAdminBootstrapResult> {
  const accounts = await store.listAccounts();
  const config = readSuperAdminBootstrapConfig(environment);

  if (!config.ok) {
    const hasActiveSuperAdmin = accounts.some(
      (account) => account.role === "SUPER_ADMIN" && account.isActive
    );
    if (hasActiveSuperAdmin) {
      return { ok: true, status: "preserved" };
    }
    return { ok: false, status: "not_configured" };
  }

  const decision = decideSuperAdminBootstrap(accounts, config);
  if (decision.kind === "not_configured") return { ok: false, status: "not_configured" };
  if (decision.kind === "conflict") return { ok: false, status: "conflict" };

  if (decision.kind === "create") {
    await store.createSuperAdmin({
      email: config.email,
      passwordHash: await hashAdminPassword(config.password),
    });
    await store.recordAudit({
      actorEmail: config.email,
      action: "SUPER_ADMIN_BOOTSTRAPPED",
      entityType: "AdminUser",
      entityId: config.email,
      details: "Created the environment-configured super admin.",
    });
    return { ok: true, status: "created" };
  }

  if (decision.kind === "recover") {
    await store.reactivateSuperAdmin({
      id: decision.id,
      passwordHash: await hashAdminPassword(config.password),
    });
    await store.revokeSessionsForEmails([config.email]);
    await store.recordAudit({
      actorEmail: config.email,
      action: "SUPER_ADMIN_RECOVERED",
      entityType: "AdminUser",
      entityId: config.email,
      details: "Reactivated the deactivated super admin with the environment-configured credential.",
    });
    return { ok: true, status: "recovered" };
  }

  if (decision.kind === "migrate_legacy") {
    await store.migrateLegacySuperAdmin({
      id: decision.legacyId,
      email: config.email,
      passwordHash: await hashAdminPassword(config.password),
    });
    await store.revokeSessionsForEmails([LEGACY_SUPER_ADMIN_EMAIL, config.email]);
    await store.recordAudit({
      actorEmail: config.email,
      action: "SUPER_ADMIN_LEGACY_MIGRATED",
      entityType: "AdminUser",
      entityId: config.email,
      details: "Migrated the known legacy bootstrap account and revoked its sessions.",
    });
    return { ok: true, status: "migrated" };
  }

  if (decision.legacyIdsToDeactivate.length > 0) {
    const legacyEmails = accounts
      .filter((account) => decision.legacyIdsToDeactivate.includes(account.id))
      .map((account) => account.email);
    await store.deactivateAccounts(decision.legacyIdsToDeactivate);
    await store.revokeSessionsForEmails(legacyEmails);
    await store.recordAudit({
      actorEmail: config.email,
      action: "LEGACY_SUPER_ADMIN_DEACTIVATED",
      entityType: "AdminUser",
      entityId: config.email,
      details: "Deactivated duplicate known legacy bootstrap accounts.",
    });
  }
  return { ok: true, status: "preserved" };
}
