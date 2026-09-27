import type {
  ChangeEmailInput,
  ChangePasswordInput,
  PublicUser,
  UpdateProfileInput,
} from '@bozochat/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ME_KEY } from './auth';

/**
 * Mutations du compte connecté. Chaque réponse est écrite dans le cache `me` :
 * l'en-tête et le reste de l'application se mettent à jour sans rechargement.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api<PublicUser>('/users/me', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useChangeEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeEmailInput) =>
      api<PublicUser>('/users/me/email', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

/** Le serveur répond 204 et conserve la session : rien à mettre à jour dans le cache. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api<void>('/users/me/password', { method: 'PATCH', body: JSON.stringify(input) }),
  });
}
