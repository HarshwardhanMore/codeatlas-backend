import { validateEnvironment, type EnvironmentVariables } from './env.schema';

export interface AppConfiguration {
  app: {
    environment: EnvironmentVariables['NODE_ENV'];
    port: number;
    frontendOrigin: string;
    swaggerEnabled: boolean;
  };
  services: {
    databaseUrl: string;
    redisUrl: string;
  };
  security: {
    jwtAccessSecret: string;
    jwtRefreshSecret: string;
    jwtAccessExpiresIn: string;
    jwtRefreshExpiresIn: string;
  };
  oauth: {
    google: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    github: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    bitbucket: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    providerRequestTimeoutMs: number;
  };
  ai: {
    maxContextTokens: number;
    openRouterApiKey: string;
    openRouterModel: string;
    providerTimeoutMs: number;
    rateLimitPerMinute: number;
  };
  repositories: {
    maxZipUploadBytes: number;
    storagePath: string;
  };
  encryption: {
    oauthEncryptionKey: string;
  };
  scanner: {
    gitCloneTimeoutMs: number;
    jobAttempts: number;
    jobTimeoutMs: number;
    materializationPath: string;
    maxFileBytes: number;
    maxFiles: number;
    maxWorkspaceBytes: number;
    progressTtlSeconds: number;
    workspacePath: string;
  };
}

export const configuration = (): AppConfiguration => {
  const env = validateEnvironment(process.env);

  return {
    app: {
      environment: env.NODE_ENV,
      port: env.PORT,
      frontendOrigin: env.FRONTEND_ORIGIN,
      swaggerEnabled: env.SWAGGER_ENABLED
        ? env.SWAGGER_ENABLED === 'true'
        : env.NODE_ENV !== 'production',
    },
    services: {
      databaseUrl: env.DATABASE_URL,
      redisUrl: env.REDIS_URL,
    },
    security: {
      jwtAccessSecret: env.JWT_ACCESS_SECRET,
      jwtRefreshSecret: env.JWT_REFRESH_SECRET,
      jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
    oauth: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackUrl: env.GOOGLE_CALLBACK_URL,
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackUrl: env.GITHUB_CALLBACK_URL,
      },
      bitbucket: {
        clientId: env.BITBUCKET_CLIENT_ID,
        clientSecret: env.BITBUCKET_CLIENT_SECRET,
        callbackUrl: env.BITBUCKET_CALLBACK_URL,
      },
      providerRequestTimeoutMs: env.OAUTH_PROVIDER_TIMEOUT_MS,
    },
    ai: {
      maxContextTokens: env.AI_MAX_CONTEXT_TOKENS,
      openRouterApiKey: env.OPENROUTER_API_KEY,
      openRouterModel: env.OPENROUTER_MODEL,
      providerTimeoutMs: env.AI_PROVIDER_TIMEOUT_MS,
      rateLimitPerMinute: env.AI_RATE_LIMIT_PER_MINUTE,
    },
    repositories: {
      maxZipUploadBytes: env.MAX_ZIP_UPLOAD_BYTES,
      storagePath: env.REPOSITORY_STORAGE_PATH,
    },
    encryption: {
      oauthEncryptionKey: env.OAUTH_ENCRYPTION_KEY,
    },
    scanner: {
      gitCloneTimeoutMs: env.SCANNER_GIT_CLONE_TIMEOUT_MS,
      jobAttempts: env.SCAN_JOB_ATTEMPTS,
      jobTimeoutMs: env.SCAN_JOB_TIMEOUT_MS,
      materializationPath: env.SCANNER_MATERIALIZATION_PATH,
      maxFileBytes: env.SCANNER_MAX_FILE_BYTES,
      maxFiles: env.SCANNER_MAX_FILES,
      maxWorkspaceBytes: env.SCANNER_MAX_WORKSPACE_BYTES,
      progressTtlSeconds: env.SCAN_PROGRESS_TTL_SECONDS,
      workspacePath: env.SCANNER_WORKSPACE_PATH,
    },
  };
};
