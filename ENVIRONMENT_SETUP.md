# CodeAtlas Backend Environment Setup

This guide explains how to configure the CodeAtlas backend from a fresh clone. It documents only environment variables that exist in the current backend implementation and `.env.example`.

Last reviewed for provider setup flows: June 2026.

## 1. Prerequisites

Install the local tooling before creating `.env`.

| Tool       | Required version                               | Why it is needed                                                       |
| ---------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Node.js    | `24.x`                                         | The backend package requires `>=24 <25`.                               |
| npm        | `>=11`                                         | Dependency installation and scripts.                                   |
| Docker     | Current stable Docker Desktop or Docker Engine | Easiest way to run PostgreSQL and Redis locally.                       |
| PostgreSQL | 16 recommended                                 | Primary database used through Prisma.                                  |
| Redis      | 7 recommended                                  | BullMQ queues, scan progress, AI rate limits, and OAuth state storage. |
| Git        | Current stable                                 | Repository materialization clones GitHub and Bitbucket repositories.   |

Check local versions:

```bash
node --version
npm --version
docker --version
git --version
```

The repository includes `.nvmrc` with Node `24`:

```bash
nvm use
```

## 2. Basic Environment Setup

Create a backend environment file from the checked-in template:

```bash
cp .env.example .env
```

Then edit `.env` and replace every placeholder secret before running the API outside short-lived local testing.

Install dependencies:

```bash
npm install
```

## 3. Database Setup

CodeAtlas uses PostgreSQL through Prisma. The backend requires `DATABASE_URL`.

### Option A: Docker PostgreSQL

From this backend repository:

```bash
docker compose up -d postgres
```

The Compose database matches this local URL:

```env
DATABASE_URL=postgresql://codeatlas:codeatlas_local@localhost:5432/codeatlas
```

### Option B: Local PostgreSQL

Create a database and user manually:

```bash
createdb codeatlas
```

Use a PostgreSQL URL in this format:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Example:

```env
DATABASE_URL=postgresql://codeatlas:codeatlas_local@localhost:5432/codeatlas
```

### Option C: Managed PostgreSQL

Use your provider's connection string and ensure:

- The database is reachable from the backend runtime.
- SSL settings match the provider requirements.
- The database user can create and modify tables during migration deployment.

Example format:

```env
DATABASE_URL=postgresql://USER:PASSWORD@db.example.com:5432/codeatlas?sslmode=require
```

### Prisma Commands

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply migrations in local development:

```bash
npm run prisma:migrate
```

Deploy existing migrations in production:

```bash
npm run prisma:deploy
```

Validate the schema:

```bash
npx prisma validate
```

## 4. Redis Setup

CodeAtlas requires Redis for:

- BullMQ repository scan jobs.
- Scan progress snapshots.
- AI assistant rate limiting.
- Google OAuth state storage.
- GitHub and Bitbucket OAuth nonce/state storage.

Start Redis through this repository's Docker Compose file:

```bash
docker compose up -d redis
```

Local Redis URL:

```env
REDIS_URL=redis://localhost:6379
```

Managed Redis example:

```env
REDIS_URL=rediss://USERNAME:PASSWORD@redis.example.com:6379
```

Use `rediss://` only when your provider requires TLS.

## 5. JWT Configuration

The backend uses:

| Variable                 | Purpose                                |
| ------------------------ | -------------------------------------- |
| `JWT_ACCESS_SECRET`      | Signs short-lived access tokens.       |
| `JWT_REFRESH_SECRET`     | Signs long-lived refresh tokens.       |
| `JWT_ACCESS_EXPIRES_IN`  | Access token lifetime, default `15m`.  |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime, default `30d`. |

Generate separate secrets:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Example:

```env
JWT_ACCESS_SECRET=replace-with-output-from-first-openssl-command
JWT_REFRESH_SECRET=replace-with-output-from-second-openssl-command
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
```

Never reuse `.env.example` placeholder secrets in production. The production environment validator rejects placeholder values containing `replace-with`.

## 6. Cookie and Auth Configuration

The backend enables CORS for one frontend origin and sends HTTP-only refresh cookies.

| Variable          | Local value             | Production value                                                            |
| ----------------- | ----------------------- | --------------------------------------------------------------------------- |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Your deployed frontend origin, for example `https://codeatlas.example.com`. |
| `PORT`            | `3001`                  | The port your backend process listens on.                                   |
| `NODE_ENV`        | `development`           | `production` in production.                                                 |

Cookie behavior in the current implementation:

- Refresh cookie name: `codeatlas_refresh_token`.
- Google OAuth state cookie name: `codeatlas_google_oauth_state`.
- Cookies are `httpOnly`.
- Cookies use `sameSite=lax`.
- Cookies are marked `secure` when `NODE_ENV=production`.
- Backend CORS uses `FRONTEND_ORIGIN` and `credentials: true`.

For local development:

```env
NODE_ENV=development
PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
```

For production, use HTTPS for both frontend and backend. Browser cookies marked `secure` will not work over plain HTTP.

## 7. Google OAuth Setup

Google OAuth is used for user login. GitHub and Bitbucket are not login providers in CodeAtlas.

The backend uses Google OAuth scopes:

```text
email profile
```

Official setup reference: https://support.google.com/cloud/answer/6158849

### Create Google OAuth Credentials

Provider UI names change periodically. As of June 2026, expect the flow to be under either **Google Auth Platform** or **APIs and Services** in Google Cloud Console.

1. Open https://console.cloud.google.com/.
2. Create a new Google Cloud project, or select an existing project.
3. Open **Google Auth Platform** or **APIs and Services > OAuth consent screen**.
4. Configure the app information:
   - App name: `CodeAtlas`.
   - User support email: your developer or company email.
   - Audience: internal for a Google Workspace-only app, external for public login.
   - Developer contact email: your developer or company email.
5. If the app is in testing mode, add your Google account as a test user.
6. Open **Clients** or **Credentials**.
7. Create an OAuth client.
8. Select application type: **Web application**.
9. Add an authorized redirect URI:

```text
http://localhost:3001/api/v1/auth/google/callback
```

10. Save the client.
11. Copy the generated Client ID and Client Secret immediately. Google may only show or allow downloading the client secret at creation time.

### Map Google Values to CodeAtlas

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback
```

Production callback example:

```env
GOOGLE_CALLBACK_URL=https://api.codeatlas.example.com/api/v1/auth/google/callback
FRONTEND_ORIGIN=https://codeatlas.example.com
```

The value in `GOOGLE_CALLBACK_URL` must exactly match the authorized redirect URI in Google Cloud Console. Scheme, host, port, path, and trailing slash all matter.

## 8. GitHub OAuth Integration Setup

GitHub OAuth is used to connect repository sources. It is not used for login.

The backend requests these GitHub scopes:

```text
repo read:user user:email
```

Official setup references:

- https://docs.github.com/en/developers/apps/creating-an-oauth-app
- https://docs.github.com/en/developers/apps/scopes-for-oauth-apps

### Create a GitHub OAuth App

1. Open GitHub.
2. Click your profile picture.
3. Go to **Settings**.
4. Open **Developer settings**.
5. Open **OAuth Apps**.
6. Click **New OAuth App** or **Register a new application**.
7. Fill in:

| Field                      | Local development value                                     |
| -------------------------- | ----------------------------------------------------------- |
| Application name           | `CodeAtlas Local`                                           |
| Homepage URL               | `http://localhost:3000`                                     |
| Application description    | Optional                                                    |
| Authorization callback URL | `http://localhost:3001/api/v1/integrations/github/callback` |

8. Register the app.
9. Copy the Client ID.
10. Generate and copy the Client Secret.

### Map GitHub Values to CodeAtlas

```env
GITHUB_CLIENT_ID=your-github-oauth-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-client-secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/v1/integrations/github/callback
```

Production callback example:

```env
GITHUB_CALLBACK_URL=https://api.codeatlas.example.com/api/v1/integrations/github/callback
```

GitHub OAuth Apps support one callback URL. Use separate OAuth apps for local, staging, and production when URLs differ.

### GitHub Repository Access Notes

CodeAtlas lists repositories through the GitHub API and materializes selected repositories by cloning over HTTPS with the encrypted OAuth access token. The current OAuth scope set includes `repo`, which grants access to public and private repositories the user can access. Only grant this to trusted deployments.

## 9. Bitbucket OAuth Setup

Bitbucket OAuth is used to connect repository sources. It is not used for login.

The backend requests these Bitbucket scopes:

```text
account repository
```

Official setup reference: https://developer.atlassian.com/cloud/bitbucket/modules/oauth-consumer/

### Create a Bitbucket OAuth Consumer

Provider UI names can vary by workspace. As of June 2026, expect this under workspace settings.

1. Open https://bitbucket.org/.
2. Select the workspace that owns the repositories.
3. Open **Workspace settings**.
4. Open **OAuth consumers**.
5. Click **Add consumer**.
6. Fill in:

| Field        | Local development value                                        |
| ------------ | -------------------------------------------------------------- |
| Name         | `CodeAtlas Local`                                              |
| Description  | Optional                                                       |
| Callback URL | `http://localhost:3001/api/v1/integrations/bitbucket/callback` |
| URL          | `http://localhost:3000`                                        |

7. Enable OAuth permissions:
   - Account: read.
   - Repositories: read.
8. Save the consumer.
9. Copy the Key as `BITBUCKET_CLIENT_ID`.
10. Copy the Secret as `BITBUCKET_CLIENT_SECRET`.

### Map Bitbucket Values to CodeAtlas

```env
BITBUCKET_CLIENT_ID=your-bitbucket-consumer-key
BITBUCKET_CLIENT_SECRET=your-bitbucket-consumer-secret
BITBUCKET_CALLBACK_URL=http://localhost:3001/api/v1/integrations/bitbucket/callback
```

Production callback example:

```env
BITBUCKET_CALLBACK_URL=https://api.codeatlas.example.com/api/v1/integrations/bitbucket/callback
```

## 10. OpenRouter AI Setup

OpenRouter powers the AI assistant. The scanner remains the source of truth; the AI provider only receives selected stored platform intelligence.

Official references:

- https://openrouter.ai/docs/api/reference/overview/
- https://openrouter.ai/docs/guides/overview/models

### Create an API Key

1. Open https://openrouter.ai/.
2. Create an account or sign in.
3. Open account settings or the keys page.
4. Create an API key.
5. Copy it into `OPENROUTER_API_KEY`.

### Select a Model

OpenRouter model IDs change over time. Use the model catalog in OpenRouter and copy the model identifier into `OPENROUTER_MODEL`.

The current `.env.example` uses:

```env
OPENROUTER_MODEL=openai/gpt-5.2
```

Configure:

```env
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=openai/gpt-5.2
AI_MAX_CONTEXT_TOKENS=12000
AI_PROVIDER_TIMEOUT_MS=30000
AI_RATE_LIMIT_PER_MINUTE=20
```

Notes:

- Free models may have stricter limits, lower availability, or provider-specific data policies.
- Paid models require OpenRouter credits or billing.
- `AI_MAX_CONTEXT_TOKENS` controls how much stored repository intelligence CodeAtlas prepares for the model.
- `AI_PROVIDER_TIMEOUT_MS` controls how long CodeAtlas waits for OpenRouter before returning an error.
- `AI_RATE_LIMIT_PER_MINUTE` is enforced through Redis per user.

## 11. Encryption Keys

CodeAtlas encrypts GitHub and Bitbucket OAuth tokens before storing them.

Required variable:

```env
OAUTH_ENCRYPTION_KEY=replace-with-32-character-oauth-key
```

The implementation requires a string of at least 32 characters. Generate a strong key:

```bash
openssl rand -base64 32
```

Use one stable value per environment. If you rotate this key without a token migration plan, existing encrypted provider credentials may become unreadable and users will need to reconnect providers.

## 12. Scanner Configuration

The scanner materializes repositories into isolated local paths, discovers files, extracts code intelligence, discovers APIs, generates documentation, and stores snapshots.

| Variable                       | Default                            | Purpose                                                      |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------ |
| `REPOSITORY_STORAGE_PATH`      | `storage/repositories`             | Persistent storage path for uploaded ZIP repository sources. |
| `MAX_ZIP_UPLOAD_BYTES`         | `52428800`                         | Maximum uploaded ZIP size in bytes, default 50 MiB.          |
| `SCANNER_WORKSPACE_PATH`       | `storage/scanner-workspaces`       | Temporary scanner workspace root.                            |
| `SCANNER_MATERIALIZATION_PATH` | `storage/scanner-materializations` | Temporary source materialization root for Git clones.        |
| `SCANNER_GIT_CLONE_TIMEOUT_MS` | `120000`                           | Git clone timeout, default 2 minutes.                        |
| `SCANNER_MAX_FILES`            | `10000`                            | Maximum number of supported source files to process.         |
| `SCANNER_MAX_FILE_BYTES`       | `1048576`                          | Maximum individual source file size, default 1 MiB.          |
| `SCANNER_MAX_WORKSPACE_BYTES`  | `262144000`                        | Maximum workspace size, default 250 MiB.                     |

The scanner ignores directories such as `.git`, `.next`, `build`, `coverage`, `dist`, and `node_modules`. It supports `.js`, `.jsx`, `.ts`, and `.tsx` files in the current implementation.

Large repository guidance:

- Increase limits only when the host has enough CPU, memory, and disk.
- Keep `SCANNER_MAX_FILE_BYTES` bounded to avoid parsing generated bundles or very large files.
- Keep scanner paths on fast local disk when possible.
- Do not point scanner paths to shared directories used by other processes.

## 13. BullMQ and Worker Configuration

BullMQ uses Redis for repository scan jobs and progress state.

| Variable                    | Default  | Purpose                                                |
| --------------------------- | -------- | ------------------------------------------------------ |
| `SCAN_JOB_ATTEMPTS`         | `3`      | Number of BullMQ attempts for a scan job.              |
| `SCAN_JOB_TIMEOUT_MS`       | `300000` | Maximum job runtime before timeout, default 5 minutes. |
| `SCAN_PROGRESS_TTL_SECONDS` | `604800` | Redis TTL for scan progress snapshots, default 7 days. |

Operational notes:

- A timed-out or cancelled scan should stop cooperative scanner work.
- Progress records are temporary Redis state; durable scan history is stored in PostgreSQL.
- Use a dedicated Redis instance or logical database for production CodeAtlas deployments.

## 14. Swagger Configuration

Swagger is controlled by `SWAGGER_ENABLED`.

| Value   | Behavior                                                             |
| ------- | -------------------------------------------------------------------- |
| unset   | Enabled when `NODE_ENV` is not `production`; disabled in production. |
| `true`  | Enables `/docs`.                                                     |
| `false` | Disables `/docs`.                                                    |

Local development:

```env
SWAGGER_ENABLED=true
```

Production recommendation:

```env
SWAGGER_ENABLED=false
```

If Swagger is exposed in production, protect it at the network or ingress layer.

## 15. Complete Backend `.env` Example

Use this as a fully commented template. Replace placeholders before production.

```env
# Runtime
NODE_ENV=development
PORT=3001

# Services
DATABASE_URL=postgresql://codeatlas:codeatlas_local@localhost:5432/codeatlas
REDIS_URL=redis://localhost:6379

# Browser origin allowed by backend CORS and used for OAuth success redirects.
FRONTEND_ORIGIN=http://localhost:3000

# JWT secrets. Generate two different values with: openssl rand -base64 48
JWT_ACCESS_SECRET=replace-with-generated-access-secret-at-least-32-chars
JWT_REFRESH_SECRET=replace-with-generated-refresh-secret-at-least-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth login.
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# GitHub repository connection OAuth. Leave blank only if GitHub connection is disabled.
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3001/api/v1/integrations/github/callback

# Bitbucket repository connection OAuth. Leave blank only if Bitbucket connection is disabled.
BITBUCKET_CLIENT_ID=
BITBUCKET_CLIENT_SECRET=
BITBUCKET_CALLBACK_URL=http://localhost:3001/api/v1/integrations/bitbucket/callback

# OAuth provider request timeout.
OAUTH_PROVIDER_TIMEOUT_MS=15000

# Encrypts stored GitHub and Bitbucket tokens. Generate with: openssl rand -base64 32
OAUTH_ENCRYPTION_KEY=replace-with-generated-oauth-encryption-key-at-least-32-chars

# ZIP repository storage.
REPOSITORY_STORAGE_PATH=storage/repositories
MAX_ZIP_UPLOAD_BYTES=52428800

# Scanner workspaces and Git materialization.
SCANNER_WORKSPACE_PATH=storage/scanner-workspaces
SCANNER_MATERIALIZATION_PATH=storage/scanner-materializations
SCANNER_GIT_CLONE_TIMEOUT_MS=120000
SCANNER_MAX_FILES=10000
SCANNER_MAX_FILE_BYTES=1048576
SCANNER_MAX_WORKSPACE_BYTES=262144000

# BullMQ scan job behavior.
SCAN_JOB_ATTEMPTS=3
SCAN_JOB_TIMEOUT_MS=300000
SCAN_PROGRESS_TTL_SECONDS=604800

# OpenRouter AI assistant.
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-5.2
AI_MAX_CONTEXT_TOKENS=12000
AI_PROVIDER_TIMEOUT_MS=30000
AI_RATE_LIMIT_PER_MINUTE=20

# Swagger docs.
SWAGGER_ENABLED=true
```

## 16. Environment Validation Errors

| Error or symptom                                               | Likely cause                                                                                            | Fix                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment configuration` on startup                 | Required variable missing or invalid.                                                                   | Compare `.env` with `.env.example`; check `DATABASE_URL`, `REDIS_URL`, JWT secrets, Google values, callback URLs, and encryption key. |
| `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` validation failure | Secret is shorter than 32 characters.                                                                   | Generate with `openssl rand -base64 48`.                                                                                              |
| Production startup rejects placeholder values                  | Production validation blocks values containing `replace-with`.                                          | Replace every production secret with a generated value or provider credential.                                                        |
| Google `redirect_uri_mismatch`                                 | `GOOGLE_CALLBACK_URL` does not exactly match Google Cloud authorized redirect URI.                      | Update Google OAuth client or `.env`; restart backend.                                                                                |
| Google login returns state/cookie error                        | Browser did not return OAuth state cookie, state expired, or frontend/backend origins are inconsistent. | Confirm `FRONTEND_ORIGIN`, backend URL, callback URL, and cookie support. Retry within 10 minutes.                                    |
| GitHub connect says provider is not configured                 | Missing `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, or callback URL mismatch.                           | Create a GitHub OAuth App and set all GitHub variables.                                                                               |
| Bitbucket connect says provider is not configured              | Missing `BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET`, or callback URL mismatch.                     | Create a Bitbucket OAuth consumer and set all Bitbucket variables.                                                                    |
| AI assistant says OpenRouter is not configured                 | `OPENROUTER_API_KEY` is empty.                                                                          | Create an OpenRouter key and set `OPENROUTER_API_KEY`.                                                                                |
| AI provider request timed out                                  | OpenRouter or selected model did not respond within `AI_PROVIDER_TIMEOUT_MS`.                           | Retry, increase timeout cautiously, or select a faster model.                                                                         |
| Scanner fails on large repository                              | File count, file size, workspace size, or clone timeout limit exceeded.                                 | Increase scanner limits only if host capacity supports it, or scan a smaller repository.                                              |
| ZIP upload rejected                                            | File is not `.zip`, MIME type is unsupported, file is empty, or size exceeds `MAX_ZIP_UPLOAD_BYTES`.    | Upload a valid ZIP within the configured size.                                                                                        |
| Redis connection error                                         | `REDIS_URL` is wrong or Redis is not running.                                                           | Start Redis and verify the URL.                                                                                                       |
| Prisma cannot connect                                          | `DATABASE_URL` is wrong or PostgreSQL is not reachable.                                                 | Start PostgreSQL, check credentials, then rerun Prisma commands.                                                                      |

## 17. Production Deployment Notes

Before production deployment:

- Set `NODE_ENV=production`.
- Use HTTPS for frontend and backend.
- Set `FRONTEND_ORIGIN` to the exact deployed frontend origin.
- Use production OAuth callback URLs in Google, GitHub, and Bitbucket.
- Generate unique JWT and encryption secrets per environment.
- Use managed PostgreSQL with backups and migration deployment.
- Use managed Redis or a reliable Redis deployment with persistence expectations documented.
- Set `SWAGGER_ENABLED=false` unless the docs route is protected by network policy.
- Keep `OPENROUTER_API_KEY` in the backend runtime only. Never expose it to the frontend.
- Use separate provider apps/clients for local, staging, and production.
- Rotate secrets through your deployment platform, not by committing `.env`.
- Ensure the scanner storage paths have enough disk and are not publicly served.

Production startup order:

```bash
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run build
npm run start
```

For Docker Compose, the `codeatlas-backend-migrations` service runs `npm run prisma:deploy` before the backend service starts.

## Environment Variable Coverage

The backend currently supports these environment variables:

```text
NODE_ENV
PORT
DATABASE_URL
REDIS_URL
FRONTEND_ORIGIN
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_CALLBACK_URL
BITBUCKET_CLIENT_ID
BITBUCKET_CLIENT_SECRET
BITBUCKET_CALLBACK_URL
OAUTH_PROVIDER_TIMEOUT_MS
OAUTH_ENCRYPTION_KEY
REPOSITORY_STORAGE_PATH
MAX_ZIP_UPLOAD_BYTES
SCANNER_WORKSPACE_PATH
SCANNER_MATERIALIZATION_PATH
SCANNER_GIT_CLONE_TIMEOUT_MS
SCAN_JOB_ATTEMPTS
SCAN_JOB_TIMEOUT_MS
SCAN_PROGRESS_TTL_SECONDS
SCANNER_MAX_FILES
SCANNER_MAX_FILE_BYTES
SCANNER_MAX_WORKSPACE_BYTES
OPENROUTER_API_KEY
OPENROUTER_MODEL
AI_MAX_CONTEXT_TOKENS
AI_PROVIDER_TIMEOUT_MS
AI_RATE_LIMIT_PER_MINUTE
SWAGGER_ENABLED
```
