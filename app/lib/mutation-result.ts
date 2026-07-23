export type MutationOutcome = "APPLIED" | "PENDING_APPROVAL" | "NOT_FOUND" | "FAILED" | "CONFLICT" | "NO_OP";

export type D1MutationResult = {
  success?: boolean;
  meta?: { changes?: number };
};

export class MutationNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor(entityLabel: string) {
    super(`${entityLabel} was not found.`);
    this.name = "MutationNotFoundError";
  }
}

export class MutationConflictError extends Error {
  readonly code = "CONFLICT";

  constructor(message = "Doctor profile was changed by another session. Refresh and try again.") {
    super(message);
    this.name = "MutationConflictError";
  }
}

export function requireAppliedMutation(
  result: D1MutationResult,
  entityExists: boolean,
  entityLabel: string,
) {
  if (!entityExists || Number(result.meta?.changes || 0) < 1) {
    throw new MutationNotFoundError(entityLabel);
  }
  return { outcome: "APPLIED" as const };
}

export async function executeRoleMutation<TRevision>(input: {
  isStaff: boolean;
  createRevision: () => Promise<TRevision>;
  applyMutation: () => Promise<{ outcome?: MutationOutcome } & Record<string, unknown> | void>;
}) {
  if (input.isStaff) {
    return {
      outcome: "PENDING_APPROVAL" as const,
      revision: await input.createRevision(),
    };
  }

  const result = await input.applyMutation();
  const { outcome: _outcome, ...rest } = (result || {}) as { outcome?: MutationOutcome } & Record<string, unknown>;
  return { outcome: _outcome || ("APPLIED" as const), ...rest };
}

export async function executeMediaDeletion<TAsset>(input: {
  loadMetadata: () => Promise<TAsset | null>;
  deleteObject: (asset: TAsset) => Promise<void>;
  deleteMetadata: (asset: TAsset) => Promise<D1MutationResult>;
  writeAudit: (asset: TAsset) => Promise<void>;
  logError?: (message: string, error: unknown) => void;
}) {
  const asset = await input.loadMetadata();
  if (!asset) throw new MutationNotFoundError("Media asset");

  try {
    await input.deleteObject(asset);
  } catch (error) {
    input.logError?.("Failed to delete R2 object", error);
    return { outcome: "FAILED" as const, stage: "OBJECT" as const };
  }

  try {
    const result = await input.deleteMetadata(asset);
    requireAppliedMutation(result, true, "Media asset");
    await input.writeAudit(asset);
    return { outcome: "APPLIED" as const };
  } catch (error) {
    input.logError?.("Media object deleted but metadata/audit finalization failed", error);
    return { outcome: "FAILED" as const, stage: "METADATA" as const };
  }
}
