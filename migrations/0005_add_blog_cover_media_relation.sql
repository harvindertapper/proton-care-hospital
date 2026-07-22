-- 0005: Add nullable canonical Blog Post → Media Library cover relation.
--
-- Existing Blog runtime remains unchanged until M4-C2 is deployed after the
-- authorized production migration gate.
--
-- FK decision: Follows the verified Doctor migration 0004 pattern.
-- No ALTER-time FOREIGN KEY / REFERENCES constraint is added.
-- SQLite limitation: FOREIGN KEY via ALTER TABLE is not supported.
-- Application-level referential validation will be added in M4-C2.
--
-- Existing Blog rows retain all data and receive cover_media_id=NULL.
-- Application-level relation validation will be added in M4-C2.
-- No backfill, no lifecycle mutation, no media registration.

ALTER TABLE blog_posts ADD COLUMN cover_media_id TEXT;

CREATE INDEX idx_blog_posts_cover_media
ON blog_posts(cover_media_id);
