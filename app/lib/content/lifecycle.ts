import { InvalidLifecycleTransitionError } from "./errors.ts";

export const CONTENT_LIFECYCLE_STATES = [
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "HIDDEN",
  "ARCHIVED",
] as const;

export type ContentLifecycleStatus = (typeof CONTENT_LIFECYCLE_STATES)[number];

const ALLOWED_TRANSITIONS: Record<ContentLifecycleStatus, ReadonlySet<ContentLifecycleStatus>> = {
  DRAFT: new Set<ContentLifecycleStatus>(["IN_REVIEW", "ARCHIVED"]),
  IN_REVIEW: new Set<ContentLifecycleStatus>(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  PUBLISHED: new Set<ContentLifecycleStatus>(["HIDDEN", "ARCHIVED"]),
  HIDDEN: new Set<ContentLifecycleStatus>(["PUBLISHED", "ARCHIVED"]),
  ARCHIVED: new Set<ContentLifecycleStatus>(["DRAFT"]),
};

export function isValidLifecycleStatus(value: unknown): value is ContentLifecycleStatus {
  return typeof value === "string" && (CONTENT_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function canTransition(
  from: ContentLifecycleStatus,
  to: ContentLifecycleStatus,
): boolean {
  if (!isValidLifecycleStatus(from) || !isValidLifecycleStatus(to)) {
    return false;
  }
  return ALLOWED_TRANSITIONS[from].has(to);
}

export function assertValidTransition(
  from: ContentLifecycleStatus,
  to: ContentLifecycleStatus,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidLifecycleTransitionError(from, to);
  }
}

export interface LegacyLifecycleInput {
  status?: string | null;
  isVisible?: number | null;
  isDeleted?: number | null;
  deletedAt?: string | null;
}

export function mapLegacyLifecycle(input: LegacyLifecycleInput): {
  lifecycleStatus: ContentLifecycleStatus;
  deletedAt: string | null;
} {
  const statusUpper = input.status ? input.status.toUpperCase() : null;
  const isVisible = input.isVisible ?? 1;
  const isDeleted = input.isDeleted ?? 0;

  if (isDeleted === 1) {
    return {
      lifecycleStatus: "ARCHIVED",
      deletedAt: input.deletedAt ?? null,
    };
  }
  if (statusUpper === "NEEDS_REVIEW") {
    return { lifecycleStatus: "IN_REVIEW", deletedAt: input.deletedAt ?? null };
  }
  if (isVisible === 0 || statusUpper === "HIDDEN") {
    return { lifecycleStatus: "HIDDEN", deletedAt: input.deletedAt ?? null };
  }
  return { lifecycleStatus: "PUBLISHED", deletedAt: input.deletedAt ?? null };
}
