-- 0004: Add nullable canonical Doctor → Media Library relation foundation.
--
-- Adds photo_media_id to doctor_profiles to enable future media_assets
-- relation wiring.  Existing photo_url remains the authoritative runtime
-- source until M4-B activates the relation after production migration.
--
-- Additive only: no columns dropped, no rows modified, no FK constraint
-- added via ALTER TABLE (SQLite limitation).  Application-level
-- referential validation is required in M4-B.

ALTER TABLE doctor_profiles ADD COLUMN photo_media_id TEXT;

CREATE INDEX idx_doctor_profiles_photo_media ON doctor_profiles(photo_media_id);
