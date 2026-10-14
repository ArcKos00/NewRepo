import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { labelRequest } from '../telemetry/index';
import { currentUser } from '../audit/audit-context';
import type { SessionRequest } from './session';

const PUBLIC = 'auth:public';
/** Маршрут доступний без входу (сам вхід). */
export const Public = () => SetMetadata(PUBLIC, true);

const ADMIN = 'auth:admin';
/** Лише для адміністратора (роль ADMIN_ROLE у Keycloak). */
export const AdminOnly = () => SetMetadata(ADMIN, true);

/** Усе API — лише для тих, хто увійшов через Keycloak (або AUTH_DISABLED у розробці). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const user = currentUser(req);
    if (user) {
      // Усі подальші рядки логу цього запиту — з користувачем; у APM транзакція теж
      // (labels.enduser_id / enduser_name).
      this.logger.assign({ user: user.username });
      labelRequest(req, { 'enduser.id': user.id, 'enduser.name': user.username });
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    if (!user) throw new UnauthorizedException('Потрібно увійти');
    if (this.reflector.getAllAndOverride<boolean>(ADMIN, [ctx.getHandler(), ctx.getClass()]) && !user.admin)
      throw new ForbiddenException('Лише для адміністратора');
    return true;
  }
}
