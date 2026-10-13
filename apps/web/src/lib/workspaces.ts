import type {
  AssignableRole,
  CreateInvitationInput,
  InvitationDto,
  ReceivedInvitationDto,
  UpdateWorkspaceInput,
  WorkspaceDto,
  WorkspaceMemberDto,
  WorkspaceRole,
} from '@bozochat/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { conversationsKey } from './conversations';

export const workspacesKey = ['workspaces'] as const;
export const workspaceKey = (id: string) => ['workspaces', id] as const;
const membersKey = (id: string) => ['workspaces', id, 'members'] as const;
const invitationsKey = (id: string) => ['workspaces', id, 'invitations'] as const;
export const receivedInvitationsKey = ['invitations'] as const;

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
};

const RANK: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Miroir de la règle serveur, pour n'afficher que les actions possibles.
 * Le serveur reste seul juge : un bouton affiché à tort serait refusé avec un 403.
 */
export function canManage(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return RANK[actor] > RANK[target];
}

export function useWorkspaces() {
  return useQuery({ queryKey: workspacesKey, queryFn: () => api<WorkspaceDto[]>('/workspaces') });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: workspaceKey(id),
    queryFn: () => api<WorkspaceDto>(`/workspaces/${id}`),
    retry: false,
  });
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: membersKey(id),
    queryFn: () => api<WorkspaceMemberDto[]>(`/workspaces/${id}/members`),
  });
}

/** Réservé aux admins : la requête n'est lancée que si `enabled`. */
export function useInvitations(id: string, enabled: boolean) {
  return useQuery({
    queryKey: invitationsKey(id),
    enabled,
    queryFn: () => api<InvitationDto[]>(`/workspaces/${id}/invitations`),
  });
}

export function useReceivedInvitations() {
  return useQuery({
    queryKey: receivedInvitationsKey,
    queryFn: () => api<ReceivedInvitationDto[]>('/invitations'),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<WorkspaceDto>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspacesKey }),
  });
}

export function useUpdateWorkspace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) =>
      api<WorkspaceDto>(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (workspace) => {
      qc.setQueryData(workspaceKey(id), workspace);
      void qc.invalidateQueries({ queryKey: workspacesKey, exact: true });
    },
  });
}

/** Supprimer le workspace ou le quitter : dans les deux cas, ses conversations disparaissent. */
function useLeaveEffects() {
  const qc = useQueryClient();
  return (id: string) => {
    qc.removeQueries({ queryKey: workspaceKey(id) });
    void qc.invalidateQueries({ queryKey: workspacesKey, exact: true });
    void qc.invalidateQueries({ queryKey: conversationsKey });
  };
}

export function useDeleteWorkspace(id: string) {
  const onLeft = useLeaveEffects();
  return useMutation({
    mutationFn: () => api<void>(`/workspaces/${id}`, { method: 'DELETE' }),
    onSuccess: () => onLeft(id),
  });
}

export function useUpdateMemberRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) =>
      api<WorkspaceMemberDto>(`/workspaces/${id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: membersKey(id) }),
  });
}

/** Retirer un membre, ou se retirer soi-même (`self`). */
export function useRemoveMember(id: string) {
  const qc = useQueryClient();
  const onLeft = useLeaveEffects();
  return useMutation({
    mutationFn: ({ userId }: { userId: string; self?: boolean }) =>
      api<void>(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: (_data, { self }) => {
      if (self) onLeft(id);
      else {
        void qc.invalidateQueries({ queryKey: membersKey(id) });
        void qc.invalidateQueries({ queryKey: workspaceKey(id), exact: true });
      }
    },
  });
}

export function useInvite(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      api<InvitationDto>(`/workspaces/${id}/invitations`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invitationsKey(id) }),
  });
}

export function useRevokeInvitation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api<void>(`/workspaces/${id}/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: invitationsKey(id) }),
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api<WorkspaceDto>(`/invitations/${invitationId}/accept`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: receivedInvitationsKey });
      void qc.invalidateQueries({ queryKey: workspacesKey, exact: true });
      void qc.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

export function useDeclineInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api<void>(`/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: receivedInvitationsKey }),
  });
}
