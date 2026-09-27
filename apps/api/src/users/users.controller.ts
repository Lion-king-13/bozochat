import { Body, Controller, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  changeEmailSchema,
  changePasswordSchema,
  updateProfileSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type PublicUser,
  type UpdateProfileInput,
} from '@bozochat/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

/** Compte de l'utilisateur connecté : `me` vient toujours de la session, jamais de l'URL. */
@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateProfile(
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @CurrentUser() user: PublicUser,
  ): Promise<PublicUser> {
    return this.users.updateProfile(user.id, body);
  }

  // Débit limité comme la connexion : ces routes vérifient un mot de passe.
  @Patch('me/email')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changeEmail(
    @Body(new ZodValidationPipe(changeEmailSchema)) body: ChangeEmailInput,
    @CurrentUser() user: PublicUser,
  ): Promise<PublicUser> {
    return this.users.changeEmail(user.id, body);
  }

  @Patch('me/password')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.users.changePassword(user.id, body);
  }
}
