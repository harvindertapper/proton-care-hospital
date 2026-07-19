import type { MutationOutcome } from "../mutation-result.ts";
import {
  ContentVersionConflictError,
  ContentPostApplyError,
} from "./errors.ts";
import { assertValidTransition, type ContentLifecycleStatus } from "./lifecycle.ts";
import {
  isContentLifecycleTable,
  LIFECYCLE_COLUMNS,
  type ContentLifecycleTable,
} from "./schema-capabilities.ts";
import {
  type ContentCacheInvalidator,
  tagsForTable,
} from "./cache.ts";

export interface OptimisticContentMutationContext {
  d1: D1Database;
  table: string;
  id: string;
  expectedVersion?: number;
  targetLifecycle?: ContentLifecycleStatus;
  fields?: Record<string, unknown>;
  cacheInvalidator?: ContentCacheInvalidator | null;
  audit?: ((event: ContentMutationAudit) => Promise<void> | void) | null;
}

export interface ContentMutationAudit {
  table: string;
  id: string;
  action: string;
  outcome: MutationOutcome | "CONFLICT";
  expectedVersion?: number;
  actualVersion?: number;
  at: string;
}

export interface OptimisticContentMutationResult {
  outcome: MutationOutcome | "CONFLICT";
  version?: number;
  lifecycleStatus?: ContentLifecycleStatus;
}

function toSqlValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function executeOptimisticContentMutation(
  ctx: OptimisticContentMutationContext,
): Promise<OptimisticContentMutationResult> {
  if (!isContentLifecycleTable(ctx.table)) {
    throw new Error(`Table ${ctx.table} is not part of the content lifecycle allowlist`);
  }
  const table = ctx.table as ContentLifecycleTable;

  const existing = await ctx.d1
    .prepare(
      `SELECT ${LIFECYCLE_COLUMNS.version}, ${LIFECYCLE_COLUMNS.lifecycleStatus} FROM ${table} WHERE id = ?`,
    )
    .bind(ctx.id)
    .first<{ version: number; lifecycle_status: ContentLifecycleStatus }>();

  if (!existing) {
    await recordAudit(ctx, "OPTIMISTIC_MUTATION", "NOT_FOUND");
    return { outcome: "NOT_FOUND" };
  }

  const actualVersion = existing.version;
  if (ctx.expectedVersion !== undefined && ctx.expectedVersion !== actualVersion) {
    await recordAudit(ctx, "OPTIMISTIC_MUTATION", "CONFLICT", actualVersion);
    throw new ContentVersionConflictError(table, ctx.id, ctx.expectedVersion, actualVersion);
  }

  if (ctx.targetLifecycle !== undefined) {
    assertValidTransition(existing.lifecycle_status, ctx.targetLifecycle);
  }

  const assignments: string[] = [];
  const bindings: unknown[] = [];
  for (const [column, value] of Object.entries(ctx.fields ?? {})) {
    assignments.push(`${column} = ?`);
    bindings.push(toSqlValue(value));
  }
  if (ctx.targetLifecycle !== undefined) {
    assignments.push(`${LIFECYCLE_COLUMNS.lifecycleStatus} = ?`);
    bindings.push(ctx.targetLifecycle);
  }
  if (ctx.expectedVersion !== undefined) {
    assignments.push(`${LIFECYCLE_COLUMNS.version} = ?`);
    bindings.push(actualVersion + 1);
  }

  const newVersion = ctx.expectedVersion !== undefined ? actualVersion + 1 : actualVersion;
  const newLifecycle = ctx.targetLifecycle ?? existing.lifecycle_status;

  if (assignments.length > 0) {
    const statement = ctx.d1.prepare(
      `UPDATE ${table} SET ${assignments.join(", ")} WHERE id = ?` +
        (ctx.expectedVersion !== undefined ? ` AND ${LIFECYCLE_COLUMNS.version} = ?` : ""),
    );
    const finalBindings = [...bindings, ctx.id];
    if (ctx.expectedVersion !== undefined) {
      finalBindings.push(actualVersion);
    }
    const result = await statement.bind(...finalBindings).run();

    if (!result.success) {
      await recordAudit(ctx, "OPTIMISTIC_MUTATION", "FAILED");
      return { outcome: "FAILED" };
    }
  }

  const postApplyError = await runPostApplyHooks(ctx, table, ctx.id);
  if (postApplyError) {
    throw postApplyError;
  }

  await runCacheInvalidation(ctx, table);
  await recordAudit(ctx, "OPTIMISTIC_MUTATION", "APPLIED", actualVersion);

  return { outcome: "APPLIED", version: newVersion, lifecycleStatus: newLifecycle };
}

async function runPostApplyHooks(
  ctx: OptimisticContentMutationContext,
  table: string,
  id: string,
): Promise<ContentPostApplyError | null> {
  try {
    return null;
  } catch (error) {
    return new ContentPostApplyError(table, id, "post-apply hook threw", error);
  }
}

async function runCacheInvalidation(
  ctx: OptimisticContentMutationContext,
  table: string,
): Promise<void> {
  if (!ctx.cacheInvalidator) return;
  try {
    await ctx.cacheInvalidator.invalidate(tagsForTable(table));
  } catch (error) {
    throw new ContentPostApplyError(table, ctx.id, "cache invalidation failed", error);
  }
}

async function recordAudit(
  ctx: OptimisticContentMutationContext,
  action: string,
  outcome: MutationOutcome | "CONFLICT",
  actualVersion?: number,
): Promise<void> {
  if (!ctx.audit) return;
  try {
    await ctx.audit({
      table: ctx.table,
      id: ctx.id,
      action,
      outcome,
      expectedVersion: ctx.expectedVersion,
      actualVersion,
      at: new Date().toISOString(),
    });
  } catch {
    // Auditing is best-effort for foundational readiness.
  }
}
