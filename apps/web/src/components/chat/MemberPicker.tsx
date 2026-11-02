import type { WorkspaceMemberDto } from '@bozochat/shared';
import { useState } from 'react';
import { initials } from '../../lib/format';

type Props = {
  members: WorkspaceMemberDto[];
  /** Sélection multiple (cases à cocher) ou choix immédiat d'une personne. */
  selected?: Set<string>;
  onToggle: (userId: string) => void;
  disabled?: boolean;
  emptyLabel: string;
};

const ROW = 'flex items-center gap-3 px-3 py-2 hover:bg-stone-50';

/** Liste filtrable des membres d'un workspace, pour démarrer une conversation ou un groupe. */
export function MemberPicker({ members, selected, onToggle, disabled, emptyLabel }: Props) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = members.filter(
    ({ user }) =>
      !needle ||
      user.displayName.toLowerCase().includes(needle) ||
      user.email.toLowerCase().includes(needle),
  );

  if (members.length === 0) return <p className="text-sm text-stone-500">{emptyLabel}</p>;

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor="member-search">
        Rechercher un membre
      </label>
      <input
        id="member-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un membre…"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"
      />
      <ul className="max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
        {visible.map(({ user }) => {
          const identity = (
            <>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600"
              >
                {initials(user.displayName)}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{user.displayName}</span>
                <span className="block truncate text-xs text-stone-500">{user.email}</span>
              </span>
            </>
          );
          return (
            <li key={user.id}>
              {selected ? (
                <label className={`${ROW} cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={selected.has(user.id)}
                    disabled={disabled}
                    onChange={() => onToggle(user.id)}
                    className="h-4 w-4 shrink-0 accent-brand-500"
                  />
                  {identity}
                </label>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(user.id)}
                  className={`${ROW} w-full disabled:opacity-60`}
                >
                  {identity}
                </button>
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-2 text-sm text-stone-500">Aucun membre ne correspond.</li>
        )}
      </ul>
    </div>
  );
}
