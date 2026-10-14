import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { labelRequest } from '../telemetry/index';
import { currentUser } from '../audit/audit-context';
import type { SessionRequest } from './session';

const PUBLIC = 'auth:public';
/** Маршрут доступний без входу (сам вхід). */
export const Public = () => SetMetadata(PUBLIC, true);

/** Усе API — лише для тих, хто увійшов через Keycloak (або AUTH_DISABLED у розробці). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    const user = currentUser(req);
    if (!user) throw new UnauthorizedException('Потрібно увійти');
    // У APM транзакцію видно з користувачем (labels.enduser_id / enduser_name).
    labelRequest(req, { 'enduser.id': user.id, 'enduser.name': user.username });
    return true;
  }
}
