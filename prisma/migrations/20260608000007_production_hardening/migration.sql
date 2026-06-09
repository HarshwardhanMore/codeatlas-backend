CREATE INDEX "scan_jobs_repository_id_status_created_at_idx"
  ON "scan_jobs"("repository_id", "status", "created_at");

CREATE INDEX "detected_apis_repository_id_path_idx"
  ON "detected_apis"("repository_id", "path");
