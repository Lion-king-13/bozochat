import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { ServerOptions } from 'socket.io';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

class RestrictedIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly origin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin, credentials: true },
    });
  }
}

/** Configuration commune à la prod et aux tests e2e. */
export function setupApp(app: NestExpressApplication, origin: string) {
  app.set('trust proxy', 1); // derrière le reverse proxy Traefik de Coolify (HTTPS)
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useWebSocketAdapter(new RestrictedIoAdapter(app, origin));
}
