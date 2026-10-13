import {
  createInvitationSchema,
  workspaceNameSchema,
  type AssignableRole,
  type WorkspaceDto,
} from '@bozochat/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Field } from '../components/Field';
import { ApiRequestError } from '../lib/api';
import { useMe } from '../lib/auth';
import { errorMessage } from '../lib/conversations';
import { initials } from '../lib/format';
import {
  ROLE_LABELS,
  canManage,
  useDeleteWorkspace,
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMemberRole,
  useUpdateWorkspace,
  useWorkspace,
} from '../lib/workspaces';

const CARD = 'space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm';
const SUBMIT =
  'rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800 disabled:opacity-60';
const SECONDARY =
  'rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-60';
const DANGER =
  'rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60';
const SELECT =
  'rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

function SettingsCard({ workspace }: { workspace: WorkspaceDto }) {
  const update = useUpdateWorkspace(workspace.id);
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | undefined>();
  const isOwner = workspace.role === 'OWNER';

  async function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const parsed = workspaceNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    try {
      const updated = await update.mutateAsync({ name: parsed.data });
      setName(updated.name);
      toast.success('Workspace renommé.');
    } catch (e) {
      setError(e instanceof ApiRequestError ? (e.fieldErrors?.name ?? e.message) : errorMessage(e));
    }
  }

  async function onChangePlan() {
    const plan = workspace.plan === 'PRO' ? 'FREE' : 'PRO';
    try {
      await update.mutateAsync({ plan });
      toast.success(plan === 'PRO' ? 'Passage au plan Pro effectué.' : 'Retour au plan Free.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <section className={CARD} aria-labelledby="settings-title">
      <h2 id="settings-title" className="font-semibold">
        Paramètres
      </h2>
      <form noValidate onSubmit={onRename} className="space-y-3">
        <Field
          label="Nom du workspace"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
        <button type="submit" disabled={update.isPending} className={SUBMIT}>
          Renommer
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
        <div>
          <p className="font-medium">Plan {workspace.plan === 'PRO' ? 'Pro' : 'Free'}</p>
          <p className="text-sm text-stone-600">
            {workspace.memberLimit === null
              ? `${workspace.memberCount} membres · illimité`
              : `${workspace.memberCount} / ${workspace.memberLimit} membres`}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => void onChangePlan()}
            className={SECONDARY}
          >
            {workspace.plan === 'PRO' ? 'Repasser en Free' : 'Passer à Pro'}
          </button>
        )}
      </div>
    </section>
  );
}

function MembersCard({ workspace, meId }: { workspace: WorkspaceDto; meId: string }) {
  const members = useMembers(workspace.id);
  const updateRole = useUpdateMemberRole(workspace.id);
  const remove = useRemoveMember(workspace.id);

  async function onRoleChange(userId: string, role: AssignableRole) {
    try {
      await updateRole.mutateAsync({ userId, role });
      toast.success('Rôle mis à jour.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onRemove(userId: string, displayName: string) {
    if (!window.confirm(`Retirer ${displayName} du workspace ?`)) return;
    try {
      await remove.mutateAsync({ userId });
      toast.success(`${displayName} a été retiré du workspace.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const pending = updateRole.isPending || remove.isPending;
  return (
    <section className={CARD} aria-labelledby="members-title">
      <h2 id="members-title" className="font-semibold">
        Membres
      </h2>
      {members.isPending && <p className="text-stone-500">Chargement…</p>}
      {members.isError && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(members.error)}
        </p>
      )}
      <ul className="divide-y divide-stone-100">
        {members.data?.map(({ user, role }) => {
          const manageable = user.id !== meId && canManage(workspace.role, role);
          return (
            <li key={user.id} className="flex flex-wrap items-center gap-3 py-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600"
                >
                  {initials(user.displayName)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {user.displayName}
                  {user.id === meId && <span className="text-stone-500"> (vous)</span>}
                </p>
                <p className="truncate text-sm text-stone-600">{user.email}</p>
              </div>
              {manageable && role !== 'OWNER' ? (
                <>
                  <label className="sr-only" htmlFor={`role-${user.id}`}>
                    Rôle de {user.displayName}
                  </label>
                  <select
                    id={`role-${user.id}`}
                    value={role}
                    disabled={pending}
                    onChange={(e) => void onRoleChange(user.id, e.target.value as AssignableRole)}
                    className={SELECT}
                  >
                    <option value="MEMBER">{ROLE_LABELS.MEMBER}</option>
                    <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void onRemove(user.id, user.displayName)}
                    className={DANGER}
                  >
                    Retirer
                  </button>
                </>
              ) : (
                <span className="text-sm text-stone-600">{ROLE_LABELS[role]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InviteCard({ workspace }: { workspace: WorkspaceDto }) {
  const invite = useInvite(workspace.id);
  const invitations = useInvitations(workspace.id, true);
  const revoke = useRevokeInvitation(workspace.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('MEMBER');
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const parsed = createInvitationSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    try {
      await invite.mutateAsync(parsed.data);
      setEmail('');
      toast.success(`Invitation envoyée à ${parsed.data.email}.`);
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? (e.fieldErrors?.email ?? e.message) : errorMessage(e),
      );
    }
  }

  async function onRevoke(id: string) {
    try {
      await revoke.mutateAsync(id);
      toast.success('Invitation annulée.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <section className={CARD} aria-labelledby="invite-title">
      <h2 id="invite-title" className="font-semibold">
        Inviter un membre
      </h2>
      <p className="text-sm text-stone-600">
        La personne verra l'invitation dans ses workspaces en se connectant avec cette adresse.
      </p>
      <form noValidate onSubmit={onSubmit} className="space-y-3">
        <Field
          label="Adresse e-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="thomas@orion.test"
          autoComplete="off"
          error={error}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="invite-role" className="block text-sm font-medium text-stone-700">
              Rôle
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
              className={SELECT}
            >
              <option value="MEMBER">{ROLE_LABELS.MEMBER}</option>
              <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
            </select>
          </div>
          <button type="submit" disabled={invite.isPending} className={SUBMIT}>
            {invite.isPending ? 'Envoi…' : 'Inviter'}
          </button>
        </div>
      </form>

      {invitations.data && invitations.data.length > 0 && (
        <div className="border-t border-stone-100 pt-4">
          <h3 className="text-sm font-semibold text-stone-700">Invitations en attente</h3>
          <ul className="divide-y divide-stone-100">
            {invitations.data.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate">{invitation.email}</p>
                  <p className="text-sm text-stone-600">
                    {ROLE_LABELS[invitation.role]} · expire le{' '}
                    {dateFormat.format(new Date(invitation.expiresAt))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => void onRevoke(invitation.id)}
                  className={SECONDARY}
                >
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DangerCard({ workspace, meId }: { workspace: WorkspaceDto; meId: string }) {
  const navigate = useNavigate();
  const remove = useDeleteWorkspace(workspace.id);
  const leave = useRemoveMember(workspace.id);
  const isOwner = workspace.role === 'OWNER';

  async function onDelete() {
    const confirmed = window.confirm(
      `Supprimer définitivement « ${workspace.name} » ? Toutes ses conversations seront perdues.`,
    );
    if (!confirmed) return;
    try {
      await remove.mutateAsync();
      toast.success('Workspace supprimé.');
      void navigate('/app/settings/workspaces');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onLeave() {
    if (!window.confirm(`Quitter « ${workspace.name} » ?`)) return;
    try {
      await leave.mutateAsync({ userId: meId, self: true });
      toast.success('Vous avez quitté le workspace.');
      void navigate('/app/settings/workspaces');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <section className={`${CARD} border-red-200`} aria-labelledby="danger-title">
      <h2 id="danger-title" className="font-semibold text-red-700">
        Zone sensible
      </h2>
      {isOwner ? (
        <>
          <p className="text-sm text-stone-600">
            En tant que propriétaire, vous ne pouvez pas quitter ce workspace. Vous pouvez le
            supprimer, avec toutes ses conversations.
          </p>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => void onDelete()}
            className={DANGER}
          >
            Supprimer le workspace
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            Vous perdrez l'accès à toutes les conversations de ce workspace.
          </p>
          <button
            type="button"
            disabled={leave.isPending}
            onClick={() => void onLeave()}
            className={DANGER}
          >
            Quitter le workspace
          </button>
        </>
      )}
    </section>
  );
}

export function WorkspacePage() {
  const { workspaceId = '' } = useParams();
  const me = useMe();
  const workspace = useWorkspace(workspaceId);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-bold">{workspace.data?.name ?? 'Workspace'}</h1>
          <Link to="/app/settings/workspaces" className={SECONDARY}>
            Mes workspaces
          </Link>
        </div>

        {workspace.isPending && <p className="text-stone-500">Chargement…</p>}
        {workspace.isError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(workspace.error)}
          </p>
        )}
        {workspace.data && me.data && (
          <>
            {workspace.data.role !== 'MEMBER' && (
              <SettingsCard key={workspace.data.id} workspace={workspace.data} />
            )}
            <MembersCard workspace={workspace.data} meId={me.data.id} />
            {workspace.data.role !== 'MEMBER' && <InviteCard workspace={workspace.data} />}
            <DangerCard workspace={workspace.data} meId={me.data.id} />
          </>
        )}
      </div>
    </section>
  );
}
