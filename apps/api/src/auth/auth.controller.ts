import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '@bozochat/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser, SessionGuard } from './session.guard';
import { SESSION_COOKIE } from './session.util';

const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  expires,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { token, expiresAt, user } = await this.auth.register(body);
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    return user;
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { token, expiresAt, user } = await this.auth.login(body);
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
}
