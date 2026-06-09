import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

const API_PREFIX = 'api';
const API_VERSION = '1';
const FALLBACK_PORT = 3001;

interface ExpressApplication {
  disable(setting: string): void;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? FALLBACK_PORT;
  const frontendOrigin = configService.getOrThrow<string>('app.frontendOrigin');
  const expressApp = app.getHttpAdapter().getInstance() as ExpressApplication;

  expressApp.disable('x-powered-by');
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: frontendOrigin,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (configService.getOrThrow<boolean>('app.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CodeAtlas API')
      .setDescription('Enterprise API intelligence platform foundation')
      .setVersion(API_VERSION)
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);
}

void bootstrap();
