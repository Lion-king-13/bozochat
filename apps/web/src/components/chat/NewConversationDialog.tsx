import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage, useCreateGroup, useOpenDirect } from '../../lib/conversations';
import { useMembers, useWorkspaces } from '../../lib/workspaces';
import { Field } from '../Field';
import { Modal } from '../Modal';
import { MemberPicker } from './MemberPicker';

type Mode = 'direct' | 'group';
type Props = { meId: string; onClose: () => void };

const SUBMIT =
  'w-full rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-stone-800 disabled:opacity-60';

/** « Nouvelle conversation » : message privé avec un membre, ou groupe nommé. */
export function NewConversationDialog({ meId, onClose }: Props) {
  const workspaces = useWorkspaces();
  const [mode, setMode] = useState<Mode>('direct');
  const [chosenWorkspace, setChosenWorkspace] = useState<string>();
  const workspaceId = chosenWorkspace ?? workspaces.data?.[0]?.id;

  return (
    <Modal title="Nouvelle conversation" onClose={onClose}>
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Type de conversation"
          className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1"
        >
          {(
            [
              ['direct', 'Message privé'],
              ['group', 'Groupe'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === value ? 'bg-white shadow-sm' : 'text-stone-600 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {workspaces.isPending && <p className="text-sm text-stone-500">Chargement…</p>}
        {workspaces.isError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage(workspaces.error)}
          </p>
        )}
        {workspaces.isSuccess && workspaces.data.length === 0 && (
          <p className="text-sm text-stone-600">
            Vous n'appartenez à aucun workspace.{' '}
            <Link to="/app/settings/workspaces" onClick={onClose} className="font-medium underline">
              Créez-en un ou acceptez une invitation
            </Link>{' '}
            pour discuter avec votre équipe.
          </p>
        )}

        {workspaces.data && workspaces.data.length > 1 && (
          <div className="space-y-1">
            <label
              htmlFor="new-conv-workspace"
              className="block text-sm font-medium text-stone-700"
            >
              Workspace
            </label>
            <select
              id="new-conv-workspace"
              value={workspaceId}
              onChange={(e) => setChosenWorkspace(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
            >
              {workspaces.data.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {workspaceId &&
          (mode === 'direct' ? (
            <DirectForm key={workspaceId} workspaceId={workspaceId} meId={meId} onDone={onClose} />
          ) : (
            <GroupForm key={workspaceId} workspaceId={workspaceId} meId={meId} onDone={onClose} />
          ))}
      </div>
    </Modal>
  );
}

type FormProps = { workspaceId: string; meId: string; onDone: () => void };

function useOtherMembers(workspaceId: string, meId: string) {
  const members = useMembers(workspaceId);
  return { members, others: members.data?.filter((m) => m.user.id !== meId) ?? [] };
}

function DirectForm({ workspaceId, meId, onDone }: FormProps) {
  const { members, others } = useOtherMembers(workspaceId, meId);
  const open = useOpenDirect();
  const navigate = useNavigate();

  const start = (userId: string) =>
    open.mutate(
      { workspaceId, userId },
      {
        onSuccess: (conversation) => {
          onDone();
          void navigate(`/app/c/${conversation.id}`);
        },
      },
    );

  if (members.isPending) return <p className="text-sm text-stone-500">Chargement des membres…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">Choisissez la personne à qui écrire.</p>
      <MemberPicker
        members={others}
        onToggle={start}
        disabled={open.isPending}
        emptyLabel="Vous êtes seul dans ce workspace : invitez d'abord vos collègues."
      />
      {(open.isError || members.isError) && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(open.error ?? members.error)}
        </p>
      )}
    </div>
  );
}

function GroupForm({ workspaceId, meId, onDone }: FormProps) {
  const { members, others } = useOtherMembers(workspaceId, meId);
  const create = useCreateGroup();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nameError, setNameError] = useState<string>();

  const toggle = (userId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Le nom du groupe est obligatoire.');
      return;
    }
    setNameError(undefined);
    create.mutate(
      { workspaceId, name, participantIds: [...selected] },
      {
        onSuccess: (conversation) => {
          onDone();
          void navigate(`/app/c/${conversation.id}`);
        },
      },
    );
  };

  if (members.isPending) return <p className="text-sm text-stone-500">Chargement des membres…</p>;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Nom du groupe"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        placeholder="Ex. Équipe design"
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-700">
          Participants{selected.size > 0 && ` (${selected.size})`}
        </legend>
        <MemberPicker
          members={others}
          selected={selected}
          onToggle={toggle}
          disabled={create.isPending}
          emptyLabel="Vous êtes seul dans ce workspace : invitez d'abord vos collègues."
        />
      </fieldset>
      {(create.isError || members.isError) && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(create.error ?? members.error)}
        </p>
      )}
      <button type="submit" disabled={create.isPending || selected.size === 0} className={SUBMIT}>
        {create.isPending ? 'Création…' : 'Créer le groupe'}
      </button>
    </form>
  );
}
