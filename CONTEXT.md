# CodeAtlas Backend Context

This file explains what exists in the `codeatlas-backend` repository, why it exists, and how it works. `AGENTS.md` explains how contributors must work; this file explains backend implementation reality.

Last verified against the local backend codebase on 2026-06-09.

## Product Role

CodeAtlas is an AI-powered engineering intelligence platform. The backend is the API, persistence, queue, scanner, repository integration, and AI orchestration service.

The backend owns deterministic platform intelligence. The frontend consumes backend APIs but does not implement backend domains.

Core boundary:

```text
Scanner = source of truth
AI = explanation layer
```

The scanner materializes repositories, analyzes source code, stores code/API intelligence, generates documentation data, and detects API changes. The AI assistant only explains stored backend data.

## Runtime and Stack

- Node.js 24 with npm 11.
- NestJS and TypeScript.
- PostgreSQL through Prisma.
- Redis with BullMQ.
- ts-morph and Tree-sitter for TypeScript/JavaScript analysis.
- OpenRouter for AI completions.
- GitHub API, Bitbucket API, and ZIP upload for repository sources.
- Jest for tests.
- Dockerfile and backend-owned `docker-compose.yml` for local backend services.

## Backend Responsibilities

Implemented backend responsibilities:

- Email/password registration and login.
- Google OAuth login.
- JWT access tokens and refresh token rotation.
- RBAC foundation with roles and permissions.
- GitHub and Bitbucket repository OAuth connection flows.
- ZIP repository upload and safe extraction.
- Repository import and ownership checks.
- BullMQ scan queue and scan lifecycle processing.
- Git/ZIP source materialization.
- Isolated scanner workspaces.
- File discovery, language detection, framework detection, AST metadata extraction.
- Code files, symbols, and dependency persistence.
- NestJS and Express API discovery.
- OpenAPI and Markdown documentation generation.
- API snapshots, diffing, breaking-change detection, and risk scoring.
- Dependency graph API.
- Dashboard analytics API.
- AI conversations, message history, Redis-backed rate limiting, context building, and OpenRouter calls.

Not owned here:

- Browser UI, page routing, React components, and frontend state.
- Billing.
- Organization/team management UI beyond backend schema foundations.

## Architecture

HTTP flow:

```text
Request -> Controller -> Service -> Repository -> Prisma -> PostgreSQL
```

Async scan flow:

```text
Repository API -> Scan service -> ScanJob -> BullMQ -> Processor -> Scanner lifecycle -> Storage
```

AI flow:

```text
AI controller -> Chat service -> Context builder -> Stored intelligence -> OpenRouter provider -> Conversation storage
```

Controllers should stay thin. Services orchestrate business rules. Repositories isolate persistence. Providers isolate external systems. Workers/processors isolate asynchronous execution.

## Important Folders

- `src/common`: shared decorators, role/current-user helpers, auth user types, duration and token hashing utilities.
- `src/config`: Zod environment schema and typed configuration mapping.
- `src/modules`: backend feature modules.
- `prisma/schema.prisma`: database schema.
- `prisma/migrations`: sequential migrations for identity, repository sources, scanner, API intelligence, versioning, AI, and production hardening.
- `fixtures`: scanner/API extraction fixtures.
- `test`: shared test helpers.

## Modules

### `auth`

Owns email/password auth, Google OAuth login, JWT generation/validation, refresh token rotation, auth cookies, Google OAuth state validation, and auth guards.

Implemented routes include registration, login, refresh, logout, current user lookup, Google OAuth start, and Google OAuth callback.

Security details:

- Passwords are hashed with bcrypt.
- Refresh tokens are stored hashed.
- Refresh token reuse revokes the token family.
- Google OAuth uses signed state, callback-scoped HTTP-only cookies, expiry, and Redis replay protection.

### `users`

Owns user lookup and role assignment support. User creation is orchestrated through auth flows. Role and permission persistence is isolated behind repositories.

### `integrations`

Owns repository-provider OAuth for GitHub and Bitbucket. These providers are repository sources, not login providers.

Responsibilities:

- Generate provider authorization URLs.
- Validate OAuth state.
- Exchange OAuth codes for tokens.
- Encrypt stored provider tokens.
- List provider repositories.
- Validate and disconnect connections.

GitHub scopes currently requested: `repo`, `read:user`, `user:email`.

Bitbucket scopes currently requested: `account`, `repository`.

### `repositories`

Owns repository records, provider repository import, ZIP upload intake, ZIP storage, repository listing, and repository ownership checks.

ZIP safety includes extension/MIME validation, size checks, entry count limit, expanded-size limit, strict file names, path traversal protection, symlink rejection, and cleanup on failure.

### `jobs`

Owns BullMQ queues, producers, processors, and progress consumption. The implemented queue is `repository.scan`; additional queue constants exist for API analysis and documentation generation boundaries.

Repository scan jobs carry repository id, scan id, and user id. Jobs are asynchronous and should never block HTTP request handling.

### `scanner`

Owns repository source materialization and deterministic code intelligence.

Pipeline:

```text
Repository
  -> Source materializer
  -> Workspace manager
  -> File discovery
  -> Language detector
  -> Framework detector
  -> AST parser/extractors
  -> Code metadata persistence
  -> API discovery
  -> Documentation generation
  -> Snapshot/diff/change persistence
```

Materializers:

- Git materializer for GitHub and Bitbucket repositories.
- ZIP materializer for uploaded ZIP sources.

Scanner rules:

- Do not execute scanned code.
- Do not install repository dependencies.
- Keep workspaces isolated.
- Enforce file count, file size, workspace size, clone timeout, and cancellation limits.
- A bad file should not imply fabricated output.

Supported code extensions: `.ts`, `.tsx`, `.js`, `.jsx`.

Ignored directories include `.git`, `.next`, `build`, `coverage`, `dist`, and `node_modules`.

### API Intelligence

Located under `src/modules/scanner/api-intelligence`.

Implemented capabilities:

- NestJS extractor for controller and method decorators.
- Express extractor for app/router route calls.
- Best-effort request and response schema extraction.
- Auth metadata extraction from guards/decorators/middleware where detectable.
- OpenAPI generation from persisted detected API records.
- Markdown documentation generation.
- API snapshots, contract hashes, schema/auth diffing, change records, and risk scoring.

Snapshots are immutable. Diffs compare current scan output with previous snapshots and store `ApiChange` records.

### Dependency Graph

Located under `src/modules/scanner/dependency-graph`.

The backend exposes real dependency graph nodes and edges from persisted `CodeFile`, `CodeSymbol`, and `CodeDependency` data. It does not fabricate graph data.

### `ai`

Owns AI conversation APIs and OpenRouter integration.

AI context includes relevant stored repository metadata, detected APIs, documentation, API history, breaking changes, code symbols, and dependencies. The AI module must not read repository files, clone repositories, parse source code, or use AI as a scanner.

OpenRouter failures, missing API key, provider rate limits, provider timeouts, and context-size constraints are handled through service/provider errors.

### `dashboard`

Owns aggregated dashboard metrics from repositories, scans, detected APIs, changes, and recent activity. Dashboard data is derived from persisted product records.

### `health`

Provides a basic health endpoint/service boundary.

### `prisma`

Provides Prisma service integration for NestJS lifecycle and database access.

## Database Model Overview

Identity:

- `User`: account profile, status, and timestamps.
- `AuthAccount`: login method mapping for `PASSWORD` and `GOOGLE`.
- `RefreshToken`: hashed refresh token families, expiry, revocation, and rotation state.
- `Role`, `Permission`, `RolePermission`, `UserRole`: RBAC foundation.

Enterprise structure foundation:

- `Organization`, `OrganizationMember`, `Team`, `TeamMember`: schema foundation for organization/team concepts.

Repository sources:

- `RepositoryConnection`: encrypted GitHub/Bitbucket provider credentials and connection metadata.
- `Repository`: imported GitHub/Bitbucket repositories and ZIP repository sources.

Scan lifecycle:

- `ScanJob`: queued/running/completed/failed/cancelled scan history, progress, error, branch, commit, and materialization metadata.

Code intelligence:

- `CodeFile`: discovered source files, language, path, size, and metadata.
- `CodeSymbol`: classes, functions, methods, interfaces, types, imports, exports, decorators.
- `CodeDependency`: file/symbol relationships and dependency edges.

API intelligence:

- `DetectedApi`: discovered route contract and source metadata.
- `ApiDocumentation`: OpenAPI JSON and Markdown for a detected API.
- `ApiSnapshot`: immutable API contract snapshots per scan.
- `ApiChange`: detected API lifecycle and breaking-change records.

AI:

- `AiConversation`: repository-scoped user conversations.
- `AiMessage`: user/assistant messages, model, metadata, and timestamps.

## Auth and OAuth Flows

Email/password:

```text
register/login -> AuthService -> UsersService -> PasswordService -> TokenService -> RefreshToken repository
```

Google login:

```text
/auth/google -> signed state + Redis nonce + state cookie -> Google
Google callback -> state validation -> user/account lookup -> token issue -> frontend redirect
```

Repository OAuth:

```text
/integrations/:provider/connect -> OAuth state -> provider authorize URL
provider callback -> code exchange -> encrypted token storage -> repository listing/import
```

GitHub and Bitbucket tokens are decrypted only inside provider/materialization flows that need them. Tokens are never returned to the frontend.

## Repository Ingestion and Materialization

GitHub/Bitbucket flow:

1. User connects provider.
2. Backend stores encrypted provider credentials.
3. Backend lists repositories through provider APIs.
4. User imports a repository.
5. Scan starts.
6. Git materializer validates provider, URL, branch, and credentials.
7. Git clone runs with bounded timeout, shallow clone, blob filtering, and askpass token isolation.
8. Scanner receives a local source path.

ZIP flow:

1. User uploads a `.zip`.
2. Backend validates file type and size.
3. Backend extracts safely into repository storage.
4. ZIP materializer returns the stored local source path.
5. Scanner processes the source path through the same lifecycle.

## Redis Usage

Redis is required for:

- BullMQ queue backend.
- Scan progress snapshots and TTL.
- Google OAuth state replay protection.
- GitHub/Bitbucket OAuth state storage.
- AI assistant rate limiting across backend instances.

## Security Model

- Global validation pipe whitelists DTO properties and rejects unknown fields.
- CORS is restricted to configured `FRONTEND_ORIGIN` with credentials enabled.
- Refresh cookies are HTTP-only and secure in production.
- JWT access tokens are signed with dedicated access secret.
- Refresh tokens use a separate refresh secret and hashed persistence.
- Provider OAuth tokens are encrypted before storage.
- Repository ownership is checked before repository, scan, API, graph, and AI access.
- Uploaded and cloned code is untrusted input.
- Scanner and ZIP operations enforce path and size safety.
- AI prompts instruct the assistant to answer from available stored context and say when data is missing.

## Runtime and Deployment

Required services:

- PostgreSQL.
- Redis.
- Backend process.
- Optional provider credentials for Google, GitHub, Bitbucket, and OpenRouter depending on enabled flows.

Local backend Compose is owned in this repository:

```bash
docker compose up --build
```

The Compose file starts PostgreSQL, Redis, a migration job, and the backend service. It does not start the frontend.

Production notes:

- Run `npm run prisma:deploy` before starting the API.
- Use HTTPS in production so secure cookies work.
- Set `SWAGGER_ENABLED=false` unless docs are protected.
- Store secrets in a deployment secret manager, not in source control.
- Ensure scanner storage paths have enough disk and are not publicly served.

## Testing Approach

Test coverage exists for auth services and guards, OAuth state, token encryption, provider abstraction, repository services, queue producers, scanner lifecycle, materializers, file/language/framework detection, metadata extraction, API extractors, OpenAPI generation, versioning/diff/risk, dashboard service, AI provider/context/chat/rate limit, and dependency graph service.

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm test
npx prisma validate
docker compose config
```

External provider calls must be mocked in tests. Scanner tests should use fixtures rather than live repositories.

## Current Limitations

- API extraction currently targets NestJS and Express.
- Code analysis currently supports TypeScript and JavaScript extensions.
- Organization and team models exist as backend foundations; full management workflows are not implemented here.
- AI answers are limited to stored backend intelligence and configured OpenRouter availability.
