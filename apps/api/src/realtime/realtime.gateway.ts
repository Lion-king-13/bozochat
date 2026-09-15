import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { ClientToServerEvents, PublicUser, ServerToClientEvents } from '@bozochat/shared';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { toApiError } from '../common/all-exceptions.filter';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE } from '../auth/session.util';
import { ConversationsService } from '../conversations/conversations.service';

type ClientSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  { user: PublicUser }
>;

const joinSchema = z.object({ conversationId: z.uuid() });

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

/**
 * Gateway temps réel.
 * - Authentification par le même cookie de session que l'API (middleware au handshake).
 * - Chaque socket rejoint sa room personnelle `user:<id>` (notifications, badges).
 * - Rejoindre `conversation:<id>` exige d'être participant (vérifié en base).
 * CORS : géré dans main.ts via un adapter configuré sur APP_ORIGIN.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly conversations: ConversationsService,
  ) {}

  /**
   * Authentification dans un middleware Socket.IO : la connexion n'est acceptée qu'une fois
   * l'utilisateur vérifié. (Dans handleConnection, le client pourrait émettre des événements
   * avant la fin de la vérification asynchrone.)
   */
  afterInit(server: Server) {
    server.use((socket, next) => {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      this.auth
        .userFromToken(cookies[SESSION_COOKIE])
        .then((user) => {
          if (!user) return next(new Error('Vous devez être connecté.'));
          socket.data.user = user;
          next();
        })
        .catch((e: unknown) => {
          this.logger.error(e);
          next(new Error('Connexion temps réel impossible pour le moment.'));
        });
    });
  }

  async handleConnection(client: ClientSocket) {
    await client.join(userRoom(client.data.user.id));
  }

  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: ClientSocket, @MessageBody() body: unknown) {
    try {
      const { conversationId } = joinSchema.parse(body);
      await this.conversations.assertParticipant(conversationId, client.data.user.id);
      await client.join(conversationRoom(conversationId));
      return { ok: true };
    } catch (e) {
      const error =
        e instanceof z.ZodError
          ? { statusCode: 400, message: 'Conversation invalide.' }
          : toApiError(e);
      return { ok: false, error };
    }
  }

  @SubscribeMessage('conversation:leave')
  async onLeave(@ConnectedSocket() client: ClientSocket, @MessageBody() body: unknown) {
    const parsed = joinSchema.safeParse(body);
    if (parsed.success) await client.leave(conversationRoom(parsed.data.conversationId));
  }
}
