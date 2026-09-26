import type { MessageAuthor, MessageDto } from '@bozochat/shared';
import { formatTime, initials } from '../../lib/format';

/** Avatar : l'image si elle existe, sinon les initiales — `avatarUrl` est le plus souvent nul. */
function Avatar({ author }: { author: MessageAuthor | null }) {
  if (author?.avatarUrl) {
    return (
      <img src={author.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600"
    >
      {author ? initials(author.displayName) : '?'}
    </span>
  );
}

type Props = { message: MessageDto; mine: boolean; showAuthor: boolean };

/** Le contenu est rendu comme du texte : aucun HTML issu d'un message n'est interprété. */
export function MessageBubble({ message, mine, showAuthor }: Props) {
  const authorName = message.author?.displayName ?? 'Utilisateur supprimé';
  // Un message supprimé reste neutre, même s'il vient de l'utilisateur courant.
  const bubble =
    message.deleted || !mine ? 'border border-stone-200 bg-white' : 'bg-ink text-white';

  return (
    <li className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      {showAuthor ? (
        <Avatar author={message.author} />
      ) : (
        <span className="h-8 w-8 shrink-0" aria-hidden="true" />
      )}
      <div className={`flex min-w-0 max-w-lg flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showAuthor && (
          <span className="px-1 text-xs font-medium text-stone-500">{authorName}</span>
        )}
        <div className={`mt-0.5 rounded-2xl px-3 py-2 ${bubble}`}>
          {message.deleted ? (
            <p className="text-sm italic text-stone-500">Message supprimé</p>
          ) : (
            <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
          )}
          <p
            className={`mt-1 text-xs ${mine ? 'text-right' : ''} ${
              mine && !message.deleted ? 'text-stone-400' : 'text-stone-500'
            }`}
          >
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {message.editedAt && <span> · modifié</span>}
          </p>
        </div>
      </div>
    </li>
  );
}
