import { MutationNotFoundError } from "../mutation-result.ts";
import {
  ContentVersionConflictError,
  InvalidLifecycleTransitionError,
  ContentMutationFailedError,
  type ContentMutationFailureStage,
} from "./errors.ts";
import {
  assertValidLifecycleTransition,
  type ContentLifecycleStatus,
} from "./lifecycle.ts";
import { isContentLifecycleDomain } from "./schema-capabilities.ts";
import {
  type ContentCacheInvalidator,
  contentCacheTag,
  contentCacheKeyTag,
} from "./cache.ts";

export interface ContentRowSnapshot {
  version: number;
  lifecycleStatus: ContentLifecycleStatus;
  deletedAt: string | null;
}

function isDeletedSnapshot(snapshot: ContentRowSnapshot): boolean {
  return snapshot.deletedAt !== null || snapshot.lifecycleStatus === "ARCHIVED";
}

// The backend is the ONLY place that knows table names, SQL, and bindings.
// The orchestrator stays pure and dependency-injected.
export interface ContentMutationBackend {
  loadRow(id: string): Promise<ContentRowSnapshot | null>;
  applyMutation(input: {
    id: string;
    expectedVersion: number;
    targetLifecycle: ContentLifecycleStatus;
    newVersion: number;
  }): Promise<number>;
}

export interface ContentMutationAuditEvent {
  id: string;
  action: "OPTIMISTIC_CONTENT_MUTATION";
  outcome: "APPLIED" | "CONFLICT" | "FAILED";
  domain: string;
  expectedVersion: number;
  appliedVersion: number;
  targetLifecycle: ContentLifecycleStatus;
  at: string;
}

export interface ContentMutationAuditor {
  record(event: ContentMutationAuditEvent): Promise<void> | void;
}

export interface OptimisticContentMutationContext {
  backend: ContentMutationBackend;
  domain: string;
  id: string;
  expectedVersion: number;
  targetLifecycle: ContentLifecycleStatus;
  cacheInvalidator?: ContentCacheInvalidator | null;
  audit?: ContentMutationAuditor | null;
}

export interface OptimisticContentMutationResult {
  outcome: "APPLIED";
  appliedVersion: number;
  lifecycleStatus: ContentLifecycleStatus;
}

function fail(stage: ContentMutationFailureStage, appliedVersion: number, message: string, cause?: unknown): never {
  throw new ContentMutationFailedError(stage, appliedVersion, message, cause);
}

export async function executeOptimisticContentMutation(
  ctx: OptimisticContentMutationContext,
): Promise<OptimisticContentMutationResult> {
  if (!isContentLifecycleDomain(ctx.domain)) {
    throw new Error(`Domain ${ctx.domain} is not a recognised content lifecycle domain`);
  }
  if (!Number.isInteger(ctx.expectedVersion) || ctx.expectedVersion < 1) {
    throw new Error(`expectedVersion must be a positive integer, received ${ctx.expectedVersion}`);
  }

  // 1) Load current snapshot. Missing or logically-deleted rows are not found.
  const current = await ctx.backend.loadRow(ctx.id);
  if (!current || isDeletedSnapshot(current)) {
    throw new MutationNotFoundError("content record");
  }

  // 2) Initial version mismatch => CONFLICT (lost optimistic-lock race upfront).
  if (current.version !== ctx.expectedVersion) {
    throw new ContentVersionConflictError(ctx.id, ctx.expectedVersion, current.version);
  }

  // 3) Validate the lifecycle transition before touching storage.
  try {
    assertValidLifecycleTransition(current.lifecycleStatus, ctx.targetLifecycle);
  } catch (error) {
    if (error instanceof InvalidLifecycleTransitionError) throw error;
    fail("MUTATION", current.version, "lifecycle transition validation threw", error);
  }

  const newVersion = current.version + 1;

  // 4) Mutation. A thrown backend error is a hard MUTATION-stage failure.
  let changes = 0;
  try {
    changes = await ctx.backend.applyMutation({
      id: ctx.id,
      expectedVersion: ctx.expectedVersion,
      targetLifecycle: ctx.targetLifecycle,
      newVersion,
    });
  } catch (error) {
    fail("MUTATION", current.version, "applyMutation threw", error);
  }

  // 5) A mutation is only proved when meta.changes >= 1. A zero-change result
  //    means the row moved under us, so re-load to classify precisely.
  if (changes < 1) {
    const reloaded = await ctx.backend.loadRow(ctx.id);
    if (!reloaded || isDeletedSnapshot(reloaded)) {
      throw new MutationNotFoundError("content record");
    }
    throw new ContentVersionConflictError(ctx.id, ctx.expectedVersion, reloaded.version);
  }

  // 6) Side-effect order: MUTATION -> AUDIT -> CACHE.
  //    Audit or cache failure must throw FAILED; never return APPLIED.
  try {
    await ctx.audit?.record({
      id: ctx.id,
      action: "OPTIMISTIC_CONTENT_MUTATION",
      outcome: "APPLIED",
      domain: ctx.domain,
      expectedVersion: ctx.expectedVersion,
      appliedVersion: newVersion,
      targetLifecycle: ctx.targetLifecycle,
      at: new Date().toISOString(),
    });
  } catch (error) {
    fail("AUDIT", newVersion, "audit record failed", error);
  }

  try {
    if (ctx.cacheInvalidator) {
      const tags = [
        contentCacheTag(ctx.domain),
        contentCacheKeyTag(ctx.domain, ctx.id),
      ];
      await ctx.cacheInvalidator.invalidate(tags);
    }
  } catch (error) {
    fail("CACHE", newVersion, "cache invalidation failed", error);
  }

  return {
    outcome: "APPLIED",
    appliedVersion: newVersion,
    lifecycleStatus: ctx.targetLifecycle,
  };
}
