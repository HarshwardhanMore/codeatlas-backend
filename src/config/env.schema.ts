import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().min(2).default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().min(2).default('30d'),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.string().url(),
    GITHUB_CLIENT_ID: z.string().default(''),
    GITHUB_CLIENT_SECRET: z.string().default(''),
    GITHUB_CALLBACK_URL: z.string().url(),
    BITBUCKET_CLIENT_ID: z.string().default(''),
    BITBUCKET_CLIENT_SECRET: z.string().default(''),
    BITBUCKET_CALLBACK_URL: z.string().url(),
    OAUTH_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    OAUTH_ENCRYPTION_KEY: z.string().min(32),
    REPOSITORY_STORAGE_PATH: z.string().min(1).default('storage/repositories'),
    MAX_ZIP_UPLOAD_BYTES: z.coerce.number().int().positive().default(52428800),
    SCANNER_WORKSPACE_PATH: z.string().min(1).default('storage/scanner-workspaces'),
    SCAN_JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
    SCAN_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
    SCAN_PROGRESS_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    SCANNER_GIT_CLONE_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    SCANNER_MATERIALIZATION_PATH: z.string().min(1).default('storage/scanner-materializations'),
    SCANNER_MAX_FILES: z.coerce.number().int().positive().default(10000),
    SCANNER_MAX_FILE_BYTES: z.coerce.number().int().positive().default(1048576),
    SCANNER_MAX_WORKSPACE_BYTES: z.coerce.number().int().positive().default(262144000),
    OPENROUTER_API_KEY: z.string().default(''),
    OPENROUTER_MODEL: z.string().min(1).default('openai/gpt-5.2'),
    AI_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(12000),
    AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }

    for (const key of [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OAUTH_ENCRYPTION_KEY',
    ] as const) {
      if (isPlaceholderSecret(env[key])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} must be replaced before running in production.`,
          path: [key],
        });
      }
    }

    for (const key of [
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'BITBUCKET_CLIENT_ID',
      'BITBUCKET_CLIENT_SECRET',
      'OPENROUTER_API_KEY',
    ] as const) {
      if (env[key] && isPlaceholderSecret(env[key])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} cannot use a placeholder value in production.`,
          path: [key],
        });
      }
    }
  });

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = environmentSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  return parsed.data;
}

function isPlaceholderSecret(value: string): boolean {
  return value.toLowerCase().includes('replace-with');
}
