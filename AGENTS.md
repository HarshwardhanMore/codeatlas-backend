# CodeAtlas Backend Contributor Guide

This file is permanent guidance for AI agents and engineers working in the `codeatlas-backend` repository.

## Repository Role

`codeatlas-backend` is the NestJS API and platform processing service for CodeAtlas. It owns authentication, authorization foundations, repository provider integration, ZIP ingestion, repository scanning, API intelligence, persistence, queues, dashboard data, dependency graph APIs, and the AI assistant API.

This repository does not own the Next.js frontend. Frontend UI behavior belongs in the separate `codeatlas-frontend` repository.

## Architecture Principles

- Controllers are HTTP transport only.
- Services own business logic and orchestration.
- Repositories own Prisma persistence and query details.
- Providers isolate external services such as GitHub, Bitbucket, and OpenRouter.
- Workers and processors own asynchronous BullMQ execution.
- Scanner output is deterministic source-of-truth data.
- AI is a reasoning and explanation layer over stored intelligence only.
- Keep module boundaries explicit and avoid circular dependencies.
- Prefer typed configuration and constants over magic values.
- Keep changes scoped to the requested behavior.

## Locked Backend Stack

- Runtime: Node.js 24 LTS with npm 11.
- Framework: NestJS with TypeScript.
- Database: PostgreSQL through Prisma.
- Queue/cache: Redis with BullMQ.
- Repository analysis: ts-morph and Tree-sitter.
- AI provider: OpenRouter API.
- Repository providers: GitHub API, Bitbucket API, ZIP upload.
- Testing: Jest.
- Quality: ESLint, Prettier, Husky, lint-staged, GitHub Actions.

## Folder Ownership

- `src/common`: shared decorators, guards, filters, interceptors, pipes, types, and utilities.
- `src/config`: environment validation and typed runtime configuration.
- `src/modules/auth`: authentication, Google login, JWT, refresh tokens, auth cookies, and auth guards.
- `src/modules/users`: user lookup, role assignment, and user-related persistence boundaries.
- `src/modules/integrations`: GitHub and Bitbucket repository provider OAuth, token encryption, provider registry, and connection lifecycle.
- `src/modules/repositories`: repository records, ZIP upload/storage, provider repository import, ownership checks, and repository API endpoints.
- `src/modules/jobs`: BullMQ queues, producers, processors, and scan progress consumption.
- `src/modules/scanner`: source materialization, workspace management, file discovery, language/framework detection, AST extraction, API intelligence, versioning, and dependency graph.
- `src/modules/ai`: OpenRouter provider, prompt rules, context building, conversations, messages, and AI rate limiting.
- `src/modules/dashboard`: aggregated product metrics and recent activity.
- `src/modules/prisma`: Prisma service and database lifecycle integration.
- `prisma`: schema and migrations.
- `fixtures`: scanner/API extraction fixtures used by tests.
- `test`: shared test utilities.

## NestJS Patterns

- Use `*.module.ts` to compose feature dependencies.
- Use `controllers/` for HTTP routes and request/response decorators.
- Use `services/` for business logic.
- Use `repositories/` for database access.
- Use `providers/` for external provider implementations.
- Use `dto/` with `class-validator` for inbound request validation.
- Use guards for authentication, role checks, and ownership boundaries.
- Do not inject Prisma directly into controllers.
- Do not perform long-running work in HTTP handlers; enqueue jobs instead.

## Prisma Rules

- Keep Prisma access behind repository or service boundaries.
- Keep migrations deterministic and reviewable.
- Do not modify historical migrations unless explicitly required for a local reset.
- Store secrets and tokens only in hashed or encrypted form where the domain requires it.
- Add indexes only for verified query patterns.
- Preserve ownership constraints in repository, scan, API, AI, and integration queries.

## DTO and Validation Rules

- Validate inbound payloads with DTOs and the global validation pipe.
- Use explicit DTOs for route params, query strings, and request bodies.
- Keep response objects typed.
- Reject unknown or malformed input rather than silently coercing unsafe values.
- Do not bypass validation in controllers or tests.

## Security Rules

- Never commit secrets or local `.env` files.
- Validate required environment variables at startup.
- Do not expose password hashes, refresh tokens, OAuth tokens, API keys, or raw provider errors.
- Encrypt GitHub and Bitbucket OAuth tokens before persistence.
- Hash refresh tokens before persistence.
- Use ownership checks before repository, scan, API, dependency graph, or AI access.
- Treat uploaded ZIP files and cloned repositories as untrusted input.
- Prevent path traversal and unsafe archive extraction.
- Do not execute scanned repository code or install scanned repository dependencies.
- Bound external provider calls and scanner work with configured timeouts and limits.
- Do not log access tokens, refresh tokens, OAuth codes, API keys, or generated Git credentials.

## Domain Rules

- Auth providers are `PASSWORD` and `GOOGLE`.
- Repository providers are `GITHUB`, `BITBUCKET`, and `ZIP`.
- GitHub and Bitbucket are repository connections, not login providers.
- Scanner data is the source of truth for code/API intelligence.
- AI must use stored platform intelligence and must not clone, read, or parse repositories directly.
- OpenAPI output must be generated from persisted detected API records.
- API snapshots are immutable history.

## Testing Expectations

- Add focused Jest tests for services, providers, repositories, guards, and scanner utilities.
- Mock external providers; do not hit GitHub, Bitbucket, Google, or OpenRouter in tests.
- Use fixtures for scanner and API extraction behavior.
- Cover security-sensitive behavior: OAuth state, token handling, ownership checks, ZIP safety, scanner cancellation, and AI context boundaries.
- Run relevant validation before handing off changes:

```bash
npm run lint
npm run typecheck
npm run build
npm test
npx prisma validate
```

## Naming Conventions

- Use kebab-case for files and folders.
- Use PascalCase for classes, DTO classes, Nest providers, and exported types.
- Use camelCase for functions, variables, and object properties.
- Use suffixes consistently: `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.provider.ts`, `*.guard.ts`, `*.dto.ts`, `*.spec.ts`.
- Keep module and folder names aligned with the domain they own.

## Dependency Rules

- Prefer existing local abstractions before adding new ones.
- Keep framework-specific API extraction inside extractor classes.
- Keep provider-specific GitHub/Bitbucket logic inside provider implementations.
- Do not add new runtime packages unless the task requires them and they fit the locked stack.
- Do not introduce monorepo tooling, Nx, Turborepo, or shared workspace assumptions.

## Forbidden Patterns

- Fake APIs, fake dashboards, fake metrics, or fake repository data.
- Business logic in controllers.
- Direct Prisma access from controllers.
- Raw secrets in code, logs, tests, or documentation.
- Plaintext refresh token or OAuth token persistence.
- Unsafe filesystem access or ZIP extraction.
- Shell command construction with untrusted user input.
- Executing scanned repository code.
- AI scanning repositories directly.
- Disabling lint, typecheck, validation, or tests to make changes pass.
- Broad rewrites or unrelated refactors.
