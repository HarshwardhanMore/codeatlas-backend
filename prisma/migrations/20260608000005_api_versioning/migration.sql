CREATE TYPE "ApiChangeType" AS ENUM ('ADDED', 'REMOVED', 'MODIFIED', 'DEPRECATED');

CREATE TYPE "ApiChangeSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "api_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "api_id" UUID NOT NULL,
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "contract_hash" CHAR(64) NOT NULL,
  "schema_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "api_id" UUID NOT NULL,
  "old_snapshot_id" UUID,
  "new_snapshot_id" UUID,
  "change_type" "ApiChangeType" NOT NULL,
  "severity" "ApiChangeSeverity" NOT NULL,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_snapshots_api_id_scan_id_key" ON "api_snapshots"("api_id", "scan_id");
CREATE INDEX "api_snapshots_repository_id_idx" ON "api_snapshots"("repository_id");
CREATE INDEX "api_snapshots_scan_id_idx" ON "api_snapshots"("scan_id");
CREATE INDEX "api_snapshots_contract_hash_idx" ON "api_snapshots"("contract_hash");
CREATE INDEX "api_changes_repository_id_idx" ON "api_changes"("repository_id");
CREATE INDEX "api_changes_scan_id_idx" ON "api_changes"("scan_id");
CREATE INDEX "api_changes_api_id_idx" ON "api_changes"("api_id");
CREATE INDEX "api_changes_old_snapshot_id_idx" ON "api_changes"("old_snapshot_id");
CREATE INDEX "api_changes_new_snapshot_id_idx" ON "api_changes"("new_snapshot_id");
CREATE INDEX "api_changes_change_type_idx" ON "api_changes"("change_type");
CREATE INDEX "api_changes_severity_idx" ON "api_changes"("severity");

ALTER TABLE "api_snapshots"
  ADD CONSTRAINT "api_snapshots_api_id_fkey"
  FOREIGN KEY ("api_id")
  REFERENCES "detected_apis"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_snapshots"
  ADD CONSTRAINT "api_snapshots_repository_id_fkey"
  FOREIGN KEY ("repository_id")
  REFERENCES "repositories"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_snapshots"
  ADD CONSTRAINT "api_snapshots_scan_id_fkey"
  FOREIGN KEY ("scan_id")
  REFERENCES "scan_jobs"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_changes"
  ADD CONSTRAINT "api_changes_repository_id_fkey"
  FOREIGN KEY ("repository_id")
  REFERENCES "repositories"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_changes"
  ADD CONSTRAINT "api_changes_scan_id_fkey"
  FOREIGN KEY ("scan_id")
  REFERENCES "scan_jobs"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_changes"
  ADD CONSTRAINT "api_changes_api_id_fkey"
  FOREIGN KEY ("api_id")
  REFERENCES "detected_apis"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_changes"
  ADD CONSTRAINT "api_changes_old_snapshot_id_fkey"
  FOREIGN KEY ("old_snapshot_id")
  REFERENCES "api_snapshots"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "api_changes"
  ADD CONSTRAINT "api_changes_new_snapshot_id_fkey"
  FOREIGN KEY ("new_snapshot_id")
  REFERENCES "api_snapshots"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
