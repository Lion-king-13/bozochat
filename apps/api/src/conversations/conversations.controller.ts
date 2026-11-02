import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  addParticipantsSchema,
  conversationIdSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  createMessageSchema,
  messagesQuerySchema,
  updateConversationSchema,
  updateParticipantRoleSchema,
  userIdSchema,
  type AddParticipantsInput,
  type ConversationListItemDto,
  type CreateDirectConversationInput,
  type CreateGroupConversationInput,
  type CreateMessageInput,
  type MessageDto,
  type MessagePageDto,
  type MessagesQueryInput,
  type PublicUser,
  type UpdateConversationInput,
  type UpdateParticipantRoleInput,
} from '@bozochat/shared';
import type { Response } from 'express';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ConversationManagementService } from './conversation-management.service';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';

/** L'appartenance à la conversation est vérifiée dans les services, jamais seulement ici. */
@Controller('conversations')
@UseGuards(SessionGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly management: ConversationManagementService,
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

  @Post(':id/read')
  @HttpCode(204)
  markRead(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.conversations.markRead(conversationId, user.id);
  }

  // ---------------------------------------------------------------- Création et groupes

  /** 201 à la création, 200 quand la conversation 1:1 existait déjà (même réponse). */
  @Post('direct')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async openDirect(
    @Body(new ZodValidationPipe(createDirectConversationSchema))
    body: CreateDirectConversationInput,
    @CurrentUser() user: PublicUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationListItemDto> {
    const { conversation, created } = await this.management.openDirect(
      user.id,
      body.workspaceId,
      body.userId,
    );
    res.status(created ? 201 : 200);
    return conversation;
  }

  @Post('group')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createGroup(
    @Body(new ZodValidationPipe(createGroupConversationSchema)) body: CreateGroupConversationInput,
    @CurrentUser() user: PublicUser,
  ): Promise<ConversationListItemDto> {
    return this.management.createGroup(user.id, body);
  }

  @Patch(':id')
  @HttpCode(204)
  rename(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) body: UpdateConversationInput,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.management.rename(user.id, conversationId, body.name);
  }

  @Post(':id/participants')
  @HttpCode(204)
  addParticipants(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Body(new ZodValidationPipe(addParticipantsSchema)) body: AddParticipantsInput,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.management.addParticipants(user.id, conversationId, body.userIds);
  }

  /** Retirer quelqu'un, ou quitter le groupe avec son propre id. */
  @Delete(':id/participants/:userId')
  @HttpCode(204)
  removeParticipant(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Param('userId', new ZodValidationPipe(userIdSchema)) targetId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.management.removeParticipant(user.id, conversationId, targetId);
  }

  @Patch(':id/participants/:userId')
  @HttpCode(204)
  changeRole(
    @Param('id', new ZodValidationPipe(conversationIdSchema)) conversationId: string,
    @Param('userId', new ZodValidationPipe(userIdSchema)) targetId: string,
    @Body(new ZodValidationPipe(updateParticipantRoleSchema)) body: UpdateParticipantRoleInput,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.management.changeRole(user.id, conversationId, targetId, body.role);
  }
}
