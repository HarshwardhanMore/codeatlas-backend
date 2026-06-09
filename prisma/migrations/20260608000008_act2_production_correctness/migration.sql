CREATE UNIQUE INDEX "scan_jobs_one_active_per_repository_idx"
ON "scan_jobs" ("repository_id")
WHERE "status" IN ('QUEUED', 'RUNNING');

CREATE INDEX "code_dependencies_repository_scan_source_idx"
ON "code_dependencies" ("repository_id", "scan_id", "source_path");

CREATE INDEX "code_dependencies_repository_scan_target_idx"
ON "code_dependencies" ("repository_id", "scan_id", "target_path");
