# CodeAtlas Backend

![Node.js 24](https://img.shields.io/badge/Node.js-24-339933)
![NestJS 11](https://img.shields.io/badge/NestJS-11-E0234E)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1)
![Redis](https://img.shields.io/badge/Redis-7-DC382D)

NestJS API for authentication, repository ingestion, asynchronous scans, API intelligence, dashboard data, and AI assistant services.

## Repository Responsibility

This repository owns the backend application only. It includes:

- Authentication, refresh tokens, Google login, and RBAC foundations.
- GitHub, Bitbucket, and ZIP repository source ingestion.
- PostgreSQL persistence through Prisma.
- Redis and BullMQ scan processing.
- Repository materialization, scanner lifecycle, code intelligence, API discovery, OpenAPI generation, API versioning, and change detection.
- Dashboard metrics, dependency graph APIs, and OpenRouter-backed assistant APIs.

The Next.js UI is maintained separately in `../codeatlas-frontend`.

## Tech Stack

| Category            | Technology                                           |
| ------------------- | ---------------------------------------------------- |
| Runtime             | Node.js 24, npm 11                                   |
| Framework           | NestJS                                               |
| Language            | TypeScript                                           |
| Database            | PostgreSQL, Prisma                                   |
| Queue/cache         | Redis, BullMQ                                        |
| Repository analysis | ts-morph, Tree-sitter                                |
| Authentication      | JWT, Google OAuth, bcrypt                            |
| AI provider         | OpenRouter                                           |
| Testing             | Jest                                                 |
| Quality             | ESLint, Prettier, Husky, lint-staged, GitHub Actions |

## Capabilities

- Email/password registration and login.
- Google OAuth login.
- Refresh token rotation and logout.
- GitHub and Bitbucket repository connections.
- ZIP repository upload.
- BullMQ-backed repository scan pipeline.
- TypeScript and JavaScript code metadata extraction.
- NestJS and Express API discovery.
- OpenAPI document generation.
- API snapshots, history, and breaking-change detection.
- Dependency graph data from stored code relationships.
- Dashboard metrics and recent activity.
- AI assistant responses grounded in stored platform intelligence.

## Architecture Overview

HTTP requests follow the standard NestJS module boundary:

```text
Request
  -> Controller
  -> Service
  -> Repository
  -> PostgreSQL
```

Repository scans run asynchronously:

```text
API
  -> BullMQ queue
  -> Worker
  -> Scanner
  -> PostgreSQL / Redis
```

Controllers should stay focused on HTTP concerns. Services own business logic. Repositories isolate Prisma persistence and query details.

## Project Structure

```text
src/common/      Shared decorators, guards, pipes, types, and utilities.
src/config/      Environment validation and typed runtime configuration.
src/modules/     Feature modules for auth, repositories, scanner, AI, jobs, and dashboard.
prisma/          Prisma schema and migrations.
fixtures/        Scanner and API extraction test fixtures.
test/            Shared test utilities.
```

## Requirements

- Node.js `>=24 <25`
- npm `>=11`
- PostgreSQL
- Redis
- Git
- Docker, optional but recommended for local PostgreSQL and Redis

Use the project Node version:

```bash
nvm use
```

## Environment Setup

Create a local environment file:

```bash
cp .env.example .env
```

For full provider setup instructions, see [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md).

Important environment groups:

| Group            | Variables                                                         |
| ---------------- | ----------------------------------------------------------------- |
| Runtime          | `NODE_ENV`, `PORT`, `FRONTEND_ORIGIN`                             |
| Services         | `DATABASE_URL`, `REDIS_URL`                                       |
| JWT              | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, token expiry variables |
| Google login     | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Repository OAuth | GitHub and Bitbucket client IDs, secrets, and callback URLs       |
| Token encryption | `OAUTH_ENCRYPTION_KEY`                                            |
| Scanner          | Workspace paths, file limits, ZIP limits, Git clone timeout       |
| Queue            | Scan attempts, timeout, progress TTL                              |
| AI               | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, AI limits               |
| Swagger          | `SWAGGER_ENABLED`                                                 |

## Installation

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
```

Use `npm run prisma:deploy` instead of `npm run prisma:migrate` when applying existing migrations in deployed environments.

## Run

Development:

```bash
npm run dev
```

Production-style local run:

```bash
npm run build
npm run start
```

Default local API origin:

```text
http://localhost:3001
```

Swagger is available at `/docs` when enabled by configuration.

## Build, Test, and Quality

```bash
npm run build
npm run typecheck
npm test
npm run lint
npm run format:check
```

GitHub Actions runs install, lint, typecheck, tests, and build. Husky and lint-staged run fast staged-file checks before commits.

## Common Scripts

| Script                    | Purpose                                |
| ------------------------- | -------------------------------------- |
| `npm run dev`             | Start NestJS in watch mode.            |
| `npm run build`           | Compile the backend into `dist/`.      |
| `npm run start`           | Run the compiled backend.              |
| `npm run lint`            | Run ESLint with zero warnings allowed. |
| `npm run lint:fix`        | Fix supported ESLint issues.           |
| `npm run format`          | Format files with Prettier.            |
| `npm run format:check`    | Check Prettier formatting.             |
| `npm run typecheck`       | Run TypeScript without emitting files. |
| `npm test`                | Run Jest tests.                        |
| `npm run prisma:generate` | Generate Prisma client.                |
| `npm run prisma:migrate`  | Run local Prisma migrations.           |
| `npm run prisma:deploy`   | Deploy existing Prisma migrations.     |

## Troubleshooting

| Issue                               | Likely cause                                              | Fix                                                         |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Backend cannot start                | Required environment variable is missing or invalid.      | Compare `.env` with `.env.example` and restart the process. |
| Prisma cannot connect               | `DATABASE_URL` is wrong or PostgreSQL is not running.     | Start PostgreSQL and verify the connection string.          |
| Redis errors                        | `REDIS_URL` is wrong or Redis is not running.             | Start Redis and verify the URL.                             |
| Prisma client errors                | Client was not generated after install or schema changes. | Run `npm run prisma:generate`.                              |
| OAuth redirect mismatch             | Provider callback URL does not match `.env`.              | Update provider settings or local environment values.       |
| AI assistant unavailable            | `OPENROUTER_API_KEY` is empty or OpenRouter failed.       | Configure OpenRouter and check backend logs.                |
| Scanner fails on large repositories | File, workspace, ZIP, or clone limits were exceeded.      | Adjust scanner limits only if host capacity supports it.    |

## Notes for Contributors

- Keep controllers thin and HTTP-focused.
- Put business logic in services.
- Keep Prisma query details behind repositories or service boundaries.
- Do not commit secrets or local `.env` files.
- Add or update tests when changing auth, providers, scanner behavior, AI services, or persistence logic.
- Use [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for detailed local and production environment setup.
