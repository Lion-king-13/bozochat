import { Injectable } from '@nestjs/common';
import type {
  ClientToServerEvents,
  MessageDto,
  MessagePageDto,
  MessagesQueryInput,
  PublicUser,
  ServerToClientEvents,
} from '@bozochat/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Server } from 'socket.io';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import { conversations, messages } from '../db/schema';
import { conversationRoom } from '../realtime/rooms';
import { ConversationsService } from './conversations.service';
import { decodeCursor, encodeCursor } from './cursor';

type MessageRow = typeof messages.$inferSelect & {
  author: { id: string; displayName: string; avatarUrl: string | null } | null;
};

/** Un message supprimé garde sa place dans l'historique mais jamais son contenu. */
export function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    author: row.author
      ? {
          id: row.author.id,
          displayName: row.author.displayName,
          avatarUrl: row.author.avatarUrl,
        }
      : null,
    content: row.deletedAt ? '' : row.content,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted: row.deletedAt !== null,
  };
}

/**
 * Unique chemin métier pour lire et écrire des messages : le controller REST et la gateway
 * Socket.IO l'appellent tous les deux, donc la vérification d'appartenance ne peut pas être
 * contournée par un canal plutôt que par l'autre.
 */
@Injectable()
export class MessagesService {
  /**
   * Serveur Socket.IO fourni par la gateway à son initialisation (`attachServer`).
   * Évite d'injecter la gateway ici, ce qui créerait un cycle ConversationsModule ↔ RealtimeModule.
   */
  private server: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly conversations: ConversationsService,
  ) {}

  attachServer(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.server = server;
  }

  /** Historique paginé, du plus récent au plus ancien. */
  async list(
    conversationId: string,
    userId: string,
    query: MessagesQueryInput,
  ): Promise<MessagePageDto> {
    await this.conversations.assertParticipant(conversationId, userId);

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.db.query.messages.findMany({
      where: and(
        eq(messages.conversationId, conversationId),
        // Comparaison de tuples : strictement « avant » le curseur, sans trou ni doublon
        // même quand plusieurs messages partagent le même createdAt.
        cursor
          ? sql`(${messages.createdAt}, ${messages.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
      orderBy: [desc(messages.createdAt), desc(messages.id)],
      limit: query.limit + 1, // une ligne de plus : sait s'il reste une page sans second COUNT
      with: { author: { columns: { id: true, displayName: true, avatarUrl: true } } },
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items[items.length - 1];

    return {
      items: items.map(toMessageDto),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      hasMore,
    };
  }

  /**
   * Crée un message puis le diffuse dans `conversation:<id>`.
   * L'insertion et la mise à jour de `lastMessageAt` sont dans la même transaction :
   * la liste des conversations ne peut pas être désynchronisée de l'historique.
   */
  async create(conversationId: string, author: PublicUser, content: string): Promise<MessageDto> {
    await this.conversations.assertParticipant(conversationId, author.id);

    const row = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(messages)
        .values({ conversationId, authorId: author.id, content })
        .returning();
      await tx
        .update(conversations)
        .set({ lastMessageAt: inserted!.createdAt })
        .where(eq(conversations.id, conversationId));
      return inserted!;
    });

    const message = toMessageDto({ ...row, author });
    // Diffusé après le commit, à toute la room y compris l'émetteur : le client déduplique
    // sur l'id, ce qui reste correct avec plusieurs onglets ouverts.
    this.server?.to(conversationRoom(conversationId)).emit('message:new', message);
    return message;
  }
}
