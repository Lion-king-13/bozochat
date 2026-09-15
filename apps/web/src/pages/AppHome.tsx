import { Navigate } from 'react-router';
import { toast } from 'sonner';
import { Logo } from '../components/Logo';
import { useLogout, useMe } from '../lib/auth';
import { useSocket } from '../lib/socket';

/** Coquille de l'application connectée — le chat arrive en S3. */
export function AppHome() {
  const me = useMe();
  const logout = useLogout();
  const { connected } = useSocket(Boolean(me.data));

  if (me.isPending) return <p className="p-8 text-stone-500">Chargement…</p>;
  if (!me.data) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen flex-col">
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
      <main className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold">Bienvenue, {me.data.displayName} 👋</h1>
          <p className="mt-2 text-stone-600">Vos conversations apparaîtront ici.</p>
        </div>
      </main>
    </div>
  );
}
