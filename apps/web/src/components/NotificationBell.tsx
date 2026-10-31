import { Link } from 'react-router';
import {
  formatUnreadCount,
  totalUnread,
  unreadLabel,
  useConversations,
} from '../lib/conversations';

type Props = { activeConversationId: string | undefined };

/** Indicateur global des non-lus — pas un centre de notifications : il mène à la liste. */
export function NotificationBell({ activeConversationId }: Props) {
  const conversations = useConversations();
  const total = totalUnread(conversations.data, activeConversationId);

  return (
    <Link
      to="/app"
      aria-label={total > 0 ? unreadLabel(total) : 'Aucun message non lu'}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 hover:bg-stone-100"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 text-stone-700"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {total > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-brand-500 px-1 text-center text-[10px] leading-4 font-semibold text-ink"
        >
          {formatUnreadCount(total)}
        </span>
      )}
    </Link>
  );
}
