import { Navigate, Route, Routes, useMatch } from 'react-router';
import { toast } from 'sonner';
import { ChatPane } from '../components/chat/ChatPane';
import { ConversationList } from '../components/chat/ConversationList';
import { EmptyState } from '../components/chat/EmptyState';
import { Logo } from '../components/Logo';
import { useLogout, useMe } from '../lib/auth';
import { useMessageStream, useSocket } from '../lib/socket';

/** Coquille de l'application connectée : en-tête, liste des conversations et fil de discussion. */
export function AppHome() {
  const me = useMe();
  const logout = useLogout();
  const { socket, connected } = useSocket(Boolean(me.data));
  // Écoute `message:new` pour toute la session, y compris sans conversation ouverte.
  useMessageStream(socket);
  // Sur mobile, la liste laisse la place au fil dès qu'une conversation est ouverte.
  const selection = useMatch('/app/c/:conversationId');

  if (me.isPending) return <p className="p-8 text-stone-500">Chargement…</p>;
  if (!me.data) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5" aria-live="polite">
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-stone-400'}`}
            />
            {connected ? 'En ligne' : 'Connexion…'}
          </span>
          <span className="hidden sm:inline">{me.data.displayName}</span>
          <button
            onClick={() =>
              logout.mutate(undefined, { onError: () => toast.error('La déconnexion a échoué.') })
            }
            className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
          >
            Déconnexion
          </button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1">
        <ConversationList meId={me.data.id} hiddenOnMobile={Boolean(selection)} />
        <Routes>
          <Route index element={<EmptyState />} />
          <Route
            path="c/:conversationId"
            element={<ChatPane meId={me.data.id} socket={socket} connected={connected} />}
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
    </div>
  );
}
