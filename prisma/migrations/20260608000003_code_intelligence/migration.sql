CREATE TYPE "CodeLanguage" AS ENUM ('TYPESCRIPT', 'JAVASCRIPT', 'UNKNOWN');
CREATE TYPE "CodeSymbolKind" AS ENUM ('CLASS', 'FUNCTION', 'METHOD', 'INTERFACE', 'TYPE', 'IMPORT', 'EXPORT', 'DECORATOR', 'VARIABLE');
CREATE TYPE "CodeDependencyKind" AS ENUM ('IMPORT', 'EXPORT', 'CLASS_EXTENDS', 'METHOD_CALL');

CREATE TABLE "code_files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "path" VARCHAR(1024) NOT NULL,
  "language" "CodeLanguage" NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "hash" CHAR(64) NOT NULL,
  "line_count" INTEGER NOT NULL,
  "parse_status" VARCHAR(40) NOT NULL,
  "parse_error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "code_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_symbols" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "code_file_id" UUID NOT NULL,
  "kind" "CodeSymbolKind" NOT NULL,
  "name" VARCHAR(320) NOT NULL,
  "qualified_name" VARCHAR(640),
  "start_line" INTEGER,
  "end_line" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "code_symbols_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "code_dependencies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "repository_id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "source_file_id" UUID NOT NULL,
  "target_file_id" UUID,
  "source_path" VARCHAR(1024) NOT NULL,
  "target_path" VARCHAR(1024),
  "kind" "CodeDependencyKind" NOT NULL,
  "specifier" VARCHAR(1024) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "code_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "code_files_scan_id_path_key" ON "code_files"("scan_id", "path");
CREATE INDEX "code_files_repository_id_idx" ON "code_files"("repository_id");
CREATE INDEX "code_files_scan_id_idx" ON "code_files"("scan_id");
CREATE INDEX "code_files_language_idx" ON "code_files"("language");
CREATE INDEX "code_symbols_repository_id_idx" ON "code_symbols"("repository_id");
CREATE INDEX "code_symbols_scan_id_idx" ON "code_symbols"("scan_id");
CREATE INDEX "code_symbols_code_file_id_idx" ON "code_symbols"("code_file_id");
CREATE INDEX "code_symbols_kind_idx" ON "code_symbols"("kind");
CREATE INDEX "code_dependencies_repository_id_idx" ON "code_dependencies"("repository_id");
CREATE INDEX "code_dependencies_scan_id_idx" ON "code_dependencies"("scan_id");
CREATE INDEX "code_dependencies_source_file_id_idx" ON "code_dependencies"("source_file_id");
CREATE INDEX "code_dependencies_target_file_id_idx" ON "code_dependencies"("target_file_id");
CREATE INDEX "code_dependencies_kind_idx" ON "code_dependencies"("kind");

ALTER TABLE "code_files" ADD CONSTRAINT "code_files_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_files" ADD CONSTRAINT "code_files_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_code_file_id_fkey" FOREIGN KEY ("code_file_id") REFERENCES "code_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_dependencies" ADD CONSTRAINT "code_dependencies_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_dependencies" ADD CONSTRAINT "code_dependencies_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_dependencies" ADD CONSTRAINT "code_dependencies_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "code_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_dependencies" ADD CONSTRAINT "code_dependencies_target_file_id_fkey" FOREIGN KEY ("target_file_id") REFERENCES "code_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
