import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  conversationIdSchema,
  createMessageSchema,
  messagesQuerySchema,
  type ConversationListItemDto,
  type CreateMessageInput,
  type MessageDto,
  type MessagePageDto,
  type MessagesQueryInput,
  type PublicUser,
} from '@bozochat/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';

/** L'appartenance à la conversation est vérifiée dans les services, jamais seulement ici. */
@Controller('conversations')
@UseGuards(SessionGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<ConversationListItemDto[]> {
    return this.conversations.listForUser(user.id);
  }

  @Get(':id/messages')
  history(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: MessagesQueryInput,
    @CurrentUser() user: PublicUser,
  ): Promise<MessagePageDto> {
    return this.messages.list(conversationId, user.id, query);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  send(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageInput,
    @CurrentUser() user: PublicUser,
  ): Promise<MessageDto> {
    return this.messages.create(conversationId, user, body.content);
  }
}
