import type { ApiError } from '@bozochat/shared';

/** Erreur typée : le front affiche `message` et `fieldErrors`, jamais une trace technique. */
export class ApiRequestError extends Error implements ApiError {
  constructor(
    public statusCode: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiRequestError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as Partial<ApiError> | null;
    throw new ApiRequestError(
      res.status,
      err?.message ?? 'Une erreur inattendue est survenue.',
      err?.fieldErrors,
    );
  }
  return body as T;
}
