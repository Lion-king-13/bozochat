import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ApiError } from '@bozochat/shared';
import type { ZodError, ZodType } from 'zod';

/** Une erreur par champ, le premier problème rencontré faisant foi. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * Traduit une erreur Zod en erreur d'API. Utilisable hors du pipe (ex. gateway WebSocket),
 * où le filtre d'exceptions global ne passe pas.
 */
export function zodToApiError(error: ZodError): ApiError {
  const fieldErrors = zodFieldErrors(error);
  // Valeur scalaire (paramètre d'URL, payload non-objet) : son message est directement lisible.
  const scalar = Object.keys(fieldErrors).length === 1 ? fieldErrors._ : undefined;
  return {
    statusCode: 400,
    message: scalar ?? 'Certains champs sont invalides.',
    fieldErrors: scalar ? undefined : fieldErrors,
  };
}

/** Valide le body avec un schéma Zod partagé et renvoie des erreurs par champ lisibles. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const { message, fieldErrors } = zodToApiError(result.error);
    throw new BadRequestException({ message, fieldErrors });
  }
}
