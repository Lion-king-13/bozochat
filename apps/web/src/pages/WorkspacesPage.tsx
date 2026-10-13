import { createWorkspaceSchema } from '@bozochat/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Field } from '../components/Field';
import { ApiRequestError } from '../lib/api';
import { errorMessage } from '../lib/conversations';
import {
  ROLE_LABELS,
  useAcceptInvitation,
  useCreateWorkspace,
  useDeclineInvitation,
  useReceivedInvitations,
  useWorkspaces,
} from '../lib/workspaces';

const CARD = 'space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm';
const SUBMIT =
  'rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800 disabled:opacity-60';
const SECONDARY =
  'rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60';

function ReceivedInvitations() {
  const invitations = useReceivedInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const navigate = useNavigate();

  if (!invitations.data || invitations.data.length === 0) return null;

  async function onAccept(id: string) {
    try {
      const workspace = await accept.mutateAsync(id);
      toast.success(`Vous avez rejoint ${workspace.name}.`);
      void navigate(`/app/settings/workspaces/${workspace.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDecline(id: string) {
    try {
      await decline.mutateAsync(id);
      toast.success('Invitation refusée.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const pending = accept.isPending || decline.isPending;
  return (
    <section className={CARD} aria-labelledby="received-title">
      <h2 id="received-title" className="font-semibold">
        Invitations reçues
      </h2>
      <ul className="divide-y divide-stone-100">
        {invitations.data.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-medium">{invitation.workspace.name}</p>
              <p className="text-sm text-stone-600">
                {invitation.invitedBy
                  ? `${invitation.invitedBy.displayName} vous invite`
                  : 'Invitation'}{' '}
                en tant que {ROLE_LABELS[invitation.role].toLowerCase()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => void onDecline(invitation.id)}
                className={SECONDARY}
              >
                Refuser
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void onAccept(invitation.id)}
                className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
              >
                Rejoindre
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateWorkspaceForm() {
  const create = useCreateWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const parsed = createWorkspaceSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    try {
      const workspace = await create.mutateAsync(parsed.data.name);
      toast.success('Workspace créé.');
      void navigate(`/app/settings/workspaces/${workspace.id}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? (e.fieldErrors?.name ?? e.message) : errorMessage(e));
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className={CARD}>
      <h2 className="font-semibold">Créer un workspace</h2>
      <p className="text-sm text-stone-600">Vous en serez le propriétaire.</p>
      <Field
        label="Nom du workspace"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Agence Orion"
        error={error}
      />
      <button type="submit" disabled={create.isPending} className={SUBMIT}>
        {create.isPending ? 'Création…' : 'Créer'}
      </button>
    </form>
  );
}

export function WorkspacesPage() {
  const workspaces = useWorkspaces();

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <Link to="/app" className={SECONDARY}>
            Retour au chat
          </Link>
        </div>

        <ReceivedInvitations />

        <section className={CARD} aria-labelledby="mine-title">
          <h2 id="mine-title" className="font-semibold">
            Mes workspaces
          </h2>
          {workspaces.isPending && <p className="text-stone-500">Chargement…</p>}
          {workspaces.isError && (
            <p role="alert" className="text-sm text-red-600">
              {errorMessage(workspaces.error)}
            </p>
          )}
          {workspaces.data?.length === 0 && (
            <p className="text-sm text-stone-600">Vous n'appartenez à aucun workspace.</p>
          )}
          <ul className="divide-y divide-stone-100">
            {workspaces.data?.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  to={`/app/settings/workspaces/${workspace.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-stone-50"
                >
                  <span>
                    <span className="block font-medium">{workspace.name}</span>
                    <span className="text-sm text-stone-600">
                      {ROLE_LABELS[workspace.role]} · {workspace.memberCount} membre
                      {workspace.memberCount > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-600">
                    {workspace.plan === 'PRO' ? 'Pro' : 'Free'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <CreateWorkspaceForm />
      </div>
    </section>
  );
}
