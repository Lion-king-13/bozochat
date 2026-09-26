import type { ConversationListItemDto } from '@bozochat/shared';
import { NavLink } from 'react-router';
import { conversationTitle } from '../../lib/conversations';
import { formatListTimestamp } from '../../lib/format';

type Props = { conversation: ConversationListItemDto; meId: string };

export function ConversationListItem({ conversation, meId }: Props) {
  const title = conversationTitle(conversation, meId);
  const others = conversation.participants.filter((p) => p.id !== meId);
  const subtitle =
    conversation.type === 'GROUP'
      ? others.map((p) => p.displayName).join(', ') || 'Vous seul'
      : 'Conversation directe';

  return (
    <NavLink
      to={`/app/c/${conversation.id}`}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 ${isActive ? 'bg-stone-100' : 'hover:bg-stone-50'}`
      }
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{title}</span>
        <time dateTime={conversation.lastMessageAt} className="shrink-0 text-xs text-stone-500">
          {formatListTimestamp(conversation.lastMessageAt)}
        </time>
      </span>
      <span className="mt-0.5 block truncate text-xs text-stone-500">{subtitle}</span>
    </NavLink>
  );
}
