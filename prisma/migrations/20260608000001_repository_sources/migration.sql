ALTER TYPE "RepositoryProvider" ADD VALUE 'ZIP';

ALTER TABLE "repository_connections"
  ADD COLUMN "username" VARCHAR(160),
  ADD COLUMN "encrypted_access_token" TEXT,
  ADD COLUMN "encrypted_refresh_token" TEXT,
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "last_validated_at" TIMESTAMP(3);

CREATE TABLE "repositories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "provider" "RepositoryProvider" NOT NULL,
  "external_id" VARCHAR(320) NOT NULL,
  "name" VARCHAR(240) NOT NULL,
  "full_name" VARCHAR(512) NOT NULL,
  "url" TEXT NOT NULL,
  "default_branch" VARCHAR(160),
  "visibility" VARCHAR(80),
  "language" VARCHAR(120),
  "source_path" TEXT,
  "archive_path" TEXT,
  "upload_size_bytes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repositories_owner_id_provider_external_id_key" ON "repositories"("owner_id", "provider", "external_id");
CREATE INDEX "repositories_connection_id_idx" ON "repositories"("connection_id");
CREATE INDEX "repositories_owner_id_idx" ON "repositories"("owner_id");

ALTER TABLE "repositories" ADD CONSTRAINT "repositories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
