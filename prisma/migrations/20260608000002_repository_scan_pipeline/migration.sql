CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "scan_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "repository_id" UUID NOT NULL,
  "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "error_message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scan_jobs_repository_id_idx" ON "scan_jobs"("repository_id");
CREATE INDEX "scan_jobs_status_idx" ON "scan_jobs"("status");
CREATE INDEX "scan_jobs_created_at_idx" ON "scan_jobs"("created_at");

ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
