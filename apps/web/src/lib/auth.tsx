import type { LoginInput, PublicUser, RegisterInput } from '@bozochat/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from './api';

const ME_KEY = ['auth', 'me'];

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<PublicUser>('/auth/me');
      } catch (e) {
        if (e instanceof ApiRequestError && e.statusCode === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<PublicUser>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<PublicUser>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.setQueryData(ME_KEY, null),
  });
}
