-- Migration 0002: Canonical Content Lifecycle Foundation
-- Additive, non-destructive foundation for the canonical content lifecycle.
-- Every original row and legacy column is preserved. The live Worker must
-- continue to work with only migration 0000, or migrations 0000 and 0001.
-- No live Admin or public route depends on these new columns in this bundle.

-- department_timings
ALTER TABLE department_timings ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'));
ALTER TABLE department_timings ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE department_timings ADD COLUMN deleted_at TEXT;

-- doctor_profiles
ALTER TABLE doctor_profiles ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'));
ALTER TABLE doctor_profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE doctor_profiles ADD COLUMN deleted_at TEXT;

-- blog_posts
ALTER TABLE blog_posts ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'));
ALTER TABLE blog_posts ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE blog_posts ADD COLUMN deleted_at TEXT;

-- career_jobs
ALTER TABLE career_jobs ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'));
ALTER TABLE career_jobs ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE career_jobs ADD COLUMN deleted_at TEXT;

-- patient_videos
ALTER TABLE patient_videos ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'));
ALTER TABLE patient_videos ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE patient_videos ADD COLUMN deleted_at TEXT;

-- media_assets
ALTER TABLE media_assets ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'));
ALTER TABLE media_assets ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;

-- Legacy backfill. Preserves every existing row and every legacy column.
-- Precedence:
--   1) is_deleted = 1                       -> ARCHIVED (set deleted_at when null)
--   2) upper(status) = 'NEEDS_REVIEW'       -> IN_REVIEW
--   3) is_visible = 0 or upper(status)='HIDDEN' -> HIDDEN
--   4) otherwise                            -> PUBLISHED

UPDATE department_timings
SET lifecycle_status = CASE
  WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW'
  WHEN is_visible = 0 OR upper(status) = 'HIDDEN' THEN 'HIDDEN'
  ELSE 'PUBLISHED'
END
WHERE lifecycle_status = 'PUBLISHED';

UPDATE doctor_profiles
SET lifecycle_status = CASE
  WHEN is_deleted = 1 THEN 'ARCHIVED'
  WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW'
  WHEN is_visible = 0 OR upper(status) = 'HIDDEN' THEN 'HIDDEN'
  ELSE 'PUBLISHED'
END,
deleted_at = CASE
  WHEN is_deleted = 1 AND deleted_at IS NULL THEN CURRENT_TIMESTAMP
  ELSE deleted_at
END
WHERE lifecycle_status = 'PUBLISHED';

UPDATE blog_posts
SET lifecycle_status = CASE
  WHEN is_deleted = 1 THEN 'ARCHIVED'
  WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW'
  WHEN is_visible = 0 OR upper(status) = 'HIDDEN' THEN 'HIDDEN'
  ELSE 'PUBLISHED'
END,
deleted_at = CASE
  WHEN is_deleted = 1 AND deleted_at IS NULL THEN CURRENT_TIMESTAMP
  ELSE deleted_at
END
WHERE lifecycle_status = 'PUBLISHED';

UPDATE career_jobs
SET lifecycle_status = CASE
  WHEN is_deleted = 1 THEN 'ARCHIVED'
  WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW'
  WHEN is_visible = 0 OR upper(status) = 'HIDDEN' THEN 'HIDDEN'
  ELSE 'PUBLISHED'
END,
deleted_at = CASE
  WHEN is_deleted = 1 AND deleted_at IS NULL THEN CURRENT_TIMESTAMP
  ELSE deleted_at
END
WHERE lifecycle_status = 'PUBLISHED';

UPDATE patient_videos
SET lifecycle_status = CASE
  WHEN is_deleted = 1 THEN 'ARCHIVED'
  WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW'
  WHEN is_visible = 0 OR upper(status) = 'HIDDEN' THEN 'HIDDEN'
  ELSE 'PUBLISHED'
END,
deleted_at = CASE
  WHEN is_deleted = 1 AND deleted_at IS NULL THEN CURRENT_TIMESTAMP
  ELSE deleted_at
END
WHERE lifecycle_status = 'PUBLISHED';

UPDATE media_assets
SET lifecycle_status = CASE
  WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW'
  WHEN is_visible = 0 OR upper(status) = 'HIDDEN' THEN 'HIDDEN'
  ELSE 'PUBLISHED'
END
WHERE lifecycle_status = 'PUBLISHED';
