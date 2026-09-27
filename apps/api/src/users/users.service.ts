import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ChangeEmailInput,
  ChangePasswordInput,
  PublicUser,
  UpdateProfileInput,
} from '@bozochat/shared';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { toPublicUser } from '../auth/auth.service';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import { users, type User } from '../db/schema';

const EMAIL_TAKEN = 'Un compte existe déjà avec cette adresse e-mail.';
const WRONG_PASSWORD = 'Le mot de passe actuel est incorrect.';

/** Violation de contrainte d'unicité PostgreSQL — filet de sécurité contre une course. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

/**
 * Compte de l'utilisateur connecté. Toutes les méthodes travaillent à partir de l'id de session :
 * un utilisateur ne peut jamais modifier un autre compte, et son UUID ne change jamais.
 * Aucun mot de passe ni hash n'est journalisé ni renvoyé.
 */
@Injectable()
export class UsersService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** Nom affiché et photo de profil : aucun des deux n'exige le mot de passe actuel. */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    const patch: { displayName?: string; avatarUrl?: string | null } = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    // `null` est une valeur signifiante : elle retire la photo.
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

    if (Object.keys(patch).length === 0) return toPublicUser(await this.requireUser(userId));

    const [updated] = await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    return toPublicUser(updated!);
  }

  /** Changement d'identifiant de connexion : mot de passe actuel obligatoire. */
  async changeEmail(userId: string, input: ChangeEmailInput): Promise<PublicUser> {
    const user = await this.requireUser(userId);
    await this.assertCurrentPassword(user, input.currentPassword);

    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, input.email),
      columns: { id: true },
    });
    // Aucune énumération : ce contrôle ne concerne que la mise à jour du compte connecté.
    if (existing && existing.id !== userId) {
      throw new ConflictException({ message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN } });
    }

    try {
      const [updated] = await this.db
        .update(users)
        .set({ email: input.email })
        .where(eq(users.id, userId))
        .returning();
      return toPublicUser(updated!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ message: EMAIL_TAKEN, fieldErrors: { email: EMAIL_TAKEN } });
      }
      throw error;
    }
  }

  /**
   * Les sessions existantes restent valides : l'utilisateur n'est pas déconnecté de l'onglet
   * depuis lequel il vient de changer son mot de passe.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.requireUser(userId);
    await this.assertCurrentPassword(user, input.currentPassword);
    await this.db
      .update(users)
      .set({ passwordHash: await argon2.hash(input.newPassword) })
      .where(eq(users.id, userId));
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    // Session valide mais compte disparu : on traite comme une session invalide.
    if (!user) throw new UnauthorizedException();
    return user;
  }

  /** 400 avec une erreur de champ : un mot de passe erroné n'est pas une session expirée. */
  private async assertCurrentPassword(user: User, currentPassword: string): Promise<void> {
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException({
        message: WRONG_PASSWORD,
        fieldErrors: { currentPassword: WRONG_PASSWORD },
      });
    }
  }
}
