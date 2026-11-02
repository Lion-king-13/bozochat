import type { ConversationListItemDto } from '@bozochat/shared';
import { useState } from 'react';
import { conversationTitle } from '../../lib/conversations';
import { initials } from '../../lib/format';

type Props = { conversation: ConversationListItemDto; meId: string };

/**
 * Pastille d'une conversation dans la liste : photo de l'autre personne pour une conversation
 * privée, initiales sinon. Un groupe n'a pas de photo (stockage d'images non tranché, issue #5) :
 * ses initiales sur un carré arrondi le distinguent d'une personne.
 * Une photo qui ne se charge pas (lien mort, CSP en production) retombe sur les initiales.
 */
export function ConversationAvatar({ conversation, meId }: Props) {
  const [broken, setBroken] = useState(false);
  const title = conversationTitle(conversation, meId);
  const group = conversation.type === 'GROUP';
  const photo = group ? null : conversation.participants.find((p) => p.id !== meId)?.avatarUrl;

  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt=""
        onError={() => setBroken(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center text-sm font-semibold ${
        group
          ? 'rounded-xl bg-stone-200 text-stone-700'
          : 'rounded-full bg-brand-100 text-brand-600'
      }`}
    >
      {initials(title)}
    </span>
  );
}
