import type {
  ConversationListItemDto,
  CreateDirectConversationInput,
  CreateGroupConversationInput,
  CreateMessageInput,
  MessageDto,
  MessagePageDto,
  ParticipantRole,
  WorkspaceRole,
} from '@bozochat/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { api, ApiRequestError } from './api';

export const conversationsKey = ['conversations'] as const;
/** Préfixe commun : invalide l'historique de toutes les conversations d'un coup. */
export const allMessagesKey = ['messages'] as const;
export const messagesKey = (conversationId: string) => [...allMessagesKey, conversationId] as const;

/** Le curseur est opaque : jamais construit ni analysé côté client, seulement renvoyé tel quel. */
type MessagesCache = InfiniteData<MessagePageDto, string | null>;

/** Message affichable pour l'utilisateur — jamais une trace technique. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Une erreur inattendue est survenue.';
}

/** Titre affiché : le nom du groupe, ou les autres participants pour une conversation DIRECT. */
export function conversationTitle(conversation: ConversationListItemDto, meId: string): string {
  if (conversation.name) return conversation.name;
  const others = conversation.participants.filter((p) => p.id !== meId);
  if (others.length === 0) return 'Conversation';
  return others.map((p) => p.displayName).join(', ');
}

/**
 * Total pour le badge global. La conversation affichée ne compte pas : elle est en cours de
 * lecture, même si la liste reçue précède de quelques millisecondes le marquage côté serveur.
 */
export function totalUnread(
  conversations: ConversationListItemDto[] | undefined,
  activeConversationId: string | undefined,
): number {
  return (conversations ?? []).reduce(
    (total, c) => (c.id === activeConversationId ? total : total + c.unreadCount),
    0,
  );
}

/** Texte compact d'un badge : le détail exact reste dans `unreadLabel`. */
export function formatUnreadCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function unreadLabel(count: number): string {
  return count === 1 ? '1 message non lu' : `${count} messages non lus`;
}

/** Remet à zéro le compteur d'une conversation dans la liste, sans toucher aux autres. */
export function clearUnread(
  conversations: ConversationListItemDto[] | undefined,
  conversationId: string,
): ConversationListItemDto[] | undefined {
  return conversations?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c));
}

/**
 * Unique point d'entrée pour faire entrer un message dans le cache, dédupliqué sur `message.id`.
 *
 * Indispensable car le même message arrive par plusieurs canaux :
 * l'ack de `message:send`, la réponse de `POST /messages`, et `message:new` que le serveur
 * diffuse à toute la room — émetteur compris. Sans cette déduplication il apparaîtrait deux fois
 * (et davantage avec plusieurs onglets ou après une reconnexion Socket.IO).
 */
export function upsertMessageInCache(qc: QueryClient, message: MessageDto): void {
  qc.setQueryData<MessagesCache>(messagesKey(message.conversationId), (cache) => {
    // Pas d'historique en cache : rien à insérer, le prochain chargement contiendra le message.
    if (!cache) return cache;

    const pageIndex = cache.pages.findIndex((page) =>
      page.items.some((item) => item.id === message.id),
    );
    if (pageIndex !== -1) {
      // Déjà présent : on remplace la version connue au lieu d'ajouter un doublon.
      return {
        ...cache,
        pages: cache.pages.map((page, index) =>
          index === pageIndex
            ? {
                ...page,
                items: page.items.map((item) => (item.id === message.id ? message : item)),
              }
            : page,
        ),
      };
    }

    const [newest, ...older] = cache.pages;
    if (!newest) return cache;
    // La première page contient les messages les plus récents : le nouveau se place en tête.
    return { ...cache, pages: [{ ...newest, items: [message, ...newest.items] }, ...older] };
  });
}

/** Les conversations de l'utilisateur, les plus actives en premier (ordre donné par l'API). */
export function useConversations() {
  return useQuery({
    queryKey: conversationsKey,
    queryFn: () => api<ConversationListItemDto[]>('/conversations'),
  });
}

/** Historique paginé par curseur ; chaque page va du plus récent au plus ancien. */
export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: messagesKey(conversationId ?? ''),
    enabled: Boolean(conversationId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const query = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : '';
      return api<MessagePageDto>(`/conversations/${conversationId ?? ''}/messages${query}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/**
 * Marque une conversation comme lue. Le compteur passe à zéro immédiatement ; la relecture finale
 * (succès comme échec) laisse le dernier mot à la base, seule source de vérité des non-lus.
 */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api<void>(`/conversations/${conversationId}/read`, { method: 'POST' }),
    onMutate: (conversationId) => {
      qc.setQueryData<ConversationListItemDto[]>(conversationsKey, (list) =>
        clearUnread(list, conversationId),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey }),
  });
}

/** Envoi par REST — utilisé quand le socket n'est pas disponible. */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api<MessageDto>(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content } satisfies CreateMessageInput),
      }),
    onSuccess: (message) => {
      upsertMessageInCache(qc, message);
      void qc.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

// ---------------------------------------------------------------- Création et groupes

export const PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string> = {
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
};

/**
 * Miroir de la règle serveur (conversation-permissions.ts), pour n'afficher que les actions
 * possibles : admin du groupe, ou admin/owner du workspace. Le serveur reste seul juge.
 */
export function canManageGroup(
  conversation: ConversationListItemDto,
  meId: string,
  workspaceRole: WorkspaceRole | undefined,
): boolean {
  if (conversation.type !== 'GROUP') return false;
  const me = conversation.participants.find((p) => p.id === meId);
  return me?.role === 'ADMIN' || workspaceRole === 'ADMIN' || workspaceRole === 'OWNER';
}

/** Après chaque changement : la liste (noms, participants, rôles) est relue depuis l'API. */
function useConversationMutation<TInput, TResult = void>(
  request: (input: TInput) => Promise<TResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => qc.invalidateQueries({ queryKey: conversationsKey }),
  });
}

/** Ouvre la conversation 1:1 avec un membre, ou renvoie celle qui existe déjà. */
export function useOpenDirect() {
  return useConversationMutation((input: CreateDirectConversationInput) =>
    api<ConversationListItemDto>('/conversations/direct', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export function useCreateGroup() {
  return useConversationMutation((input: CreateGroupConversationInput) =>
    api<ConversationListItemDto>('/conversations/group', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export function useRenameConversation(conversationId: string) {
  return useConversationMutation((name: string) =>
    api<void>(`/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  );
}

export function useAddParticipants(conversationId: string) {
  return useConversationMutation((userIds: string[]) =>
    api<void>(`/conversations/${conversationId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    }),
  );
}

/** Retirer quelqu'un, ou quitter le groupe avec son propre id. */
export function useRemoveParticipant(conversationId: string) {
  return useConversationMutation((userId: string) =>
    api<void>(`/conversations/${conversationId}/participants/${userId}`, { method: 'DELETE' }),
  );
}

export function useChangeParticipantRole(conversationId: string) {
  return useConversationMutation(({ userId, role }: { userId: string; role: ParticipantRole }) =>
    api<void>(`/conversations/${conversationId}/participants/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  );
}
