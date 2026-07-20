import { MutationNotFoundError, MutationConflictError } from "./mutation-result.ts";
import type { DoctorManagerRow } from "./doctor-admin-types.ts";

export type LifecycleStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";

export type DoctorGuardOperation = "SAVE" | "ARCHIVE" | "RESTORE";

export function parseExpectedVersion(
  raw: unknown,
  { minimum = 0 }: { minimum?: number } = {},
): number {
  if (raw === undefined || raw === null) return minimum > 0 ? NaN : 0;
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) return NaN;
  if (raw < minimum) return NaN;
  return raw;
}

export function throwInvalidExpectedVersion(
  message = "expectedVersion must be a non-negative integer.",
): never {
  throw new Error(message);
}

export async function throwDoctorGuardFailure(
  repo: DoctorRepo,
  slug: string,
  operation: DoctorGuardOperation,
): Promise<never> {
  const current = await loadDoctor(repo, slug);

  if (!current) {
    throw new MutationNotFoundError("Doctor profile");
  }

  const archived =
    current.is_deleted === 1 || current.lifecycle_status === "ARCHIVED";

  if (operation === "SAVE") {
    if (archived) throw new Error(ARCHIVED_SAVE_ERROR);
    throw new MutationConflictError();
  }

  if (operation === "ARCHIVE") {
    if (archived) throw new MutationNotFoundError("Doctor profile");
    throw new MutationConflictError();
  }

  if (!archived) throw new MutationNotFoundError("Doctor profile");
  throw new MutationConflictError();
}

export type LoadedDoctor = {
  id: string;
  slug: string;
  lifecycle_status: LifecycleStatus;
  version: number;
  deleted_at: string | null;
  status: string;
  is_visible: number;
  is_deleted: number;
};

export const ACTIVE_DOCTORS_ADMIN_SQL =
  "SELECT * FROM doctor_profiles WHERE is_deleted = 0 AND lifecycle_status != 'ARCHIVED' ORDER BY name";

export const ARCHIVED_DOCTORS_ADMIN_SQL =
  "SELECT id, slug, name, speciality, department_slug, is_deleted, lifecycle_status, version, deleted_at FROM doctor_profiles WHERE is_deleted = 1 AND lifecycle_status = 'ARCHIVED' ORDER BY name";

export function resolveDoctorManagerRows(
  rows: DoctorManagerRow[] | null | undefined,
): DoctorManagerRow[] {
  return (rows || []).filter(
    (row) =>
      Number(row.is_deleted ?? 0) !== 1 &&
      String(row.lifecycle_status ?? "") !== "ARCHIVED",
  );
}

export type DoctorQueryFn = (
  sql: string,
  ...binds: unknown[]
) => Promise<{ results?: Record<string, unknown>[] }>;

export type DoctorRunFn = (
  sql: string,
  ...binds: unknown[]
) => Promise<{ success?: boolean; meta?: { changes?: number } }>;

export type DoctorAuditFn = (
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: string,
) => Promise<void> | void;

export type DoctorRepo = {
  query: DoctorQueryFn;
  run: DoctorRunFn;
  audit: DoctorAuditFn;
};

export const ARCHIVED_SAVE_ERROR = "Doctor profile is archived. Restore it before editing.";

export function deriveLifecycleFromVisibility(isVisible: boolean): {
  lifecycle_status: LifecycleStatus;
  status: string;
  is_visible: number;
  is_deleted: number;
} {
  if (isVisible) {
    return { lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, is_deleted: 0 };
  }
  return { lifecycle_status: "HIDDEN", status: "HIDDEN", is_visible: 0, is_deleted: 0 };
}

export async function loadDoctor(
  repo: DoctorRepo,
  slug: string,
): Promise<LoadedDoctor | null> {
  const rows = await repo.query(
    "SELECT id, slug, lifecycle_status, version, deleted_at, status, is_visible, is_deleted FROM doctor_profiles WHERE slug = ? LIMIT 1",
    slug,
  );
  if (!rows.results?.length) return null;
  const row = rows.results[0];
  return {
    id: String(row.id),
    slug: String(row.slug),
    lifecycle_status: String(row.lifecycle_status) as LifecycleStatus,
    version: Number(row.version),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    status: String(row.status),
    is_visible: Number(row.is_visible),
    is_deleted: Number(row.is_deleted),
  };
}

export async function loadActiveDoctor(
  repo: DoctorRepo,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const rows = await repo.query(
    "SELECT id, slug, is_deleted FROM doctor_profiles WHERE slug = ? AND is_deleted = 0 AND lifecycle_status != 'ARCHIVED' LIMIT 1",
    slug,
  );
  return rows.results && rows.results.length ? rows.results[0] : null;
}

export async function loadArchivedDoctor(
  repo: DoctorRepo,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const rows = await repo.query(
    "SELECT id, slug, is_deleted FROM doctor_profiles WHERE slug = ? AND is_deleted = 1 AND lifecycle_status = 'ARCHIVED' LIMIT 1",
    slug,
  );
  return rows.results && rows.results.length ? rows.results[0] : null;
}

export async function assertNotArchivedForEdit(
  repo: DoctorRepo,
  slug: string,
): Promise<void> {
  const existing = await loadDoctor(repo, slug);
  if (existing && (existing.is_deleted === 1 || existing.lifecycle_status === "ARCHIVED")) {
    throw new Error(ARCHIVED_SAVE_ERROR);
  }
}

export async function createDoctor(
  repo: DoctorRepo,
  slug: string,
  fields: {
    name: string;
    speciality: string;
    qualification: string;
    departmentSlug: string;
    photoUrl: string;
    profileNote: string;
    blockedDates: string;
    isVisible: boolean;
  },
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const lifecycle = deriveLifecycleFromVisibility(fields.isVisible);
  let result: { success?: boolean; meta?: { changes?: number } };
  try {
    result = await repo.run(
      `INSERT INTO doctor_profiles
        (id, slug, name, speciality, qualification, department_slug, photo_url, profile_note, consent_status, status, is_visible, approved_by, blocked_dates, is_deleted, lifecycle_status, version, deleted_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED_SOURCE', ?, ?, ?, ?, ?, ?, 1, NULL, CURRENT_TIMESTAMP)`,
      `doctor-${slug}`,
      slug,
      fields.name,
      fields.speciality,
      fields.qualification,
      fields.departmentSlug,
      fields.photoUrl,
      fields.profileNote,
      lifecycle.status,
      lifecycle.is_visible,
      actorEmail,
      fields.blockedDates,
      lifecycle.is_deleted,
      lifecycle.lifecycle_status,
    );
  } catch (error) {
    const existing = await loadDoctor(repo, slug);
    if (existing) {
      throw new MutationConflictError("A doctor with this slug was created by another session.");
    }
    throw error;
  }
  const changes = Number(result.meta?.changes || 0);
  if (changes < 1) {
    const existing = await loadDoctor(repo, slug);
    if (existing) {
      throw new MutationConflictError("A doctor with this slug was created by another session.");
    }
    throw new Error("Doctor profile creation failed unexpectedly.");
  }
  await repo.audit(actorEmail, "DOCTOR_APPROVED", "DoctorProfile", slug, fields.name);
  return { outcome: "APPLIED" };
}

export async function updateDoctor(
  repo: DoctorRepo,
  slug: string,
  expectedVersion: number,
  fields: {
    name: string;
    speciality: string;
    qualification: string;
    departmentSlug: string;
    photoUrl: string;
    profileNote: string;
    blockedDates: string;
    isVisible: boolean;
  },
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const current = await loadDoctor(repo, slug);
  if (!current) throw new MutationNotFoundError("Doctor profile");
  if (current.is_deleted === 1 || current.lifecycle_status === "ARCHIVED") {
    throw new Error(ARCHIVED_SAVE_ERROR);
  }
  if (current.version !== expectedVersion) {
    throw new MutationConflictError();
  }

  const lifecycle = deriveLifecycleFromVisibility(fields.isVisible);
  const result = await repo.run(
    `UPDATE doctor_profiles SET
      name = ?, speciality = ?, qualification = ?, department_slug = ?, photo_url = ?,
      profile_note = ?, approved_by = ?, blocked_dates = ?,
      status = ?, is_visible = ?, is_deleted = ?, lifecycle_status = ?,
      deleted_at = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1
      WHERE slug = ? AND version = ? AND is_deleted = 0 AND lifecycle_status != 'ARCHIVED'`,
    fields.name,
    fields.speciality,
    fields.qualification,
    fields.departmentSlug,
    fields.photoUrl,
    fields.profileNote,
    actorEmail,
    fields.blockedDates,
    lifecycle.status,
    lifecycle.is_visible,
    lifecycle.is_deleted,
    lifecycle.lifecycle_status,
    slug,
    expectedVersion,
  );
  if (Number(result.meta?.changes || 0) < 1) {
    await throwDoctorGuardFailure(repo, slug, "SAVE");
  }
  await repo.audit(actorEmail, "DOCTOR_APPROVED", "DoctorProfile", slug, fields.name);
  return { outcome: "APPLIED" };
}

export async function archiveDoctor(
  repo: DoctorRepo,
  slug: string,
  expectedVersion: number,
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const current = await loadDoctor(repo, slug);
  if (!current) throw new MutationNotFoundError("Doctor profile");
  if (current.is_deleted === 1 || current.lifecycle_status === "ARCHIVED") {
    throw new MutationNotFoundError("Doctor profile");
  }
  if (current.version !== expectedVersion) {
    throw new MutationConflictError();
  }

  const result = await repo.run(
    `UPDATE doctor_profiles SET
      lifecycle_status = 'ARCHIVED', status = 'HIDDEN', is_visible = 0, is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1
      WHERE slug = ? AND version = ? AND is_deleted = 0 AND lifecycle_status != 'ARCHIVED'`,
    slug,
    expectedVersion,
  );
  if (Number(result.meta?.changes || 0) < 1) {
    await throwDoctorGuardFailure(repo, slug, "ARCHIVE");
  }
  await repo.audit(actorEmail, "DOCTOR_ARCHIVED", "DoctorProfile", slug, "Doctor profile archived.");
  return { outcome: "APPLIED" };
}

export async function restoreDoctor(
  repo: DoctorRepo,
  slug: string,
  expectedVersion: number,
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const current = await loadDoctor(repo, slug);
  if (!current) throw new MutationNotFoundError("Doctor profile");
  if (current.is_deleted !== 1 || current.lifecycle_status !== "ARCHIVED") {
    throw new MutationNotFoundError("Doctor profile");
  }
  if (current.version !== expectedVersion) {
    throw new MutationConflictError();
  }

  const result = await repo.run(
    `UPDATE doctor_profiles SET
      lifecycle_status = 'HIDDEN', status = 'HIDDEN', is_visible = 0, is_deleted = 0,
      deleted_at = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1
      WHERE slug = ? AND version = ? AND is_deleted = 1 AND lifecycle_status = 'ARCHIVED'`,
    slug,
    expectedVersion,
  );
  if (Number(result.meta?.changes || 0) < 1) {
    await throwDoctorGuardFailure(repo, slug, "RESTORE");
  }
  await repo.audit(actorEmail, "DOCTOR_RESTORED_TO_HIDDEN", "DoctorProfile", slug, "Doctor profile restored to hidden state for review.");
  return { outcome: "APPLIED" };
}
