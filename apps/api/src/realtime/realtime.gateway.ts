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
import {
  sendMessageSchema,
  type Ack,
  type ClientToServerEvents,
  type PublicUser,
  type SendMessageAck,
  type ServerToClientEvents,
} from '@bozochat/shared';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { toApiError } from '../common/all-exceptions.filter';
import { zodToApiError } from '../common/zod-validation.pipe';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE } from '../auth/session.util';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../conversations/messages.service';
import { conversationRoom, userRoom } from './rooms';

type ClientSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  object,
  { user: PublicUser }
>;

const joinSchema = z.object({ conversationId: z.uuid() });

/** Le filtre d'exceptions global ne couvre que HTTP : ici, aucune trace ne doit fuiter dans l'ack. */
function toAckError(e: unknown) {
  return e instanceof z.ZodError ? zodToApiError(e) : toApiError(e);
}

/**
 * Gateway temps réel.
 * - Authentification par le même cookie de session que l'API (middleware au handshake).
 * - Chaque socket rejoint sa room personnelle `user:<id>` (notifications, badges).
 * - Rejoindre `conversation:<id>` exige d'être participant (vérifié en base).
 * - Envoyer un message re-vérifie l'appartenance : avoir rejoint la room ne suffit jamais.
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
    private readonly messages: MessagesService,
  ) {}

  /**
   * Authentification dans un middleware Socket.IO : la connexion n'est acceptée qu'une fois
   * l'utilisateur vérifié. (Dans handleConnection, le client pourrait émettre des événements
   * avant la fin de la vérification asynchrone.)
   */
  afterInit(server: Server) {
    // Donne au service métier de quoi diffuser `message:new`, y compris pour les envois REST.
    this.messages.attachServer(server as Server<ClientToServerEvents, ServerToClientEvents>);

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
  async onJoin(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
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

  /**
   * Même service métier que `POST /api/conversations/:id/messages` : une seule implémentation
   * de la validation, du contrôle d'accès, de la transaction et de la diffusion.
   */
  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: unknown,
  ): Promise<SendMessageAck> {
    try {
      const { conversationId, content } = sendMessageSchema.parse(body);
      const message = await this.messages.create(conversationId, client.data.user, content);
      return { ok: true, message };
    } catch (e) {
      return { ok: false, error: toAckError(e) };
    }
  }
}
