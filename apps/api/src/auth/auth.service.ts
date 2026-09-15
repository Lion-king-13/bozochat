import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput, PublicUser, RegisterInput } from '@bozochat/shared';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import { sessions, users, type User } from '../db/schema';
import { SESSION_TTL_MS, generateSessionToken, hashSessionToken } from './session.util';

@Injectable()
export class AuthService {
  constructor(@InjectDb() private readonly db: Database) {}

  async register(input: RegisterInput) {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (existing) {
      throw new ConflictException({
        message: 'Un compte existe déjà avec cette adresse e-mail.',
        fieldErrors: { email: 'Un compte existe déjà avec cette adresse e-mail.' },
      });
    }
    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        passwordHash: await argon2.hash(input.password),
      })
      .returning();
    return this.createSession(user!);
  }

  async login(input: LoginInput) {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    // Même message que l'utilisateur existe ou non : pas d'énumération de comptes.
    const valid = user ? await argon2.verify(user.passwordHash, input.password) : false;
    if (!user || !valid) {
      throw new UnauthorizedException('E-mail ou mot de passe incorrect.');
    }
    return this.createSession(user);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  /** Retourne l'utilisateur associé à un token de session valide, sinon null. */
  async userFromToken(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, hashSessionToken(token)),
      with: { user: true },
    });
    if (!session || session.expiresAt < new Date()) return null;
    return toPublicUser(session.user);
  }

  private async createSession(user: User) {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.db
      .insert(sessions)
      .values({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt });
    return { token, expiresAt, user: toPublicUser(user) };
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}
