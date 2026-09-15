import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { PublicUser } from '@bozochat/shared';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SESSION_COOKIE } from './session.util';

type AuthedRequest = Request & { user?: PublicUser };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.auth.userFromToken(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
