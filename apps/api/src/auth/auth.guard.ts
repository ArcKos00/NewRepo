import { Reflector } from '@nestjs/core';

@Injectable()
export class AuthGuard implements CanActivate {

  canActivate(ctx: ExecutionContext): boolean {
    return true;
  }
}
