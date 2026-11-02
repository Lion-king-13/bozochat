import type { ConversationListItemDto, ParticipantRole } from '@bozochat/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  canManageGroup,
  errorMessage,
  PARTICIPANT_ROLE_LABELS,
  useAddParticipants,
  useChangeParticipantRole,
  useRemoveParticipant,
  useRenameConversation,
} from '../../lib/conversations';
import { useMembers, useWorkspaces } from '../../lib/workspaces';
import { ConfirmButton } from '../ConfirmButton';
import { Field } from '../Field';
import { Modal } from '../Modal';
import { MemberPicker } from './MemberPicker';

type Props = { conversation: ConversationListItemDto; meId: string; onClose: () => void };

const SECTION = 'space-y-3 border-b border-stone-200 pb-5 last:border-b-0 last:pb-0';
const SUBMIT =
  'rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60';
const DANGER =
  'rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60';
const SELECT =
  'rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60';

function Alert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage(error)}
    </p>
  );
}

/**
 * Gestion d'un groupe : renommer, participants et rôles (admins), quitter (tout le monde).
 * Les actions affichées suivent les droits ; le serveur revérifie chacune d'elles.
 */
export function GroupSettingsDialog({ conversation, meId, onClose }: Props) {
  const workspaces = useWorkspaces();
  const workspaceRole = workspaces.data?.find((w) => w.id === conversation.workspaceId)?.role;
  const manager = canManageGroup(conversation, meId, workspaceRole);

  return (
    <Modal title={conversation.name ?? 'Groupe'} onClose={onClose}>
      <div className="space-y-5">
        {manager && <RenameSection conversation={conversation} />}
        <ParticipantsSection conversation={conversation} meId={meId} manager={manager} />
        {manager && <AddSection conversation={conversation} />}
        <LeaveSection conversation={conversation} meId={meId} onLeft={onClose} />
      </div>
    </Modal>
  );
}

function RenameSection({ conversation }: { conversation: ConversationListItemDto }) {
  const rename = useRenameConversation(conversation.id);
  const [name, setName] = useState(conversation.name ?? '');
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Le nom du groupe est obligatoire.');
      return;
    }
    setError(undefined);
    rename.mutate(name);
  };

  return (
    <form onSubmit={submit} noValidate className={SECTION}>
      <Field
        label="Nom du groupe"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <Alert error={rename.error} />
      <button
        type="submit"
        disabled={rename.isPending || name.trim() === conversation.name}
        className={SUBMIT}
      >
        {rename.isSuccess && name.trim() === conversation.name ? 'Enregistré' : 'Renommer'}
      </button>
    </form>
  );
}

type ParticipantsProps = { conversation: ConversationListItemDto; meId: string; manager: boolean };

function ParticipantsSection({ conversation, meId, manager }: ParticipantsProps) {
  const changeRole = useChangeParticipantRole(conversation.id);
  const remove = useRemoveParticipant(conversation.id);
  const pending = changeRole.isPending || remove.isPending;
  const admins = conversation.participants.filter((p) => p.role === 'ADMIN').length;

  return (
    <section className={SECTION}>
      <h3 className="text-sm font-semibold text-stone-700">
        Participants ({conversation.participants.length})
      </h3>
      <ul className="space-y-2">
        {conversation.participants.map((p) => {
          const me = p.id === meId;
          // Le dernier admin ne peut pas être rétrogradé : le serveur refuserait.
          const lockedAdmin = p.role === 'ADMIN' && admins === 1;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{p.displayName}</span>
                {me && <span className="text-stone-500"> (vous)</span>}
              </span>
              {manager && !me ? (
                <>
                  <label className="sr-only" htmlFor={`participant-role-${p.id}`}>
                    Rôle de {p.displayName}
                  </label>
                  <select
                    id={`participant-role-${p.id}`}
                    value={p.role}
                    disabled={pending || lockedAdmin}
                    onChange={(e) =>
                      changeRole.mutate({ userId: p.id, role: e.target.value as ParticipantRole })
                    }
                    className={SELECT}
                  >
                    <option value="MEMBER">{PARTICIPANT_ROLE_LABELS.MEMBER}</option>
                    <option value="ADMIN">{PARTICIPANT_ROLE_LABELS.ADMIN}</option>
                  </select>
                  <ConfirmButton
                    label="Retirer"
                    question={`Retirer ${p.displayName} ?`}
                    confirmLabel="Oui, retirer"
                    onConfirm={() => remove.mutate(p.id)}
                    disabled={pending}
                    className={DANGER}
                  />
                </>
              ) : (
                <span className="text-sm text-stone-600">{PARTICIPANT_ROLE_LABELS[p.role]}</span>
              )}
            </li>
          );
        })}
      </ul>
      <Alert error={changeRole.error ?? remove.error} />
    </section>
  );
}

function AddSection({ conversation }: { conversation: ConversationListItemDto }) {
  const members = useMembers(conversation.workspaceId);
  const add = useAddParticipants(conversation.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inGroup = new Set(conversation.participants.map((p) => p.id));
  const candidates = members.data?.filter((m) => !inGroup.has(m.user.id)) ?? [];

  const toggle = (userId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate([...selected], { onSuccess: () => setSelected(new Set()) });
  };

  return (
    <form onSubmit={submit} className={SECTION}>
      <h3 className="text-sm font-semibold text-stone-700">Ajouter des participants</h3>
      {members.isPending ? (
        <p className="text-sm text-stone-500">Chargement des membres…</p>
      ) : (
        <MemberPicker
          members={candidates}
          selected={selected}
          onToggle={toggle}
          disabled={add.isPending}
          emptyLabel="Tous les membres du workspace font déjà partie du groupe."
        />
      )}
      <Alert error={add.error ?? members.error} />
      {candidates.length > 0 && (
        <button type="submit" disabled={add.isPending || selected.size === 0} className={SUBMIT}>
          {add.isPending ? 'Ajout…' : `Ajouter${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
      )}
    </form>
  );
}

type LeaveProps = { conversation: ConversationListItemDto; meId: string; onLeft: () => void };

function LeaveSection({ conversation, meId, onLeft }: LeaveProps) {
  const leave = useRemoveParticipant(conversation.id);
  const navigate = useNavigate();
  if (!conversation.participants.some((p) => p.id === meId)) return null;

  return (
    <section className={SECTION}>
      <Alert error={leave.error} />
      <ConfirmButton
        label="Quitter le groupe"
        question="Vous ne verrez plus ses messages."
        confirmLabel="Oui, quitter"
        onConfirm={() =>
          leave.mutate(meId, {
            onSuccess: () => {
              onLeft();
              void navigate('/app', { replace: true });
            },
          })
        }
        disabled={leave.isPending}
        className={DANGER}
      />
    </section>
  );
}
