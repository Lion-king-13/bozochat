import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Schéma de la base — source de vérité du diagramme UML (docs/03-modele-donnees.md).
 * Toute modification : `pnpm --filter api db:generate` puis commit du SQL généré dans /drizzle.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const planEnum = pgEnum('plan', ['FREE', 'PRO']);
export const workspaceRoleEnum = pgEnum('workspace_role', ['OWNER', 'ADMIN', 'MEMBER']);
export const conversationTypeEnum = pgEnum('conversation_type', ['DIRECT', 'GROUP']);
export const participantRoleEnum = pgEnum('participant_role', ['ADMIN', 'MEMBER']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  displayName: varchar('display_name', { length: 60 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  ...timestamps,
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  plan: planEnum('plan').notNull().default('FREE'),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index('wm_user_idx').on(t.userId)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: conversationTypeEnum('type').notNull(),
    /** Nom affiché — null pour les conversations DIRECT */
    name: varchar('name', { length: 80 }),
    /** "userA:userB" (ids triés) : empêche deux conversations 1:1 entre les mêmes personnes */
    directKey: varchar('direct_key', { length: 80 }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
    /** Dénormalisé : tri de la liste des conversations sans jointure sur les messages */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('conversations_direct_key_uq').on(t.workspaceId, t.directKey),
    index('conversations_ws_activity_idx').on(t.workspaceId, t.lastMessageAt.desc()),
  ],
);

export const participants = pgTable(
  'participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: participantRoleEnum('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /** Non-lus = messages créés après cette date */
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('participants_user_idx').on(t.userId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    content: varchar('content', { length: 4000 }).notNull(),
    ...timestamps,
    editedAt: timestamp('edited_at', { withTimezone: true }),
    /** Soft delete : l'historique reste cohérent */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt.desc()),
    check('messages_content_not_blank', sql`char_length(trim(${t.content})) > 0`),
  ],
);

// Relations (API de requêtes relationnelles de Drizzle)
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(workspaceMembers),
  participations: many(participants),
  messages: many(messages),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  conversations: many(conversations),
}));
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [conversations.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [conversations.createdById], references: [users.id] }),
  participants: many(participants),
  messages: many(messages),
}));
export const participantsRelations = relations(participants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [participants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [participants.userId], references: [users.id] }),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
