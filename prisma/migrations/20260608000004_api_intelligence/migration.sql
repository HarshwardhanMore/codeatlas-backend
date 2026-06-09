CREATE TYPE "ApiFramework" AS ENUM ('NESTJS', 'EXPRESS');

CREATE TYPE "ApiHttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

CREATE TABLE "detected_apis" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "method" "ApiHttpMethod" NOT NULL,
  "path" VARCHAR(1024) NOT NULL,
  "framework" "ApiFramework" NOT NULL,
  "controller_name" VARCHAR(320),
  "handler_name" VARCHAR(320),
  "file_path" VARCHAR(1024) NOT NULL,
  "line_number" INTEGER NOT NULL,
  "request_schema" JSONB,
  "response_schema" JSONB,
  "auth_metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "detected_apis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_documentation" (
  "api_id" UUID NOT NULL,
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "open_api_json" JSONB NOT NULL,
  "markdown" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "api_documentation_pkey" PRIMARY KEY ("api_id")
);

CREATE INDEX "detected_apis_repository_id_idx" ON "detected_apis"("repository_id");
CREATE INDEX "detected_apis_scan_id_idx" ON "detected_apis"("scan_id");
CREATE INDEX "detected_apis_method_idx" ON "detected_apis"("method");
CREATE INDEX "detected_apis_framework_idx" ON "detected_apis"("framework");
CREATE INDEX "api_documentation_repository_id_idx" ON "api_documentation"("repository_id");
CREATE INDEX "api_documentation_scan_id_idx" ON "api_documentation"("scan_id");

ALTER TABLE "detected_apis"
  ADD CONSTRAINT "detected_apis_repository_id_fkey"
  FOREIGN KEY ("repository_id")
  REFERENCES "repositories"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "detected_apis"
  ADD CONSTRAINT "detected_apis_scan_id_fkey"
  FOREIGN KEY ("scan_id")
  REFERENCES "scan_jobs"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_documentation"
  ADD CONSTRAINT "api_documentation_api_id_fkey"
  FOREIGN KEY ("api_id")
  REFERENCES "detected_apis"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_documentation"
  ADD CONSTRAINT "api_documentation_repository_id_fkey"
  FOREIGN KEY ("repository_id")
  REFERENCES "repositories"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "api_documentation"
  ADD CONSTRAINT "api_documentation_scan_id_fkey"
  FOREIGN KEY ("scan_id")
  REFERENCES "scan_jobs"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
