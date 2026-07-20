import type { ContentLifecycleStatus } from "./lifecycle.ts";

export class ContentVersionConflictError extends Error {
  readonly code = "CONFLICT";
  readonly recordId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(recordId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Content version conflict: expected version ${expectedVersion} but found ${actualVersion}`,
    );
    this.name = "ContentVersionConflictError";
    this.recordId = recordId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class InvalidLifecycleTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";
  readonly from: ContentLifecycleStatus;
  readonly to: ContentLifecycleStatus;

  constructor(from: ContentLifecycleStatus, to: ContentLifecycleStatus) {
    super(`Invalid content lifecycle transition: ${from} -> ${to}`);
    this.name = "InvalidLifecycleTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type ContentMutationFailureStage = "MUTATION" | "AUDIT" | "CACHE";

export class ContentMutationFailedError extends Error {
  readonly code = "FAILED";
  readonly stage: ContentMutationFailureStage;
  readonly appliedVersion: number;

  constructor(
    stage: ContentMutationFailureStage,
    appliedVersion: number,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Content mutation failed at stage ${stage} (appliedVersion=${appliedVersion}): ${message}`,
    );
    this.name = "ContentMutationFailedError";
    this.stage = stage;
    this.appliedVersion = appliedVersion;
    this.cause = cause;
  }
}
