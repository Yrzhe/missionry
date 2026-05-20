-- intentionally no-op
-- EdgeSpark's managed `es_system__auth_*` tables reject migration-driven
-- DELETEs at apply time. Track leaked test account cleanup separately:
-- see research-docs/implementation/2026-05-21-signup-gate.md "deferred cleanup".
SELECT 1;
