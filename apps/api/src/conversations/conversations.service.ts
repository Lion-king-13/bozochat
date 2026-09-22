import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ConversationListItemDto } from '@bozochat/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import { conversations, participants } from '../db/schema';

/**
 * Cœur des permissions : toute lecture/écriture/abonnement temps réel sur une conversation
 * passe par assertParticipant. À enrichir en S4 (création 1:1, groupes, participants…).
 */
@Injectable()
export class ConversationsService {
  constructor(@InjectDb() private readonly db: Database) {}

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const participant = await this.db.query.participants.findFirst({
      where: and(eq(participants.conversationId, conversationId), eq(participants.userId, userId)),
      columns: { userId: true },
    });
    return participant !== undefined;
  }

  async assertParticipant(conversationId: string, userId: string): Promise<void> {
    if (!(await this.isParticipant(conversationId, userId))) {
      // 403 générique : on ne révèle pas si la conversation existe.
      throw new ForbiddenException("Vous n'avez pas accès à cette conversation.");
    }
  }

  /** Les conversations dont l'utilisateur est participant, les plus actives en premier. */
  async listForUser(userId: string): Promise<ConversationListItemDto[]> {
    const rows = await this.db.query.conversations.findMany({
      where: inArray(
        conversations.id,
        this.db
          .select({ id: participants.conversationId })
          .from(participants)
          .where(eq(participants.userId, userId)),
      ),
      // L'id départage deux conversations de même activité : ordre stable.
      orderBy: [desc(conversations.lastMessageAt), desc(conversations.id)],
      with: {
        participants: {
          with: { user: { columns: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });

    return rows.map((conversation) => ({
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      type: conversation.type,
      name: conversation.name,
      createdAt: conversation.createdAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      participants: conversation.participants.map(({ user }) => ({
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      })),
    }));
  }
}
