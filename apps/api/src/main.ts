import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { loadDotenv } from './config/dotenv';
import { loadEnv } from './config/env';
import { setupApp } from './setup-app';

async function bootstrap() {
  loadDotenv();
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app, env.APP_ORIGIN);

  // En production, le même service sert le build React (même origine = pas de CORS cross-site).
  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      const isSpaRoute =
        req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io');
      if (isSpaRoute) return res.sendFile(join(webDist, 'index.html'));
      next();
    });
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`BozoChat API démarrée sur le port ${env.PORT}`, 'Bootstrap');
}

void bootstrap();
