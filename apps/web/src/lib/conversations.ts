import type {
  ConversationListItemDto,
  CreateMessageInput,
  MessageDto,
  MessagePageDto,
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
export const messagesKey = (conversationId: string) => ['messages', conversationId] as const;

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
