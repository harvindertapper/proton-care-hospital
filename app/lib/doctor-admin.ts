import { requireAppliedMutation } from "./mutation-result.ts";
import type { DoctorManagerRow } from "./doctor-admin-types.ts";

export function resolveDoctorManagerRows(
  rows: DoctorManagerRow[] | null | undefined,
): DoctorManagerRow[] {
  return rows && rows.length ? rows : [];
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

export async function loadActiveDoctor(
  repo: DoctorRepo,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const rows = await repo.query(
    "SELECT id, slug, is_deleted FROM doctor_profiles WHERE slug = ? AND is_deleted = 0 LIMIT 1",
    slug,
  );
  return rows.results && rows.results.length ? rows.results[0] : null;
}

export async function loadArchivedDoctor(
  repo: DoctorRepo,
  slug: string,
): Promise<Record<string, unknown> | null> {
  const rows = await repo.query(
    "SELECT id, slug, is_deleted FROM doctor_profiles WHERE slug = ? AND is_deleted = 1 LIMIT 1",
    slug,
  );
  return rows.results && rows.results.length ? rows.results[0] : null;
}

export async function assertNotArchivedForEdit(
  repo: DoctorRepo,
  slug: string,
): Promise<void> {
  const rows = await repo.query(
    "SELECT id, slug, is_deleted FROM doctor_profiles WHERE slug = ? LIMIT 1",
    slug,
  );
  const existing = rows.results && rows.results.length ? rows.results[0] : null;
  if (existing && Number(existing.is_deleted) === 1) {
    throw new Error(ARCHIVED_SAVE_ERROR);
  }
}

export async function archiveDoctor(
  repo: DoctorRepo,
  slug: string,
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const existing = await loadActiveDoctor(repo, slug);
  const result = await repo.run(
    "UPDATE doctor_profiles SET is_deleted = 1, is_visible = 0, status = 'HIDDEN', updated_at = CURRENT_TIMESTAMP WHERE slug = ? AND is_deleted = 0",
    slug,
  );
  requireAppliedMutation(result, Boolean(existing), "Doctor profile");
  await repo.audit(actorEmail, "DOCTOR_ARCHIVED", "DoctorProfile", slug, "Doctor profile archived (hidden, not deleted).");
  return { outcome: "APPLIED" };
}

export async function restoreDoctor(
  repo: DoctorRepo,
  slug: string,
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const existing = await loadArchivedDoctor(repo, slug);
  const result = await repo.run(
    "UPDATE doctor_profiles SET is_deleted = 0, is_visible = 0, status = 'HIDDEN', updated_at = CURRENT_TIMESTAMP WHERE slug = ? AND is_deleted = 1",
    slug,
  );
  requireAppliedMutation(result, Boolean(existing), "Doctor profile");
  await repo.audit(actorEmail, "DOCTOR_RESTORED_TO_HIDDEN", "DoctorProfile", slug, "Doctor profile restored to hidden state for review.");
  return { outcome: "APPLIED" };
}
