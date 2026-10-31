import type { ConversationListItemDto } from '@bozochat/shared';
import { describe, expect, it } from 'vitest';
import { clearUnread, formatUnreadCount, totalUnread, unreadLabel } from './conversations';

const conversation = (id: string, unreadCount: number): ConversationListItemDto => ({
  id,
  workspaceId: 'w',
  type: 'GROUP',
  name: id,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  participants: [],
  unreadCount,
});

describe('totalUnread', () => {
  it('additionne les non-lus de toutes les conversations', () => {
    expect(totalUnread([conversation('a', 2), conversation('b', 3)], undefined)).toBe(5);
  });

  it('ignore la conversation affichée, déjà en cours de lecture', () => {
    expect(totalUnread([conversation('a', 2), conversation('b', 3)], 'a')).toBe(3);
  });

  it('vaut 0 tant que la liste n’est pas chargée', () => {
    expect(totalUnread(undefined, undefined)).toBe(0);
  });
});

describe('clearUnread', () => {
  it('ne remet à zéro que la conversation visée', () => {
    const list = clearUnread([conversation('a', 2), conversation('b', 3)], 'a');
    expect(list?.map((c) => c.unreadCount)).toEqual([0, 3]);
  });

  it('laisse un cache vide intact', () => {
    expect(clearUnread(undefined, 'a')).toBeUndefined();
  });
});

describe('badges', () => {
  it('reste compact au-delà de 99', () => {
    expect(formatUnreadCount(99)).toBe('99');
    expect(formatUnreadCount(100)).toBe('99+');
  });

  it('accorde le libellé accessible', () => {
    expect(unreadLabel(1)).toBe('1 message non lu');
    expect(unreadLabel(8)).toBe('8 messages non lus');
  });
});
