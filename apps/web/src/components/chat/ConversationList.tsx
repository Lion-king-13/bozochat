import { errorMessage, useConversations } from '../../lib/conversations';
import { ConversationListItem } from './ConversationListItem';

/** `hiddenOnMobile` : quand une conversation est ouverte, le petit écran affiche le fil seul. */
type Props = { meId: string; hiddenOnMobile: boolean };

export function ConversationList({ meId, hiddenOnMobile }: Props) {
  const conversations = useConversations();

  return (
    <aside
      className={`${hiddenOnMobile ? 'hidden' : 'flex'} w-full shrink-0 flex-col border-r border-stone-200 bg-white sm:flex sm:w-72`}
    >
      <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700">
        Conversations
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.isPending && <p className="p-2 text-sm text-stone-500">Chargement…</p>}

        {conversations.isError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(conversations.error)}
          </p>
        )}

        {conversations.isSuccess && conversations.data.length === 0 && (
          <p className="p-2 text-sm text-stone-500">Aucune conversation pour le moment.</p>
        )}

        <nav className="space-y-1">
          {conversations.data?.map((conversation) => (
            <ConversationListItem key={conversation.id} conversation={conversation} meId={meId} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
