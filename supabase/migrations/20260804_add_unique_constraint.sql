-- ============================================================
-- T11 — Constraint: unique webtoon title
-- Prevents duplicate "E2E Test" webtoons created during testing
-- and ensures data integrity for webtoon titles
-- ============================================================

alter table public.webtoons add constraint unique_webtoons_title unique (title);