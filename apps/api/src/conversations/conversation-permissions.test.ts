import { describe, expect, it } from 'vitest';
import {
  canManageGroup,
  canRemoveParticipant,
  directKey,
  successorAfterLeave,
  type ConversationActor,
} from './conversation-permissions';

const groupAdmin: ConversationActor = {
  type: 'GROUP',
  participantRole: 'ADMIN',
  workspaceRole: 'MEMBER',
};
const groupMember: ConversationActor = {
  type: 'GROUP',
  participantRole: 'MEMBER',
  workspaceRole: 'MEMBER',
};
const workspaceAdmin: ConversationActor = {
  type: 'GROUP',
  participantRole: null,
  workspaceRole: 'ADMIN',
};
const outsider: ConversationActor = { type: 'GROUP', participantRole: null, workspaceRole: null };

describe('canManageGroup', () => {
  it("autorise l'admin du groupe et l'admin ou l'owner du workspace", () => {
    expect(canManageGroup(groupAdmin)).toBe(true);
    expect(canManageGroup(workspaceAdmin)).toBe(true);
    expect(canManageGroup({ ...workspaceAdmin, workspaceRole: 'OWNER' })).toBe(true);
  });

  it('refuse un simple membre et un inconnu', () => {
    expect(canManageGroup(groupMember)).toBe(false);
    expect(canManageGroup(outsider)).toBe(false);
  });

  it('refuse toujours pour une conversation privée', () => {
    expect(canManageGroup({ ...groupAdmin, type: 'DIRECT' })).toBe(false);
    expect(canManageGroup({ ...workspaceAdmin, type: 'DIRECT', workspaceRole: 'OWNER' })).toBe(
      false,
    );
  });
});

describe('canRemoveParticipant', () => {
  it('tout participant peut quitter un groupe', () => {
    expect(canRemoveParticipant(groupMember, 'bob', 'bob')).toBe(true);
  });

  it("seul un gestionnaire retire quelqu'un d'autre", () => {
    expect(canRemoveParticipant(groupAdmin, 'alice', 'bob')).toBe(true);
    expect(canRemoveParticipant(workspaceAdmin, 'alice', 'bob')).toBe(true);
    expect(canRemoveParticipant(groupMember, 'bob', 'carol')).toBe(false);
  });

  it('un non-participant ne peut pas « quitter » et une conversation privée ne se quitte pas', () => {
    expect(canRemoveParticipant(workspaceAdmin, 'alice', 'alice')).toBe(false);
    expect(canRemoveParticipant({ ...groupMember, type: 'DIRECT' }, 'bob', 'bob')).toBe(false);
  });
});

describe('directKey', () => {
  it("ne dépend pas de l'ordre des deux personnes", () => {
    expect(directKey('b', 'a')).toBe('a:b');
    expect(directKey('a', 'b')).toBe('a:b');
  });

  it('tient dans la colonne direct_key (80 caractères) avec deux UUID', () => {
    const uuid = '00000000-0000-4000-8000-000000000000';
    expect(directKey(uuid, uuid.replace(/0$/, '1')).length).toBeLessThanOrEqual(80);
  });
});

describe('successorAfterLeave', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
  const members = [
    { userId: 'alice', role: 'ADMIN' as const, joinedAt: at(0) },
    { userId: 'carol', role: 'MEMBER' as const, joinedAt: at(2) },
    { userId: 'bob', role: 'MEMBER' as const, joinedAt: at(1) },
  ];

  it('promeut le membre le plus ancien quand le dernier admin part', () => {
    expect(successorAfterLeave(members, 'alice')).toBe('bob');
  });

  it("ne promeut personne quand un membre part ou qu'un autre admin reste", () => {
    expect(successorAfterLeave(members, 'bob')).toBeNull();
    const twoAdmins = members.map((m) =>
      m.userId === 'carol' ? { ...m, role: 'ADMIN' as const } : m,
    );
    expect(successorAfterLeave(twoAdmins, 'alice')).toBeNull();
  });

  it('ne renvoie personne quand le groupe se vide', () => {
    expect(successorAfterLeave([members[0]!], 'alice')).toBeNull();
  });
});
