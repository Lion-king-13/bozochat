import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createInvitationSchema,
  createWorkspaceSchema,
  invitationIdSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  userIdSchema,
  workspaceIdSchema,
  type CreateWorkspaceInput,
  type InvitationDto,
  type PublicUser,
  type ReceivedInvitationDto,
  type UpdateMemberRoleInput,
  type UpdateWorkspaceInput,
  type WorkspaceDto,
  type WorkspaceMemberDto,
} from '@bozochat/shared';
import type { z } from 'zod';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkspacesService } from './workspaces.service';

const workspaceId = new ZodValidationPipe(workspaceIdSchema);

/** Les permissions sont vérifiées dans WorkspacesService à partir du rôle en base. */
@Controller('workspaces')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<WorkspaceDto[]> {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Body(new ZodValidationPipe(createWorkspaceSchema)) body: CreateWorkspaceInput,
    @CurrentUser() user: PublicUser,
  ): Promise<WorkspaceDto> {
    return this.workspaces.create(user.id, body.name);
  }

  @Get(':id')
  get(
    @Param('id', workspaceId) id: string,
    @CurrentUser() user: PublicUser,
  ): Promise<WorkspaceDto> {
    return this.workspaces.get(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', workspaceId) id: string,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: UpdateWorkspaceInput,
    @CurrentUser() user: PublicUser,
  ): Promise<WorkspaceDto> {
    return this.workspaces.update(id, user.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', workspaceId) id: string, @CurrentUser() user: PublicUser): Promise<void> {
    return this.workspaces.remove(id, user.id);
  }

  @Get(':id/members')
  members(
    @Param('id', workspaceId) id: string,
    @CurrentUser() user: PublicUser,
  ): Promise<WorkspaceMemberDto[]> {
    return this.workspaces.listMembers(id, user.id);
  }

  @Patch(':id/members/:userId')
  updateMemberRole(
    @Param('id', workspaceId) id: string,
    @Param('userId', new ZodValidationPipe(userIdSchema)) targetId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
    @CurrentUser() user: PublicUser,
  ): Promise<WorkspaceMemberDto> {
    return this.workspaces.updateMemberRole(id, user.id, targetId, body.role);
  }

  /** Retirer un membre, ou quitter le workspace quand `userId` est soi-même. */
  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @Param('id', workspaceId) id: string,
    @Param('userId', new ZodValidationPipe(userIdSchema)) targetId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.workspaces.removeMember(id, user.id, targetId);
  }

  @Get(':id/invitations')
  invitations(
    @Param('id', workspaceId) id: string,
    @CurrentUser() user: PublicUser,
  ): Promise<InvitationDto[]> {
    return this.workspaces.listInvitations(id, user.id);
  }

  @Post(':id/invitations')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  invite(
    @Param('id', workspaceId) id: string,
    @Body(new ZodValidationPipe(createInvitationSchema))
    body: z.output<typeof createInvitationSchema>,
    @CurrentUser() user: PublicUser,
  ): Promise<InvitationDto> {
    return this.workspaces.invite(id, user, body.email, body.role);
  }

  @Delete(':id/invitations/:invitationId')
  @HttpCode(204)
  revokeInvitation(
    @Param('id', workspaceId) id: string,
    @Param('invitationId', new ZodValidationPipe(invitationIdSchema)) invitationId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.workspaces.revokeInvitation(id, user.id, invitationId);
  }
}

/** Invitations reçues par l'utilisateur connecté (rattachées à son adresse e-mail). */
@Controller('invitations')
@UseGuards(SessionGuard)
export class InvitationsController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<ReceivedInvitationDto[]> {
    return this.workspaces.listReceived(user);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @Param('id', new ZodValidationPipe(invitationIdSchema)) id: string,
    @CurrentUser() user: PublicUser,
  ): Promise<WorkspaceDto> {
    return this.workspaces.acceptInvitation(id, user);
  }

  @Delete(':id')
  @HttpCode(204)
  decline(
    @Param('id', new ZodValidationPipe(invitationIdSchema)) id: string,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.workspaces.declineInvitation(id, user);
  }
}
