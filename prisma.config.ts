import { defineConfig } from 'prisma/config';

const LOCAL_DATABASE_URL = 'postgresql://codeatlas:codeatlas_local@localhost:5432/codeatlas';

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
  },
  schema: 'prisma/schema.prisma',
});
