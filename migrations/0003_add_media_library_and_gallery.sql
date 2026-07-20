-- Migration 0003: Media Library and Gallery Schema Foundation
-- Additive, non-destructive foundation for the Media Library and Gallery model.
-- Every original row and legacy column is preserved. The live Worker must
-- continue to work with only migrations 0000-0002.
-- No live Admin or public route depends on these new columns or tables in this bundle.
-- gallery_v2_initialized remains 0 until migration 0003 is applied to production
-- and verified by an authorized operator.

-- ============================================================================
-- 1. Additive media_assets expansion
-- ============================================================================

-- Storage/location
ALTER TABLE media_assets ADD COLUMN storage_type TEXT NOT NULL DEFAULT 'R2' CHECK (storage_type IN ('R2','PUBLIC'));
ALTER TABLE media_assets ADD COLUMN public_path TEXT;

-- Display variant
ALTER TABLE media_assets ADD COLUMN display_r2_key TEXT;
ALTER TABLE media_assets ADD COLUMN display_public_path TEXT;
ALTER TABLE media_assets ADD COLUMN display_content_type TEXT;
ALTER TABLE media_assets ADD COLUMN display_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (display_size_bytes >= 0);

-- Thumbnail variant
ALTER TABLE media_assets ADD COLUMN thumbnail_r2_key TEXT;
ALTER TABLE media_assets ADD COLUMN thumbnail_public_path TEXT;
ALTER TABLE media_assets ADD COLUMN thumbnail_content_type TEXT;
ALTER TABLE media_assets ADD COLUMN thumbnail_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (thumbnail_size_bytes >= 0);

-- Public metadata
ALTER TABLE media_assets ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE media_assets ADD COLUMN alt_text TEXT NOT NULL DEFAULT '';
ALTER TABLE media_assets ADD COLUMN caption TEXT NOT NULL DEFAULT '';
ALTER TABLE media_assets ADD COLUMN width INTEGER CHECK (width IS NULL OR width > 0);
ALTER TABLE media_assets ADD COLUMN height INTEGER CHECK (height IS NULL OR height > 0);

-- Deduplication/classification
ALTER TABLE media_assets ADD COLUMN checksum_sha256 TEXT;
ALTER TABLE media_assets ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL' CHECK (category IN ('GENERAL','GALLERY','DOCTOR','BLOG','VIDEO_POSTER'));

-- Rights/source
ALTER TABLE media_assets ADD COLUMN rights_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (rights_status IN ('UNVERIFIED','VERIFIED_INTERNAL','LICENSED','PUBLIC_DOMAIN'));
ALTER TABLE media_assets ADD COLUMN rights_source TEXT NOT NULL DEFAULT '';
ALTER TABLE media_assets ADD COLUMN source_url TEXT;

-- Timestamps
ALTER TABLE media_assets ADD COLUMN updated_at TEXT;
ALTER TABLE media_assets ADD COLUMN published_at TEXT;

-- Cleanup foundation
ALTER TABLE media_assets ADD COLUMN cleanup_candidate_at TEXT;
ALTER TABLE media_assets ADD COLUMN purge_after TEXT;
ALTER TABLE media_assets ADD COLUMN purge_status TEXT NOT NULL DEFAULT 'NONE' CHECK (purge_status IN ('NONE','CANDIDATE','BLOCKED','READY','FAILED','PURGED'));
ALTER TABLE media_assets ADD COLUMN purge_error TEXT;

-- ============================================================================
-- 2. Compatibility backfill for existing R2 rows
-- ============================================================================

-- Backfill storage_type remains R2 (already default), but update display fields
-- and category from legacy purpose, and timestamps from created_at.

UPDATE media_assets
SET
  display_r2_key = r2_key,
  display_content_type = content_type,
  display_size_bytes = CASE WHEN display_size_bytes = 0 THEN size_bytes ELSE display_size_bytes END,
  category = CASE
    WHEN purpose = 'gallery' THEN 'GALLERY'
    WHEN purpose = 'doctor-photo' THEN 'DOCTOR'
    ELSE 'GENERAL'
  END,
  updated_at = created_at
WHERE updated_at IS NULL;

-- published_at: only for already published/approved/visible rows
UPDATE media_assets
SET published_at = created_at
WHERE published_at IS NULL
  AND status = 'APPROVED'
  AND is_visible = 1
  AND lifecycle_status = 'PUBLISHED';

-- ============================================================================
-- 3. Media indexes
-- ============================================================================

-- Lifecycle/category listing index
CREATE INDEX idx_media_lifecycle_category_created ON media_assets(lifecycle_status, category, created_at);

-- Active PUBLIC path uniqueness (scoped: storage_type='PUBLIC' AND public_path IS NOT NULL AND deleted_at IS NULL)
CREATE UNIQUE INDEX idx_media_active_public_path ON media_assets(public_path)
  WHERE storage_type = 'PUBLIC' AND public_path IS NOT NULL AND deleted_at IS NULL;

-- Scoped active checksum uniqueness (storage_type + checksum, active rows only)
CREATE UNIQUE INDEX idx_media_active_checksum ON media_assets(storage_type, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL AND deleted_at IS NULL AND purge_status != 'PURGED';

-- ============================================================================
-- 4. Gallery sections table
-- ============================================================================

CREATE TABLE IF NOT EXISTS gallery_sections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  deleted_at TEXT
);

-- ============================================================================
-- 5. Gallery items table
-- ============================================================================

CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  slot_key TEXT,
  title_override TEXT NOT NULL DEFAULT '',
  alt_text_override TEXT NOT NULL DEFAULT '',
  caption_override TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT,
  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT
);

-- ============================================================================
-- 6. Gallery indexes
-- ============================================================================

-- Gallery sections lifecycle/order index
CREATE INDEX idx_gallery_sections_lifecycle_order ON gallery_sections(lifecycle_status, sort_order, id);

-- Gallery items section/lifecycle/order index
CREATE INDEX idx_gallery_items_section_lifecycle_order ON gallery_items(section_id, lifecycle_status, sort_order, id);

-- Gallery items media/deleted index
CREATE INDEX idx_gallery_items_media_deleted ON gallery_items(media_id, deleted_at);

-- Unique active slot_key (scoped: slot_key IS NOT NULL AND deleted_at IS NULL)
CREATE UNIQUE INDEX idx_gallery_items_active_slot ON gallery_items(slot_key)
  WHERE slot_key IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- 7. Dormant PUBLIC asset registration
-- ============================================================================

INSERT OR IGNORE INTO media_assets (
  id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note,
  status, is_visible, lifecycle_status,
  storage_type, public_path, display_public_path, display_content_type, display_size_bytes,
  category, title, alt_text, caption,
  rights_status, rights_source
) VALUES
('media-public-gallery-front-exterior-hero',
 'public:/assets/hospital/front-exterior-hero.webp',
 'front-exterior-hero.webp', 'image/webp', 121776, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/front-exterior-hero.webp', '/assets/hospital/front-exterior-hero.webp', 'image/webp', 121776,
 'GALLERY', 'Front Exterior Hero', 'Proton Care Hospital front exterior hero view', 'Hospital front exterior hero view',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset'),

('media-public-gallery-front-exterior-wide',
 'public:/assets/hospital/front-exterior-wide.webp',
 'front-exterior-wide.webp', 'image/webp', 93022, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/front-exterior-wide.webp', '/assets/hospital/front-exterior-wide.webp', 'image/webp', 93022,
 'GALLERY', 'Front Exterior Wide', 'Proton Care Hospital front exterior wide view', 'Hospital front exterior wide view',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset'),

('media-public-gallery-reception',
 'public:/assets/hospital/reception.jpg',
 'reception.jpg', 'image/jpeg', 133182, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/reception.jpg', '/assets/hospital/reception.jpg', 'image/jpeg', 133182,
 'GALLERY', 'Reception', 'Proton Care Hospital reception area', 'Hospital reception area',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset'),

('media-public-gallery-corridor',
 'public:/assets/hospital/corridor.jpg',
 'corridor.jpg', 'image/jpeg', 75692, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/corridor.jpg', '/assets/hospital/corridor.jpg', 'image/jpeg', 75692,
 'GALLERY', 'Corridor', 'Proton Care Hospital corridor', 'Hospital corridor',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset'),

('media-public-gallery-ward-bed-01',
 'public:/assets/hospital/ward-bed-01.jpg',
 'ward-bed-01.jpg', 'image/jpeg', 121167, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/ward-bed-01.jpg', '/assets/hospital/ward-bed-01.jpg', 'image/jpeg', 121167,
 'GALLERY', 'Ward Bed', 'Proton Care Hospital ward bed', 'Hospital ward bed',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset'),

('media-public-gallery-patient-room-twin',
 'public:/assets/hospital/patient-room-twin.jpg',
 'patient-room-twin.jpg', 'image/jpeg', 118489, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/patient-room-twin.jpg', '/assets/hospital/patient-room-twin.jpg', 'image/jpeg', 118489,
 'GALLERY', 'Patient Room Twin', 'Proton Care Hospital patient room with twin beds', 'Hospital patient room with twin beds',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset'),

('media-public-gallery-patient-room-single',
 'public:/assets/hospital/patient-room-single.jpg',
 'patient-room-single.jpg', 'image/jpeg', 101614, 'gallery', 'system:migration-0003', '',
 'HIDDEN', 0, 'DRAFT',
 'PUBLIC', '/assets/hospital/patient-room-single.jpg', '/assets/hospital/patient-room-single.jpg', 'image/jpeg', 101614,
 'GALLERY', 'Patient Room Single', 'Proton Care Hospital patient room with single bed', 'Hospital patient room with single bed',
 'VERIFIED_INTERNAL', 'Verified existing Git/public hospital asset');

-- ============================================================================
-- 8. Dormant Gallery seed
-- ============================================================================

INSERT OR IGNORE INTO gallery_sections (
  id, slug, name, description, sort_order, lifecycle_status, version, created_by
) VALUES
('gallery-section-facilities', 'facilities', 'Hospital Facilities', 'Hospital facility photos', 0, 'DRAFT', 1, 'system:migration-0003');

INSERT OR IGNORE INTO gallery_items (
  id, section_id, media_id, slot_key, title_override, sort_order, lifecycle_status, version, created_by
) VALUES
('gallery-item-hero', 'gallery-section-facilities', 'media-public-gallery-front-exterior-hero', 'front-exterior-hero', 'Front Exterior Hero', 0, 'DRAFT', 1, 'system:migration-0003'),
('gallery-item-wide', 'gallery-section-facilities', 'media-public-gallery-front-exterior-wide', 'front-exterior-wide', 'Front Exterior Wide', 1, 'DRAFT', 1, 'system:migration-0003'),
('gallery-item-reception', 'gallery-section-facilities', 'media-public-gallery-reception', 'reception', 'Reception', 2, 'DRAFT', 1, 'system:migration-0003'),
('gallery-item-corridor', 'gallery-section-facilities', 'media-public-gallery-corridor', 'corridor', 'Corridor', 3, 'DRAFT', 1, 'system:migration-0003'),
('gallery-item-ward', 'gallery-section-facilities', 'media-public-gallery-ward-bed-01', 'ward-bed-01', 'Ward Bed', 4, 'DRAFT', 1, 'system:migration-0003'),
('gallery-item-twin', 'gallery-section-facilities', 'media-public-gallery-patient-room-twin', 'patient-room-twin', 'Patient Room Twin', 5, 'DRAFT', 1, 'system:migration-0003'),
('gallery-item-single', 'gallery-section-facilities', 'media-public-gallery-patient-room-single', 'patient-room-single', 'Patient Room Single', 6, 'DRAFT', 1, 'system:migration-0003');

-- ============================================================================
-- 9. Initialization marker
-- ============================================================================

INSERT OR IGNORE INTO site_configs (key, value) VALUES ('gallery_v2_initialized', '0');
