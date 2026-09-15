import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@bozochat/shared';
import type { Response } from 'express';

/**
 * Filtre global : toute erreur devient un JSON { statusCode, message, fieldErrors? }.
 * Les erreurs inattendues sont journalisées côté serveur mais jamais détaillées au client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    const body = toApiError(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(body.statusCode).json(body);
  }
}

export function toApiError(exception: unknown): ApiError {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const r = response as { message?: unknown; fieldErrors?: Record<string, string> };
      const message = Array.isArray(r.message) ? r.message.join(' ') : String(r.message ?? '');
      // Les messages techniques par défaut d'Express/Nest (« Cannot GET … ») ne sont pas montrés.
      const technical = statusCode === 404 && message.startsWith('Cannot ');
      return {
        statusCode,
        message: message && !technical ? message : defaultMessage(statusCode),
        fieldErrors: r.fieldErrors,
      };
    }
    return { statusCode, message: String(response) };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: defaultMessage(HttpStatus.INTERNAL_SERVER_ERROR),
  };
}

function defaultMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Vous devez être connecté.';
    case 403:
      return "Vous n'avez pas accès à cette ressource.";
    case 404:
      return 'Ressource introuvable.';
    case 429:
      return 'Trop de tentatives. Réessayez dans quelques instants.';
    default:
      return status >= 500
        ? 'Une erreur inattendue est survenue. Réessayez plus tard.'
        : 'Requête invalide.';
  }
}
