-- Deprecated: one multi-table SELECT fails if *any* optional table is missing.
-- Row counts: ./scripts/d1/run-d1-table-counts.sh and scripts/d1/d1-cleanup-candidate-counts.sql
-- Triage: rg for table name in the repo, then e.g. SELECT COUNT(*) FROM optional_table
SELECT 1 AS see_d1_table_counts;
