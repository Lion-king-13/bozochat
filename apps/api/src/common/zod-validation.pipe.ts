import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valide le body avec un schéma Zod partagé et renvoie des erreurs par champ lisibles. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fieldErrors[key] ??= issue.message;
    }
    throw new BadRequestException({
      message: 'Certains champs sont invalides.',
      fieldErrors,
    });
  }
}
