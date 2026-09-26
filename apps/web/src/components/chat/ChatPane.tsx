import { Link, useParams } from 'react-router';
import { conversationTitle, errorMessage, useConversations } from '../../lib/conversations';
import { useConversationRoom, type AppSocket } from '../../lib/socket';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

type Props = { meId: string; socket: AppSocket | null; connected: boolean };

export function ChatPane({ meId, socket, connected }: Props) {
  const { conversationId } = useParams<{ conversationId: string }>();
  const conversations = useConversations();
  // Abonnement à la room, rejoué automatiquement à chaque reconnexion.
  const roomError = useConversationRoom(socket, conversationId);

  const conversation = conversations.data?.find((c) => c.id === conversationId);
  const title = conversation ? conversationTitle(conversation, meId) : 'Conversation';
  const participants = conversation?.participants.map((p) => p.displayName).join(', ') ?? '';
  // La liste ne contient que les conversations accessibles : l'absence vaut 404 ou 403.
  const unavailable = conversations.isSuccess && !conversation;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link
          to="/app"
          aria-label="Retour aux conversations"
          className="rounded-lg border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100 sm:hidden"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{title}</h1>
          {participants && <p className="truncate text-xs text-stone-500">{participants}</p>}
        </div>
      </header>

      {conversations.isError && (
        <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(conversations.error)}
        </p>
      )}

      {roomError && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {roomError}
        </p>
      )}

      {unavailable || !conversationId ? (
        <p role="alert" className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Cette conversation est introuvable ou ne vous est pas accessible.
        </p>
      ) : (
        <>
          {/* `key` : changer de conversation repart d'un fil neuf, défilement compris. */}
          <MessageList key={conversationId} conversationId={conversationId} meId={meId} />
          <MessageComposer conversationId={conversationId} socket={socket} connected={connected} />
        </>
      )}
    </section>
  );
}
