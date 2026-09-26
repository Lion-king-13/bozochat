import type { MessageDto } from '@bozochat/shared';
import { Fragment, useEffect, useRef, type UIEvent } from 'react';
import { errorMessage, useMessages } from '../../lib/conversations';
import { formatDayLabel, isSameDay } from '../../lib/format';
import { MessageBubble } from './MessageBubble';

type Props = { conversationId: string; meId: string };

/** En dessous de cette distance du bas, on considère que l'utilisateur suit le direct. */
const PINNED_THRESHOLD_PX = 120;

export function MessageList({ conversationId, meId }: Props) {
  const messages = useMessages(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Vrai tant que l'utilisateur est en bas du fil : on ne lui vole pas le défilement
  // quand il remonte lire l'historique.
  const pinned = useRef(true);

  const items: MessageDto[] = messages.data?.pages.flatMap((page) => page.items) ?? [];
  const newestId = items[0]?.id;

  // Dépend du dernier message : charger des messages plus anciens ne déplace donc pas la vue.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !newestId || !pinned.current) return;
    el.scrollTop = el.scrollHeight;
  }, [newestId]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_THRESHOLD_PX;
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
      {messages.isPending && <p className="text-sm text-stone-500">Chargement des messages…</p>}

      {messages.isError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(messages.error)}
        </p>
      )}

      {/* Hors du conteneur `flex-col-reverse` : le bouton garde sa place au-dessus du fil. */}
      {messages.hasNextPage && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={() => void messages.fetchNextPage()}
            disabled={messages.isFetchingNextPage}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60"
          >
            {messages.isFetchingNextPage ? 'Chargement…' : 'Charger les messages plus anciens'}
          </button>
        </div>
      )}

      {messages.isSuccess && items.length === 0 && (
        <p className="text-sm text-stone-500">Aucun message pour l’instant. Écrivez le premier !</p>
      )}

      {/* L'API renvoie du plus récent au plus ancien : `flex-col-reverse` remet le récent en bas. */}
      <ol className="flex flex-col-reverse gap-1">
        {items.map((message, index) => {
          const older = items[index + 1];
          const newDay = !older || !isSameDay(older.createdAt, message.createdAt);
          const showAuthor = newDay || older?.author?.id !== message.author?.id;
          return (
            <Fragment key={message.id}>
              <MessageBubble
                message={message}
                mine={message.author?.id === meId}
                showAuthor={showAuthor}
              />
              {/* Le séparateur suit la bulle dans le DOM, donc s'affiche au-dessus d'elle. */}
              {newDay && (
                <li className="my-2 text-center text-xs text-stone-500">
                  {formatDayLabel(message.createdAt)}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
