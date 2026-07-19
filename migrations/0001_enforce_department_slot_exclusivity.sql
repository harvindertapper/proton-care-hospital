-- Production databases retain the legacy phone-scoped index. This additive
-- index enforces the actual booking invariant without removing that safe,
-- redundant index during the compatibility window.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_department_slot
ON appointments(department_slug, requested_date, requested_time)
WHERE status != 'CANCELLED';
