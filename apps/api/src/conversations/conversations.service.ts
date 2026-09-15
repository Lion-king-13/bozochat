import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import { participants } from '../db/schema';

/**
 * Cœur des permissions : toute lecture/écriture/abonnement temps réel sur une conversation
 * passe par assertParticipant. À enrichir en S3–S4 (création 1:1, groupes, messages…).
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
}
