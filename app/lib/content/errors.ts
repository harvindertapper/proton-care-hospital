import type { ContentLifecycleStatus } from "./lifecycle";

export class ContentVersionConflictError extends Error {
  readonly code = "CONTENT_VERSION_CONFLICT";
  readonly tableName: string;
  readonly recordId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(
    tableName: string,
    recordId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Content version conflict on ${tableName} id=${recordId}: expected version ${expectedVersion} but found ${actualVersion}`,
    );
    this.name = "ContentVersionConflictError";
    this.tableName = tableName;
    this.recordId = recordId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class InvalidLifecycleTransitionError extends Error {
  readonly code = "INVALID_LIFECYCLE_TRANSITION";
  readonly from: ContentLifecycleStatus;
  readonly to: ContentLifecycleStatus;

  constructor(from: ContentLifecycleStatus, to: ContentLifecycleStatus) {
    super(`Invalid content lifecycle transition: ${from} -> ${to}`);
    this.name = "InvalidLifecycleTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class ContentPostApplyError extends Error {
  readonly code = "CONTENT_POST_APPLY_ERROR";
  readonly tableName: string;
  readonly recordId: string;
  readonly cause?: unknown;

  constructor(tableName: string, recordId: string, message: string, cause?: unknown) {
    super(`Post-apply failure for ${tableName} id=${recordId}: ${message}`);
    this.name = "ContentPostApplyError";
    this.tableName = tableName;
    this.recordId = recordId;
    this.cause = cause;
  }
}
